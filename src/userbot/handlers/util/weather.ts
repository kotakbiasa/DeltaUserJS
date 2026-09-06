import { escapeHtml } from '../../../utils/richMessage.js';

export default {
  name: 'weather',
  version: '1.0.0',
  description: 'Info cuaca dari wttr.in.',
  help: {
    title: 'Cuaca (.weather)',
    description: 'Menampilkan cuaca singkat untuk sebuah kota.',
    usage: '`.weather <kota>`',
    detail: 'Contoh: `.weather Jakarta`. Sumber data: wttr.in (format 1 baris).'
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.match(/^\.weather(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    const kota = (match[1] || '').trim();
    if (!kota) {
      await message.edit({
        text: `<blockquote>❌ <b>Format salah:</b> <code>.weather &lt;kota&gt;</code>\nContoh: <code>.weather Jakarta</code></blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    await message.edit({
      text: `<blockquote>⏳ <b>Mengecek cuaca ${escapeHtml(kota)}...</b></blockquote>`,
      parseMode: 'html'
    });

    try {
      // UA curl agar wttr.in membalas plain-text format=3, bukan halaman HTML
      const res = await fetch(`https://wttr.in/${encodeURIComponent(kota)}?format=3`, {
        headers: { 'User-Agent': 'curl/8.5.0' }
      });
      if (!res.ok) {
        throw new Error(`wttr.in responded ${res.status}`);
      }
      const body = (await res.text()).trim();
      if (!body || body.length > 300) {
        throw new Error('Respons tidak dikenal');
      }
      await message.edit({
        text: `🌤️ <b>Cuaca ${escapeHtml(kota)}</b>\n\n<blockquote>${escapeHtml(body)}</blockquote>`,
        parseMode: 'html'
      });
    } catch (err) {
      await message.edit({
        text: `<blockquote>❌ <b>Gagal cek cuaca:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
