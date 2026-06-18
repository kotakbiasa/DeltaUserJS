import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export default {
  name: 'ytdl',
  help: {
    title: 'YouTube Downloader (.ytdl)',
    description: 'Mengunduh video/audio dari YouTube atau link lainnya menggunakan yt-dlp.',
    usage: 'Ketik `.ytdl [url]` atau `.ytdl audio [url]`.',
    detail: 'Modul ini akan mendownload media berkat kekuatan yt-dlp dan mengirimkannya ke chat.'
  },
  async execute(client, message, settings, telegramId) {
    if (message.out && message.message && message.message.toLowerCase().startsWith('.ytdl ')) {
      const args = message.message.split(' ');
      
      let isAudio = false;
      let url = '';
      
      if (args[1] === 'audio') {
        isAudio = true;
        url = args[2];
      } else {
        url = args[1];
      }
      
      if (!url) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Format salah!</b>\nGunakan: <code>.ytdl [url]</code> atau <code>.ytdl audio [url]</code></blockquote>`, 
          parseMode: 'html' 
        });
        return;
      }
      
      try {
        await message.edit({ 
          text: `<blockquote>⏳ <b>Sedang memproses dan mendownload media...</b>\nMohon tunggu...</blockquote>`, 
          parseMode: 'html' 
        });
        
        const timestamp = Date.now();
        const tmpPath = path.join(process.cwd(), `ytdl_${timestamp}.%(ext)s`);
        
        let formatOpt = '-f "best[ext=mp4]/best"';
        if (isAudio) {
          formatOpt = '-f "bestaudio" --extract-audio --audio-format mp3';
        }
        
        // Batas ukuran 50MB agar cepat dan aman.
        const cmd = `yt-dlp ${formatOpt} -o "${tmpPath}" "${url}" --max-filesize 50M`;
        
        await execAsync(cmd);
        
        // Cari file yang berhasil didownload
        const files = fs.readdirSync(process.cwd());
        const downloadedFile = files.find(f => f.startsWith(`ytdl_${timestamp}`));
        
        if (!downloadedFile) {
          throw new Error('File tidak ditemukan (mungkin ukuran melebihi batas atau link tidak didukung).');
        }
        
        const finalPath = path.join(process.cwd(), downloadedFile);
        
        await message.edit({ 
          text: `<blockquote>📤 <b>Media berhasil diunduh. Sedang mengirim ke chat...</b></blockquote>`, 
          parseMode: 'html' 
        });
        
        await client.sendFile(message.chatId, {
          file: finalPath,
          caption: `<blockquote>✅ <b>Unduhan Selesai</b>\n🔗 ${url}</blockquote>`,
          replyTo: message.replyToMsgId,
          parseMode: 'html'
        });
        
        // Hapus pesan progress setelah berhasil terkirim
        await message.delete();
        
        // Cleanup file
        try {
          fs.unlinkSync(finalPath);
        } catch(e) {}
        
      } catch (err) {
        console.error('Error in ytdl plugin:', err);
        await message.edit({ 
          text: `<blockquote>❌ <b>Gagal mendownload media:</b>\n<i>${err.message.slice(0, 500)}...</i></blockquote>`, 
          parseMode: 'html' 
        });
      }
    }
  }
};
