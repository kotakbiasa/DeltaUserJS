import { InlineKeyboard } from 'grammy';
import { replyRich, escapeHtml } from '../../utils/richMessage.js';
import userbotManager from '../../userbot/engine/manager.js';
import { getUserbotSession, saveSchedule } from '../../infrastructure/database.js';
import { startLoop } from '../../userbot/handlers/util/loop.js';

const loopCancelKeyboard = new InlineKeyboard().text('❌ Batal', 'cancel_loop');

async function waitForInput(conversation: any, ctx: any): Promise<string> {
  const result = await conversation.waitFor(['message:text', 'callback_query:data']);
  const cbData = result.callbackQuery?.data;
  const textMsg = result.message?.text?.trim().toLowerCase();

  if (cbData === 'cancel_loop' || cbData === 'cancel' || textMsg === '/cancel') {
    if (result.callbackQuery) {
      try { await result.answerCallbackQuery('Aksi dibatalkan.'); } catch (_) {}
      try { await result.deleteMessage(); } catch (_) {}
    }
    await replyRich(ctx, `<p><b>❌ Aksi Dibatalkan</b><br>Penjadwalan broadcast dibatalkan.</p>`);
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

export async function userAddLoopConversation(conversation: any, ctx: any) {
  const telegramId = ctx.from.id;
  const session = getUserbotSession(telegramId);
  if (!session) {
    await replyRich(ctx, `<p>❌ Anda belum memiliki sesi userbot terdaftar. Silakan registrasi terlebih dahulu.</p>`);
    return;
  }

  const isRunning = userbotManager.isRunning(telegramId);
  const ubot = userbotManager.clients.get(telegramId);

  try {
    await replyRich(ctx,
      `<h1 align="center">⏰ Tambah Jadwal Auto-Loop</h1>` +
      `<h3>Langkah 1/3: Target Obrolan / Grup</h3>` +
      `<p>Kirimkan <b>ID Obrolan</b> (misal: <code>-1001234567890</code>), username channel/grup (misal: <code>@grupanda</code>), atau ketik <code>me</code> untuk pesan tersimpan pribadi (Saved Messages).</p>` +
      `<footer>Ketik /cancel atau ketuk tombol di bawah untuk membatalkan:</footer>`,
      { reply_markup: loopCancelKeyboard }
    );

    let targetChat: string;
    try {
      targetChat = await waitForInput(conversation, ctx);
    } catch (err: any) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    await replyRich(ctx,
      `<h3>Langkah 2/3: Interval Pengiriman (Menit)</h3>` +
      `<p>Target: <code>${escapeHtml(targetChat)}</code><br><br>` +
      `Kirimkan interval pengiriman berkala dalam satuan <b>menit</b> (angka minimal 1, contoh: <code>10</code> untuk tiap 10 menit, <code>60</code> untuk tiap 1 jam).</p>`,
      { reply_markup: loopCancelKeyboard }
    );

    let minutesInput: string;
    try {
      minutesInput = await waitForInput(conversation, ctx);
    } catch (err: any) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    const minutes = parseInt(minutesInput, 10);
    if (isNaN(minutes) || minutes < 1) {
      await replyRich(ctx, `<p>❌ Interval tidak valid. Harus berupa angka minimal 1 menit. Penjadwalan dibatalkan.</p>`);
      return;
    }

    await replyRich(ctx,
      `<h3>Langkah 3/3: Isi Pesan Broadcast</h3>` +
      `<p>Target: <code>${escapeHtml(targetChat)}</code> · Interval: <b>${minutes} Menit</b><br><br>` +
      `Kirimkan teks pesan promosi / pesan broadcast yang ingin dikirimkan secara otomatis.</p>`,
      { reply_markup: loopCancelKeyboard }
    );

    let loopMessage: string;
    try {
      loopMessage = await waitForInput(conversation, ctx);
    } catch (err: any) {
      if (err.message === 'USER_CANCELLED') return;
      throw err;
    }

    // Persist to database
    await saveSchedule(telegramId, targetChat, 'loop', minutes, loopMessage);

    // If userbot is running, activate immediately in memory
    if (isRunning && ubot && ubot.client) {
      startLoop(ubot.client, telegramId, targetChat, minutes, loopMessage, false);
    }

    const keyboard = new InlineKeyboard()
      .text('⏰ Kelola Jadwal Broadcast', 'rich:user_loops:1').row()
      .text('🤖 Dashboard Userbot', 'rich:ubot');

    await replyRich(ctx,
      `<h1 align="center">🎉 Jadwal Auto-Loop Berhasil Dibuat!</h1>` +
      `<table bordered striped>` +
      `<tr><th>Pengaturan</th><th>Nilai</th></tr>` +
      `<tr><td>Target Obrolan</td><td><code>${escapeHtml(targetChat)}</code></td></tr>` +
      `<tr><td>Interval</td><td><b>Tiap ${minutes} Menit</b></td></tr>` +
      `<tr><td>Status Runtime</td><td>${isRunning ? '🟢 Berjalan Sekarang' : '🟡 Disimpan (Aktif saat bot start)'}</td></tr>` +
      `</table>` +
      `<h3>📝 Isi Pesan Broadcast:</h3>` +
      `<pre>${escapeHtml(loopMessage)}</pre>` +
      `<footer>Jadwal ini disimpan permanen dan akan pulih otomatis saat userbot direstart.</footer>`,
      { reply_markup: keyboard }
    );
  } catch (err: any) {
    if (err.message === 'USER_CANCELLED') return;
    await replyRich(ctx, `<p>❌ Terjadi kesalahan saat menjadwalkan: ${escapeHtml(err.message || String(err))}</p>`);
  }
}
