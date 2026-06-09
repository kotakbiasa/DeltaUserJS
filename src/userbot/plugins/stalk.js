export default {
  name: 'stalk',
  help: {
    title: 'Deep Stalking (Scraper)',
    description: 'Menggali dan menganalisis riwayat pesan seseorang di dalam obrolan saat ini. Sangat berguna untuk melihat seberapa aktif seseorang atau mencari tahu apa yang pernah mereka katakan.',
    usage: '• `.stalk <@username atau ID>`\n• Atau balas pesan target dan ketik `.stalk`',
    detail: 'Fitur ini menembus batasan API normal dengan menyedot hingga 100 pesan riwayat terakhir milik target di dalam grup ini.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;
    
    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    
    if (cmd !== '.stalk') return;

    let targetUser = args[1];
    const replied = await message.getReplyMessage();

    if (replied && replied.senderId) {
      targetUser = Number(replied.senderId);
    }

    if (!targetUser) {
      await message.edit({ 
        text: `<blockquote>❌ <b>Gagal:</b> Harap berikan @username/ID target, atau balas pesan target.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
        parseMode: 'html' 
      });
      return;
    }

    await message.edit({ 
      text: `<blockquote>🔍 <b>Menggali riwayat pesan...</b>\nMohon tunggu sebentar, sedang menghubungi server Telegram...</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
      parseMode: 'html' 
    });

    try {
      // Dapatkan entitas target untuk nama
      let entity;
      try {
        entity = await client.getEntity(targetUser);
      } catch (e) {
        // Abaikan jika tidak bisa getEntity, mungkin bukan username valid
      }

      // Ambil hingga 100 pesan terakhir dari user tersebut di chat ini
      const history = await client.getMessages(message.peerId, {
        fromUser: targetUser,
        limit: 100
      });

      if (!history || history.length === 0) {
        await message.edit({ 
          text: `<blockquote>👻 <b>Jejak Tidak Ditemukan!</b>\nTarget tidak pernah mengirim pesan di obrolan ini, atau pesan sudah terhapus.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
        return;
      }

      const totalFound = history.length;
      let firstSeenDate = history[history.length - 1].date; // Pesan paling tua yang didapat (indeks terakhir)
      
      const firstName = entity ? (entity.firstName || '') : 'Pengguna';
      const lastName = entity ? (entity.lastName || '') : '';
      const fullName = `${firstName} ${lastName}`.trim();
      const userId = entity ? entity.id : targetUser;

      let report = `<blockquote>🕵️ <b>Laporan Deep Stalking</b>\n\n`;
      report += `👤 <b>Target:</b> <a href="tg://user?id=${userId}">${fullName}</a> (<code>${userId}</code>)\n`;
      report += `📊 <b>Aktivitas (100 Pesan Terakhir):</b> Ditemukan ${totalFound} pesan.\n`;
      report += `🕒 <b>Jejak Paling Awal Terdeteksi:</b> ${new Date(firstSeenDate * 1000).toLocaleString()}\n\n`;
      
      report += `💬 <b>Cuplikan Pesan Terakhir:</b>\n`;
      
      // Ambil maksimal 3 pesan berteks terbaru
      let textMessagesFound = 0;
      for (const msg of history) {
        if (msg.message && msg.message.trim().length > 0) {
          let excerpt = msg.message.trim();
          if (excerpt.length > 50) excerpt = excerpt.substring(0, 50) + '...';
          
          const dateStr = new Date(msg.date * 1000).toLocaleDateString();
          report += `• <i>"${excerpt}"</i> (${dateStr})\n`;
          
          textMessagesFound++;
          if (textMessagesFound >= 3) break;
        }
      }

      if (textMessagesFound === 0) {
        report += `• <i>(Hanya mengirim stiker/media kosong)</i>\n`;
      }

      report += `</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`;

      await message.edit({ 
        text: report, 
        parseMode: 'html' 
      });

    } catch (err) {
      console.error('Stalk Error:', err);
      await message.edit({ 
        text: `<blockquote>❌ <b>Gagal Menggali Pesan:</b>\n<i>${err.message}</i></blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
        parseMode: 'html' 
      });
    }
  }
};
