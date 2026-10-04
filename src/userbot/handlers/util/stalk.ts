import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';
import { toPeer } from '../../engine/compatClient.js';

export default {
  name: 'stalk',
  help: {
    title: 'Deep Stalking (Scraper)',
    description: 'Menggali dan menganalisis riwayat pesan seseorang di dalam obrolan saat ini. Sangat berguna untuk melihat seberapa aktif seseorang atau mencari tahu apa yang pernah mereka katakan.',
    usage: '• `.stalk <@username atau ID>`\n• Atau balas pesan target dan ketik `.stalk`',
    detail: 'Fitur ini menembus batasan API normal dengan menyedot hingga 100 pesan riwayat terakhir milik target di dalam grup ini.'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, settings: UserbotSettings, telegramId: number) {
    if (!message.out || !message.message) {return;}
    
    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    
    if (cmd !== '.stalk') {return;}

    let targetUser: string | number = args[1];
    const replied = await message.getReplyMessage();

    if (replied && replied.senderId) {
      targetUser = Number(replied.senderId);
    }

    if (!targetUser) {
      await message.edit({ 
        text: `<blockquote>❌ <b>Gagal:</b> Harap berikan @username/ID target, atau balas pesan target.</blockquote>`, 
        parseMode: 'html' 
      });
      return;
    }

    await message.edit({ 
      text: `<blockquote>🔍 <b>Menggali riwayat pesan...</b>\nMohon tunggu sebentar, sedang menghubungi server Telegram...</blockquote>`, 
      parseMode: 'html' 
    });

    try {
      // Dapatkan entitas target untuk nama
      let entity;
      try {
        entity = await client.getEntity(targetUser);
      } catch (_e) {
        // Abaikan jika tidak bisa getEntity, mungkin bukan username valid
      }

      // Ambil hingga 100 pesan terakhir dari user tersebut di chat ini
      // getHistory() mtcute tidak punya filter fromUser — memakainya di sini
      // membuat laporan menghitung SEMUA pesan di chat, bukan punya target.
      // Jalur yang benar adalah searchMessages().
      const history = await client.searchMessages({
        chatId: toPeer(message.peerId),
        fromUser: targetUser,
        limit: 100,
      });

      if (!history || history.length === 0) {
        await message.edit({ 
          text: `<blockquote>👻 <b>Jejak Tidak Ditemukan!</b>\nTarget tidak pernah mengirim pesan di obrolan ini, atau pesan sudah terhapus.</blockquote>`, 
          parseMode: 'html' 
        });
        return;
      }

      const totalFound = history.length;
      // Message.date mtcute sudah berupa Date, bukan detik unix.
      const firstSeenDate = history[history.length - 1].date;
      
      const firstName = entity ? (entity.firstName || '') : 'Pengguna';
      const lastName = entity ? (entity.lastName || '') : '';
      const fullName = `${firstName} ${lastName}`.trim();
      const userId = entity ? entity.id : targetUser;

      let report = `<blockquote>🕵️ <b>Laporan Deep Stalking</b>\n\n`;
      report += `👤 <b>Target:</b> <a href="tg://user?id=${userId}">${escapeHtml(fullName)}</a> (<code>${escapeHtml(String(userId))}</code>)\n`;
      report += `📊 <b>Aktivitas (100 Pesan Terakhir):</b> Ditemukan ${escapeHtml(String(totalFound))} pesan.\n`;
      report += `🕒 <b>Jejak Paling Awal Terdeteksi:</b> ${firstSeenDate.toLocaleString()}\n\n`;
      
      report += `💬 <b>Cuplikan Pesan Terakhir:</b>\n`;
      
      // Ambil maksimal 3 pesan berteks terbaru
      let textMessagesFound = 0;
      for (const msg of history) {
        // Message mtcute memakai `.text`; `.message` selalu undefined di sini
        // sehingga cuplikan tidak pernah tampil.
        if (msg.text && msg.text.trim().length > 0) {
          let excerpt = msg.text.trim();
          if (excerpt.length > 50) {excerpt = excerpt.substring(0, 50) + '...';}
          
          const dateStr = msg.date.toLocaleDateString();
          report += `• <i>"${escapeHtml(excerpt)}"</i> (${escapeHtml(dateStr)})\n`;
          
          textMessagesFound++;
          if (textMessagesFound >= 3) {break;}
        }
      }

      if (textMessagesFound === 0) {
        report += `• <i>(Hanya mengirim stiker/media kosong)</i>\n`;
      }

      report += `</blockquote>`;

      await message.edit({ 
        text: report, 
        parseMode: 'html' 
      });

    } catch (err) {
      Logger.logUser(telegramId, `Stalk Error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({ 
        text: `<blockquote>❌ <b>Gagal Menggali Pesan:</b>\n<i>${escapeHtml(err.message)}</i></blockquote>`, 
        parseMode: 'html' 
      });
    }
  }
};
