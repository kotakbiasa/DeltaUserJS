import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';

export default {
  name: 'shortlink',
  version: '1.0.0',
  description: 'Perpendek URL dengan TinyURL.',
  help: {
    title: 'Shortlink (.shortlink)',
    description: 'Memperpendek sebuah URL menggunakan TinyURL.',
    usage: '`.shortlink <url>`',
    detail: 'Contoh: `.shortlink https://contoh.com/path/panjang`.'
  },
  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.match(/^\.shortlink(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    const url = (match[1] || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      await message.edit({
        text: `<blockquote>❌ <b>Format salah:</b> <code>.shortlink &lt;url&gt;</code>\nURL harus diawali http:// atau https://</blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    await message.edit({
      text: `<blockquote>⏳ <b>Memperpendek URL...</b></blockquote>`,
      parseMode: 'html'
    });

    try {
      const api = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
      const res = await fetch(api);
      if (!res.ok) {
        throw new Error(`TinyURL responded ${res.status}`);
      }
      const short = (await res.text()).trim();
      if (!short.startsWith('http')) {
        throw new Error('Respons tidak valid');
      }
      await message.edit({
        text: `🔗 <b>Shortlink</b>\n\n<blockquote><code>${escapeHtml(short)}</code></blockquote>\n<i>Asli:</i> ${escapeHtml(url)}`,
        parseMode: 'html',
        linkPreview: false
      });
    } catch (err) {
      Logger.logUser(telegramId, `Error in shortlink plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Gagal memperpendek URL:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
