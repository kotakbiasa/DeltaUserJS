import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { block, code, escapeHtml, footer } from '../ui.js';

const execFileAsync = promisify(execFile);

function findDownloaded(prefix) {
  return fs.readdirSync(process.cwd()).find(file => file.startsWith(prefix));
}

function cleanup(filePath) {
  try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
}

export default {
  name: 'ytdl',
  help: {
    title: 'YouTube Downloader (.ytdl)',
    description: 'Mengunduh video/audio menggunakan yt-dlp.',
    usage: '• `.ytdl <url>`\n• `.ytdl audio <url>`',
    detail: 'Batas ukuran file 50MB agar proses tetap aman dan cepat.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !message.text?.toLowerCase().startsWith('.ytdl')) return;

    const args = message.text.trim().split(/\s+/);
    if (args[0].toLowerCase() !== '.ytdl') return;

    const audio = args[1]?.toLowerCase() === 'audio';
    const url = audio ? args[2] : args[1];
    if (!url) {
      await message.edit({ text: block('Format salah', `Gunakan ${code('.ytdl <url>')} atau ${code('.ytdl audio <url>')}.`) + footer(settings), parseMode: 'html' });
      return;
    }

    let finalPath = null;
    try {
      await message.edit({ text: block('Downloader', 'Memproses media dengan yt-dlp...') + footer(settings), parseMode: 'html' });

      const prefix = `ytdl_${Date.now()}`;
      const output = path.join(process.cwd(), `${prefix}.%(ext)s`);
      const ytdlArgs = audio
        ? ['-f', 'bestaudio', '--extract-audio', '--audio-format', 'mp3', '--max-filesize', '50M', '-o', output, url]
        : ['-f', 'best[ext=mp4]/best', '--max-filesize', '50M', '-o', output, url];

      await execFileAsync('yt-dlp', ytdlArgs, { timeout: 10 * 60 * 1000 });
      const downloaded = findDownloaded(prefix);
      if (!downloaded) throw new Error('File hasil unduhan tidak ditemukan. Link mungkin tidak didukung atau file melewati batas 50MB.');

      finalPath = path.join(process.cwd(), downloaded);
      await message.edit({ text: block('Downloader', 'Media siap. Mengirim ke chat...') + footer(settings), parseMode: 'html' });
      await client.sendFile(message.chat.id, {
        file: finalPath,
        caption: block('Unduhan selesai', escapeHtml(url)) + footer(settings),
        replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id,
        parseMode: 'html',
      });
      await message.delete();
    } catch (err) {
      console.error('Error in ytdl plugin:', err);
      await message.edit({ text: block('Download gagal', escapeHtml(err.message)) + footer(settings), parseMode: 'html' });
    } finally {
      cleanup(finalPath);
    }
  },
};
