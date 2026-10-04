import { escapeHtml, replyRich } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import config from '../../../config.js';
import { cancelKeyboard, waitForInput } from './shared.js';
import type { BotContext, BotConversation } from '../../context.js';

/**
 * Conversation to broadcast message to all registered users (Owner Only)
 */
export async function broadcastConversation(conversation: BotConversation, ctx: BotContext) {
  const telegramId = ctx.from.id;

  // Double-check if the sender is the owner
  if (Number(telegramId) !== Number(config.ownerId)) {
    await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br>Anda tidak memiliki akses ke fitur Administrator ini!</p>`);
    return;
  }

  try {
    await replyRich(ctx, `<h1 align="center">📢 Panel Broadcast Userbot</h1><p>Silakan kirimkan pesan broadcast yang ingin Anda sebarluaskan ke seluruh pengguna terdaftar.</p>`, { reply_markup: cancelKeyboard, });

    let broadcastMsg;
    try {
      broadcastMsg = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') {return;}
      throw err;
    }

    const MAX_BROADCAST_MESSAGE_LENGTH = 4096;
    const broadcastHeader = '📢 PEMBERITAHUAN USERBOT\n\n';
    if (broadcastMsg.length + broadcastHeader.length > MAX_BROADCAST_MESSAGE_LENGTH) {
      await replyRich(ctx, `<p>❌ Pesan terlalu panjang. Total pesan broadcast maksimal ${MAX_BROADCAST_MESSAGE_LENGTH} karakter.</p>`);
      return;
    }

    await replyRich(ctx, `<p>⏳ Memulai proses broadcast...</p>`);

    // Load DB and active list
    const { getAllRegisteredUsers } = await import('../../../infrastructure/database.js');
    const allUsers = getAllRegisteredUsers();

    let successCount = 0;
    let failCount = 0;

    for (const user of allUsers) {
      try {
        await ctx.api.sendMessage(user.telegram_id, `📢 <b>PEMBERITAHUAN USERBOT</b>\n\n${escapeHtml(broadcastMsg)}`, {
          parse_mode: 'HTML',
        });
        successCount++;
        // Add a small 100ms delay to avoid hitting Telegram's rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (_err) {
        failCount++;
      }
    }

    await replyRich(ctx, `<h1 align="center">✅ Broadcast Selesai!</h1>` +
      `<table bordered striped><caption>📊 Ringkasan Pengiriman</caption>` +
      `<tr><th>Item</th><th>Jumlah</th></tr>` +
      `<tr><td>✅ Sukses Terkirim</td><td align="center"><code>${successCount} Akun</code></td></tr>` +
      `<tr><td>❌ Gagal Terkirim</td><td align="center"><code>${failCount} Akun</code></td></tr>` +
      `</table>` +
      `<footer>Gunakan <code>/menu</code> untuk kembali ke Menu Utama.</footer>`);

  } catch (error) {
    if (error.message !== 'USER_CANCELLED') {
      Logger.logUser(telegramId, `Error in Broadcast Conversation: ${error.message}`, 'ERROR');
      await replyRich(ctx, `<p><b>❌ KESALAHAN</b><br>Terjadi kesalahan sistem saat memproses broadcast.</p>`);
    }
  }
}
