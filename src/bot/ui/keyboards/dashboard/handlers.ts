/**
 * Pendaftaran command dan callback query dashboard ke instance grammY.
 *
 * Dipecah dari dashboard.ts (2.821 baris). Isi tiap fungsi dipindahkan apa
 * adanya; yang berubah hanya di file mana ia tinggal.
 */
import config from '../../../../config.js';
import {
  UserbotModel,
  deleteUserbot,
  disablePlugin,
  enablePlugin,
  getAllRegisteredUsers,
  getDisabledPlugins,
  getUserbotSession,
  setSystemVar,
  updateUserbotFeature,
  updateUserbotStatus,
} from '../../../../infrastructure/database.js';
import { setUserVar } from '../../../../services/SystemVarService.js';
import userbotManager from '../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../userbot/engine/pluginRegistry.js';
import { stopLoop } from '../../../../userbot/handlers/util/loop.js';
import { Logger } from '../../../../utils/logger.js';
import { escapeHtml, replyRich } from '../../../../utils/richMessage.js';
import { sendWithNativeDraft } from '../../../../utils/streamRich.js';
import {
  addPendingApproval,
  approveUser,
  getPendingApprovals,
  hasAcceptedTerms,
  isApproved,
  isPendingApproval,
  removePendingApproval,
  revokeUser,
  setAcceptedTerms,
} from '../../../state/approvedUsers.js';
import fs from 'fs';
import { InputFile } from 'grammy';
import { Api } from 'teleproto';
import { PROTECTED_PLUGINS, getSystemVarValue, isOwner, normalizedDisabled } from './shared.js';
import {
  panelAccessDenied,
  panelAdmin,
  panelAdminBackup,
  panelAdminBroadcast,
  panelAdminFleet,
  panelAdminPending,
  panelAdminSettings,
  panelAdminUserDetail,
  panelAdminUsers,
  panelBuySubscription,
  panelDangerDelete,
  panelDonate,
  panelHealth,
  panelHelpCommands,
  panelHelpFaq,
  panelHelpQuickstart,
  panelInlineHelper,
  panelMain,
  panelMenuList,
  panelPluginDetail,
  panelPlugins,
  panelPrefixPicker,
  panelQuickHelp,
  panelRegister,
  panelSettings,
  panelStats,
  panelSubscription,
  panelTermsDeclined,
  panelTermsOfService,
  panelUserLoops,
  panelUserbot,
  panelUserbotDiag,
} from './panels.js';
import {
  applyButtonStylesToPayload,
  keyboardAccessDenied,
  keyboardAdmin,
  keyboardAdminBackup,
  keyboardAdminBroadcast,
  keyboardAdminFleet,
  keyboardAdminPending,
  keyboardAdminSettings,
  keyboardAdminUserDetail,
  keyboardAdminUsers,
  keyboardBack,
  keyboardBuySubscription,
  keyboardDangerDelete,
  keyboardHelpBack,
  keyboardHelpCenter,
  keyboardInlineHelper,
  keyboardMain,
  keyboardPanelMenu,
  keyboardPrefixPicker,
  keyboardRegister,
  keyboardSettings,
  keyboardSubscription,
  keyboardTermsDeclined,
  keyboardTermsOfService,
  keyboardUserLoops,
  keyboardUserbot,
  keyboardUserbotDiag,
} from './keyboards.js';

export async function mongoStatusLabel() {
  try {
    const mongoose = await import('mongoose');
    return mongoose.default.connection.readyState === 1
      ? `🟢 Connected (${mongoose.default.connection.name})`
      : `🔴 State ${mongoose.default.connection.readyState}`;
  } catch (_e) {
    return '🔴 Disconnected';
  }
}

export async function sendRich(ctx, rich, reply_markup, { deleteOld = false, edit = true } = {}) {
  if (ctx.inlineMessageId) {
    if (ctx.answerCallbackQuery) {
      await ctx.answerCallbackQuery({ text: '⚠️ Akses menu ini melalui Private Chat (DM) bot.', show_alert: true }).catch(()=>{});
    }
    return;
  }
  const rich_message = typeof rich === 'string' ? { html: rich } : rich;
  // Edit in-place kalau berasal dari callback pada pesan bot (message_id ada) & opsi edit aktif
  const cbMsgId = ctx.callbackQuery?.message?.message_id;
  if (edit && cbMsgId) {
    try {
      await ctx.api.editMessageText(ctx.callbackQuery.message.chat.id, cbMsgId, rich_message, { reply_markup });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('message is not modified')) {
        return;
      }
      Logger.logSystem(`editMessageText(rich) failed: ${msg}`, 'WARN');
      // fallback: kirim pesan baru di bawah
    }
  }
  // Efek draft native hanya untuk pengiriman pesan BARU di chat privat. Edit in-place tidak perlu draft.
  const chatId = ctx.chat?.id;
  const doSend = () => ctx.replyWithRichMessage(rich_message, { reply_markup });
  try {
    if (chatId && typeof chatId === 'number' && chatId > 0) {
      await sendWithNativeDraft(doSend, ctx.api, chatId, 'Memuat dashboard…');
    } else {
      await doSend();
    }
    if (deleteOld) {
      try { await ctx.deleteMessage(); } catch (_) { /* empty */ }
    }
  } catch (err) {
    Logger.logSystem(`sendRichMessage failed: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
    await ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal kirim pesan.</b> Silakan kirim /menu kembali.</p>` });
  }
}

