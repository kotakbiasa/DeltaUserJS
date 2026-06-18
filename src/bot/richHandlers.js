import config from '../config.js';
import { updateUserbotStatus, getUserbotSession, getAllRegisteredUsers, getDisabledPlugins, disablePlugin, enablePlugin, deleteUserbot, updateUserbotFeature } from '../database/db.js';
import { helpRegistry, loadedPlugins } from '../userbot/pluginRegistry.js';
import userbotManager from '../userbot/manager.js';
import {
  isOwner,
  panelMain,
  panelUserbot,
  panelPlugins,
  panelSettings,
  panelRegister,
  panelAccessDenied,
  panelAdmin,
  panelStats,
  panelQuickHelp,
  panelDonate,
  panelHealth,
  keyboardMain,
  keyboardUserbot,
  keyboardSettings,
  keyboardDangerDelete,
  keyboardPluginStudio,
  keyboardRegister,
  keyboardAdmin,
  keyboardBack,
} from './richUi.js';
import { buildHelpMenuRichHtml, helpKeyboard } from './inlineHelp.js';

function styleForButtonText(text = '') {
  const label = String(text).trim();
  if (label.includes('Mulai') || label.includes('Login')) return 'success';
  if (label.includes('Dashboard') || label.includes('Command Center')) return 'primary';
  if (label.includes('Hapus') || label.includes('Cancel') || label.includes('Danger')) return 'danger';
  return undefined;
}

export function applyButtonStylesToPayload(payload) {
  const keyboard = payload?.reply_markup?.inline_keyboard;
  if (!Array.isArray(keyboard)) return;
  for (const row of keyboard) {
    if (!Array.isArray(row)) continue;
    for (const button of row) {
      if (!button?.style) {
        const style = styleForButtonText(button?.text);
        if (style) button.style = style;
      }
    }
  }
}

async function mongoStatusLabel() {
  try {
    const mongoose = await import('mongoose');
    return mongoose.default.connection.readyState === 1
      ? `🟢 Connected (${mongoose.default.connection.name})`
      : `🔴 State ${mongoose.default.connection.readyState}`;
  } catch (e) {
    return '🔴 Disconnected';
  }
}

async function sendRich(ctx, rich, reply_markup, { deleteOld = false } = {}) {
  const rich_message = typeof rich === 'string' ? { html: rich } : rich;
  try {
    await ctx.replyWithRichMessage(
      rich_message,
      { reply_markup }
    );
    if (deleteOld) {
      try { await ctx.deleteMessage(); } catch (_) {}
    }
  } catch (err) {
    console.warn('sendRichMessage failed:', err.message);
    await ctx.reply('⚠️ Rich message gagal dikirim. Coba update Telegram atau kirim /menu lagi.');
  }
}

async function openMain(ctx, options = {}) {
  await sendRich(ctx, panelMain(ctx), keyboardMain(ctx), options);
}

async function openHelp(ctx, target = 'ubot', options = {}) {
  const dbSession = getUserbotSession(ctx.from.id);
  const totalPages = Math.ceil(Object.keys(helpRegistry).length / 4) || 1;
  await sendRich(ctx, buildHelpMenuRichHtml(dbSession, 1, totalPages), helpKeyboard(1, target), options);
}


function findPlugin(name) {
  const target = decodeURIComponent(String(name || '')).trim().toLowerCase();
  return loadedPlugins.find(plugin => String(plugin.name).toLowerCase() === target);
}

function pluginNotice(pluginName, enabled) {
  return `${enabled ? 'Plugin diaktifkan' : 'Plugin dinonaktifkan'}: ${pluginName}`;
}

async function openPluginStudio(ctx, page = 1, notice = '', options = {}) {
  await sendRich(ctx, panelPlugins(ctx, page, notice), keyboardPluginStudio(ctx, page), options);
}

