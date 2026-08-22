export default {
  name: 'sangmata',
  version: '1.0.0',
  description: 'Mengecek histori nama dan username seseorang via SangMata.',
  help: {
    title: 'SangMata',
    description: 'Mengecek histori perubahan nama dan username seseorang menggunakan bot @SangMata_BOT.',
    usage: 'Balas pesan pengguna dengan `.sgm` atau ketik `.sgm <username/ID>`',
    detail: 'Bot SangMata akan membalas dengan histori semua perubahan nama dan username yang pernah dilakukan oleh pengguna tersebut.'
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.match(/^\.sgm(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    let target = match[1];

    if (!target && message.replyToMsgId) {
      const replied = await message.getReplyMessage();
      if (replied && replied.senderId) {
        target = replied.senderId.toString();
      }
    }

    if (!target) {
      await message.edit({
        text: '❌ <b>Harap balas pesan pengguna atau berikan ID/Username.</b>',
        parseMode: 'html'
      });
      return;
    }

    await message.edit({ text: '⏳ <b>Memeriksa histori ke @SangMata_BOT...</b>', parseMode: 'html' });

    const botUsername = '@SangMata_BOT';
    const startTime = Math.floor(Date.now() / 1000);

    try {
      // 1. Kirim ID/username ke bot SangMata
      await client.sendMessage(botUsername, { message: target });

      // 2. Tunggu dan ambil balasannya (maksimal 15 detik)
      let foundMessages = [];
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        
        const history = await client.getMessages(botUsername, { limit: 5 });
        
        // Ambil semua pesan balasan SangMata (bukan pesan kita) setelah startTime
        const replies = history.filter(m => !m.out && m.date >= startTime - 2);
        
        if (replies.length >= 2 || (replies.length === 1 && replies[0].message.includes('No records'))) {
          foundMessages = replies.reverse(); // Urutkan dari yang tertua ke terbaru
          break;
        } else if (replies.length > 0 && i > 5) {
          // Jika sudah ada minimal 1 pesan dan sudah lewat 5 detik, ambil saja apa yang ada
          foundMessages = replies.reverse();
          break;
        }
      }

      if (foundMessages.length > 0) {
        // Hapus status 'loading'
        try { await message.delete(); } catch(_e) { /* empty */ }
        
        // Forward balasan SangMata ke chat saat ini
        for (const msg of foundMessages) {
          await client.sendMessage(message.chatId, {
            message: msg.message,
            replyTo: message.replyToMsgId
          });
        }
      } else {
        await message.edit({
          text: '<blockquote>❌ <b>@SangMata_BOT tidak merespons dalam waktu 15 detik.</b> Bot mungkin sedang offline atau melimit request Anda.</blockquote>',
          parseMode: 'html'
        });
      }

    } catch (err) {
      await message.edit({
        text: `<blockquote>❌ <b>Terjadi kesalahan:</b> ${err instanceof Error ? err.message : String(err)}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
