import { InlineKeyboard } from 'grammy';
import config from '../../config.js';
import { activeRegClients } from '../conversations/registration.js';
import { sendAccessDeniedRich, panelMain, keyboardMain } from '../ui/keyboards/dashboard.js';
import { replyRich, editRich } from '../../utils/richMessage.js';
import { Logger } from '../../utils/logger.js';
import { isApproved, approveUser, revokeUser } from '../state/approvedUsers.js';

async function sendMainRich(ctx, deleteOld = false) {
  await replyRich(ctx, panelMain(ctx), { reply_markup: keyboardMain(ctx) });
  if (deleteOld) {
    try { await ctx.deleteMessage(); } catch (_) { /* empty */ }
  }
}

export function registerLegacyCallbacks(bot) {
  // Legacy callback aliases kept so old buttons/conversation prompts still work.
  bot.callbackQuery('back_to_main', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendMainRich(ctx, true);
  });

  bot.callbackQuery('ubot_register_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = ctx.from.id;
    if (Number(id) !== Number(config.ownerId) && !isApproved(Number(id))) {
      await sendAccessDeniedRich(ctx);
      return;
    }
    await ctx.conversation.enter('otp-reg');
  });

  bot.callbackQuery('reg_otp', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Same approval gate as ubot_register_menu — otherwise these aliases let
    // any user bypass the subscription/approval system and register a userbot.
    const id = ctx.from.id;
    if (Number(id) !== Number(config.ownerId) && !isApproved(Number(id))) {
      await sendAccessDeniedRich(ctx);
      return;
    }
    await ctx.conversation.enter('otp-reg');
  });

  bot.callbackQuery('reg_qr', async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = ctx.from.id;
    if (Number(id) !== Number(config.ownerId) && !isApproved(Number(id))) {
      await sendAccessDeniedRich(ctx);
      return;
    }
    await ctx.conversation.enter('qr-reg');
  });

  bot.callbackQuery('request_approval', async (ctx) => {
    const telegramId = ctx.from.id;
    const name = ctx.from.first_name || 'User';
    const username = ctx.from.username ? `@${ctx.from.username}` : 'Tanpa Username';
    try {
      const targetChat = config.logGroupId || config.ownerId;
      const extraParams: Record<string, unknown> = {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .text('✅ Setujui', `approve_reg:${telegramId}`)
          .text('❌ Tolak', `reject_reg:${telegramId}`),
      };
      if (config.logGroupId && config.logTopicId) {extraParams.message_thread_id = config.logTopicId;}
      await ctx.api.sendMessage(targetChat,
        `🔔 <b>Permintaan Registrasi</b>\n\n` +
        `<pre>Nama      ${name}\nUsername  ${username}\nID        ${telegramId}</pre>`,
        extraParams,
      );
      await ctx.editMessageText('✅ Permintaan terkirim. Tunggu persetujuan owner.', {
        reply_markup: new InlineKeyboard().text('Dashboard', 'back_to_main'),
      });
    } catch (err) {
      Logger.logUser(ctx.from.id, `request_approval error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await ctx.answerCallbackQuery({ text: 'Gagal mengirim permintaan approval.', show_alert: true });
    }
  });

  bot.callbackQuery(/^approve_reg:(\d+)$/, async (ctx) => {
    // Only the owner may approve registrations. Callback data can be forged by
    // any user, so authorize on ctx.from.id — never on the callback payload.
    if (Number(ctx.from.id) !== Number(config.ownerId)) {
      await ctx.answerCallbackQuery({ text: '⛔ Hanya owner yang boleh menyetujui.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    const targetId = Number(ctx.match[1]);
    approveUser(targetId);
    await editRich(ctx, `<blockquote><b>✅ BERHASIL</b><br>Pendaftaran <code>${targetId}</code> disetujui.</blockquote>`);
    try { await ctx.api.sendMessage(targetId, '🎉 Pendaftaran disetujui. Kirim /menu untuk mulai.'); } catch (_) { /* user may have blocked the bot */ }
  });

  bot.callbackQuery(/^reject_reg:(\d+)$/, async (ctx) => {
    // Owner-only — see approve_reg above.
    if (Number(ctx.from.id) !== Number(config.ownerId)) {
      await ctx.answerCallbackQuery({ text: '⛔ Hanya owner yang boleh menolak.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    const targetId = Number(ctx.match[1]);
    revokeUser(targetId);
    await editRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Pendaftaran <code>${targetId}</code> ditolak.</blockquote>`);
    try { await ctx.api.sendMessage(targetId, '❌ Pendaftaran userbot ditolak oleh owner.'); } catch (_) { /* user may have blocked the bot */ }
  });

  bot.callbackQuery('cancel_reg', async (ctx) => {
    const userId = ctx.from.id;
    const client = activeRegClients.get(userId);
    if (client) {
      try { await client.disconnect(); } catch (_) { /* empty */ }
      activeRegClients.delete(userId);
    }
    try { await ctx.answerCallbackQuery('Pendaftaran dibatalkan.'); } catch (_) { /* empty */ }
    await ctx.conversation.exitAll();
    try { await ctx.deleteMessage(); } catch (_) { /* empty */ }
    await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Pendaftaran dibatalkan.</blockquote>`);
    await sendMainRich(ctx);
  });
}
