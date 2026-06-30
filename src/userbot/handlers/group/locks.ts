// @ts-nocheck
import { Api } from 'teleproto';

const lockMapping = {
  messages: 'sendMessages',
  sticker: 'sendStickers',
  gif: 'sendGifs',
  media: 'sendMedia',
  games: 'sendGames',
  inline: 'sendInline',
  photo: 'sendPhotos',
  video: 'sendVideos',
  docs: 'sendDocs',
  voice: 'sendVoices',
  audio: 'sendAudios',
  plain: 'sendPlain',
  url: 'embedLinks',
  polls: 'sendPolls',
  group_info: 'changeInfo',
  useradd: 'inviteUsers',
  pin: 'pinMessages'
};

const lockAllProps = Object.values(lockMapping);
const adminCache = new Map(); // Menyimpan { timestamp, admins: Set(id) } per chatId

export default {
  name: 'locks',
  version: '1.0.0',
  description: 'Mengunci hak akses grup (mirip Rose/MissKaty). Serta memiliki URL Detector otomatis.',
  help: {
    title: 'Group Locks',
    description: 'Mengunci hak akses spesifik di grup.',
    usage: '`.lock <tipe>` | `.unlock <tipe>` | `.lock all` | `.locks`',
    detail: 'Tipe yang didukung:\nmessages, sticker, gif, media, games, inline, photo, video, docs, voice, audio, plain, url, polls, group_info, useradd, pin.'
  },
  
  async execute(client, message, settings, telegramId) {
    // 1. URL DETECTOR PASIF (Berlaku untuk semua pesan masuk)
    if (!message.out && message.message && message.chatId) {
      const text = message.message.toLowerCase();
      // Cek apakah pesan berisi link
      if (text.includes('http://') || text.includes('https://') || text.includes('t.me/')) {
        try {
          const chat = await client.getEntity(message.chatId);
          // Cek apakah embedLinks sedang di-lock
          if (chat && chat.defaultBannedRights && chat.defaultBannedRights.embedLinks) {
            
            // Cek apakah pengirim adalah admin agar tidak salah hapus
            const senderId = Number(message.senderId);
            let isAdmin = senderId === Number(telegramId);
            
            if (!isAdmin) {
              const now = Date.now();
              const cached = adminCache.get(message.chatId);
              
              // Gunakan cache jika kurang dari 10 menit
              if (cached && (now - cached.timestamp < 10 * 60 * 1000)) {
                isAdmin = cached.admins.has(senderId);
              } else {
                // Fetch daftar admin
                const participants = await client.invoke(new Api.channels.GetParticipants({
                  channel: message.chatId,
                  filter: new Api.ChannelParticipantsAdmins(),
                  offset: 0,
                  limit: 100,
                  hash: 0n
                }));
                const adminSet = new Set(participants.participants.map(p => Number(p.userId)));
                adminCache.set(message.chatId, { timestamp: now, admins: adminSet });
                isAdmin = adminSet.has(senderId);
              }
            }

            // Jika bukan admin, hapus pesan
            if (!isAdmin) {
              try {
                await client.deleteMessages(message.chatId, [message.id], { revoke: true });
              } catch (delErr) {
                // Gagal menghapus (mungkin bot tidak punya izin delete message)
              }
            }
          }
        } catch (e) {
           // Skip error untuk chat biasa/bukan supergroup
        }
      }
    }

    // 2. ACTIVE COMMAND HANDLER (.lock / .unlock / .locks)
    if (!message.out || !message.message) return;
    
    const parts = message.message.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();

    if (!['.lock', '.unlock', '.locks'].includes(cmd)) return;

    // Command: .locks (Cek status)
    if (cmd === '.locks') {
      try {
        const chat = await client.getEntity(message.chatId);
        const rights = chat.defaultBannedRights || {};
        
        let activeLocks = [];
        for (const [key, prop] of Object.entries(lockMapping)) {
          if (rights[prop] === true) {
            activeLocks.push(key);
          }
        }

        let replyText = `🔒 <b>Status Kunci Grup Ini:</b>\n\n`;
        if (activeLocks.length > 0) {
          replyText += activeLocks.map(k => `• <code>${k}</code>`).join('\n');
        } else {
          replyText += `<i>Tidak ada akses yang dikunci.</i>`;
        }

        await message.edit({ text: replyText, parseMode: 'html' });
      } catch (err) {
        await message.edit({ text: `❌ Gagal mengambil status grup: ${err.message}` });
      }
      return;
    }

    // Command: .lock <tipe> atau .unlock <tipe>
    if (parts.length < 2) {
      await message.edit({ text: `❌ Parameter salah! Gunakan: <code>${cmd} [tipe/all]</code>`, parseMode: 'html' });
      return;
    }

    const parameter = parts[1].toLowerCase();
    const state = cmd === '.lock'; // true jika lock, false jika unlock

    if (parameter !== 'all' && !lockMapping[parameter]) {
      await message.edit({ 
        text: `❌ Parameter <b>${parameter}</b> tidak valid!\nKetik <code>.help locks</code> untuk melihat daftar tipe yang didukung.`, 
        parseMode: 'html' 
      });
      return;
    }

    await message.edit({ text: `⏳ <b>Memproses...</b>`, parseMode: 'html' });

    try {
      const chat = await client.getEntity(message.chatId);
      const currentRights = chat.defaultBannedRights || {};

      // Membangun ulang objek Banned Rights (Teleproto butuh nilai eksplisit)
      const newRightsData = { untilDate: 0 };
      
      // Salin hak akses yang ada sekarang
      for (const prop of lockAllProps) {
        newRightsData[prop] = currentRights[prop] === true;
      }

      // Modifikasi sesuai permintaan
      if (parameter === 'all') {
        for (const prop of lockAllProps) {
          newRightsData[prop] = state;
        }
      } else {
        const targetProp = lockMapping[parameter];
        newRightsData[targetProp] = state;
      }

      const newRights = new Api.ChatBannedRights(newRightsData);

      // Kirim perubahan ke Telegram
      await client.invoke(new Api.messages.EditChatDefaultBannedRights({
        peer: message.chatId,
        bannedRights: newRights
      }));

      const actionText = state ? 'Dikunci' : 'Dibuka';
      const targetText = parameter === 'all' ? 'Semuanya' : `Fitur <b>${parameter}</b>`;
      
      let extraNote = '';
      if (parameter === 'url' && state === true) {
        extraNote = '\n\n<i>🛡️ Sistem Anti-Link aktif. Pesan berisi URL dari member biasa akan otomatis dihapus.</i>';
      }

      await message.edit({ 
        text: `✅ ${targetText} berhasil ${actionText} di grup ini.${extraNote}`, 
        parseMode: 'html' 
      });

    } catch (err) {
      console.error(`Error in locks plugin:`, err.message);
      
      let errorMsg = err.message;
      if (errorMsg.includes('CHAT_ADMIN_REQUIRED')) {
        errorMsg = 'Saya membutuhkan hak Admin (Ubah Info Grup) untuk melakukan ini.';
      } else if (errorMsg.includes('CHAT_NOT_MODIFIED')) {
        errorMsg = 'Izin tersebut sudah disetel dalam keadaan yang Anda minta (Tidak ada perubahan).';
      }

      await message.edit({ 
        text: `<blockquote>❌ <b>Gagal:</b>\n<i>${errorMsg}</i></blockquote>`, 
        parseMode: 'html' 
      });
    }
  }
};
