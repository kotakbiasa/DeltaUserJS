export default {
  name: 'quote',
  help: {
    title: 'Quote Maker (.q)',
    description: 'Membuat stiker kutipan dari pesan yang di-reply.',
    usage: 'Balas sebuah pesan teks lalu ketik `.q` atau `.quote`.',
    detail: 'Modul ini akan meneruskan pesan ke @QuotLyBot dan mengirimkan hasil stikernya kembali ke obrolan Anda.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;
    const cmd = message.message.toLowerCase().trim();
    if (cmd === '.q' || cmd === '.quote') {
      const replied = await message.getReplyMessage();
      if (!replied) {
        await message.edit({ text: '❌ <b>Gagal:</b> Balas sebuah pesan teks untuk membuat quote!', parseMode: 'html' });
        return;
      }
      
      try {
        await message.edit({ text: '⏳ <b>Membuat quote...</b>', parseMode: 'html' });
        
        const botUsername = '@QuotLyBot';
        
        // Forward ke @QuotLyBot
        await client.forwardMessages(botUsername, {
          messages: [replied.id],
          fromPeer: message.peerId
        });

        // Tunggu balasan dari @QuotLyBot (maksimal 15 detik)
        let quoteMsg = null;
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const history = await client.getMessages(botUsername, { limit: 1 });
          if (history.length > 0 && history[0].media && history[0].media.document) {
            // Pastikan ini pesan baru (dikirim setelah command kita)
            if (history[0].date >= message.date - 2) {
              quoteMsg = history[0];
              break;
            }
          }
        }

        if (quoteMsg) {
          // Kirim stiker quote ke chat asal
          await client.sendMessage(message.peerId, {
            message: '',
            file: quoteMsg.media,
            replyTo: message.replyToMsgId
          });
          // Hapus command .q
          await message.delete({ revoke: true });
        } else {
          await message.edit({ text: '❌ <b>Gagal:</b> @QuotLyBot lambat merespons. Coba lagi nanti.', parseMode: 'html' });
        }

      } catch (err) {
        console.error('Error in quote plugin:', err);
        await message.edit({ text: `❌ <b>Gagal membuat quote:</b> <code>${err.message}</code>`, parseMode: 'html' });
      }
    }
  }
};