export async function openMain(ctx, options = {}) {
  await sendRich(ctx, panelMain(ctx), keyboardMain(ctx), options);
}

async function toggleUserbotSetting(ctx, field, label, panel, keyboard) {
  const session = getUserbotSession(ctx.from.id);
  if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}

  const newStatus = session[field] === 1 ? 0 : 1;
  await updateUserbotFeature(ctx.from.id, field, newStatus);
  await ctx.answerCallbackQuery(`${label}: ${newStatus === 1 ? 'ON' : 'OFF'}`);
  return sendRich(ctx, panel(ctx), keyboard(ctx));
}

export function findPlugin(name) {
  const target = decodeURIComponent(String(name || '')).trim().toLowerCase();
  return loadedPlugins.find(plugin => String(plugin.name).toLowerCase() === target);
}

export function pluginNotice(pluginName, enabled) {
  return `${enabled ? 'Plugin diaktifkan' : 'Plugin dinonaktifkan'}: ${pluginName}`;
}

export async function openPluginStudio(ctx, page = 1, category = 'all', notice = '', options = {}) {
  const result = panelPlugins(ctx, page, category, notice);
  // edit: true → kalau dipicu callback (tombol toggle/page), pesan diedit in-place, bukan hapus-kirim-ulang
  await sendRich(ctx, result.rich, result.keyboard, { edit: true, ...options });
}

