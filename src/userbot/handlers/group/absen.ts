import { escapeHtml } from '../../../utils/richMessage.js';

// Absen grup sederhana: kumpulkan absen per-chat in-memory, tampilkan list, hapus.
// (Versi asli di PyroUbot pakai inline bot; ini disederhanakan ke per-chat store.)

interface AbsenEntry { userId: string; name: string; time: string; }

const absenStore = new Map<string, Map<string, AbsenEntry>>();

function nowJakarta(): string {
  return new Date().toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

export default {
  name: 'absen',
  version: '1.0.0',
  description: 'Sistem absen grup: hadir, cek daftar, reset.',
  help: {
    title: 'Absen Grup (.absen)',
    description: 'Kumpulkan absen member grup. Setiap yang ketik .hadir tercatat beserta waktunya.',
    usage: '• `.absen` — info & mulai sesi\n• `.hadir` — catat kehadiranmu\n• `.listabsen` — lihat daftar yang sudah absen\n• `.delabsen` — reset absen (owner userbot)',
    detail: 'Data absen disimpan sementara di memori per chat. Setelah restart bot, absen dikosongkan.'
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const raw = message.message.trim().toLowerCase();
    const chatKey = String(message.chatId);

    // .hadir — bisa dipakai siapa saja (bukan cuma self)
    if (raw === '.hadir') {
      if (!absenStore.has(chatKey)) {absenStore.set(chatKey, new Map());}
      const store = absenStore.get(chatKey) as Map<string, AbsenEntry>;
      const sender = await message.getSender();
      const uid = String(message.senderId);
      store.set(uid, {
        userId: uid,
        name: sender ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') : 'Unknown',
        time: nowJakarta()
      });
      await message.react({ emoji: '👍' }).catch(() => undefined);
      return;
    }

    if (!message.out) {return;}

    if (raw === '.absen') {
      if (!absenStore.has(chatKey)) {absenStore.set(chatKey, new Map());}
      const count = absenStore.get(chatKey)?.size || 0;
      await message.edit({
        text: `📋 <b>Absen Grup</b>\n\n` +
          `<blockquote>Ketik <code>.hadir</code> untuk mencatat kehadiran.\n` +
          `Sudah absen: <b>${count}</b> orang.\n` +
          `Lihat: <code>.listabsen</code> | Reset: <code>.delabsen</code></blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    if (raw === '.listabsen') {
      const store = absenStore.get(chatKey);
      if (!store || store.size === 0) {
        await message.edit({
          text: `<blockquote>📋 Belum ada yang absen di chat ini.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      let i = 1;
      let list = '';
      for (const [, e] of store) {
        list += `${i}. ${escapeHtml(e.name)} — <code>${escapeHtml(e.time)}</code>\n`;
        i++;
      }
      await message.edit({
        text: `📋 <b>Daftar Absen (${store.size})</b>\n\n<blockquote>${list}</blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    if (raw === '.delabsen') {
      absenStore.delete(chatKey);
      await message.edit({
        text: `<blockquote>✅ Semua absen di chat ini berhasil dihapus.</blockquote>`,
        parseMode: 'html'
      });
      return;
    }
  }
};
