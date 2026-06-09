// Map untuk menyimpan status loop per akun telegram
// Struktur: telegramId -> Map<chatId, { intervalId, message, minutes, startedAt }>
const loopStore = new Map();

export default {
  name: 'schedule',
  help: {
    title: 'Schedule / Auto Post',
    description: 'Mengirimkan pesan secara otomatis dan berulang di sebuah obrolan (Loop). Sangat berguna untuk broadcast promosi atau keperluan roleplay.',
    usage: '• `.loop <menit> <pesan>` (Mulai loop)\n• `.rmloop` (Hentikan loop di chat ini)\n• `.listloop` (Lihat semua loop berjalan)',
    detail: 'Pesan akan terhapus otomatis dari jadwal ketika bot direstart (`npm start`) untuk mencegah spam abadi yang tidak disengaja.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;
    
    const text = message.message.trim();
    const args = text.split(/\s+/);
    const cmd = args[0].toLowerCase();
    
    if (!['.loop', '.rmloop', '.listloop'].includes(cmd)) return;

    // Pastikan penyimpanan untuk akun ini ada
    if (!loopStore.has(telegramId)) {
      loopStore.set(telegramId, new Map());
    }
    const myLoops = loopStore.get(telegramId);
    
    const chatId = message.peerId.userId || message.peerId.channelId || message.peerId.chatId;
    const chatKey = String(chatId);

    if (cmd === '.loop') {
      if (args.length < 3) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Format Salah:</b>\nPenggunaan: <code>.loop &lt;menit&gt; &lt;pesan&gt;</code>\nContoh: <code>.loop 10 Halo semua!</code></blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
        return;
      }

      const minutes = parseInt(args[1]);
      if (isNaN(minutes) || minutes < 1) {
        await message.edit({ 
          text: `<blockquote>❌ <b>Menit Tidak Valid:</b> Harap masukkan angka menit minimal 1.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
        return;
      }

      const loopMessage = text.substring(cmd.length + args[1].length + 2).trim();
      
      // Hentikan loop lama jika ada di chat ini
      if (myLoops.has(chatKey)) {
        clearInterval(myLoops.get(chatKey).intervalId);
      }

      // Mulai loop baru
      const ms = minutes * 60 * 1000;
      const intervalId = setInterval(async () => {
        try {
          await client.sendMessage(message.peerId, {
            message: loopMessage
          });
        } catch (err) {
          console.error(`Loop Error [${chatKey}]:`, err.message);
        }
      }, ms);

      myLoops.set(chatKey, {
        intervalId,
        message: loopMessage,
        minutes: minutes,
        startedAt: new Date()
      });

      await message.edit({ 
        text: `<blockquote>🔁 <b>Loop Aktif!</b>\n\nBot akan otomatis mengirimkan pesan setiap <b>${minutes} menit</b> di obrolan ini.\n\nKetik <code>.rmloop</code> untuk menghentikan.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
        parseMode: 'html' 
      });
    }
    
    else if (cmd === '.rmloop') {
      if (myLoops.has(chatKey)) {
        clearInterval(myLoops.get(chatKey).intervalId);
        myLoops.delete(chatKey);
        await message.edit({ 
          text: `<blockquote>⏹️ <b>Loop Dihentikan!</b>\nPesan otomatis di obrolan ini telah dimatikan.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
      } else {
        await message.edit({ 
          text: `<blockquote>ℹ️ <b>Info:</b> Tidak ada loop yang berjalan di obrolan ini.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
      }
    }
    
    else if (cmd === '.listloop') {
      if (myLoops.size === 0) {
        await message.edit({ 
          text: `<blockquote>ℹ️ <b>Info:</b> Anda tidak memiliki loop yang sedang berjalan.</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`, 
          parseMode: 'html' 
        });
        return;
      }

      let listText = `<blockquote>🔁 <b>Daftar Loop Aktif Anda:</b>\n\n`;
      let i = 1;
      for (const [id, data] of myLoops.entries()) {
        const shortMsg = data.message.length > 20 ? data.message.substring(0, 20) + '...' : data.message;
        listText += `<b>${i}. Chat ID:</b> <code>${id}</code>\n`;
        listText += `├ Interval: ${data.minutes} menit\n`;
        listText += `└ Pesan: <i>"${shortMsg}"</i>\n\n`;
        i++;
      }
      listText += `</blockquote>\n\n⚡ <i>${settings?.custom_name || 'DeltaUbotJS'}</i>`;

      await message.edit({ 
        text: listText, 
        parseMode: 'html' 
      });
    }
  }
};
