export default {
  name: 'id',
  help: {
    title: 'Info ID (.id)',
    description: 'Mendapatkan ID Chat atau ID Telegram pengguna secara instan.',
    usage: '• Ketik `.id` biasa.\n• Balas (reply) chat orang lain dengan mengetik `.id`.',
    detail: '• Jika diketik biasa, menampilkan ID Chat saat ini dan ID Anda.\n• Jika digunakan sebagai balasan, menampilkan ID Chat, ID Telegram Target, dan Nama Target yang Anda balas.'
  },
  async execute(client, message, settings, telegramId) {
    if (message.out && message.message && message.message.toLowerCase() === '.id') {
      try {
        const replied = await message.getReplyMessage();
        
        if (replied) {
          const sender = await replied.getSender();
          await message.edit({
            text: `🌐 <b>Info Chat & User</b>\n\n` +
                  `<blockquote>` +
                  `• <b>ID Chat</b>: <code>${message.chatId}</code>\n` +
                  `• <b>ID Target</b>: <code>${replied.senderId}</code>\n` +
                  `• <b>Nama Target</b>: <code>${sender ? (sender.firstName + (sender.lastName ? ' ' + sender.lastName : '')) : 'Tidak Dikenal'}</code>` +
                  `</blockquote>\n\n` +
                  `⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`,
            parseMode: 'html'
          });
        } else {
          await message.edit({
            text: `🌐 <b>Info Chat</b>\n\n` +
                  `<blockquote>` +
                  `• <b>ID Chat</b>: <code>${message.chatId}</code>\n` +
                  `• <b>ID Anda</b>: <code>${telegramId}</code>` +
                  `</blockquote>\n\n` +
                  `⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`,
            parseMode: 'html'
          });
        }
      } catch (err) {
        console.error('Error in id plugin:', err);
      }
    }
  }
};
