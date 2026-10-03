import { fetchWithTimeout } from '../../../utils/http.js';
import { defineCommand } from '../../engine/defineCommand.js';

export default defineCommand({
  name: 'brat',
  version: '1.0.0',
  description: 'Membuat gambar tulisan brat (gaya TikTok) / iPhone quoted.',
  help: {
    title: 'Brat Text (.brat)',
    description: 'Membuat gambar bergaya brat (video TikTok nulis blur) dari teks.',
    usage: '`.brat <teks>`',
    detail: 'Contoh: `.brat halo semua`. Hasil dikirim sebagai gambar PNG.'
  },
  args: 'required',
  usage: '<code>.brat &lt;teks&gt;</code>\nContoh: <code>.brat halo semua</code>',
  loading: 'Membuat gambar brat...',
  errorTitle: 'Gagal membuat brat',
  logErrors: true,

  async run({ client, message, arg: text }) {
    // Endpoint terverifikasi: api.siputzx.my.id/api/m/brat mengembalikan PNG.
    const url = `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(text)}`;
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }
    }, 20_000);
    if (!response.ok) {throw new Error(`API brat gagal: ${response.status}`);}

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 1000) {throw new Error('gambar tidak valid');}

    await client.sendMessage(message.chatId, {
      message: `🎨 Brat: ${text.slice(0, 100)}`,
      file: { source: buffer, filename: 'brat.png' },
      parseMode: 'html',
      replyTo: message.replyToMsgId
    });
    try { await message.delete(); } catch (_e) { /* ignore */ }
  }
});
