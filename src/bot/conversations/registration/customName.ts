import { replyRich } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import { cancelKeyboard, waitForInput } from './shared.js';

/**
 * Conversation to set custom userbot name
 */
export async function customNameConversation(conversation, ctx) {
  const telegramId = ctx.from.id;

  try {
    await replyRich(ctx, `<h1 align="center">📝 Set Custom Nama Ubot</h1><p>Kirimkan nama/signature baru untuk userbot Anda (Maksimal 30 karakter).<br>Contoh: <code>Ubot Sultan</code></p><footer>Ketik /cancel untuk membatalkan.</footer>`, { reply_markup: cancelKeyboard, });

    let newName;
    try {
      newName = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') {return;}
      throw err;
    }

    if (newName.length > 30) {
      await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br>Nama terlalu panjang! Maksimal 30 karakter. Pengaturan dibatalkan.</p>`);
      return;
    }

    // Save to DB
    const { updateUserbotFeature } = await import('../../../infrastructure/database.js');
    await updateUserbotFeature(telegramId, 'custom_name', newName);

    await replyRich(ctx, `✅ <b>Nama Ubot berhasil diperbarui menjadi:</b><br><p>"${newName}"</p>`);

    await ctx.replyWithRichMessage({ html: `<footer>Gunakan <code>/menu</code> untuk kembali ke Panel Kontrol Utama.</footer>` });

  } catch (error) {
    if (error.message !== 'USER_CANCELLED') {
      Logger.logUser(telegramId, `Error in custom name conversation: ${error.message}`, 'ERROR');
      await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br>Terjadi kesalahan sistem. Gagal mengubah nama ubot.</p>`);
    }
  }
}
