// @ts-nocheck
import { addWarn, removeWarn, getWarns, resetWarns } from '../../../infrastructure/database.js';
import { Api } from 'teleproto';

export default {
  name: 'warn',
  help: {
    title: 'Warn System (.warn)',
    description: 'Memberikan peringatan kepada pengguna di grup. Jika mencapai 3, pengguna akan dikeluarkan (kick/ban).',
    usage: '`.warn <alasan>` — Memberi peringatan (balas pesan)\n`.unwarn` — Menghapus 1 peringatan\n`.warns` — Melihat daftar peringatan\n`.resetwarn` — Mereset peringatan user',
    detail: 'Data peringatan disimpan secara personal untuk userbot Anda (berbeda dengan peringatan dari Master Bot).'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;

    const text = message.message;
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (!['.warn', '.unwarn', '.warns', '.resetwarn'].includes(cmd)) return;

    const replied = await message.getReplyMessage();
    const chatId = message.peerId.userId || message.peerId.chatId || message.peerId.channelId;

    if (!replied && cmd !== '.warns') {
      await message.edit({ text: `<blockquote>❌ Balas pesan pengguna untuk menggunakan ${cmd}.</blockquote>`, parseMode: 'html' });
      return;
    }

    const targetId = replied ? replied.senderId : null;
    let targetEntity = null;
    if (targetId) {
      try {
        targetEntity = await client.getEntity(targetId);
      } catch (e) {}
    }
    const targetName = targetEntity ? (targetEntity.firstName || targetEntity.title || String(targetId)) : (targetId ? String(targetId) : 'Unknown');

    if (cmd === '.warn') {
      const reason = parts.length > 1 ? parts.slice(1).join(' ') : 'Melanggar aturan';
      try {
        const warnData = await addWarn(telegramId, chatId, targetId, reason);
        let replyText = `⚠️ <b>Pengguna Diperingatkan</b>\nPengguna: <b>${targetName}</b>\nPeringatan ke: <b>${warnData.count}/3</b>\nAlasan: <i>${reason}</i>`;
        
        if (warnData.count >= 3) {
          replyText += `\n\n⛔ <b>Batas peringatan tercapai! Membisukan (Mute) pengguna selama 1 Jam...</b>`;
          const muteDurationSeconds = 3600; // 1 hour
          const untilDate = Math.floor(Date.now() / 1000) + muteDurationSeconds;

          try {
            await client.invoke(new Api.channels.EditBanned({
              channel: message.peerId,
              participant: targetId,
              bannedRights: new Api.ChatBannedRights({
                untilDate: untilDate,
                viewMessages: false,
                sendMessages: true,
                sendMedia: true,
                sendStickers: true,
                sendGifs: true,
                sendGames: true,
                sendInline: true,
                embedLinks: true
              })
            }));
            replyText += `\n✅ <i>Berhasil dibungkam hingga 1 jam ke depan.</i>`;
            await resetWarns(telegramId, chatId, targetId);
          } catch (e) {
            replyText += `\n❌ <i>Gagal membungkam pengguna (Mungkin bot tidak memiliki hak admin).</i>`;
          }
        }
        await message.edit({ text: replyText, parseMode: 'html' });
      } catch (err) {
        await message.edit({ text: `❌ Gagal memberikan peringatan: ${err.message}` });
      }
    }

    else if (cmd === '.unwarn') {
      try {
        const warnData = await removeWarn(telegramId, chatId, targetId);
        if (!warnData) {
          await message.edit({ text: `✅ <b>${targetName}</b> tidak memiliki peringatan saat ini.`, parseMode: 'html' });
          return;
        }
        await message.edit({ text: `✅ <b>Peringatan Dihapus</b>\nPengguna: <b>${targetName}</b>\nSisa peringatan: <b>${warnData.count}/3</b>`, parseMode: 'html' });
      } catch (err) {
        await message.edit({ text: `❌ Gagal menghapus peringatan: ${err.message}` });
      }
    }

    else if (cmd === '.resetwarn') {
      try {
        await resetWarns(telegramId, chatId, targetId);
        await message.edit({ text: `✅ Peringatan untuk <b>${targetName}</b> telah direset menjadi 0.`, parseMode: 'html' });
      } catch (err) {
        await message.edit({ text: `❌ Gagal mereset peringatan: ${err.message}` });
      }
    }

    else if (cmd === '.warns') {
      // Allow checking warns via reply or globally for the chat
      if (replied) {
        // Check warns for replied user
        const warnData = getWarns(telegramId, chatId, targetId);
        if (!warnData || warnData.count === 0) {
          await message.edit({ text: `✅ <b>${targetName}</b> bersih dari peringatan.`, parseMode: 'html' });
          return;
        }
        let replyText = `📋 <b>Daftar Peringatan</b>\nPengguna: <b>${targetName}</b>\nTotal: <b>${warnData.count}/3</b>\n\n<b>Alasan:</b>\n`;
        warnData.reasons.forEach((r, idx) => {
          replyText += `${idx + 1}. ${r.reason}\n`;
        });
        await message.edit({ text: replyText, parseMode: 'html' });
      } else {
        // Check warns for the chat
        const session = require('../../../infrastructure/database.js').dbCache.get(Number(telegramId));
        const chatKey = String(chatId);
        if (!session || !session.warn_data || !session.warn_data[chatKey] || Object.keys(session.warn_data[chatKey]).length === 0) {
          await message.edit({ text: `✅ Belum ada pengguna yang diperingatkan di obrolan ini.`, parseMode: 'html' });
          return;
        }
        let replyText = `📋 <b>Daftar Peringatan di Chat Ini</b>\n\n`;
        for (const [uid, data] of Object.entries(session.warn_data[chatKey])) {
          replyText += `• <code>${uid}</code> : <b>${data.count}</b> peringatan\n`;
        }
        await message.edit({ text: replyText, parseMode: 'html' });
      }
    }
  }
};
