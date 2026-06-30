import { getGroupConfig } from '../../../infrastructure/database.js';
import { replyRich } from '../../../utils/richMessage.js';

export function registerReportHandlers(bot) {
  bot.command('report', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    
    if (!ctx.message.reply_to_message) {
      return ctx.reply('❌ Balas pesan yang ingin di-report ke admin.', { reply_to_message_id: ctx.message.message_id });
    }

    try {
      const admins = await ctx.api.getChatAdministrators(ctx.chat.id);
      const adminMentions = admins
        .filter(a => !a.user.is_bot)
        .map(a => `<a href="tg://user?id=${a.user.id}">\u200b</a>`)
        .join('');
      
      await replyRich(ctx, `⚠️ <b>Report terkirim!</b> Admin telah dipanggil untuk memeriksa pesan ini.${adminMentions}`, {
        reply_to_message_id: ctx.message.reply_to_message.message_id
      });
    } catch (e) {
      ctx.reply('❌ Gagal memanggil admin.');
    }
  });

  // Also support @admin tag
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat.type === 'private') return next();
    const text = ctx.message.text.toLowerCase();

    if (text.includes('@admin')) {
      try {
        const admins = await ctx.api.getChatAdministrators(ctx.chat.id);
        const adminMentions = admins
          .filter(a => !a.user.is_bot)
          .map(a => `<a href="tg://user?id=${a.user.id}">\u200b</a>`)
          .join('');
        
        await replyRich(ctx, `⚠️ Admin telah dipanggil.${adminMentions}`, {
          reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : ctx.message.message_id
        });
      } catch (e) {
        // fail silently
      }
    }
    return next();
  });
}
