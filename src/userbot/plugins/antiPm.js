import { getUserbotSession } from '../../database/db.js';
import { block, footer } from '../ui.js';

import { getChatSettings, updateChatSettings } from '../../database/db.js';

async function sendInlineWarning(client, message, inlineBotUsername, senderId) {
  if (!inlineBotUsername) return false;
  try {
    const botEntity = await client.getEntity(inlineBotUsername);
    const results = await client.call({ _: 'messages.getInlineBotResults', bot: botEntity,
      peer: message.chat.id,
      query: `antipm_${senderId}`,
      offset: '', });
    if (!results?.results?.length) return false;
    await client.call({ _: 'messages.sendInlineBotResult', peer: message.chat.id,
      queryId: results.queryId,
      id: results.results[0].id, });
    return true;
  } catch (_) {
    return false;
  }
}

export default {
  name: 'antipm',
  help: {
    title: 'Anti-PM',
    description: 'Melindungi inbox pribadi dari pesan tidak dikenal.',
    usage: 'Aktifkan dari dashboard. Gunakan `.approve`, `.disapprove`, `.approved` untuk whitelist.',
    detail: 'Pesan pertama diberi peringatan. Pesan berikutnya dari target yang sama akan dihapus jika belum approved.'
  },
  async execute(client, message, settings, telegramId) {
    if (settings.anti_pm !== 1) {
      return;
    }

    if (message.isOutgoing || !message.isPrivate) return;

    const senderId = Number(message.sender.id);
    const sender = await message.getSender();
    if (sender?.bot || senderId === 777000 || sender?.contact) return;

    const session = getUserbotSession(telegramId);
    if (session?.approved_users?.includes(senderId)) return;

    const chatSettings = getChatSettings(telegramId, senderId);
    if (!chatSettings.antiPmWarned) {
      await updateChatSettings(telegramId, senderId, 'antiPmWarned', true);
      try { await client.markAsRead(message.chat.id); } catch (_) {}

      const sentInline = await sendInlineWarning(client, message, session?.inline_bot_username, senderId);
      if (sentInline) return;

      await client.sendText(message.chat.id, {
        message: block('Anti-PM aktif', 'Pemilik akun ini tidak menerima pesan pribadi dari user yang belum dipercaya. Pesan berikutnya dapat dihapus otomatis.') + footer(settings),
        parseMode: 'html',
      });
      return;
    }

    try {
      await client.deleteMessages(message.chat.id, [message.id], { revoke: true });
    } catch (_) {
      try { await client.deleteMessages(message.chat.id, [message.id], { revoke: false }); } catch (_) {}
    }
  },
};
