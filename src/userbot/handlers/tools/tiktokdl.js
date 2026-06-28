import fs from 'fs';
import path from 'path';
import { TiktokService } from '../../../domain/services/TiktokService.js';

export default {
  name: 'dl',
  help: {
    title: 'TikTok Downloader (.dl)',
    description: 'Mengunduh video/foto dari TikTok tanpa watermark.',
    usage: 'Ketik `.dl [url]` atau `/dl [url]`',
    detail: 'Modul ini akan mendownload media TikTok langsung ke chat.'
  },
  async execute(client, message, settings, telegramId) {
    if (message.out && message.message && (message.message.toLowerCase().startsWith('.dl ') || message.message.toLowerCase().startsWith('/dl '))) {
      const args = message.message.split(' ');
      const url = args[1];
      
      if (!url || !TiktokService.supports(url)) {
        await message.edit({ 
          text: `<blockquote>❌ <b>URL tidak valid!</b>\nHarap masukkan link TikTok yang benar (tiktok.com/vt.tiktok.com).</blockquote>`, 
          parseMode: 'html' 
        });
        return;
      }
      
      try {
        await message.edit({ 
          text: `<blockquote>⏳ <b>Sedang mendownload dari TikTok...</b>\nMohon tunggu...</blockquote>`, 
          parseMode: 'html' 
        });
        
        const destDir = path.join(process.cwd(), 'downloads');
        const { filePaths, meta } = await TiktokService.download(url, destDir);
        
        await message.edit({ 
          text: `<blockquote>📤 <b>Media berhasil diunduh. Sedang mengirim ke chat...</b></blockquote>`, 
          parseMode: 'html' 
        });

        if (meta.isSlideshow) {
          // Send each photo
          for (let i = 0; i < filePaths.length; i++) {
            const file = filePaths[i];
            await client.sendFile(message.chatId, {
              file: file,
              caption: i === 0 ? `<blockquote>✅ <b>${meta.title}</b>\n🔗 ${url}</blockquote>` : '',
              replyTo: message.replyToMsgId,
              parseMode: 'html'
            });
            fs.unlinkSync(file);
          }
        } else {
          // Send video
          await client.sendFile(message.chatId, {
            file: filePaths[0],
            caption: `<blockquote>✅ <b>${meta.title}</b>\n🔗 ${url}</blockquote>`,
            replyTo: message.replyToMsgId,
            parseMode: 'html'
          });
          fs.unlinkSync(filePaths[0]);
        }
        
        // Hapus pesan progress setelah berhasil terkirim
        await message.delete();
        
      } catch (err) {
        console.error('Error in dl plugin:', err);
        await message.edit({ 
          text: `<blockquote>❌ <b>Gagal mendownload media:</b>\n<i>${err.message.slice(0, 500)}...</i></blockquote>`, 
          parseMode: 'html' 
        });
      }
    }
  }
};
