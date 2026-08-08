import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';

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
          const targetName = sender
            ? escapeHtml([sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Tidak Dikenal')
            : 'Tidak Dikenal';
          await message.edit({
            text: `<h1>🌐 Info Chat & User</h1>` +
                  `<table bordered striped><caption>📋 Detail</caption>` +
                  `<tr><th>Item</th><th>Detail</th></tr>` +
                  `<tr><td>💬 ID Chat</td><td align="center"><code>${message.chatId}</code></td></tr>` +
                  `<tr><td>👤 ID Target</td><td align="center"><code>${replied.senderId}</code></td></tr>` +
                  `<tr><td>📛 Nama Target</td><td align="center"><code>${targetName}</code></td></tr>` +
                  `</table>` +
                  ``,
            parseMode: 'html'
          });
        } else {
          await message.edit({
            text: `<h1>🌐 Info Chat</h1>` +
                  `<table bordered striped><caption>📋 Detail</caption>` +
                  `<tr><th>Item</th><th>Detail</th></tr>` +
                  `<tr><td>💬 ID Chat</td><td align="center"><code>${message.chatId}</code></td></tr>` +
                  `<tr><td>👤 ID Anda</td><td align="center"><code>${telegramId}</code></td></tr>` +
                  `</table>` +
                  ``,
            parseMode: 'html'
          });
        }
      } catch (err) {
        Logger.logUser(telegramId, `Error in id plugin: ${err}`, 'ERROR');
      }
    }
  }
};

