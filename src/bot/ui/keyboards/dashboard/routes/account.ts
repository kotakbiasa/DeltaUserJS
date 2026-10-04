/**
 * Langganan, pendaftaran, ToS, dan approval.
 *
 * Dipecah dari dashboard/handlers.ts (1.081 baris). Isi tiap cabang
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 *
 * Mengembalikan NOT_HANDLED bila `action` bukan milik grup ini, supaya
 * router di handlers.ts lanjut ke grup berikutnya (urutan dipertahankan).
 */
import config from '../../../../../config.js';
import { Logger } from '../../../../../utils/logger.js';
import { addPendingApproval, approveUser, hasAcceptedTerms, isApproved, isPendingApproval, setAcceptedTerms } from '../../../../state/approvedUsers.js';
import { canRegister, isAutoApproveEnabled, isOwner } from '../shared.js';
import { escapeHtml } from '../../../../../utils/richMessage.js';
import { getUserbotSession } from '../../../../../infrastructure/database.js';
import { keyboardBuySubscription, keyboardRegister, keyboardSubscription, keyboardTermsDeclined, keyboardTermsOfService } from '../keyboards.js';
import { panelBuySubscription, panelRegister, panelSubscription, panelTermsDeclined, panelTermsOfService } from '../panels.js';
import { sendAccessDeniedRich, sendRich } from '../richRuntime.js';
import { NOT_HANDLED } from './types.js';

export async function handleAccountRoutes(ctx) {
  const action = ctx.match[1];

  if (action === 'subscription') {return sendRich(ctx, panelSubscription(ctx), keyboardSubscription(ctx), { edit: true });}

  if (action === 'register') {
    if (!canRegister(ctx)) {
      return sendAccessDeniedRich(ctx);
    }
    if (isAutoApproveEnabled() && !isApproved(ctx.from.id)) {
      approveUser(ctx.from.id, { name: ctx.from.first_name, username: ctx.from.username });
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
    if (isOwner(ctx) || isAutoApproveEnabled()) {
      approveUser(userId, { name: ctx.from.first_name, username: ctx.from.username });
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
    const nowWib = escapeHtml(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));

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

  return NOT_HANDLED;
}
