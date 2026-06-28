import { getService, downloadMedia } from '../../../domain/services/downloader/index.js';
import crypto from 'crypto';
import fs from 'fs';

export function registerDlHandler(bot) {
  bot.command('dl', async (ctx) => {
    const text = ctx.message.text || '';
    const cmdParts = text.split(' ');
    const url = cmdParts.length > 1 ? cmdParts[1] : '';
    const service = getService(url);
    
    if (!url || !service) {
      return ctx.reply(`❌ <b>URL tidak valid/tidak didukung!</b>\nHarap masukkan link yang benar (Tiktok, IG, FB, X, dll).`, { parse_mode: 'HTML' });
    }

    const waitMsg = await ctx.reply(`⏳ <b>Mendownload Media...</b>\n\nMohon tunggu sebentar...`, { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id });

    try {
      const id = crypto.randomBytes(4).toString('hex');
      const { filePath: filePathsRaw, metadata: meta } = await downloadMedia(url, id);
      
      const filePaths = Array.isArray(filePathsRaw) ? filePathsRaw : [filePathsRaw];
      const botUsername = ctx.me?.username || 'Bot';

      let title = meta.title || '';
      if (title.length > 900) title = title.slice(0, 900) + '...';

      if (meta.ext !== 'mp4' && filePaths.length > 1) {
        // Slideshow
        const { InputFile } = await import('grammy');
        const mediaGroup = filePaths.map((filePath, i) => {
          return {
            type: 'photo',
            media: new InputFile(filePath),
            caption: i === 0 ? `📸 <b>${title}</b>\n\n<i>Diunduh via @${botUsername}</i>` : '',
            parse_mode: 'HTML'
          };
        });
        
        await ctx.replyWithMediaGroup(mediaGroup, { reply_to_message_id: ctx.message.message_id });
        
        // Cleanup local files
        for (const file of filePaths) {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        }
      } else {
        // Video or single photo
        const ext = meta.ext === 'mp4' ? 'Video' : 'Foto';
        const method = meta.ext === 'mp4' ? 'replyWithVideo' : 'replyWithPhoto';
        
        const { InputFile } = await import('grammy');
        await ctx[method](new InputFile(filePaths[0]), {
          caption: `🎥 <b>${title}</b>\n\n<i>Diunduh via @${botUsername}</i>`,
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message.message_id
        });
        
        if (fs.existsSync(filePaths[0])) fs.unlinkSync(filePaths[0]);
      }
      
      await ctx.api.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
    } catch (err) {
      await ctx.api.editMessageText(ctx.chat.id, waitMsg.message_id, `❌ <b>Gagal Mendownload:</b>\n\n${err.message}`, { parse_mode: 'HTML' }).catch(() => {});
    }
  });
}
