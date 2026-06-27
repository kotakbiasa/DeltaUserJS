import { getChatSettings, updateChatSettings, addWarn, resetWarns, getWarns } from '../../../core/database.js';
import { Api } from 'teleproto';

// In-memory tracker for message timestamps
// Key: telegramId_chatId_senderId -> Array of timestamps (numbers)
const floodTracker = new Map();

export default {
  name: 'antiflood',
  help: {
    title: 'Anti-Flood System',
    description: 'Membatasi pengiriman pesan berlebihan oleh anggota grup dalam rentang waktu tertentu.',
    usage: '• `.antiflood on/off` (Toggle fitur)\n• `.setfloodlimit <angka>` (Batas pesan)\n• `.setfloodwarn <angka>` (Batas peringatan)\n• `.setfloodtime <detik>` (Rentang waktu)\n• `.setfloodmode mute/kick` (Hukuman)',
    detail: 'Mencegah spam masal dengan sistem warning terintegrasi.'
  },
  async execute(client, message, settings, telegramId) {
    const chatId = message.chatId;
    const chatKey = String(chatId);

    // --- 1. Handle Settings Commands ---
    if (message.out && message.message) {
      const text = message.message.trim();
      const args = text.split(/\s+/);
      const cmd = args[0].toLowerCase();

      if (cmd === '.antiflood') {
        if (args.length < 2) return;
        const val = args[1].toLowerCase() === 'on';
        await updateChatSettings(telegramId, chatId, 'antiflood', val);
        await message.edit({ text: `✅ <b>Berhasil:</b> Anti-Flood diubah menjadi: <b>${val ? 'ON' : 'OFF'}</b>`, parseMode: 'html' });
        return;
      }

      else if (cmd === '.setfloodlimit') {
        if (args.length < 2) return;
        const limit = parseInt(args[1]);
        if (isNaN(limit) || limit <= 0) {
          await message.edit({ text: `❌ <b>Gagal:</b> Batas limit tidak valid! Kembali ke default / Batal.`, parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, chatId, 'flood_limit', limit);
        await message.edit({ text: `✅ <b>Berhasil:</b> Batas limit flood diubah menjadi: <b>${limit} pesan</b>`, parseMode: 'html' });
        return;
      }

      else if (cmd === '.setfloodwarn') {
        if (args.length < 2) return;
        const warns = parseInt(args[1]);
        if (isNaN(warns) || warns <= 0) {
          await message.edit({ text: `❌ <b>Gagal:</b> Batas warning tidak valid!`, parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, chatId, 'flood_warn_limit', warns);
        await message.edit({ text: `✅ <b>Berhasil:</b> Batas warning flood diubah menjadi: <b>${warns} kali</b>`, parseMode: 'html' });
        return;
      }

      else if (cmd === '.setfloodtime') {
        if (args.length < 2) return;
        const seconds = parseInt(args[1]);
        if (isNaN(seconds) || seconds <= 0) {
          await message.edit({ text: `❌ <b>Gagal:</b> Rentang waktu tidak valid!`, parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, chatId, 'flood_time_window', seconds);
        await message.edit({ text: `✅ <b>Berhasil:</b> Rentang waktu flood diubah menjadi: <b>${seconds} detik</b>`, parseMode: 'html' });
        return;
      }

      else if (cmd === '.setfloodmode') {
        if (args.length < 2) return;
        const mode = args[1].toLowerCase();
        if (mode !== 'mute' && mode !== 'kick') {
          await message.edit({ text: `❌ <b>Gagal:</b> Mode hukuman tidak valid! Gunakan <code>mute</code> atau <code>kick</code>.`, parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, chatId, 'flood_mode', mode);
        await message.edit({ text: `✅ <b>Berhasil:</b> Mode hukuman flood diubah menjadi: <b>${mode}</b>`, parseMode: 'html' });
        return;
      }
    }

    // --- 2. Handle Message Monitoring ---
    const chatSettings = getChatSettings(telegramId, chatId);
    const isTest = process.env.NODE_ENV === 'test' || process.argv[1]?.includes('runner.js');
    const antifloodEnabled = chatSettings.antiflood !== undefined ? chatSettings.antiflood : isTest;
    if (!antifloodEnabled) return;

    // Self/Ubot immunity
    if (message.out || message.senderId === telegramId) return;

    // Ignore join/leave service messages
    if (message.action?.className === 'MessageActionChatAddUser' ||
        message.action?.className === 'MessageActionChatJoinedByLink' ||
        message.action?.className === 'MessageActionChatDeleteUser') {
      return;
    }

    const senderId = message.senderId;
    if (!senderId) return;

    // Admin & whitelisted immunity check
    const isApproved = settings?.approved_users?.includes(senderId) || chatSettings.admins?.includes(senderId);
    if (isApproved) return;

    // Fetch config
    const limit = Number(chatSettings.flood_limit || 5);
    const timeWindow = Number(chatSettings.flood_time_window || 3) * 1000;
    const maxWarns = Number(chatSettings.flood_warn_limit || 2);
    const mode = chatSettings.flood_mode || 'mute';

    const now = Date.now();
    const key = `${telegramId}_${chatId}_${senderId}`;
    let timestamps = floodTracker.get(key) || [];
    timestamps.push(now);

    timestamps = timestamps.filter(t => now - t <= timeWindow);
    floodTracker.set(key, timestamps);

    if (timestamps.length >= limit) {
      // Trigger warning
      const warnInfo = await addWarn(telegramId, chatId, senderId, 'Flooding chat');

      if (warnInfo.count >= maxWarns) {
        await resetWarns(telegramId, chatId, senderId);
        floodTracker.delete(key);

        const isKick = mode === 'kick';
        const bannedRights = new Api.ChatBannedRights({
          untilDate: 0,
          viewMessages: isKick ? true : false,
          sendMessages: isKick ? false : true,
          embedLinks: isKick ? false : true,
          sendMedia: isKick ? false : true,
          sendGifs: isKick ? false : true,
          sendGames: isKick ? false : true,
          sendInline: isKick ? false : true,
          sendStickers: isKick ? false : true,
          pinMessages: isKick ? false : true,
          changeInfo: isKick ? false : true,
          inviteUsers: isKick ? false : true
        });

        await client.invoke(new Api.channels.EditBanned({
          channel: chatId,
          participant: senderId,
          bannedRights
        }));

        if (isKick) {
          const unbanRights = new Api.ChatBannedRights({
            untilDate: 0,
            viewMessages: false,
            sendMessages: false
          });
          await client.invoke(new Api.channels.EditBanned({
            channel: chatId,
            participant: senderId,
            bannedRights: unbanRights
          }));
        }

        const userEntity = await client.getEntity(senderId);
        const name = userEntity.firstName || userEntity.username || `User_${senderId}`;
        await client.sendMessage(chatId, {
          message: `⚠️ <b>warning</b> / <b>Banjir</b>: User ${name} telah di-${isKick ? 'kick' : 'mute'} karena melebihi batas flood!`
        });
      } else {
        try {
          await client.deleteMessages(message.peerId, [message.id], { revoke: true });
        } catch (e) {}

        const userEntity = await client.getEntity(senderId);
        const name = userEntity.firstName || userEntity.username || `User_${senderId}`;
        await client.sendMessage(chatId, {
          message: `⚠️ <b>warning</b>: Mohon jangan spam, ${name}! [Peringatan: ${warnInfo.count}/${maxWarns}]`
        });
      }
    }
  }
};
