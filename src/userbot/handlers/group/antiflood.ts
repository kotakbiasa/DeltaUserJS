import { getChatSettings, updateChatSettings, addWarn, resetWarns } from '../../../infrastructure/database.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { isTestEnv } from '../../../utils/env.js';
import { Logger } from '../../../utils/logger.js';
import type { UserbotMessageLike, UserbotSettings, EntityLike } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';
import { toPeer } from '../../engine/compatClient.js';
import { parseIntArg, validationErrorText } from '../../engine/validate.js';

// In-memory tracker for message timestamps
// Key: telegramId_chatId_senderId -> Array of timestamps (numbers)
const floodTracker = new Map();

// Periodic cleanup: remove stale entries (> 1 hour inactive) every 10 minutes
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  let cleaned = 0;
  for (const [key, timestamps] of floodTracker.entries()) {
    const recent = timestamps.filter((t: number) => now - t <= oneHour);
    if (recent.length === 0) {
      floodTracker.delete(key);
      cleaned++;
    } else {
      floodTracker.set(key, recent);
    }
  }
  if (cleaned > 0) {Logger.logSystem(`🧹 FloodTracker cleanup: removed ${cleaned} stale entries`, 'INFO');}
}, 10 * 60 * 1000); // every 10 minutes

export default {
  name: 'antiflood',
  help: {
    title: 'Anti-Flood System',
    description: 'Membatasi pengiriman pesan berlebihan oleh anggota grup dalam rentang waktu tertentu.',
    usage: '• `.antiflood on/off` (Toggle fitur)\n• `.setfloodlimit <angka>` (Batas pesan)\n• `.setfloodwarn <angka>` (Batas peringatan)\n• `.setfloodtime <detik>` (Rentang waktu)\n• `.setfloodmode mute/kick` (Hukuman)',
    detail: 'Mencegah spam masal dengan sistem warning terintegrasi.'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, settings: UserbotSettings, telegramId: number) {
    const chatId = message.chatId;
    // Tanpa chat tidak ada yang bisa dimoderasi; dulu nilainya diam-diam
    // menjadi string "undefined" dan dipakai sebagai kunci pengaturan.
    if (chatId === undefined) {return;}
    const _chatKey = String(chatId);

    // --- 1. Handle Settings Commands ---
    if (message.out && message.message) {
      const text = message.message.trim();
      const args = text.split(/\s+/);
      const cmd = args[0].toLowerCase();

      if (cmd === '.antiflood') {
        if (args.length < 2) {return;}
        const val = args[1].toLowerCase() === 'on';
        await updateChatSettings(telegramId, chatId, 'antiflood', val);
        await message.edit({ text: `✅ <b>Berhasil:</b> Anti-Flood diubah menjadi: <b>${val ? 'ON' : 'OFF'}</b>`, parseMode: 'html' });
        return;
      }

      else if (cmd === '.setfloodlimit') {
        // Dulu memakai parseInt() tanpa batas atas, jadi "5abc" lolos sebagai 5
        // dan .setfloodlimit 999999 mematikan anti-flood tanpa pemberitahuan.
        const limitArg = parseIntArg(args[1], { min: 2, max: 100, label: 'Batas limit flood' });
        if (!limitArg.ok) {
          await message.edit({ text: validationErrorText(limitArg.error, '.setfloodlimit <2-100>'), parseMode: 'html' });
          return;
        }
        const limit = limitArg.value as number;
        await updateChatSettings(telegramId, chatId, 'flood_limit', limit);
        await message.edit({ text: `✅ <b>Berhasil:</b> Batas limit flood diubah menjadi: <b>${escapeHtml(String(limit))} pesan</b>`, parseMode: 'html' });
        return;
      }

      else if (cmd === '.setfloodwarn') {
        const warnsArg = parseIntArg(args[1], { min: 1, max: 20, label: 'Batas warning flood' });
        if (!warnsArg.ok) {
          await message.edit({ text: validationErrorText(warnsArg.error, '.setfloodwarn <1-20>'), parseMode: 'html' });
          return;
        }
        const warns = warnsArg.value as number;
        await updateChatSettings(telegramId, chatId, 'flood_warn_limit', warns);
        await message.edit({ text: `✅ <b>Berhasil:</b> Batas warning flood diubah menjadi: <b>${escapeHtml(String(warns))} kali</b>`, parseMode: 'html' });
        return;
      }

      else if (cmd === '.setfloodtime') {
        const secondsArg = parseIntArg(args[1], { min: 1, max: 3600, label: 'Rentang waktu flood' });
        if (!secondsArg.ok) {
          await message.edit({ text: validationErrorText(secondsArg.error, '.setfloodtime <1-3600>'), parseMode: 'html' });
          return;
        }
        const seconds = secondsArg.value as number;
        await updateChatSettings(telegramId, chatId, 'flood_time_window', seconds);
        await message.edit({ text: `✅ <b>Berhasil:</b> Rentang waktu flood diubah menjadi: <b>${escapeHtml(String(seconds))} detik</b>`, parseMode: 'html' });
        return;
      }

      else if (cmd === '.setfloodmode') {
        if (args.length < 2) {return;}
        const mode = args[1].toLowerCase();
        if (mode !== 'mute' && mode !== 'kick') {
          await message.edit({ text: `❌ <b>Gagal:</b> Mode hukuman tidak valid! Gunakan <code>mute</code> atau <code>kick</code>.`, parseMode: 'html' });
          return;
        }
        await updateChatSettings(telegramId, chatId, 'flood_mode', mode);
        await message.edit({ text: `✅ <b>Berhasil:</b> Mode hukuman flood diubah menjadi: <b>${escapeHtml(mode)}</b>`, parseMode: 'html' });
        return;
      }
    }

    // --- 2. Handle Message Monitoring ---
    const chatSettings = getChatSettings(telegramId, chatId);
    const antifloodEnabled = chatSettings.antiflood !== undefined ? chatSettings.antiflood : isTestEnv;
    if (!antifloodEnabled) {return;}

    // Self/Ubot immunity
    if (message.out || message.senderId === telegramId) {return;}

    // Ignore join/leave service messages
    // mtcute memakai `type` (snake_case); className adalah penamaan GramJS
    // yang tidak pernah cocok, jadi service message dulu ikut terhitung flood.
    const actionType = message.action?.type ?? message.action?.className;
    if (actionType && [
      'users_added', 'user_joined_link', 'user_joined_approved', 'user_joined_community',
      'user_left', 'user_removed',
      'MessageActionChatAddUser', 'MessageActionChatJoinedByLink', 'MessageActionChatDeleteUser',
    ].includes(actionType)) {
      return;
    }

    const senderId = message.senderId;
    if (!senderId) {return;}

    // Admin & whitelisted immunity check
    const approvedUsers = (settings?.approved_users ?? []) as Array<string | number>;
    const chatAdmins = (chatSettings.admins ?? []) as Array<string | number>;
    const isApproved = approvedUsers.includes(senderId as string | number) || chatAdmins.includes(senderId as string | number);
    if (isApproved) {return;}

    // Fetch config
    const limit = Number(chatSettings.flood_limit || 5);
    const timeWindow = Number(chatSettings.flood_time_window || 3) * 1000;
    const maxWarns = Number(chatSettings.flood_warn_limit || 2);
    const mode = chatSettings.flood_mode || 'mute';

    const now = Date.now();
    const key = `${telegramId}_${chatId}_${senderId}`;
    let timestamps = floodTracker.get(key) || [];
    timestamps.push(now);

    // Cleanup: remove old timestamps outside the window
    timestamps = timestamps.filter((t: number) => now - t <= timeWindow);
    floodTracker.set(key, timestamps);

    // Clean up empty keys to prevent memory leaks
    if (timestamps.length === 0) {
      floodTracker.delete(key);
    }

    if (timestamps.length >= limit) {
      // Trigger warning
      const warnInfo = await addWarn(telegramId, chatId, senderId, 'Flooding chat');

      if (warnInfo.count >= maxWarns) {
        await resetWarns(telegramId, chatId, senderId);
        floodTracker.delete(key);

        const isKick = mode === 'kick';
        // mtcute memakai parameter objek. Versi lama memanggil posisional gaya
        // GramJS di dalam cabang `typeof === 'function'` yang selalu benar,
        // sehingga kick/mute antiflood selalu melempar (dan tertelan .catch).
        const floodChat = toPeer(chatId as EntityLike);
        const floodUser = toPeer(senderId as EntityLike);
        if (isKick) {
          await client.kickChatMember({ chatId: floodChat, userId: floodUser }).catch(() => {});
        } else {
          // Semantik TL: `true` = DILARANG. Dulu dikirim `false`, yang justru
          // membuka pembatasan alih-alih membisukan.
          await client.restrictChatMember({
            chatId: floodChat,
            userId: floodUser,
            restrictions: { sendMessages: true, sendMedia: true, embedLinks: true },
          }).catch(() => {});
        }

        let name = `User_${senderId}`;
        try {
          const userEntity = await client.getEntity(toPeer(senderId));
          name = userEntity.firstName || userEntity.username || `User_${senderId}`;
        } catch (_e) { /* ignore: use default name */ }

        await message.edit({ text: `<blockquote>⚠️ <b>warning</b> / <b>Banjir</b>: User ${escapeHtml(name)} telah di-${isKick ? 'kick' : 'mute'} karena melebihi batas flood!</blockquote>` });
      } else {
        try {
          await client.deleteMessages(message.peerId, [message.id], { revoke: true });
        } catch (_e) { /* ignore */ }

        let name = `User_${senderId}`;
        try {
          const userEntity = await client.getEntity(toPeer(senderId));
          name = userEntity.firstName || userEntity.username || `User_${senderId}`;
        } catch (_e) { /* ignore: use default name */ }

        await client.sendMessage(toPeer(chatId), {
          message: `⚠️ <b>warning</b>: Mohon jangan spam, ${escapeHtml(name)}! [Peringatan: ${escapeHtml(String(warnInfo.count))}/${escapeHtml(String(maxWarns))}]`
        });
      }
    }
  }
};
