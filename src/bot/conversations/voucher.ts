import { InlineKeyboard } from 'grammy';
import crypto from 'crypto';
import config from '../../config.js';
import { replyRich, escapeHtml } from '../../utils/richMessage.js';
import { redeemVoucher, createVoucher } from '../../services/VoucherService.js';
import { getMasterBotUsername } from '../state/botUsername.js';

const voucherCancelKeyboard = new InlineKeyboard().text('❌ Batal', 'cancel_voucher');

async function waitForInput(conversation: any, ctx: any): Promise<string> {
  const result = await conversation.waitFor(['message:text', 'callback_query:data']);
  const cbData = result.callbackQuery?.data;
  const textMsg = result.message?.text?.trim().toLowerCase();

  if (cbData === 'cancel_voucher' || cbData === 'cancel' || textMsg === '/cancel') {
    if (result.callbackQuery) {
      try { await result.answerCallbackQuery('Aksi dibatalkan.'); } catch (_) {}
      try { await result.deleteMessage(); } catch (_) {}
    }
    await replyRich(ctx, `<blockquote><b>❌ Aksi Dibatalkan</b><br>Operasi voucher telah dibatalkan.</blockquote>`);
    throw new Error('USER_CANCELLED');
  }

  if (!result.message?.text) {
    throw new Error('USER_CANCELLED');
  }

  try {
    await result.react('👍');
  } catch (_) {}

  return result.message.text.trim();
}

export async function userRedeemVoucherConversation(conversation: any, ctx: any) {
  const telegramId = ctx.from.id;

  try {
    await replyRich(ctx,
      `<h1 align="center">🎟️ Penukaran Kode Voucher Promo</h1>` +
      `<blockquote>Silakan ketik atau tempelkan kode voucher promo Anda.<br>` +
      `Contoh: <code>DELTA-VIP30</code> atau <code>PROMO7D</code></blockquote>` +
      `<p><i>Ketik <code>/cancel</code> atau ketuk tombol di bawah untuk membatalkan:</i></p>`,
      { reply_markup: voucherCancelKeyboard }
    );

    let rawCode: string;
    try {
      rawCode = await waitForInput(conversation, ctx);
    } catch (err: any) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    const userMeta = {
      name: ctx.from?.first_name,
      username: ctx.from?.username,
    };
    const result = await redeemVoucher(rawCode, telegramId, userMeta);

    const keyboard = new InlineKeyboard();
    if (result.success) {
      keyboard.text('🤖 Buka Dashboard Userbot', 'rich:ubot').row();
      keyboard.text('💎 Menu Langganan', 'rich:subscription');
      await replyRich(ctx,
        `<h1 align="center">🎉 Penukaran Voucher Berhasil!</h1>` +
        `<blockquote>${result.message}</blockquote>` +
        `<p><i>Layanan userbot Anda telah diperpanjang dan siap digunakan.</i></p>`,
        { reply_markup: keyboard }
      );
    } else {
      keyboard.text('🎟️ Coba Lagi', 'rich:redeem_voucher').row();
      keyboard.text('💎 Menu Langganan', 'rich:subscription');
      await replyRich(ctx,
        `<h1 align="center">❌ Gagal Menukarkan Voucher</h1>` +
        `<blockquote>${escapeHtml(result.message)}</blockquote>`,
        { reply_markup: keyboard }
      );
    }
  } catch (err: any) {
    if (err.message === 'USER_CANCELLED') return;
    await replyRich(ctx, `<blockquote>❌ Terjadi kesalahan saat memproses voucher: ${escapeHtml(err.message || String(err))}</blockquote>`);
  }
}

