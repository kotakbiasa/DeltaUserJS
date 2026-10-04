import { escapeHtml } from '../../../utils/richMessage.js';
import { fetchWithTimeout } from '../../../utils/http.js';
import { defineCommand } from '../../engine/defineCommand.js';
import { toPeer } from '../../engine/compatClient.js';

export default defineCommand({
  name: 'wiki',
  version: '1.0.0',
  description: 'Cari ringkasan artikel Wikipedia Indonesia.',
  help: {
    title: 'Wikipedia (.wiki)',
    description: 'Menampilkan ringkasan artikel Wikipedia bahasa Indonesia.',
    usage: '`.wiki <query>`',
    detail: 'Contoh: `.wiki Indonesia`. Menggunakan REST API Wikipedia id.'
  },
  args: 'required',
  usage: '<code>.wiki &lt;query&gt;</code>\nContoh: <code>.wiki Indonesia</code>',
  loading: (query) => `Mencari "${escapeHtml(query)}" di Wikipedia...`,
  errorTitle: 'Gagal mencari di Wikipedia',
  finalExtra: { linkPreview: false },

  async run({ arg: query, client, message, edit }) {
    const url = `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'DeltaUserJS/1.0' } }, 15_000);

    if (res.status === 404) {
      await edit(`<blockquote>❌ <b>Artikel tidak ditemukan:</b> <i>${escapeHtml(query)}</i></blockquote>`);
      return;
    }
    if (!res.ok) {
      throw new Error(`Wikipedia responded ${res.status}`);
    }

    const data = await res.json();
    const extract = data.extract || '(tanpa ringkasan)';
    const pageUrl = data.content_urls?.desktop?.page || `https://id.wikipedia.org/wiki/${encodeURIComponent(query)}`;
    const text = `📚 <b>Wikipedia</b>\n\n<blockquote><b>${escapeHtml(data.title || query)}</b>\n${escapeHtml(extract)}</blockquote>\n\n🔗 ${pageUrl}`;

    // Ada thumbnail → kirim sebagai foto baru dan hapus pesan command.
    if (data.thumbnail?.source) {
      await client.sendMessage(toPeer(message.chatId), {
        message: text,
        file: { source: data.thumbnail.source },
        parseMode: 'html',
        linkPreview: false,
        replyTo: message.replyToMsgId
      });
      try { await message.delete(); } catch (_e) { /* ignore */ }
      return;
    }

    return text;
  }
});
