import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { fetchWithTimeout } from '../../../utils/http.js';
import type { CompatClient } from '../../engine/compatClient.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';

const BROWER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Fungsi upload ke tmpfiles.org; fallback ke uguu.se. Keduanya terverifikasi jalan.
async function uploadToTmpfiles(buf, filename) {
  const form = new FormData();
  form.append('file', new Blob([buf]), filename);
  const res = await fetchWithTimeout('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: form,
    headers: { 'User-Agent': BROWER_UA }
  }, 60_000);
  if (!res.ok) {throw new Error(`tmpfiles ${res.status}`);}
  const data = await res.json();
  const url = data?.data?.url;
  if (!url) {throw new Error('tmpfiles: URL tidak ditemukan');}
  // API memberi halaman view; ubah ke link direct download
  return url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

async function uploadToUguu(buf, filename) {
  const form = new FormData();
  form.append('files[]', new Blob([buf]), filename);
  const res = await fetchWithTimeout('https://uguu.se/upload.php', {
    method: 'POST',
    body: form,
    headers: { 'User-Agent': BROWER_UA }
  }, 60_000);
  if (!res.ok) {throw new Error(`uguu ${res.status}`);}
  const data = await res.json();
  const url = data?.files?.[0]?.url;
  if (!url) {throw new Error('uguu: URL tidak ditemukan');}
  return url;
}

export default {
  name: 'tourl',
  version: '1.0.0',
  description: 'Upload media dari pesan yang di-reply menjadi URL.',
  help: {
    title: 'To URL (.tourl)',
    description: 'Mengubah foto/video/dokumen yang di-reply menjadi link unduhan.',
    usage: 'Balas media lalu ketik `.tourl`',
    detail: 'Upload ke tmpfiles.org (fallback uguu.se), mengembalikan link unduhan langsung.'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, _settings: UserbotSettings, telegramId: number) {
    if (!message.out || !message.message) {return;}
    const cmd = message.message.trim().toLowerCase();
    if (cmd !== '.tourl') {return;}

    const replied = await message.getReplyMessage();
    if (!replied || !replied.media) {
      await message.edit({
        text: `<blockquote>❌ <b>Gagal:</b> Balas sebuah media (foto/video/dokumen) untuk di-upload!</blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    await message.edit({
      text: `<blockquote>⏳ <b>Mengunduh media & mengunggah...</b></blockquote>`,
      parseMode: 'html'
    });

    try {
      // mtcute tidak punya client.downloadMedia(); pakai adapter pesan, dengan
      // downloadAsBuffer() atas objek media sebagai cadangan.
      let buffer: Buffer | string | undefined;
      if (typeof replied.downloadMedia === 'function') {
        buffer = await replied.downloadMedia();
      }
      if (!buffer && replied.media && typeof client.downloadAsBuffer === 'function') {
        buffer = Buffer.from(await client.downloadAsBuffer(replied.media as unknown as Parameters<CompatClient['downloadAsBuffer']>[0]));
      }
      if (!buffer || buffer.length === 0) {
        throw new Error('Gagal mengunduh media');
      }
      const filename = `file_${Date.now()}`;

      await message.edit({
        text: `<blockquote>⏳ <b>Mengunggah (${(buffer.length / 1024).toFixed(1)} KB)...</b></blockquote>`,
        parseMode: 'html'
      });

      let url;
      try {
        url = await uploadToTmpfiles(buffer, filename);
      } catch (e1) {
        Logger.logUser(telegramId, `tourl tmpfiles failed: ${e1 instanceof Error ? e1.message : String(e1)}, mencoba uguu`, 'WARN');
        url = await uploadToUguu(buffer, filename);
      }

      await message.edit({
        text: `✅ <b>Upload Berhasil</b>\n\n<blockquote><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></blockquote>\n<i>Link kedaluwarsa otomatis (host sementara).</i>`,
        parseMode: 'html',
        linkPreview: false
      });
    } catch (err) {
      Logger.logUser(telegramId, `Error in tourl plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Gagal upload:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
