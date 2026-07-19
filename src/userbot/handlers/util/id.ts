import { Logger } from '../../../utils/logger.js';

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
            text: `🌐 <b>Info Chat & User</b>\n\n` +
                  `<blockquote>` +
                  `• <b>ID Chat</b>: <code>${message.chatId}</code>\n` +
                  `• <b>ID Target</b>: <code>${replied.senderId}</code>\n` +
                  `• <b>Nama Target</b>: <code>${targetName}</code>` +
                  `</blockquote>\n\n` +
                  ``,
            parseMode: 'html'
          });
        } else {
          await message.edit({
            text: `🌐 <b>Info Chat</b>\n\n` +
                  `<blockquote>` +
                  `• <b>ID Chat</b>: <code>${message.chatId}</code>\n` +
                  `• <b>ID Anda</b>: <code>${telegramId}</code>` +
                  `</blockquote>\n\n` +
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

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
