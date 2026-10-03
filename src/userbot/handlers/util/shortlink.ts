import { escapeHtml } from '../../../utils/richMessage.js';
import { fetchWithTimeout } from '../../../utils/http.js';
import { defineCommand } from '../../engine/defineCommand.js';

export default defineCommand({
  name: 'shortlink',
  version: '1.0.0',
  description: 'Perpendek URL dengan TinyURL.',
  help: {
    title: 'Shortlink (.shortlink)',
    description: 'Memperpendek sebuah URL menggunakan TinyURL.',
    usage: '`.shortlink <url>`',
    detail: 'Contoh: `.shortlink https://contoh.com/path/panjang`.'
  },
  args: 'required',
  validate: (url) => /^https?:\/\//i.test(url),
  usage: '<code>.shortlink &lt;url&gt;</code>\nURL harus diawali http:// atau https://',
  loading: 'Memperpendek URL...',
  errorTitle: 'Gagal memperpendek URL',
  logErrors: true,
  finalExtra: { linkPreview: false },

  async run({ arg: url }) {
    const api = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
    const res = await fetchWithTimeout(api, {}, 15_000);
    if (!res.ok) {
      throw new Error(`TinyURL responded ${res.status}`);
    }

    const short = (await res.text()).trim();
    if (!short.startsWith('http')) {
      throw new Error('Respons tidak valid');
    }

    return `🔗 <b>Shortlink</b>\n\n<blockquote><code>${escapeHtml(short)}</code></blockquote>\n<i>Asli:</i> ${escapeHtml(url)}`;
  }
});
