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
        
        // Ambil Topic ID dari forum group (kalau ada)
        const replyTo = message.replyTo;
        // replyToTopId: topic root message ID — hanya ada kalau pesan ini di topic
        // replyToMsgId: pesan yang di-reply — kalau user reply pesan di topic, ini = topic ID
        let topicId = null;
        if (replyTo?.replyToTopId) {
          topicId = replyTo.replyToTopId;
        } else if (replyTo?.replyToMsgId && replyTo?.forumTopic) {
          // Reply ke pesan di topic — replyToMsgId adalah topic root ID
          topicId = replyTo.replyToMsgId;
        } else if (message.peerId?.className === 'PeerChannel' && !replyTo) {
          // Pesan langsung di topic (bukan reply) — pakai message.id sebagai fallback
          // tapi cek dulu apakah ada cara lain untuk detect topic
          // Untuk sekarang, biarkan null karena tanpa reply kita tidak tahu topic ID
        }
        const topicInfo = topicId ? `\n• <b>Topic ID</b>: <code>${topicId}</code>` : '';
        
        if (replied) {
          const sender = await replied.getSender();
          const targetName = sender
            ? escapeHtml([sender.firstName, sender.lastName].filter(Boolean).join(' ') || 'Tidak Dikenal')
            : 'Tidak Dikenal';
          await message.edit({
            text: `🌐 <b>Info Chat & User</b>\n\n` +
                  `<blockquote>` +
                  `• <b>ID Chat</b>: <code>${message.chatId}</code>${topicInfo}\n` +
                  `• <b>ID Target</b>: <code>${replied.senderId}</code>\n` +
                  `• <b>Nama Target</b>: <code>${targetName}</code>` +
                  `</blockquote>` +
                  ``,
            parseMode: 'html'
          });
        } else {
          await message.edit({
            text: `🌐 <b>Info Chat</b>\n\n` +
                  `<blockquote>` +
                  `• <b>ID Chat</b>: <code>${message.chatId}</code>${topicInfo}\n` +
                  `• <b>ID Anda</b>: <code>${telegramId}</code>` +
                  `</blockquote>` +
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