export function registerRichHandlers(bot) {
  bot.api.config.use(async (prev, method, payload, signal) => {
    applyButtonStylesToPayload(payload);
    if (Array.isArray(payload?.results)) {
      for (const result of payload.results) applyButtonStylesToPayload(result);
    }
    return prev(method, payload, signal);
  });

  bot.command(['start', 'menu'], async (ctx) => {
    await openMain(ctx);
  });

  bot.command('health', async (ctx) => {
    if (!isOwner(ctx)) return;
    await sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'));
  });

  bot.command('revoke', async (ctx) => {
    const telegramId = ctx.from.id;
    const session = getUserbotSession(telegramId);
    if (!session) {
      return ctx.reply('❌ Anda belum memiliki sesi userbot yang aktif di sistem.');
    }
    
    await ctx.reply('⏳ Memproses penghapusan sesi dan logout dari Telegram...');
    
    // Attempt remote logout
    try {
      const ubot = userbotManager.clients.get(telegramId);
      if (ubot && ubot.client) {
        await ubot.client.call({ _: 'auth.logOut' });
      }
    } catch (e) {
      console.log(`Failed to logout remotely for ${telegramId}:`, e.message);
    }

    // Stop bot locally
    await userbotManager.stopUserbot(telegramId);
    
    // Delete from database
    deleteUserbot(telegramId);
    
    await ctx.reply('✅ Sesi Anda telah berhasil dihapus sepenuhnya (Revoked).\n\nKetik /daftar kembali jika ingin mendaftar ulang.');
  });

  bot.callbackQuery(/^rich:(.+)$/, async (ctx) => {
    const action = ctx.match[1];
    try { await ctx.answerCallbackQuery(); } catch (_) {}

    if (action === 'main') return openMain(ctx, { deleteOld: true });
    if (action === 'ubot') return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { deleteOld: true });

    if (action === 'toggle_power') {
      const telegramId = ctx.from.id;
      const session = getUserbotSession(telegramId);
      if (!session) return ctx.answerCallbackQuery('Sesi tidak ditemukan.');

      const isRunning = userbotManager.isRunning(telegramId);
      if (isRunning) {
        await ctx.answerCallbackQuery('Mematikan DeltaUbot...');
        await userbotManager.stopUserbot(telegramId);
        updateUserbotStatus(telegramId, false); // Optional: if status is tracked
      } else {
        await ctx.answerCallbackQuery('Menghidupkan DeltaUbot...');
        try {
          await userbotManager.startUserbot(telegramId, session.session_string);
          updateUserbotStatus(telegramId, true);
        } catch (err) {
          return ctx.reply(`❌ Gagal menghidupkan DeltaUbot: ${err.message}`);
        }
      }
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx), { deleteOld: true });
    }
    if (action === 'plugins') return openPluginStudio(ctx, 1, '', { deleteOld: true });
    if (action.startsWith('plugin_page:')) {
      const page = Number(action.split(':')[1] || 1);
      return openPluginStudio(ctx, page, '', { deleteOld: true });
    }
    if (action.startsWith('plugin_toggle:')) {
      const [, rawName, rawPage] = action.split(':');
      const page = Number(rawPage || 1);
      const plugin = findPlugin(rawName);
      if (!plugin) {
        return openPluginStudio(ctx, page, 'Plugin tidak ditemukan.', { deleteOld: true });
      }
      const pluginName = String(plugin.name);
      const lower = pluginName.toLowerCase();
      const protectedPlugins = ['admin', 'pluginmanager'];
      const disabled = getDisabledPlugins(ctx.from.id).map(name => String(name).toLowerCase());
      const isDisabled = disabled.includes(lower);

      if (!isDisabled && protectedPlugins.includes(lower)) {
        return openPluginStudio(ctx, page, `Plugin protected tidak bisa dimatikan: ${pluginName}`, { deleteOld: true });
      }

      if (isDisabled) {
        await enablePlugin(ctx.from.id, pluginName);
        return openPluginStudio(ctx, page, pluginNotice(pluginName, true), { deleteOld: true });
      }

      await disablePlugin(ctx.from.id, pluginName);
      return openPluginStudio(ctx, page, pluginNotice(pluginName, false), { deleteOld: true });
    }
        if (action === 'settings') return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { deleteOld: true });
    
    if (action === 'toggle_anti_pm') {
      const session = getUserbotSession(ctx.from.id);
      if (!session) return ctx.answerCallbackQuery('Sesi tidak ditemukan.');
      const newStatus = session.anti_pm === 1 ? 0 : 1;
      updateUserbotFeature(ctx.from.id, 'anti_pm', newStatus);
      await ctx.answerCallbackQuery(`Anti-PM diubah menjadi ${newStatus === 1 ? 'ON' : 'OFF'}`);
      return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { deleteOld: true });
    }
    
    if (action === 'toggle_afk') {
      const session = getUserbotSession(ctx.from.id);
      if (!session) return ctx.answerCallbackQuery('Sesi tidak ditemukan.');
      const newStatus = session.auto_reply === 1 ? 0 : 1;
      updateUserbotFeature(ctx.from.id, 'auto_reply', newStatus);
      await ctx.answerCallbackQuery(`Auto-Reply (AFK) diubah menjadi ${newStatus === 1 ? 'ON' : 'OFF'}`);
      return sendRich(ctx, panelSettings(ctx), keyboardSettings(ctx), { deleteOld: true });
    }
    
    if (action === 'edit_afk') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('afk-reason-conv');
    }
    
    if (action === 'edit_bot_token') {
      await ctx.answerCallbackQuery();
      return ctx.conversation.enter('inline-bot-conv');
    }
    
    if (action === 'danger_delete_session') {
      await ctx.answerCallbackQuery();
      const text = `🔺 <b>D E L T A   U B O T   J S</b> 🔺\n───────────────────────\n⚠️ <b>KONFIRMASI PENGHAPUSAN SESI</b>\n\nTindakan ini akan mematikan userbot dan menghapus session string dari database.\n\nJika hanya ingin berhenti sementara, gunakan tombol <b>Matikan Userbot</b>, bukan hapus sesi.`;
      return sendRich(ctx, text, keyboardDangerDelete(), { deleteOld: true });
    }
    
    if (action === 'confirm_delete_session') {
      await ctx.answerCallbackQuery('Menghapus sesi...');
      const telegramId = ctx.from.id;
      
      try {
        const ubot = userbotManager.clients.get(telegramId);
        if (ubot && ubot.client) {
          await ubot.client.call({ _: 'auth.logOut' });
        }
      } catch (e) {
        console.log(`Failed to logout remotely for ${telegramId}:`, e.message);
      }

      if (userbotManager.isRunning(telegramId)) {
        await userbotManager.stopUserbot(telegramId);
      }
      deleteUserbot(telegramId);
      await ctx.reply('🗑️ <b>Sesi berhasil dihapus secara permanen dari server Telegram dan database.</b>', { parse_mode: 'HTML' });
      return openMain(ctx, { deleteOld: true });
    }

    if (action === 'register') return sendRich(ctx, panelRegister(ctx), keyboardRegister(), { deleteOld: true });
    if (action === 'stats') return sendRich(ctx, panelStats(ctx), keyboardBack('main'), { deleteOld: true });
    if (action === 'guide') return sendRich(ctx, panelQuickHelp(ctx), keyboardBack('main'), { deleteOld: true });
    if (action === 'donate') return sendRich(ctx, panelDonate(ctx), keyboardBack('main'), { deleteOld: true });
    if (action === 'help' || action === 'help_main') return openHelp(ctx, 'main', { deleteOld: true });
    if (action === 'help_ubot') return openHelp(ctx, 'ubot', { deleteOld: true });

    if (action === 'admin') {
      if (!isOwner(ctx)) return;
      return sendRich(ctx, panelAdmin(ctx), keyboardAdmin(), { deleteOld: true });
    }
    if (action === 'health') {
      if (!isOwner(ctx)) return;
      return sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'), { deleteOld: true });
    }
    if (action === 'admin_users') {
      if (!isOwner(ctx)) return;
      const users = getAllRegisteredUsers();
      const rows = users.slice(0, 10).map(u => `${u.telegram_id} · ${u.is_active === 1 ? 'active' : 'inactive'}`).join('\n') || 'Belum ada user.';
      return ctx.reply(`👥 User Directory\n\n${rows}`);
    }
    if (action === 'backup') {
      if (!isOwner(ctx)) return;
      return ctx.reply('Gunakan command owner:\n/backup — backup database\n/stats_db — statistik database');
    }
    if (action === 'broadcast') {
      if (!isOwner(ctx)) return;
      return ctx.conversation.enter('admin-broadcast-conv');
    }
    if (action === 'otp') return ctx.conversation.enter('otp-reg');
    if (action === 'qr') return ctx.conversation.enter('qr-reg');
  });
}

export async function sendAccessDeniedRich(ctx) {
  await sendRich(ctx, panelAccessDenied(ctx), keyboardBack('main'), { deleteOld: true });
}
