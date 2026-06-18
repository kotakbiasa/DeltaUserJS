import { getChatSettings } from '../../database/db.js';

export default {
  name: 'rich',
  help: {
    title: 'Rich Message (.rich)',
    description: 'Mengirimkan contoh Rich Message (Artikel Native Telegram) menggunakan MTcute.',
    usage: 'Ketik `.rich` di chat mana pun.',
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;

    const key = String(message.chat.id || message.chat.id || '');
    const chatConfig = getChatSettings(telegramId, key);
    const prefix = chatConfig.prefix || '.';

    const text = message.text.trim().toLowerCase();
    if (text !== `${prefix}rich`) return;

    await message.delete();

    // Mengirim artikel / Rich Message
    await client.sendRichMessage(message.chat.id, {
      content: {
        type: 'html',
        content: `
          <h1>🌟 Contoh Rich Message MTcute 🌟</h1>
          <p>Ini adalah contoh fitur <b>Rich Message</b> yang mendukung format layaknya artikel panjang langsung di dalam obrolan Telegram.</p>
          <br>
          <blockquote>
            <b>Tahukah Anda?</b>
            <br>
            MTcute bisa merender <i>HTML</i> kompleks dan mengubahnya menjadi pesan terstruktur yang sangat indah dan rapi!
          </blockquote>
          <p>
            Bahkan kita bisa menaruh blok kode panjang seperti ini:
            <pre><code>console.log("Hello dari DeltaUserJS!");</code></pre>
          </p>
          <p>Fitur ini membuktikan bahwa Userbot Anda siap digunakan untuk eksperimen MTProto tingkat lanjut di tahun 2026! 🚀</p>
        `
      }
    });
  },
};
