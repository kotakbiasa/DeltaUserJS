import { InlineKeyboard } from 'grammy';
import config from '../../config.js';
import { activeRegClients, abortActiveQr } from '../conversations/registration.js';
import { sendAccessDeniedRich, panelMain, keyboardMain } from '../ui/keyboards/dashboard.js';
import { escapeHtml, replyRich, editRich } from '../../utils/richMessage.js';
import { Logger } from '../../utils/logger.js';
import { isApproved, approveUser, revokeUser } from '../state/approvedUsers.js';
import type { BotContext } from '../context.js';
import type { Bot } from 'grammy';

async function sendMainRich(ctx: BotContext, deleteOld = false) {
  if (ctx.callbackQuery?.message?.message_id) {
    try {
      await ctx.api.editMessageText(
        ctx.callbackQuery.message.chat.id,
        ctx.callbackQuery.message.message_id,
        { html: panelMain(ctx) },
        { reply_markup: keyboardMain(ctx) as unknown as NonNullable<Parameters<typeof ctx.api.editMessageText>[3]>['reply_markup'] }
      );
      return;
    } catch (_) { /* fallback below */ }
  }
  await replyRich(ctx, panelMain(ctx), { reply_markup: keyboardMain(ctx) });
  if (deleteOld) {
    try { await ctx.deleteMessage(); } catch (_) { /* empty */ }
  }
}

export function registerLegacyCallbacks(bot: Bot<BotContext>) {
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
    const name = escapeHtml(ctx.from.first_name || 'User');
    const username = ctx.from.username ? `@${escapeHtml(ctx.from.username)}` : 'Tanpa Username';
    try {
      const targetChat = (config.logGroupId || config.ownerId) as string | number;
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

  bot.callbackQuery(/^(?:approve_reg|approve_trial):(\d+)$/, async (ctx) => {
    // Only the owner may approve registrations.
    if (Number(ctx.from.id) !== Number(config.ownerId)) {
      await ctx.answerCallbackQuery({ text: '⛔ Hanya owner yang boleh menyetujui.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    const targetId = Number(ctx.match[1]);
    approveUser(targetId);
    const nowWib = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    await editRich(ctx, `<p><b>✅ PENDAFTARAN DISETUJUI</b><br>Pengguna <code>${targetId}</code> telah disetujui untuk menggunakan userbot.<br>Waktu: <code>${nowWib} WIB</code></p>`);
    try {
      await ctx.api.sendMessage(
        targetId,
        `🎉 <b>Permintaan Pendaftaran Disetujui!</b>\n\n` +
        `<p>Owner telah menyetujui permohonan pendaftaran userbot untuk akun Anda. Anda memiliki akses penuh untuk menggunakan layanan userbot.</p>\n\n` +
        `<footer>Silakan klik tombol di bawah untuk mulai mendaftar userbot Anda (via Scan QR Code atau OTP):</footer>`,
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
    } catch (_) { /* user may have blocked the bot */ }
  });

  bot.callbackQuery(/^(?:reject_reg|reject_trial):(\d+)$/, async (ctx) => {
    // Owner-only
    if (Number(ctx.from.id) !== Number(config.ownerId)) {
      await ctx.answerCallbackQuery({ text: '⛔ Hanya owner yang boleh menolak.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery();
    const targetId = Number(ctx.match[1]);
    revokeUser(targetId);
    try {
      const userbotManager = (await import('../../userbot/engine/manager.js')).default;
      const { updateUserbotStatus } = await import('../../infrastructure/database.js');
      await userbotManager.stopUserbot(targetId);
      await updateUserbotStatus(targetId, false);
    } catch (_) { /* ignore */ }
    await editRich(ctx, `<p><b>❌ PERMINTAAN DITOLAK</b><br>Permohonan akses untuk pengguna <code>${targetId}</code> telah ditolak/dicabut.</p>`);
    try {
      await ctx.api.sendMessage(
        targetId,
        `<h3>❌ Permintaan Akses Ditolak</h3>\n` +
        `<p>Maaf, permohonan akses userbot Anda belum disetujui atau izin telah dicabut oleh Owner.</p>`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
            ],
          },
        }
      );
    } catch (_) { /* user may have blocked the bot */ }
  });

  bot.callbackQuery(/^(cancel|cancel_reg|cancel_qr)$/, async (ctx) => {
    const userId = ctx.from.id;
    try { await abortActiveQr(userId, ctx.api); } catch (_) { /* empty */ }
    const client = activeRegClients.get(userId);
    if (client) {
      try { await client.disconnect(); } catch (_) { /* empty */ }
      activeRegClients.delete(userId);
    }
    try { await ctx.answerCallbackQuery('Pendaftaran dibatalkan.'); } catch (_) { /* empty */ }
    await ctx.conversation.exitAll();
    try { await ctx.deleteMessage(); } catch (_) { /* empty */ }
    await replyRich(ctx, `<p><b>❌ Aksi dibatalkan.</b><br>Proses pendaftaran dibatalkan.</p>`);
    await sendMainRich(ctx);
  });
}
