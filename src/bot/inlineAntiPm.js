import { InlineKeyboard } from 'grammy';
import { getUserbotSession, addApprovedUser } from '../database/db.js';

/**
 * Register Anti-PM handlers to the master/inline bot
 */
export function registerInlineAntiPmHandlers(bot) {
  // Handle inline queries for Anti-PM
  bot.on('inline_query', async (ctx, next) => {
    const query = ctx.inlineQuery.query.trim();

    if (query.startsWith('antipm_')) {
      const senderId = query.split('_')[1];
      const dbSession = getUserbotSession(ctx.from.id);
      
      const botName = dbSession?.custom_name || 'DeltaUbotJS';
      const text = `🚫 <b>Keamanan Anti-PM</b> 🚫\n\n` +
                   `<blockquote>` +
                   `Halo! Maaf, pemilik akun ini sedang mengaktifkan fitur <b>Anti-PM</b>.\n\n` +
                   `Harap <b>tidak</b> mengirimkan pesan pribadi lagi sebelum mode ini dinonaktifkan, atau pesan Anda selanjutnya akan <b>otomatis terhapus secara permanen</b>.` +
                   `</blockquote>\n\n` +
                   `⚡ <i>${botName}</i>`;

      const markup = new InlineKeyboard()
        .text('✅ Approve', `pm_approve_${senderId}`)
        .text('🚫 Blokir', `pm_block_${senderId}`);

      await ctx.answerInlineQuery([{
        type: 'article',
        id: `antipm-${senderId}`,
        title: 'Anti-PM Warning',
        description: 'Kirim peringatan Anti-PM',
        input_message_content: {
          message_text: text,
          parse_mode: 'HTML'
        },
        reply_markup: markup
      }], {
        cache_time: 0
      });
    } else {
      return next();
    }
  });

  // Handle callback queries for Anti-PM
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith('pm_approve_') || data.startsWith('pm_block_')) {
      const parts = data.split('_');
      const action = parts[1]; // 'approve' or 'block'
      const targetId = parseInt(parts[2]);

      const userSession = getUserbotSession(ctx.from.id);
      try {
        if (!userSession || (userSession.inline_bot_username && userSession.inline_bot_username.toLowerCase() !== ctx.me.username.toLowerCase())) {
           return await ctx.answerCallbackQuery({ text: '❌ Hanya pemilik yang dapat menekan tombol ini!', show_alert: true });
        }
      } catch (e) {
        // Ignored if callback expired
        if (!userSession || (userSession.inline_bot_username && userSession.inline_bot_username.toLowerCase() !== ctx.me.username.toLowerCase())) {
          return;
        }
      }

      const ownerId = userSession.telegram_id;
      const ownerName = userSession.custom_name || 'DeltaUbotJS';

      try {
        if (action === 'approve') {
          await addApprovedUser(ownerId, targetId);
          await ctx.editMessageText(`<blockquote>✅ <b>Pengguna Diizinkan!</b>\nPengguna ID <code>${targetId}</code> telah ditambahkan ke dalam daftar putih (Whitelist) Anti-PM.</blockquote>\n\n⚡ <i>${ownerName}</i>`, { parse_mode: 'HTML' });
          await ctx.answerCallbackQuery({ text: '✅ Pengguna telah diizinkan (Approved)!', show_alert: true });
        } else if (action === 'block') {
          await ctx.editMessageText(`<blockquote>🚫 <b>Pengguna Diblokir!</b>\nPengguna ID <code>${targetId}</code> tetap dalam status terblokir oleh Anti-PM.</blockquote>\n\n⚡ <i>${ownerName}</i>`, { parse_mode: 'HTML' });
          await ctx.answerCallbackQuery({ text: '🚫 Pengguna ditolak!', show_alert: true });
        }
      } catch (err) {
        // Abaikan error timeout dari answerCallbackQuery
        console.error('Ignored callback query error in Anti-PM:', err.message);
      }
    } else {
      return next();
    }
  });
}