export async function adminCreateVoucherConversation(conversation: any, ctx: any) {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {
    await replyRich(ctx, `<blockquote>❌ Anda tidak memiliki akses ke fitur ini.</blockquote>`);
    return;
  }

  try {
    await replyRich(ctx,
      `<h1 align="center">🎟️ Buat Kode Voucher Promo Baru</h1>` +
      `<blockquote>Langkah 1/3: <b>Kode Voucher</b><br>` +
      `Ketik kode voucher yang diinginkan (contoh: <code>PROMO-RAMADHAN</code>), atau ketik <code>auto</code> untuk generate kode acak otomatis.</blockquote>`,
      { reply_markup: voucherCancelKeyboard }
    );

    let codeInput: string;
    try {
      codeInput = await waitForInput(conversation, ctx);
    } catch (err: any) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    let finalCode = codeInput.toUpperCase().trim();
    if (finalCode === 'AUTO') {
      finalCode = 'DELTA-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    }

    await replyRich(ctx,
      `<blockquote>Langkah 2/3: <b>Durasi Masa Aktif (Hari)</b><br>` +
      `Kode: <code>${finalCode}</code><br><br>` +
      `Kirimkan jumlah hari masa aktif yang diberikan (contoh: <code>30</code> untuk 30 hari, atau <code>0</code> untuk Lifetime / Unlimited).</blockquote>`,
      { reply_markup: voucherCancelKeyboard }
    );

    let daysInput: string;
    try {
      daysInput = await waitForInput(conversation, ctx);
    } catch (err: any) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    const days = parseInt(daysInput, 10);
    if (isNaN(days) || days < 0) {
      await replyRich(ctx, `<blockquote>❌ Jumlah hari tidak valid. Pembuatan voucher dibatalkan.</blockquote>`);
      return;
    }

    await replyRich(ctx,
      `<blockquote>Langkah 3/3: <b>Batas Kuota Pemakaian (Max Uses)</b><br>` +
      `Durasi: <b>${days === 0 ? '♾️ Lifetime' : `${days} Hari`}</b><br><br>` +
      `Kirimkan kuota maksimal pengguna yang bisa menukarkan kode ini.<br>` +
      `Contoh: <code>1</code> untuk 1 orang saja, <code>10</code> untuk 10 orang, atau <code>-1</code> untuk kuota tanpa batas.</blockquote>`,
      { reply_markup: voucherCancelKeyboard }
    );

    let quotaInput: string;
    try {
      quotaInput = await waitForInput(conversation, ctx);
    } catch (err: any) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    const maxUses = parseInt(quotaInput, 10);
    if (isNaN(maxUses) || (maxUses < 1 && maxUses !== -1)) {
      await replyRich(ctx, `<blockquote>❌ Kuota tidak valid. Pembuatan voucher dibatalkan.</blockquote>`);
      return;
    }

    const result = await createVoucher({
      code: finalCode,
      days,
      maxUses,
      createdBy: Number(telegramId),
    });

    if (result.success) {
      const botUser = getMasterBotUsername() || 'PanelDeltaUbot';
      const claimUrl = `https://t.me/${botUser}?start=voucher_${finalCode}`;
      const hexCode = Buffer.from(finalCode).toString('hex');
      const shareText = encodeURIComponent(
        `🎁 KODE VOUCHER PROMO AKTIF!\n\n` +
        `⚡ DeltaUserJS Userbot Premium Access\n` +
        `• 🎟️ Kode Voucher: ${finalCode}\n` +
        `• ⏳ Masa Aktif: ${days === 0 ? '♾️ Lifetime' : `+${days} Hari`}\n` +
        `• 👥 Sisa Kuota: ${maxUses === -1 ? '♾️ Unlimited' : `${maxUses} Pengguna`}\n\n` +
        `Ketuk tautan di bawah untuk klaim langsung ke bot:`
      );
      const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(claimUrl)}&text=${shareText}`;

      const keyboard = new InlineKeyboard()
        .url('📢 Bagikan ke Chat / Channel Lain', tgShareUrl).row()
        .text('🚀 Broadcast Ulang ke Channel', `rich:broadcast_voucher:${hexCode}`).row()
        .text('🎟️ Lihat Semua Voucher', 'rich:admin_vouchers:1')
        .text('👑 Panel Admin', 'rich:admin');

      await replyRich(ctx,
        `<h1 align="center">✅ Voucher Berhasil Dibuat!</h1>` +
        `<table bordered striped>` +
        `<tr><th>Parameter</th><th>Nilai</th></tr>` +
        `<tr><td>Kode Voucher</td><td><code>${finalCode}</code></td></tr>` +
        `<tr><td>Masa Aktif</td><td><b>${days === 0 ? '♾️ Lifetime' : `${days} Hari`}</b></td></tr>` +
        `<tr><td>Batas Kuota</td><td>${maxUses === -1 ? '♾️ Unlimited' : `${maxUses} Pengguna`}</td></tr>` +
        `</table>` +
        `<blockquote>📢 <b>Voucher otomatis dibagikan ke Channel</b> dengan tombol klaim instan!<br>` +
        `Anda juga dapat membagikannya ke chat/channel lain menggunakan tombol di bawah:</blockquote>`,
        { reply_markup: keyboard }
      );
    } else {
      const keyboard = new InlineKeyboard()
        .text('🎟️ Lihat Semua Voucher', 'rich:admin_vouchers:1').row()
        .text('👑 Panel Admin', 'rich:admin');
      await replyRich(ctx,
        `<h1 align="center">❌ Gagal Membuat Voucher</h1>` +
        `<blockquote>${escapeHtml(result.message)}</blockquote>`,
        { reply_markup: keyboard }
      );
    }
  } catch (err: any) {
    if (err.message === 'USER_CANCELLED') return;
    await replyRich(ctx, `<blockquote>❌ Terjadi kesalahan: ${escapeHtml(err.message || String(err))}</blockquote>`);
  }
}