export function registerRichHandlers(bot) {
  bot.api.config.use(async (prev, method, payload, signal) => {
    applyButtonStylesToPayload(payload);
    if (Array.isArray(payload?.results)) {
      for (const result of payload.results) {applyButtonStylesToPayload(result);}
    }
    return prev(method, payload, signal);
  });

  bot.command(['start', 'menu'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      await replyRich(ctx, `🤖 <b>${ctx.me.first_name} Aktif!</b>\n\n<p>Silakan kirim pesan secara privat (PM) untuk mengelola bot Anda.</p>`, {
        reply_markup: {
          inline_keyboard: [[{ text: '💬 Buka Private Chat', url: `https://t.me/${ctx.me.username}?start=true` }]]
        }
      });
      return;
    }

    await openMain(ctx);
  });

  bot.command(['claim', 'voucher', 'tukar'], async (ctx) => {
    return replyRich(ctx, `<p>ℹ️ <b>Sistem Voucher Telah Dihapus</b><br>DeltaUserJS kini menggunakan sistem persetujuan langsung (Approval-Only). Silakan ajukan persetujuan melalui Menu Utama.</p>`);
  });

  bot.command(['paket', 'vip', 'langganan', 'subscribe', 'pricing'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      return replyRich(ctx, `<p>Silakan buka status akses di Private Chat bot.</p>`);
    }
    return sendRich(ctx, panelSubscription(ctx), keyboardSubscription(ctx));
  });

  bot.command(['daftar', 'login', 'register'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      return replyRich(ctx, `<p>Silakan kirim pesan secara privat (PM) untuk mendaftar userbot.</p>`);
    }
    const session = getUserbotSession(ctx.from.id);
    if (session) {
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx));
    }
    const autoApprove = getSystemVarValue('AUTO_APPROVE', '0') === '1';
    if (!isOwner(ctx) && !isApproved(ctx.from.id) && !autoApprove) {
      return sendRich(ctx, panelAccessDenied(ctx), keyboardAccessDenied(ctx));
    }
    if (autoApprove && !isApproved(ctx.from.id)) {
      approveUser(ctx.from.id, { name: ctx.from.first_name, username: ctx.from.username });
    }
    if (!hasAcceptedTerms(ctx.from.id)) {
      return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: false });
    }
    await sendRich(ctx, panelRegister(ctx), keyboardRegister());
  });

  bot.command(['tos', 'rules', 'syarat', 'ketentuan'], async (ctx) => {
    if (ctx.chat.type !== 'private') {return;}
    return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: false });
  });

  bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    try {
      const { abortActiveQr, activeRegClients } = await import('../../../conversations/registration.js');
      await abortActiveQr(userId, ctx.api);
      const client = activeRegClients.get(userId);
      if (client) {
        try { await client.disconnect(); } catch (_) { /* empty */ }
        activeRegClients.delete(userId);
      }
    } catch (_) { /* empty */ }
    await ctx.conversation.exitAll();
    await replyRich(ctx, `<p><b>❌ Aksi dibatalkan.</b><br>Ketik /menu untuk membuka Menu Utama.</p>`);
  });

  bot.command('health', async (ctx) => {
    if (!isOwner(ctx)) {return;}
    await sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'));
  });

  bot.command('revoke', async (ctx) => {
    const telegramId = ctx.from.id;
    const session = getUserbotSession(telegramId);
    if (!session) {
      return ctx.replyWithRichMessage({ html: `<p>❌ Anda belum memiliki sesi bot yang aktif.</p>` });
    }

    await ctx.replyWithRichMessage({ html: `<p>⏳ Menghapus sesi dan logout...</p>` });

    try {
      const ubot = userbotManager.clients.get(telegramId);
      if (ubot && ubot.client) {
        await (ubot.client as unknown as { call: (opts: Record<string, unknown>) => Promise<unknown> }).call({ _: 'auth.logOut' });
      }
    } catch (e) {
      Logger.logUser(telegramId, `Failed to logout remotely: ${e.message}`, 'WARN');
    }

    await userbotManager.stopUserbot(telegramId);
    await deleteUserbot(telegramId);

    await ctx.replyWithRichMessage({ html: `<p><b>✅ Berhasil</b><br>Sesi dihapus sepenuhnya. Ketik /menu untuk mendaftar ulang.</p>` });
  });

  bot.callbackQuery(/^rich:(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    try { await ctx.answerCallbackQuery(); } catch (_) { /* empty */ }

    if (action === 'main') {return openMain(ctx, { edit: true });}
    if (action === 'noop') {return;}

    if (action === 'panel_menu') {return sendRich(ctx, panelMenuList(ctx), keyboardPanelMenu(ctx), { edit: true });}

    if (action === 'ubot') {
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { edit: true });
    }

    if (action === 'toggle_power') {
      const telegramId = ctx.from.id;
      const session = getUserbotSession(telegramId);
      if (!session) {return ctx.answerCallbackQuery('Sesi tidak ditemukan.');}

      const isRunning = userbotManager.isRunning(telegramId);
      if (isRunning) {
        await ctx.answerCallbackQuery('Mematikan Bot...');
        await userbotManager.stopUserbot(telegramId);
        updateUserbotStatus(telegramId, false);
      } else {
        await ctx.answerCallbackQuery('Menghidupkan Bot...');
        try {
          await userbotManager.startUserbot(telegramId, session.session_string);
          updateUserbotStatus(telegramId, true);
        } catch (err) {
          return ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal menghidupkan:</b> ${escapeHtml(err.message)}</p>` });
        }
      }
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { edit: true });
    }

    if (action === 'user_restart_ubot') {
      const telegramId = ctx.from.id;
      const session = getUserbotSession(telegramId);
      if (!session) {
        return ctx.answerCallbackQuery({ text: 'Sesi tidak ditemukan.', show_alert: true });
      }
      if (!userbotManager.isRunning(telegramId)) {
        return ctx.answerCallbackQuery({ text: 'Userbot sedang offline. Ketuk Hidupkan Userbot terlebih dahulu.', show_alert: true });
      }

      await ctx.answerCallbackQuery({ text: '🔄 Merestart koneksi userbot...' });
      try {
        await userbotManager.restartUserbot(telegramId);
        await updateUserbotStatus(telegramId, true);
        await ctx.answerCallbackQuery({ text: '✅ Userbot berhasil direstart & online!' });
      } catch (err) {
        return ctx.replyWithRichMessage({
          html: `<p>❌ <b>Gagal restart:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`
        });
      }
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { edit: true });
    }

    if (action.startsWith('plugin_page:')) {
      const page = Number(action.split(':')[1] || 1);
      return openPluginStudio(ctx, page, 'all');
    }

    if (action.startsWith('p_cat:')) {
      const parts = action.split(':');
      const category = parts[1] || 'all';
      const page = Number(parts[2]) || 1;
      await ctx.answerCallbackQuery();
      return openPluginStudio(ctx, page, category);
    }

    if (action.startsWith('p_page:')) {
      const parts = action.split(':');
      const page = Number(parts[1]) || 1;
      const category = parts[2] || 'all';
      await ctx.answerCallbackQuery();
      return openPluginStudio(ctx, page, category);
    }

    if (action.startsWith('p_info:')) {
      const parts = action.split(':');
      const pluginName = decodeURIComponent(parts[1] || '');
      const page = Number(parts[2]) || 1;
      const category = parts[3] || 'all';
      await ctx.answerCallbackQuery();
      const detail = panelPluginDetail(ctx, pluginName, page, category);
      return sendRich(ctx, detail.rich, detail.keyboard, { edit: true });
    }

    if (action.startsWith('p_tog:')) {
      const parts = action.split(':');
      const pluginName = decodeURIComponent(parts[1] || '');
      const page = Number(parts[2]) || 1;
      const category = parts[3] || 'all';
      const lower = pluginName.toLowerCase();

      if (PROTECTED_PLUGINS.includes(lower)) {
        return ctx.answerCallbackQuery('Plugin ini dilindungi sistem.');
      }

      const isDisabled = normalizedDisabled(ctx.from.id).includes(lower);
      if (isDisabled) {
        await enablePlugin(ctx.from.id, pluginName);
        await ctx.answerCallbackQuery(`✅ Plugin ${pluginName} diaktifkan`);
        return openPluginStudio(ctx, page, category, pluginNotice(pluginName, true));
      }

      await disablePlugin(ctx.from.id, pluginName);
      await ctx.answerCallbackQuery(`❌ Plugin ${pluginName} dinonaktifkan`);
      return openPluginStudio(ctx, page, category, pluginNotice(pluginName, false));
    }

    if (action.startsWith('p_tog_det:')) {
      const parts = action.split(':');
      const pluginName = decodeURIComponent(parts[1] || '');
      const page = Number(parts[2]) || 1;
      const category = parts[3] || 'all';
      const lower = pluginName.toLowerCase();

      if (PROTECTED_PLUGINS.includes(lower)) {
        return ctx.answerCallbackQuery('Plugin ini dilindungi sistem.');
      }

      const isDisabled = normalizedDisabled(ctx.from.id).includes(lower);
      if (isDisabled) {
        await enablePlugin(ctx.from.id, pluginName);
        await ctx.answerCallbackQuery(`✅ Plugin ${pluginName} diaktifkan`);
      } else {
        await disablePlugin(ctx.from.id, pluginName);
        await ctx.answerCallbackQuery(`❌ Plugin ${pluginName} dinonaktifkan`);
      }
      const detail = panelPluginDetail(ctx, pluginName, page, category);
      return sendRich(ctx, detail.rich, detail.keyboard, { edit: true });
    }

    if (action.startsWith('plugin_toggle:')) {
      const [, rawName, rawPage] = action.split(':');
      const page = Number(rawPage || 1);
      const plugin = findPlugin(rawName);
      if (!plugin) {
        return openPluginStudio(ctx, page, 'all', 'Plugin tidak ditemukan.');
      }
      const pluginName = String(plugin.name);
      const lower = pluginName.toLowerCase();
      const protectedPlugins = ['admin', 'pluginmanager'];
      const disabled = getDisabledPlugins(ctx.from.id).map(name => String(name).toLowerCase());
      const isDisabled = disabled.includes(lower);

      if (!isDisabled && protectedPlugins.includes(lower)) {
        return openPluginStudio(ctx, page, 'all', `Plugin protected: ${pluginName}`);
      }

      if (isDisabled) {
        await enablePlugin(ctx.from.id, pluginName);
        return openPluginStudio(ctx, page, 'all', pluginNotice(pluginName, true));
      }

      await disablePlugin(ctx.from.id, pluginName);
      return openPluginStudio(ctx, page, 'all', pluginNotice(pluginName, false));
    }

    if (action === 'toggle_stream') {
      return ctx.answerCallbackQuery('Fitur ini telah dinonaktifkan.');
    }

    if (action === 'settings') {return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx));}

    if (action === 'edit_name') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('custom-name-conv');
    }

    if (action === 'pick_prefix') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelPrefixPicker(ctx), keyboardPrefixPicker(), { edit: true });
    }

    if (action.startsWith('set_prefix:')) {
      const newPrefix = action.split(':')[1];
      await setUserVar(ctx.from.id, 'PREFIX', newPrefix);
      await ctx.answerCallbackQuery({ text: `✅ Prefix diubah ke: ${newPrefix}` });
      return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { edit: true });
    }

    if (action === 'setup_helper') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelInlineHelper(ctx), keyboardInlineHelper(), { edit: true });
    }

    if (action === 'ubot_diag') {
      await ctx.answerCallbackQuery({ text: 'Menguji koneksi MTProto...' });
      const diagHtml = await panelUserbotDiag(ctx);
      return sendRich(ctx, diagHtml, keyboardUserbotDiag(ctx), { edit: true });
    }

    if (action === 'toggle_anti_pm') {
      return toggleUserbotSetting(ctx, 'anti_pm', 'Anti-PM', panelSettings, keyboardSettings);
    }

    if (action === 'toggle_afk') {
      return toggleUserbotSetting(ctx, 'auto_reply', 'AFK', panelSettings, keyboardSettings);
    }

    if (action === 'toggle_anti_pm_ubot') {
      return toggleUserbotSetting(ctx, 'anti_pm', 'Anti-PM', panelUserbot, keyboardUserbot);
    }

    if (action === 'toggle_afk_ubot') {
      return toggleUserbotSetting(ctx, 'auto_reply', 'AFK', panelUserbot, keyboardUserbot);
    }

    if (action === 'edit_afk') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('afk-reason-conv');
    }

    if (action === 'edit_vars') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('manage-vars-conv');
    }

    if (action === 'danger_delete_session') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelDangerDelete(ctx), keyboardDangerDelete(), { edit: true });
    }

    if (action === 'confirm_delete_session') {
      await ctx.answerCallbackQuery('Menghapus sesi...');
      const telegramId = ctx.from.id;

      try {
        const ubot = userbotManager.clients.get(telegramId);
        if (ubot && ubot.client) {
          await ubot.client.invoke(new Api.auth.LogOut());
        }
      } catch (e) {
        Logger.logUser(telegramId, `Failed to logout: ${e.message}`, 'WARN');
      }

      if (userbotManager.isRunning(telegramId)) {
        await userbotManager.stopUserbot(telegramId);
      }
      await deleteUserbot(telegramId);
      await ctx.replyWithRichMessage({ html: `<p>🗑️ <b>Sesi dihapus permanen.</b></p>` });
      return openMain(ctx, { deleteOld: true });
    }

    if (action === 'subscription') {return sendRich(ctx, panelSubscription(ctx), keyboardSubscription(ctx), { edit: true });}
    if (action === 'register') {
      if (!isOwner(ctx) && !isApproved(ctx.from.id)) {
        return sendAccessDeniedRich(ctx);
      }
      if (!hasAcceptedTerms(ctx.from.id)) {
        return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
      }
      return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
    }

    if (action === 'tos_agree') {
      setAcceptedTerms(ctx.from.id, true);
      await ctx.answerCallbackQuery({ text: '✅ Syarat & Ketentuan disetujui!' });
      return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
    }

    if (action === 'tos_decline') {
      await ctx.answerCallbackQuery({ text: 'Pendaftaran dibatalkan.' });
      return sendRich(ctx, panelTermsDeclined(ctx), keyboardTermsDeclined(), { edit: true });
    }

    if (action === 'tos_view') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
    }

    if (action === 'claim_trial') {
      await ctx.answerCallbackQuery();
      const userId = ctx.from.id;
      if (isOwner(ctx)) {
        approveUser(userId);
        return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
      }

      const session = getUserbotSession(userId);
      if (session) {
        return ctx.replyWithRichMessage({
          html: `<p>ℹ️ Anda sudah memiliki userbot yang aktif. Buka dashboard untuk mengelolanya.</p>`
        });
      }

      if (isApproved(userId)) {
        return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
      }

      if (isPendingApproval(userId)) {
        return ctx.replyWithRichMessage({
          html: `<h3>⏳ Permintaan Sedang Diproses</h3><p>Permintaan pendaftaran Anda sudah dikirim sebelumnya dan sedang menunggu persetujuan owner.<br>Harap tunggu notifikasi dari bot.</p>`
        });
      }

      addPendingApproval(userId, {
        name: ctx.from.first_name || 'User',
        username: ctx.from.username,
      });

      const targetChat = config.logGroupId || config.ownerId;
      const firstName = escapeHtml(ctx.from.first_name || 'User');
      const username = ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : '<i>Tanpa Username</i>';
      const nowWib = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

      if (targetChat) {
        try {
          const extraParams: Record<string, unknown> = {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Setujui', callback_data: `approve_trial:${userId}` },
                  { text: '❌ Tolak', callback_data: `reject_trial:${userId}` },
                ]
              ]
            }
          };
          if (config.logGroupId && config.logTopicId) {
            extraParams.message_thread_id = config.logTopicId;
          }
          await ctx.api.sendMessage(
            targetChat,
            `🔔 <b>Permintaan Pendaftaran Userbot</b>\n\n` +
            `Ada pengguna baru mengajukan izin akses userbot:\n` +
            `• <b>Nama:</b> ${firstName}\n` +
            `• <b>Username:</b> ${username}\n` +
            `• <b>ID Pengguna:</b> <code>${userId}</code>\n` +
            `• <b>Waktu:</b> <code>${nowWib} WIB</code>\n\n` +
            `<i>Pilih tindakan di bawah untuk menyetujui atau menolak:</i>`,
            { parse_mode: 'HTML', ...extraParams }
          );
        } catch (err) {
          Logger.logSystem(`Gagal kirim notifikasi approval request ke owner: ${err}`, 'WARN');
        }
      }

      const confirmationHtml =
        `<h1 align="center">📩 Permintaan Pendaftaran Terkirim</h1>` +
        `<p>Permintaan akses userbot berhasil diajukan kepada owner.</p>` +
        `<table bordered striped>` +
        `<tr><th>Detail Permintaan</th><th>Keterangan</th></tr>` +
        `<tr><td>ID Telegram</td><td align="center"><code>${userId}</code></td></tr>` +
        `<tr><td>Status Permohonan</td><td align="center">🕐 Menunggu Persetujuan</td></tr>` +
        `</table>` +
        `<h3>ℹ️ Apa langkah selanjutnya?</h3>` +
        `<p>Owner akan meninjau permohonan Anda. Setelah disetujui, bot akan otomatis mengirimkan notifikasi agar Anda dapat langsung login via Scan QR Code atau OTP.</p>` +
        `<footer>Harap menunggu konfirmasi persetujuan dari owner.</footer>`;

      return sendRich(ctx, confirmationHtml, {
        inline_keyboard: [
          [{ text: '🔄 Cek Status Approval', callback_data: 'rich:check_approval' }],
          [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
        ]
      }, { edit: true });
    }

    if (action === 'check_approval') {
      const userId = ctx.from.id;
      if (isOwner(ctx) || isApproved(userId)) {
        await ctx.answerCallbackQuery({ text: '🎉 Akun Anda sudah disetujui!', show_alert: true });
        return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { edit: true });
      }
      await ctx.answerCallbackQuery({ text: '⏳ Permohonan Anda masih menunggu persetujuan dari owner.', show_alert: true });
      return;
    }

    if (action === 'buy_premium') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelBuySubscription(ctx), keyboardBuySubscription(ctx), { edit: true });
    }

    if (action === 'stats') {return sendRich(ctx, panelStats(ctx), keyboardBack('main'), { edit: true });}
    if (action === 'guide') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelQuickHelp(ctx), keyboardHelpCenter(), { edit: true });
    }
    if (action === 'help_quickstart') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelHelpQuickstart(), keyboardHelpBack(), { edit: true });
    }
    if (action === 'help_commands') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelHelpCommands(ctx), keyboardHelpBack(), { edit: true });
    }
    if (action === 'help_faq') {
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelHelpFaq(), keyboardHelpBack(), { edit: true });
    }
    if (action === 'donate') {return sendRich(ctx, panelDonate(ctx), keyboardBack('main'), { edit: true });}

    if (action === 'admin') {
      if (!isOwner(ctx)) {return;}
      const pendingCount = getPendingApprovals().length;
      return sendRich(ctx, panelAdmin(ctx), keyboardAdmin(pendingCount), { edit: true });
    }
    if (action === 'health') {
      if (!isOwner(ctx)) {return;}
      return sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'), { edit: true });
    }
    if (action === 'edit_system_vars') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('manage-system-vars-conv');
    }
    if (action === 'admin_pending') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
    }
    if (action.startsWith('admin_apprv:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      if (targetId) {
        approveUser(targetId);
        removePendingApproval(targetId);
        await ctx.answerCallbackQuery({ text: `✅ User ${targetId} disetujui!` });
        try {
          await ctx.api.sendMessage(
            targetId,
            `🎉 <b>Permintaan Akses Disetujui!</b>\n\n` +
            `<p>Owner telah menyetujui akses permanen userbot untuk akun Anda.</p>\n\n` +
            `<footer>Silakan klik tombol di bawah untuk mulai menghubungkan userbot Anda:</footer>`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚀 Daftar Userbot Sekarang', callback_data: 'rich:register' }],
                  [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
                ],
              },
            }
          );
        } catch (_) { /* ignore */ }
      }
      return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
    }
    if (action.startsWith('admin_rjct:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      if (targetId) {
        revokeUser(targetId);
        removePendingApproval(targetId);
        if (userbotManager.isRunning(targetId)) {
          try { await userbotManager.stopUserbot(targetId); } catch (_) { /* ignore */ }
        }
        try { await updateUserbotStatus(targetId, false); } catch (_) { /* ignore */ }
        await ctx.answerCallbackQuery({ text: `❌ User ${targetId} ditolak/dicabut.` });
        try {
          await ctx.api.sendMessage(
            targetId,
            `<h3>❌ Akses Userbot Ditolak / Dicabut</h3>\n` +
            `<p>Maaf, permohonan akses userbot Anda tidak disetujui atau telah dicabut oleh owner.</p>`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
                ],
              },
            }
          );
        } catch (_) { /* ignore */ }
      }
      return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
    }
    if (action === 'admin_approve_all') {
      if (!isOwner(ctx)) {return;}
      const list = getPendingApprovals();
      for (const p of list) {
        approveUser(p.userId);
        removePendingApproval(p.userId);
        try {
          await ctx.api.sendMessage(
            p.userId,
            `🎉 <b>Permintaan Akses Disetujui!</b>\n\n` +
            `<p>Owner telah menyetujui akses permanen userbot untuk akun Anda.</p>\n\n` +
            `<footer>Silakan klik tombol di bawah untuk mulai menghubungkan userbot Anda:</footer>`,
            {
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🚀 Daftar Userbot Sekarang', callback_data: 'rich:register' }],
                  [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
                ],
              },
            }
          );
        } catch (_) { /* ignore */ }
      }
      await ctx.answerCallbackQuery({ text: `✅ Berhasil menyetujui ${list.length} user!` });
      return sendRich(ctx, panelAdminPending(), keyboardAdminPending(), { edit: true });
    }
    if (action.startsWith('admin_users')) {
      if (!isOwner(ctx)) {return;}
      const page = Number(action.split(':')[1]) || 1;
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminUsers(page), keyboardAdminUsers(page), { edit: true });
    }
    if (action.startsWith('admin_user:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
    }
    if (action.startsWith('admin_power_user:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      if (userbotManager.isRunning(targetId)) {
        await userbotManager.stopUserbot(targetId);
        await updateUserbotStatus(targetId, 0);
        await ctx.answerCallbackQuery({ text: `⏹️ Userbot ${targetId} dimatikan.` });
      } else {
        const session = getUserbotSession(targetId);
        if (session && session.session_string) {
          try {
            await userbotManager.startUserbot(targetId, session.session_string);
            await updateUserbotStatus(targetId, 1);
            await ctx.answerCallbackQuery({ text: `▶️ Userbot ${targetId} dinyalakan.` });
          } catch (err) {
            await ctx.answerCallbackQuery({ text: `❌ Gagal: ${err instanceof Error ? err.message : String(err)}` });
          }
        } else {
          await ctx.answerCallbackQuery({ text: `❌ Sesi userbot tidak valid.` });
        }
      }
      return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
    }
    if (action.startsWith('admin_extend:')) {
      if (!isOwner(ctx)) {return;}
      const parts = action.split(':');
      const targetId = Number(parts[1]);
      const days = Number(parts[2]);
      if (days === 0) {
        await updateUserbotFeature(targetId, 'expired_at', null);
        await ctx.answerCallbackQuery({ text: `♾️ Masa aktif diset Unlimited.` });
      } else {
        const session = getUserbotSession(targetId);
        const now = Date.now();
        const base = (session?.expired_at && new Date(session.expired_at).getTime() > now)
          ? new Date(session.expired_at).getTime()
          : now;
        const newExp = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
        await updateUserbotFeature(targetId, 'expired_at', newExp);
        await ctx.answerCallbackQuery({ text: `➕ Masa aktif ditambah ${days} hari.` });
      }
      return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
    }
    if (action.startsWith('admin_revoke_user:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      revokeUser(targetId);
      if (userbotManager.isRunning(targetId)) {
        await userbotManager.stopUserbot(targetId);
      }
      await updateUserbotStatus(targetId, 0);
      await ctx.answerCallbackQuery({ text: `🚫 Izin ${targetId} berhasil dicabut.` });
      const session = getUserbotSession(targetId);
      if (!session) {
        return sendRich(ctx, panelAdminUsers(1), keyboardAdminUsers(1), { edit: true });
      }
      return sendRich(ctx, panelAdminUserDetail(targetId), keyboardAdminUserDetail(targetId), { edit: true });
    }
    if (action.startsWith('admin_delete_user:')) {
      if (!isOwner(ctx)) {return;}
      const targetId = Number(action.split(':')[1]);
      if (userbotManager.isRunning(targetId)) {
        await userbotManager.stopUserbot(targetId);
      }
      await deleteUserbot(targetId);
      revokeUser(targetId);
      await ctx.answerCallbackQuery({ text: `🗑️ Akun ${targetId} dihapus permanen.` });
      return sendRich(ctx, panelAdminUsers(1), keyboardAdminUsers(1), { edit: true });
    }
    if (action === 'admin_broadcast') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminBroadcast(), keyboardAdminBroadcast(), { edit: true });
    }
    if (action === 'admin_start_broadcast') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('broadcast-conv');
    }
    if (action === 'admin_fleet') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
    }
    if (action === 'admin_fleet_restart') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '🔄 Merestart seluruh userbot...' });
      await userbotManager.restartAllActive();
      return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
    }
    if (action === 'admin_fleet_stop') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '🛑 Menghentikan seluruh userbot...' });
      for (const id of Array.from(userbotManager.clients.keys())) {
        try {
          await userbotManager.stopUserbot(id);
          await updateUserbotStatus(id, 0);
        } catch (_) { /* ignore */ }
      }
      return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
    }
    if (action === 'admin_fleet_start') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '🚀 Menyalakan seluruh userbot...' });
      const allUsers = getAllRegisteredUsers();
      for (const u of allUsers) {
        if (u.session_string && !userbotManager.isRunning(u.telegram_id)) {
          try {
            await userbotManager.startUserbot(u.telegram_id, u.session_string);
            await updateUserbotStatus(u.telegram_id, 1);
          } catch (_) { /* ignore */ }
        }
      }
      return sendRich(ctx, panelAdminFleet(), keyboardAdminFleet(), { edit: true });
    }
    if (action === 'admin_restart_bot') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '🔄 Merestart Master Bot...' });
      await ctx.replyWithRichMessage({ html: '<h3>🔄 Master Bot sedang direstart...</h3><p>Layanan akan kembali aktif dalam beberapa detik melalui PM2.</p>' });
      setTimeout(() => { process.exit(0); }, 1000);
      return;
    }
    if (action === 'admin_subs') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelSubscription(ctx), keyboardSubscription(ctx), { edit: true });
    }
    if (action === 'admin_backup') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminBackup(), keyboardAdminBackup(), { edit: true });
    }
    if (action === 'admin_download_backup') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery({ text: '📦 Menyiapkan file backup...' });
      try {
        const users = await UserbotModel.find({}).lean();
        const backupData = JSON.stringify(users, null, 2);
        const filename = `backup_admin_${Date.now()}.json`;
        fs.writeFileSync(filename, backupData);
        await ctx.replyWithDocument(new InputFile(filename, `delta_backup_${Date.now()}.json`), {
          caption: `📦 <b>Backup Database MongoDB</b>\nTotal: ${users.length} userbot terdaftar.\nTanggal: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
          parse_mode: 'HTML'
        });
        setTimeout(() => { try { fs.unlinkSync(filename); } catch { /* diabaikan */ } }, 60000);
      } catch (err) {
        await ctx.replyWithRichMessage({ html: `<p>❌ <b>Gagal membuat backup:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>` });
      }
      return;
    }
    if (action === 'admin_settings') {
      if (!isOwner(ctx)) {return;}
      await ctx.answerCallbackQuery();
      return sendRich(ctx, panelAdminSettings(), keyboardAdminSettings(), { edit: true });
    }
    if (action === 'admin_toggle_auto_approve') {
      if (!isOwner(ctx)) {return;}
      const cur = getSystemVarValue('AUTO_APPROVE', '0');
      const next = cur === '1' ? '0' : '1';
      await setSystemVar('AUTO_APPROVE', next);
      await ctx.answerCallbackQuery({ text: next === '1' ? '🌐 Mode: BUKA BEBAS (Auto-Approve)' : '🔒 Mode: BUTUH APPROVAL OWNER' });
      return sendRich(ctx, panelAdminSettings(), keyboardAdminSettings(), { edit: true });
    }

    // Voucher actions disabled
    if (action === 'redeem_voucher' || action === 'admin_vouchers' || action.startsWith('admin_vouchers:') || action === 'admin_new_voucher' || action.startsWith('del_voucher:') || action.startsWith('broadcast_voucher:')) {
      await ctx.answerCallbackQuery({ text: 'Sistem voucher telah dinonaktifkan.', show_alert: true });
      return;
    }

    // Feature 4: Visual Broadcast Scheduler actions
    if (action === 'user_loops' || action.startsWith('user_loops:')) {
      await ctx.answerCallbackQuery();
      const page = Number(action.split(':')[1]) || 1;
      return sendRich(ctx, panelUserLoops(ctx, page), keyboardUserLoops(ctx, page), { edit: true });
    }
    if (action === 'add_loop') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('user-add-loop-conv');
    }
    if (action.startsWith('del_loop:')) {
      const hexTarget = action.split(':')[1];
      const targetChat = Buffer.from(hexTarget, 'hex').toString('utf8');
      const stopped = stopLoop(ctx.from.id, targetChat, true);
      await ctx.answerCallbackQuery({ text: stopped ? '⏹️ Jadwal loop dihentikan dan dihapus!' : 'Jadwal dihapus.' });
      return sendRich(ctx, panelUserLoops(ctx, 1), keyboardUserLoops(ctx, 1), { edit: true });
    }

    if (action === 'otp') {
      const autoApprove = getSystemVarValue('AUTO_APPROVE', '0') === '1';
      if (!isOwner(ctx) && !isApproved(ctx.from.id) && !autoApprove) {
        return sendAccessDeniedRich(ctx);
      }
      if (autoApprove && !isApproved(ctx.from.id)) {
        approveUser(ctx.from.id, { name: ctx.from.first_name, username: ctx.from.username });
      }
      if (!hasAcceptedTerms(ctx.from.id)) {
        return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
      }
      return ctx.conversation.enter('otp-reg');
    }
    if (action === 'qr') {
      const autoApprove = getSystemVarValue('AUTO_APPROVE', '0') === '1';
      if (!isOwner(ctx) && !isApproved(ctx.from.id) && !autoApprove) {
        return sendAccessDeniedRich(ctx);
      }
      if (autoApprove && !isApproved(ctx.from.id)) {
        approveUser(ctx.from.id, { name: ctx.from.first_name, username: ctx.from.username });
      }
      if (!hasAcceptedTerms(ctx.from.id)) {
        return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: true });
      }
      return ctx.conversation.enter('qr-reg');
    }
  });
}

export async function sendAccessDeniedRich(ctx) {
  await sendRich(ctx, panelAccessDenied(ctx), keyboardAccessDenied(ctx), { edit: true });
}
