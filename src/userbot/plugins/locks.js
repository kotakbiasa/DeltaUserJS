import { setChatLock, getChatLocks } from '../../database/db.js';
import { block, code, footer } from '../ui.js';

const LOCK_TYPES = ['link', 'sticker', 'media', 'forward', 'bot', 'all'];
const COMMANDS = ['.lock', '.unlock', '.locks'];

function chatId(message) {
  return String(message.chat.id || message.chat.id || '');
}

function renderLocks(locks = {}) {
  return `<pre>${LOCK_TYPES.map(type => `${type.padEnd(10, ' ')} ${locks[type] === 1 ? '✓' : '—'}`).join('\n')}</pre>`;
}

async function safeDelete(client, message) {
  try { await client.deleteMessages(message.chat.id, [message.id], { revoke: true }); }
  catch (_) { try { await client.deleteMessages(message.chat.id, [message.id], { revoke: false }); } catch (_) {} }
}

function hasLink(message) {
  const text = message.text || '';
  if (/https?:\/\/|t\.me\/|telegram\.me\/|www\./i.test(text)) return true;
  return (message.entities || []).some(entity => {
    const name = entity.className || entity.constructor?.name || '';
    return name.includes('MessageEntityUrl') || name.includes('MessageEntityTextUrl');
  });
}

function isSticker(message) {
  const media = message.media;
  if (!media) return false;
  const name = media.className || media.constructor?.name || '';
  if (!name.includes('MessageMediaDocument')) return false;
  return (media.document?.attributes || []).some(attr => (attr.className || attr.constructor?.name || '').includes('DocumentAttributeSticker'));
}

function isMedia(message) {
  if (!message.media || isSticker(message)) return false;
  const name = message.media.className || message.media.constructor?.name || '';
  return ['MessageMediaPhoto', 'MessageMediaDocument', 'MessageMediaGeo', 'MessageMediaContact', 'MessageMediaPoll'].some(type => name.includes(type));
}

async function isBot(message) {
  try { return Boolean((await message.getSender())?.bot); } catch (_) { return false; }
}

async function shouldDelete(message, locks) {
  if (!locks || !Object.keys(locks).length) return false;
  if (locks.all === 1) return true;
  if (locks.link === 1 && hasLink(message)) return true;
  if (locks.sticker === 1 && isSticker(message)) return true;
  if (locks.media === 1 && isMedia(message)) return true;
  if (locks.forward === 1 && (message.fwdFrom || message.forward)) return true;
  if (locks.bot === 1 && await isBot(message)) return true;
  return false;
}

export default {
  name: 'locks',
  help: {
    title: 'Lock System (.lock, .unlock)',
    description: 'Mengunci jenis konten tertentu di grup.',
    usage: '• `.lock link/sticker/media/forward/bot/all`\n• `.unlock <type>`\n• `.locks`',
    detail: 'Pesan yang melanggar lock akan dihapus otomatis.'
  },
  async execute(client, message, settings, telegramId) {
    const id = chatId(message);
    if (!id || message.isPrivate) return;

    if (message.isOutgoing && message.text) {
      const args = message.text.trim().split(/\s+/);
      const cmd = args[0].toLowerCase();
      if (!COMMANDS.includes(cmd)) return;

      if (cmd === '.locks') {
        await message.edit({ text: block('Chat Locks', renderLocks(getChatLocks(telegramId, id))) + footer(settings), parseMode: 'html' });
        return;
      }

      const type = args[1]?.toLowerCase();
      if (!LOCK_TYPES.includes(type)) {
        await message.edit({ text: block('Tipe lock tidak valid', `Gunakan: ${code(LOCK_TYPES.join(', '))}`) + footer(settings), parseMode: 'html' });
        return;
      }

      const enabled = cmd === '.lock';
      const locks = await setChatLock(telegramId, id, type, enabled);
      await message.edit({ text: block('Chat Locks', `${type}: ${enabled ? 'aktif' : 'nonaktif'}\n${renderLocks(locks)}`) + footer(settings), parseMode: 'html' });
      return;
    }

    if (message.isOutgoing) return;
    if (await shouldDelete(message, getChatLocks(telegramId, id))) {
      await safeDelete(client, message);
    }
  },
};
