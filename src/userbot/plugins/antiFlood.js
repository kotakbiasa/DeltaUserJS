import { addWarn, getChatSettings, updateChatSettings, getApprovedUsers } from '../../database/db.js';
import { block, code, footer } from '../ui.js';

const floodMap = new Map();

function chatKey(message) {
  return String(message.chat.id || message.chat.id || '');
}

async function muteUser(client, message, participant, seconds = 600) {
  const bannedRights = { _: 'chatBannedRights', untilDate: Math.floor(Date.now() / 1000) + seconds, sendMessages: true };
  await client.call({ _: 'channels.editBanned', channel: message.chat.id, participant, bannedRights });
}

async function kickUser(client, message, participant) {
  const bannedRights = { _: 'chatBannedRights', untilDate: 0, viewMessages: true };
  await client.call({ _: 'channels.editBanned', channel: message.chat.id, participant, bannedRights });
}

export default {
  name: 'antiflood',
  help: {
    title: 'Anti-Flood (.antiflood)',
    description: 'Mendeteksi spam pesan cepat di grup lalu warn/mute otomatis.',
    usage: '• `.antiflood on/off`\n• `.setfloodlimit <jumlah>`\n• `.setfloodtime <detik>`\n• `.setfloodwarn <jumlah>`\n• `.setfloodmode mute/kick`',
    detail: 'Limit jumlah pesan beruntun.'
  },
  async execute(client, message, settings, telegramId) {
    const key = chatKey(message);
    if (!key || message.isPrivate) return;

    const chatSettings = getChatSettings(telegramId, key);
    const prefix = chatSettings.prefix || '.';

    if (message.isOutgoing && message.text) {
      const text = message.text.trim();
      if (!text.startsWith(prefix)) return;

      const args = text.slice(prefix.length).split(/\s+/);
      const cmd = args[0].toLowerCase();

      if (!['antiflood', 'setfloodlimit', 'setfloodwarn', 'setfloodtime', 'setfloodmode'].includes(cmd)) return;

      if (cmd === 'antiflood') {
        const value = args[1]?.toLowerCase();
        if (!['on', 'off'].includes(value)) {
          await message.edit({ text: block('Format salah', `Gunakan ${code(`${prefix}antiflood on`)} atau ${code(`${prefix}antiflood off`)}.`) + footer(settings), parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, key, 'antiflood_enabled', value === 'on' ? 1 : 0);
        await message.edit({ text: block('Anti-Flood', `Status: ${value === 'on' ? 'aktif' : 'nonaktif'}`) + footer(settings), parseMode: 'html' });
        return;
      }

      if (cmd === 'setfloodlimit') {
        const count = Number(args[1]);
        if (!count || count <= 0) {
          await updateChatSettings(telegramId, key, 'flood_count', 5);
          await message.edit({ text: block('Batal', `Limit direset ke default (5)`) + footer(settings), parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, key, 'flood_count', count);
        await message.edit({ text: block('Anti-Flood Limit', `Pesan: ${count}`) + footer(settings), parseMode: 'html' });
        return;
      }

      if (cmd === 'setfloodtime') {
        const seconds = Number(args[1]);
        if (!seconds || seconds <= 0) {
          await updateChatSettings(telegramId, key, 'flood_seconds', 10);
          await message.edit({ text: block('Batal', `Waktu direset ke default (10)`) + footer(settings), parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, key, 'flood_seconds', seconds);
        await message.edit({ text: block('Anti-Flood Time', `Waktu: ${seconds}s`) + footer(settings), parseMode: 'html' });
        return;
      }

      if (cmd === 'setfloodwarn') {
        const count = Number(args[1]);
        if (!count || count <= 0) {
          await updateChatSettings(telegramId, key, 'flood_warn', 3);
          await message.edit({ text: block('Batal', `Warn direset ke default (3)`) + footer(settings), parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, key, 'flood_warn', count);
        await message.edit({ text: block('Anti-Flood Warn', `Warn limit: ${count}`) + footer(settings), parseMode: 'html' });
        return;
      }

      if (cmd === 'setfloodmode') {
        const mode = args[1]?.toLowerCase();
        if (!['mute', 'kick'].includes(mode)) {
          await message.edit({ text: block('Format salah', `Gunakan ${code(`${prefix}setfloodmode mute`)} atau ${code(`${prefix}setfloodmode kick`)}.`) + footer(settings), parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, key, 'flood_mode', mode);
        await message.edit({ text: block('Anti-Flood Mode', `Mode: ${mode}`) + footer(settings), parseMode: 'html' });
        return;
      }
      return;
    }

    if (message.isOutgoing || (!message.text && !message.action && !message.media)) return;
    if (chatSettings.antiflood_enabled !== 1) return;

    const senderId = Number(message.sender.id);
    if (!senderId) return;

    const approved = getApprovedUsers(telegramId);
    if (approved.includes(senderId)) return; // Admin immunity

    const mapKey = `${telegramId}:${key}:${senderId}`;
    const now = Date.now();
    const limit = Number(chatSettings.flood_count || 5);
    const windowMs = Number(chatSettings.flood_seconds || 10) * 1000;
    const maxWarns = Number(chatSettings.flood_warn || 3);
    const mode = chatSettings.flood_mode || 'mute';

    let timestamps = (floodMap.get(mapKey) || []).filter(ts => now - ts <= windowMs);
    
    // Add extra weight for media messages
    if (message.media || message.action?.photo) {
      timestamps.push(now);
    }
    timestamps.push(now);
    floodMap.set(mapKey, timestamps);

    if (timestamps.length < limit) return;
    
    // Do not reset timestamps, every message past limit should increase warning

    try {
      const warnData = await addWarn(telegramId, key, senderId, `Flood: ${limit} pesan/${windowMs / 1000} detik`);
      
      if (warnData.count >= maxWarns) {
        if (mode === 'kick') {
          await kickUser(client, message, senderId);
          await client.sendText(message.chat.id || key, {
            message: block('Anti-Flood Action', `<pre>User        ${senderId}\nAction      kick\nReason      Banjir/Flood max warns</pre>`) + footer(settings),
            parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id,
          });
        } else {
          await muteUser(client, message, senderId, 600);
          await client.sendText(message.chat.id || key, {
            message: block('Anti-Flood Action', `<pre>User        ${senderId}\nAction      mute 10 menit\nReason      Banjir/Flood max warns</pre>`) + footer(settings),
            parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id,
          });
        }
      } else {
        await client.sendText(message.chat.id || key, {
          message: block('Banjir/Warning', `<pre>User        ${senderId}\nWarning     ${warnData.count}/${maxWarns}\nReason      Banjir (Flood limit reached)</pre>`) + footer(settings),
          parseMode: 'html', replyTo: message.replyTo?.replyToTopId || message.replyToMsgId || message.id,
        });
      }
    } catch (err) {
      console.error('AntiFlood action error:', err.message);
    }
  },
};
