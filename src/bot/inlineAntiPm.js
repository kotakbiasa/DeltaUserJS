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
      const richHtml = `<h1>🚫 Keamanan Anti-PM</h1>` +
        `<blockquote>${botName}<br>Akun ini sedang mengaktifkan perlindungan Anti-PM.</blockquote>` +
        `<table bordered striped><caption>Status Perlindungan</caption>` +
        `<tr><th align="center">Item</th><th align="center">Status</th></tr>` +
        `<tr><td>Mode</td><td align="center">Protected</td></tr>` +
        `<tr><td>Aksi</td><td align="center">Jangan spam/private chat</td></tr>` +
        `</table>` +
        `<p>Pesan lanjutan dapat otomatis dihapus atau diblokir.</p>`;

      const markup = new InlineKeyboard()
        .text('✅ Approve', `pm_approve_${senderId}`)
        .text('🚫 Blokir', `pm_block_${senderId}`);

      await ctx.answerInlineQuery([{
        type: 'article',
        id: `antipm-${senderId}`,
        title: 'Anti-PM Warning',
        description: 'Kirim peringatan Anti-PM',
        input_message_content: {
          rich_message: {
            html: richHtml,
          }
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
          await ctx.editMessageText(`✅ <b>Pengguna Diizinkan!</b>\n\n<pre>User ID  ${targetId}\nStatus   Whitelist</pre>\n⚡ <i>${ownerName}</i>`, { parse_mode: 'HTML' });
          await ctx.answerCallbackQuery({ text: '✅ Pengguna telah diizinkan (Approved)!', show_alert: true });
        } else if (action === 'block') {
          await ctx.editMessageText(`🚫 <b>Pengguna Diblokir!</b>\n\n<pre>User ID  ${targetId}\nStatus   Blocked</pre>\n⚡ <i>${ownerName}</i>`, { parse_mode: 'HTML' });
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
