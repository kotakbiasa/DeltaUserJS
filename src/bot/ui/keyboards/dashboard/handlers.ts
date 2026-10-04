/**
 * Pendaftaran command dan callback query dashboard ke instance grammY.
 *
 * Dipecah dari dashboard.ts (2.821 baris). Isi tiap fungsi dipindahkan apa
 * adanya; yang berubah hanya di file mana ia tinggal.
 */
import { deleteUserbot, getUserbotSession } from '../../../../infrastructure/database.js';
import userbotManager from '../../../../userbot/engine/manager.js';
import { Logger } from '../../../../utils/logger.js';
import { escapeHtml, replyRich } from '../../../../utils/richMessage.js';
import { animateBotApiPayload } from '../../../../utils/customEmoji.js';
import { approveUser, hasAcceptedTerms, isApproved } from '../../../state/approvedUsers.js';
import { getSystemVarValue, isOwner } from './shared.js';
import { panelAccessDenied, panelHealth, panelRegister, panelSubscription, panelTermsOfService, panelUserbot } from './panels.js';
import { applyButtonStylesToPayload, keyboardAccessDenied, keyboardBack, keyboardRegister, keyboardSubscription, keyboardTermsOfService, keyboardUserbot } from './keyboards.js';
import { handleNavigationRoutes } from './routes/navigation.js';
import { handlePluginsRoutes } from './routes/plugins.js';
import { handleSettingsRoutes } from './routes/settings.js';
import { handleAccountRoutes } from './routes/account.js';
import { handleInfoRoutes } from './routes/info.js';
import { handleAdminRoutes } from './routes/admin.js';
import { handleMiscRoutes } from './routes/misc.js';
import { NOT_HANDLED } from './routes/types.js';
import { mongoStatusLabel, openMain, sendRich } from './richRuntime.js';

// Helper runtime dipindah ke richRuntime.ts; di-re-export agar import
// lama (mis. dashboard.ts) tetap bekerja tanpa perubahan.
export {
  findPlugin,
  mongoStatusLabel,
  openMain,
  openPluginStudio,
  pluginNotice,
  sendAccessDeniedRich,
  sendRich,
} from './richRuntime.js';

export function registerRichHandlers(bot) {
  bot.api.config.use(async (prev, method, payload, signal) => {
    applyButtonStylesToPayload(payload);
    animateBotApiPayload(method, payload);
    if (Array.isArray(payload?.results)) {
      for (const result of payload.results) {applyButtonStylesToPayload(result);}
    }
    return prev(method, payload, signal);
  });

  bot.command(['start', 'menu'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      await replyRich(ctx, `🤖 <b>${escapeHtml(ctx.me.first_name)} Aktif!</b>\n\n<p>Silakan kirim pesan secara privat (PM) untuk mengelola bot Anda.</p>`, {
        reply_markup: {
          inline_keyboard: [[{ text: '💬 Buka Private Chat', url: `https://t.me/${ctx.me.username}?start=true` }]]
        }
      });
      return;
    }

    await openMain(ctx);
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
    try { await ctx.answerCallbackQuery(); } catch (_) { /* empty */ }
    if ((await handleNavigationRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handlePluginsRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleSettingsRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleAccountRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleInfoRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleAdminRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleMiscRoutes(ctx)) !== NOT_HANDLED) {return;}
  });
}
