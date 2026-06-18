import { addBroadcastBlacklist, getBroadcastBlacklist, removeBroadcastBlacklist } from '../../database/db.js';
import { block, code, escapeHtml, footer } from '../ui.js';

export default {
  name: 'blacklist',
  help: {
    title: 'Gcast Blacklist (.addbl)',
    description: 'Mengatur grup yang dilewati saat global broadcast.',
    usage: '• `.addbl` di grup\n• `.rmbl` di grup\n• `.listbl`',
    detail: 'Grup dalam blacklist tidak menerima pesan dari `.gcast`.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;
    const cmd = message.text.trim().split(/\s+/)[0].toLowerCase();
    if (!['.addbl', '.rmbl', '.listbl'].includes(cmd)) return;

    if (cmd === '.listbl') {
      const list = getBroadcastBlacklist(telegramId);
      const body = list.length ? list.map(id => `• ${escapeHtml(id)}`).join('\n') : 'Blacklist kosong.';
      await message.edit({ text: block('Gcast Blacklist', body) + footer(settings), parseMode: 'html' });
      return;
    }

    if (message.isPrivate) {
      await message.edit({ text: block('Tidak bisa di PM', 'Jalankan command ini di grup target.') + footer(settings), parseMode: 'html' });
      return;
    }

    const chatId = String(message.chat.id);
    if (cmd === '.addbl') {
      await addBroadcastBlacklist(telegramId, chatId);
      await message.edit({ text: block('Grup diblacklist', `${code(chatId)} akan dilewati saat .gcast.`) + footer(settings), parseMode: 'html' });
      return;
    }

    await removeBroadcastBlacklist(telegramId, chatId);
    await message.edit({ text: block('Grup dihapus dari blacklist', `${code(chatId)} akan menerima .gcast lagi.`) + footer(settings), parseMode: 'html' });
  },
};
