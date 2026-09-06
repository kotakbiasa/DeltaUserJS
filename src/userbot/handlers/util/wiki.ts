import { escapeHtml } from '../../../utils/richMessage.js';

export default {
  name: 'wiki',
  version: '1.0.0',
  description: 'Cari ringkasan artikel Wikipedia Indonesia.',
  help: {
    title: 'Wikipedia (.wiki)',
    description: 'Menampilkan ringkasan artikel Wikipedia bahasa Indonesia.',
    usage: '`.wiki <query>`',
    detail: 'Contoh: `.wiki Indonesia`. Menggunakan REST API Wikipedia id.'
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.match(/^\.wiki(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    const query = (match[1] || '').trim();
    if (!query) {
      await message.edit({
        text: `<blockquote>❌ <b>Format salah:</b> <code>.wiki &lt;query&gt;</code>\nContoh: <code>.wiki Indonesia</code></blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    await message.edit({
      text: `<blockquote>⏳ <b>Mencari "${escapeHtml(query)}" di Wikipedia...</b></blockquote>`,
      parseMode: 'html'
    });

    try {
      const url = `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'DeltaUserJS/1.0' } });
      if (res.status === 404) {
        await message.edit({
          text: `<blockquote>❌ <b>Artikel tidak ditemukan:</b> <i>${escapeHtml(query)}</i></blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      if (!res.ok) {
        throw new Error(`Wikipedia responded ${res.status}`);
      }
      const data = await res.json();
      const extract = data.extract || '(tanpa ringkasan)';
      const pageUrl = data.content_urls?.desktop?.page || `https://id.wikipedia.org/wiki/${encodeURIComponent(query)}`;

      const text = `📚 <b>Wikipedia</b>\n\n<blockquote><b>${escapeHtml(data.title || query)}</b>\n${escapeHtml(extract)}</blockquote>\n\n🔗 ${pageUrl}`;

      if (data.thumbnail?.source) {
        await client.sendMessage(message.chatId, {
          message: text,
          file: { source: data.thumbnail.source },
          parseMode: 'html',
          linkPreview: false,
          replyTo: message.replyToMsgId
        });
        try { await message.delete(); } catch (_e) { /* ignore */ }
      } else {
        await message.edit({ text, parseMode: 'html', linkPreview: false });
      }
    } catch (err) {
      await message.edit({
        text: `<blockquote>❌ <b>Gagal mencari di Wikipedia:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
