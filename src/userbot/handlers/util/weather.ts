import { escapeHtml } from '../../../utils/richMessage.js';
import { fetchWithTimeout } from '../../../utils/http.js';
import { defineCommand } from '../../engine/defineCommand.js';

export default defineCommand({
  name: 'weather',
  version: '1.0.0',
  description: 'Info cuaca dari wttr.in.',
  help: {
    title: 'Cuaca (.weather)',
    description: 'Menampilkan cuaca singkat untuk sebuah kota.',
    usage: '`.weather <kota>`',
    detail: 'Contoh: `.weather Jakarta`. Sumber data: wttr.in (format 1 baris).'
  },
  args: 'required',
  usage: '<code>.weather &lt;kota&gt;</code>\nContoh: <code>.weather Jakarta</code>',
  loading: (kota) => `Mengecek cuaca ${escapeHtml(kota)}...`,
  errorTitle: 'Gagal cek cuaca',

  async run({ arg: kota }) {
    // UA curl agar wttr.in membalas plain-text format=3, bukan halaman HTML
    const res = await fetchWithTimeout(`https://wttr.in/${encodeURIComponent(kota)}?format=3`, {
      headers: { 'User-Agent': 'curl/8.5.0' }
    }, 15_000);
    if (!res.ok) {
      throw new Error(`wttr.in responded ${res.status}`);
    }

    const body = (await res.text()).trim();
    if (!body || body.length > 300) {
      throw new Error('Respons tidak dikenal');
    }

    return `🌤️ <b>Cuaca ${escapeHtml(kota)}</b>\n\n<blockquote>${escapeHtml(body)}</blockquote>`;
  }
});
