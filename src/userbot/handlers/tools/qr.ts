import { escapeHtml } from '../../../utils/richMessage.js';
import { fetchWithTimeout } from '../../../utils/http.js';
import { defineCommand } from '../../engine/defineCommand.js';

const BROWER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export default defineCommand({
  name: 'qr',
  version: '1.0.0',
  description: 'Membuat QR Code dari teks/URL.',
  help: {
    title: 'QR Code Maker (.qr)',
    description: 'Mengubah teks atau URL menjadi gambar QR Code.',
    usage: '`.qr <teks>`',
    detail: 'Contoh: `.qr https://example.com`. Hasil dikirim sebagai gambar PNG.'
  },
  args: 'required',
  usage: '<code>.qr &lt;teks&gt;</code>\nContoh: <code>.qr halo semua</code>',
  loading: 'Membuat QR Code...',
  errorTitle: 'Gagal membuat QR',
  logErrors: true,

  async run({ arg: text, client, message }) {
    const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`;
    const res = await fetchWithTimeout(apiUrl, { headers: { 'User-Agent': BROWER_UA } }, 20_000);
    if (!res.ok) {
      throw new Error(`API responded ${res.status}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) {
      throw new Error('QR terlalu kecil / tidak valid');
    }

    await client.sendMessage(message.chatId, {
      message: `🔗 <b>QR Code</b>\n<blockquote>${escapeHtml(text)}</blockquote>`,
      file: { source: buf, filename: 'qr.png' },
      parseMode: 'html',
      replyTo: message.replyToMsgId
    });
    try { await message.delete(); } catch (_e) { /* ignore */ }
  }
});
