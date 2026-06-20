import { Api } from 'teleproto';
import config from '../../../config.js';

export default {
  name: 'anilist',
  version: '1.1.0',
  description: 'Pencarian Anime, Manga, dan Karakter via Anilist menggunakan Inline UI.',
  help: {
    title: 'Anilist (Anime & Manga)',
    description: 'Mencari database anime, manga, dan karakter dari Anilist dengan tampilan Rich UI.',
    usage: '`.anime <judul>` | `.anichar <nama>` | `.animanga <judul>` | `.airing <judul>`',
    detail: 'Menggunakan Inline Bot untuk menampilkan gambar dan tombol tautan yang rapi.'
  },
  
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;

    const match = message.message.match(/^\.(anime|anichar|animanga|airing)(?:\s+([\s\S]+))?$/i);
    if (!match) return;

    const cmd = match[1].toLowerCase();
    const search = match[2];

    if (!search) {
      await message.edit({ 
        text: `❌ Harap masukkan judul yang ingin dicari!\nContoh: <code>.${cmd} Naruto</code>`, 
        parseMode: 'html' 
      });
      return;
    }

    await message.edit({ text: `⏳ <b>Mencari informasi di database Anilist...</b>`, parseMode: 'html' });

    try {
      // Dapatkan Bot Master dari bot token
      const botId = Number(config.botToken.split(':')[0]);
      const botEntity = await client.getEntity(botId);

      const results = await client.invoke(new Api.messages.GetInlineBotResults({
        bot: botEntity,
        peer: message.peerId,
        query: `anilist_${cmd}_${search}`,
        offset: ''
      }));

      if (results && results.results && results.results.length > 0) {
        // Kirim hasil inline
        await client.invoke(new Api.messages.SendInlineBotResult({
          peer: message.peerId,
          queryId: results.queryId,
          id: results.results[0].id,
          replyToMsgId: message.replyToMsgId
        }));
        
        // Hapus pesan loading
        try { await message.delete(); } catch(e) {}
      } else {
        await message.edit({ 
          text: `<blockquote>❌ <b>Pencarian tidak ditemukan:</b> <code>${search}</code></blockquote>`, 
          parseMode: 'html' 
        });
      }
    } catch (err) {
      console.error(err);
      await message.edit({ 
        text: `<blockquote>❌ <b>Gagal menghubungi Master Bot / Inline Bot:</b>\n${err.message}</blockquote>`, 
        parseMode: 'html' 
      });
    }
  }
};
