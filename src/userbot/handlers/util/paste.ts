import { fetchWithTimeout } from '../../../utils/http.js';
import { defineCommand } from '../../engine/defineCommand.js';

const MAX_BYTES = 500 * 1024; // 500KB

export default defineCommand({
  name: 'paste',
  version: '1.0.0',
  description: 'Unggah teks ke paste.rs dan dapatkan URL.',
  help: {
    title: 'Paste (.paste)',
    description: 'Mengunggah teks ke paste.rs lalu membalas dengan URL paste.',
    usage: '`.paste <teks>` atau reply pesan teks lalu `.paste`',
    detail: 'Contoh: `.paste halo dunia`. Bisa juga reply sebuah pesan teks lalu kirim `.paste`. Teks maksimal 500KB.'
  },
  args: 'required',
  usage: '<code>.paste &lt;teks&gt;</code>\nAtau reply sebuah pesan teks lalu kirim <code>.paste</code>',
  loading: 'Mengunggah ke paste.rs...',
  errorTitle: 'Gagal mengunggah paste',
  logErrors: true,
  finalExtra: { linkPreview: false },

  // Tanpa argumen → ambil teks dari pesan yang di-reply.
  async resolveArg({ message }) {
    if (!message.replyToMsgId) {return '';}
    try {
      const replied = await message.getReplyMessage();
      if (replied !== null && replied !== undefined && replied.message) {
        return replied.message.trim();
      }
    } catch (_e) {
      // Abaikan jika pesan reply tidak bisa diambil
    }
    return '';
  },

  async run({ arg: text, edit }) {
    const byteLength = Buffer.byteLength(text, 'utf8');
    if (byteLength > MAX_BYTES) {
      await edit(`<blockquote>❌ <b>Terlalu besar:</b> ${byteLength} bytes (maksimal 500KB / ${MAX_BYTES} bytes)</blockquote>`);
      return;
    }

    const res = await fetchWithTimeout('https://paste.rs/', {
      method: 'POST',
      headers: {
        'User-Agent': 'DeltaUserJS/1.0',
        'Content-Type': 'text/plain; charset=utf-8'
      },
      body: text
    }, 20_000);
    if (!res.ok) {
      throw new Error(`paste.rs responded ${res.status}`);
    }

    const url = (await res.text()).trim();
    if (!url.startsWith('http')) {
      throw new Error('Respons tidak valid dari paste.rs');
    }

    return `📝 <b>Paste</b>\n\n🔗 ${url}`;
  }
});
