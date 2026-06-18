import { addApprovedUser, getApprovedUsers, removeApprovedUser } from '../../database/db.js';
import { block, code, escapeHtml, footer } from '../ui.js';

export default {
  name: 'approve',
  help: {
    title: 'Approve List',
    description: 'Mengatur whitelist Anti-PM dan Anti-Flood.',
    usage: '• reply `.approve`\n• reply `.disapprove`\n• `.approved`\n• `.addadmin <id>`',
    detail: 'User yang approved tidak akan terkena Anti-PM atau Anti-Flood.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;
    const args = message.text.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();
    if (!['.approve', '.disapprove', '.approved', '.addadmin'].includes(cmd)) return;

    if (cmd === '.approved') {
      const list = getApprovedUsers(telegramId);
      const body = list.length ? list.map(id => `• ${escapeHtml(id)}`).join('\n') : 'Belum ada user di whitelist.';
      await message.edit({ text: block('Approved Users', body) + footer(settings), parseMode: 'html' });
      return;
    }

    if (cmd === '.addadmin') {
      const targetId = Number(args[1]);
      if (!targetId) return;
      await addApprovedUser(telegramId, targetId);
      await message.edit({ text: block('User Approved', `${code(targetId)} tidak akan diblokir.`) + footer(settings), parseMode: 'html' });
      return;
    }

    const replied = message.replyToMessage;
    if (!replied) {
      await message.edit({ text: block('Butuh Reply', `Balas pesan target lalu ketik ${code(cmd)}.`) + footer(settings), parseMode: 'html' });
      return;
    }

    const targetId = Number(replied.sender?.id);
    if (!targetId) return;

    if (cmd === '.approve') {
      await addApprovedUser(telegramId, targetId);
      await message.edit({ text: block('User Approved', `${code(targetId)} tidak akan diblokir Anti-PM.`) + footer(settings), parseMode: 'html' });
      return;
    }

    await removeApprovedUser(telegramId, targetId);
    await message.edit({ text: block('User Disapproved', `${code(targetId)} dihapus dari whitelist Anti-PM.`) + footer(settings), parseMode: 'html' });
  },
};
