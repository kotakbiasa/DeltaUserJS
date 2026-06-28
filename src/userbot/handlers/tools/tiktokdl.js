import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getService, downloadMedia } from '../../../domain/services/downloader/index.js';

export default {
  name: 'dl',
  help: {
    title: 'Universal Downloader (.dl)',
    description: 'Mengunduh video/foto dari TikTok, IG, FB, Twitter/X.',
    usage: 'Ketik `.dl [url]` atau `/dl [url]`',
    detail: 'Modul ini akan mendownload media langsung ke chat.'
  },
  async execute(client, message, settings, telegramId) {
    if (message.out && message.message && message.message.toLowerCase().startsWith('.dl ')) {
      const args = message.message.split(' ');
      const url = args[1];
      
      if (!url || !getService(url)) {
        await message.edit({ 
          text: `<blockquote>❌ <b>URL tidak valid/tidak didukung!</b>\nLink ini tidak didukung oleh Downloader.</blockquote>`, 
          parseMode: 'html' 
        });
        return;
      }
      
      try {
        await message.edit({ 
          text: `<blockquote>⏳ <b>Sedang mendownload media...</b>\nMohon tunggu...</blockquote>`, 
          parseMode: 'html' 
        });
        
        const id = crypto.randomBytes(4).toString('hex');
        const { filePath: filePathsRaw, metadata: meta } = await downloadMedia(url, id);
        
        // Normalize filePaths to array
        const filePaths = Array.isArray(filePathsRaw) ? filePathsRaw : [filePathsRaw];
        
        await message.edit({ 
          text: `<blockquote>📤 <b>Media berhasil diunduh. Sedang mengirim ke chat...</b></blockquote>`, 
          parseMode: 'html' 
        });

        let title = meta.title || '';
        if (title.length > 900) title = title.slice(0, 900) + '...';

        if (meta.ext !== 'mp4' && filePaths.length > 1) {
          // Send each photo
          for (let i = 0; i < filePaths.length; i++) {
            const file = filePaths[i];
            await client.sendFile(message.chatId, {
              file: file,
              caption: i === 0 ? `<blockquote>✅ <b>${title}</b>\n🔗 ${url}</blockquote>` : '',
              replyTo: message.replyToMsgId,
              parseMode: 'html'
            });
            fs.unlinkSync(file);
          }
        } else {
          // Send video
          await client.sendFile(message.chatId, {
            file: filePaths[0],
            caption: `<blockquote>✅ <b>${title}</b>\n🔗 ${url}</blockquote>`,
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
