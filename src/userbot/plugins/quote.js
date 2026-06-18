import { block, escapeHtml, footer } from '../ui.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  name: 'quote',
  help: {
    title: 'Quote Maker (.q)',
    description: 'Membuat stiker kutipan dari pesan reply.',
    usage: 'Reply pesan lalu `.q` atau `.quote`.',
    detail: 'Meneruskan pesan ke @QuotLyBot lalu mengirim hasil sticker kembali ke chat.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || !message.text) return;
    const cmd = message.text.toLowerCase().trim();
    if (!['.q', '.quote'].includes(cmd)) return;

    const replied = message.replyToMessage;
    if (!replied) {
      await message.edit({ text: block('Quote gagal', 'Reply pesan yang ingin dijadikan quote.') + footer(settings), parseMode: 'html' });
      return;
    }

    await message.edit({ text: block('Quote Maker', 'Membuat sticker quote...') + footer(settings), parseMode: 'html' });

    try {
      const bot = '@QuotLyBot';
      await client.forwardMessages(bot, { messages: [replied.id], fromPeer: message.chat.id }); // quote to bot doesn't need replyTo

      let quote = null;
      for (let i = 0; i < 15; i++) {
        await sleep(1000);
        const history = await client.getMessages(bot, { limit: 1 });
        if (history?.[0]?.media?.document && history[0].date >= message.date - 2) {
          quote = history[0];
          break;
        }
      }

      if (!quote) {
        await message.edit({ text: block('Quote gagal', 'Tidak ada balasan dari @QuotLyBot. Coba lagi nanti.') + footer(settings), parseMode: 'html' });
        return;
      }

      await client.sendMedia(message.chat.id, quote.media, { replyTo: message.id });
      try { await message.delete(); } catch (_) {}
    } catch (err) {
      await message.edit({ text: block('Quote gagal', escapeHtml(err.message)) + footer(settings), parseMode: 'html' });
    }
  },
};
