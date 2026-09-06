import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

// ============================================================
// Reminder — pengingat pribadi berbasis timer untuk userbot
// Perintah: .remind <durasi> <pesan> | .listremind | .delremind <nomor>
// State disimpan in-memory per telegramId (Map), sehingga reminder
// hilang ketika proses userbot restart. Durasi maksimal 7 hari.
// Saat waktunya tiba, pesan pengingat dikirim ke chat tempat
// reminder dibuat.
// ============================================================

const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
};

interface ReminderEntry {
  chatId: number;   // chat tempat reminder dibuat & dikirim
  message: string;  // isi pesan pengingat
  durationText: string; // token durasi asli, mis. "1h30m"
  targetAt: number; // epoch ms waktu target
  timeoutId: ReturnType<typeof setTimeout> | null;
}

// telegramId -> daftar reminder aktif (urut waktu pembuatan)
const remindStore = new Map<number, ReminderEntry[]>();

// ---- Helpers ----

/**
 * Parse token durasi gabungan seperti "45s", "90m", "1h30m", "2d12h".
 * Satuan: s (detik), m (menit), h (jam), d (hari).
 * Mengembalikan total milidetik, atau null bila format tidak valid.
 */
function parseDurationMs(raw) {
  const clean = String(raw || '').toLowerCase().replace(/\s+/g, '');
  if (!clean) {return null;}
  if (!/^(\d+[smhd])+$/.test(clean)) {return null;}
  const re = /(\d+)([smhd])/g;
  let totalMs = 0;
  for (const m of clean.matchAll(re)) {
    totalMs += parseInt(m[1], 10) * UNIT_MS[m[2]];
  }
  return totalMs > 0 ? totalMs : null;
}

/** Format waktu target: locale id-ID, timezone Asia/Jakarta (WIB). */
function formatTarget(epochMs) {
  return new Date(epochMs).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short'
  });
}

/** Sisa waktu manusiawi, mis. "1 jam 29 menit 5 detik". */
function formatRemaining(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (d > 0) {parts.push(`${d} hari`);}
  if (h > 0) {parts.push(`${h} jam`);}
  if (m > 0) {parts.push(`${m} menit`);}
  if (s > 0 || parts.length === 0) {parts.push(`${s} detik`);}
  return parts.join(' ');
}

/**
 * Pasang timer pengingat. Saat waktu tiba, entry dihapus dari store
 * dan pesan pengingat dikirim ke chat tempat reminder dibuat.
 */
function startReminderTimer(client, idNum, entry, delayMs) {
  const timeoutId = setTimeout(() => {
    const list = remindStore.get(idNum);
    if (list) {
      const idx = list.indexOf(entry);
      if (idx !== -1) {list.splice(idx, 1);}
      if (list.length === 0) {remindStore.delete(idNum);}
    }
    client.sendMessage(entry.chatId, {
      message: `⏰ <b>REMINDER:</b> ${escapeHtml(entry.message)}`,
      parseMode: 'html',
      linkPreview: false
    }).catch(err => {
      Logger.logUser(idNum, `Gagal kirim reminder: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    });
  }, delayMs);
  if (typeof timeoutId.unref === 'function') {timeoutId.unref();}
  return timeoutId;
}

export default {
  name: 'remind',
  version: '1.0.0',
  description: 'Pengingat pribadi berbasis timer: buat, lihat daftar, dan batalkan reminder.',
  help: {
    title: '⏰ Reminder (.remind / .listremind / .delremind)',
    description: 'Buat pengingat pribadi: setelah durasi yang ditentukan berlalu, userbot mengirimkan pesan pengingat ke chat tempat reminder dibuat.',
    usage:
      '• `.remind <durasi> <pesan>` — buat reminder, contoh: `.remind 1h30m beli susu`\n' +
      '• `.listremind` — lihat daftar reminder aktif milikmu\n' +
      '• `.delremind <nomor>` — batalkan reminder sesuai nomor pada .listremind',
    detail:
      'Format durasi: kombinasi <angka><satuan> dengan satuan s (detik), m (menit), h (jam), d (hari). ' +
      'Contoh valid: 45s, 90m, 1h30m, 2d12h. Durasi maksimal 7 hari. ' +
      'Waktu target ditampilkan dalam format id-ID dengan timezone Asia/Jakarta (WIB). ' +
      'Reminder disimpan in-memory per akun — hilang jika userbot direstart.'
  },
  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}

    const text = message.message.trim();
    const cmd = (text.split(/\s+/)[0] || '').toLowerCase();
    if (!['.remind', '.listremind', '.delremind'].includes(cmd)) {return;}

    const idNum = Number(telegramId);
    const chatId = message.chatId;
    if (chatId === null || chatId === undefined) {return;}

    if (!remindStore.has(idNum)) {remindStore.set(idNum, []);}
    const myReminders = remindStore.get(idNum) as ReminderEntry[];

    // ============ 1. .remind <durasi> <pesan> ============
    if (cmd === '.remind') {
      const remindMatch = text.match(/^\.remind\s+(\S+)\s+([\s\S]+)$/i);
      if (!remindMatch) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Format salah:</b> <code>.remind &lt;durasi&gt; &lt;pesan&gt;</code>\n` +
            `Contoh: <code>.remind 1h30m beli susu</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const durationText = remindMatch[1];
      const reminderMessage = remindMatch[2].trim();
      const delayMs = parseDurationMs(durationText);

      if (delayMs === null) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Durasi tidak valid:</b> <code>${escapeHtml(durationText)}</code>\n` +
            `Gunakan kombinasi <code>s</code> (detik), <code>m</code> (menit), <code>h</code> (jam), <code>d</code> (hari).\n` +
            `Contoh: <code>45s</code>, <code>90m</code>, <code>1h30m</code>, <code>2d12h</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      if (delayMs > MAX_DURATION_MS) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Terlalu lama:</b> durasi maksimal reminder adalah <b>7 hari</b>.\n` +
            `Contoh maksimal: <code>.remind 7d pesan kamu</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const targetAt = Date.now() + delayMs;
      const entry: ReminderEntry = {
        chatId,
        message: reminderMessage,
        durationText,
        targetAt,
        timeoutId: null
      };
      myReminders.push(entry);
      entry.timeoutId = startReminderTimer(client, idNum, entry, delayMs);

      await message.edit({
        text:
          `⏰ <b>Reminder Dibuat!</b>\n\n` +
          `<blockquote>├ Nomor: <b>${myReminders.length}</b>\n` +
          `├ Pesan: <i>"${escapeHtml(reminderMessage)}"</i>\n` +
          `├ Durasi: <code>${escapeHtml(durationText)}</code>\n` +
          `└ Target: <b>${formatTarget(targetAt)}</b></blockquote>\n\n` +
          `💬 Sisa waktu: ${formatRemaining(delayMs)}\n` +
          `📋 Cek: <code>.listremind</code> | Batal: <code>.delremind &lt;nomor&gt;</code>`,
        parseMode: 'html'
      });
      return;
    }

    // ============ 2. .listremind ============
    if (cmd === '.listremind') {
      if (myReminders.length === 0) {
        await message.edit({
          text: `<blockquote>ℹ️ Tidak ada reminder aktif. Buat dengan <code>.remind &lt;durasi&gt; &lt;pesan&gt;</code>.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const now = Date.now();
      let listText = `⏰ <b>Daftar Reminder Aktif (${myReminders.length})</b>\n\n<blockquote>`;
      let i = 1;
      for (const entry of myReminders) {
        const shortMsg = entry.message.length > 40 ? entry.message.substring(0, 40) + '...' : entry.message;
        listText += `<b>${i}.</b> <i>"${escapeHtml(shortMsg)}"</i>\n`;
        listText += `├ Target: ${formatTarget(entry.targetAt)}\n`;
        listText += `├ Sisa: ${formatRemaining(entry.targetAt - now)}\n`;
        listText += `└ Chat: <code>${String(entry.chatId)}</code>\n\n`;
        i++;
      }
      listText += `</blockquote>Batal: <code>.delremind &lt;nomor&gt;</code>`;

      await message.edit({
        text: listText,
        parseMode: 'html'
      });
      return;
    }

    // ============ 3. .delremind <nomor> ============
    if (cmd === '.delremind') {
      if (myReminders.length === 0) {
        await message.edit({
          text: `<blockquote>ℹ️ Tidak ada reminder aktif untuk dibatalkan.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const num = parseInt(text.split(/\s+/)[1] || '', 10);
      if (isNaN(num) || num < 1 || num > myReminders.length) {
        await message.edit({
          text:
            `<blockquote>❌ <b>Nomor tidak valid.</b> Pilih nomor 1-${myReminders.length} dari daftar <code>.listremind</code>.\n` +
            `Penggunaan: <code>.delremind &lt;nomor&gt;</code></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      const removed = myReminders.splice(num - 1, 1)[0];
      if (removed.timeoutId !== null) {clearTimeout(removed.timeoutId);}
      if (myReminders.length === 0) {remindStore.delete(idNum);}

      await message.edit({
        text:
          `🗑️ <b>Reminder Dibatalkan</b>\n\n` +
          `<blockquote>Nomor: <b>${num}</b>\n` +
          `Pesan: <i>"${escapeHtml(removed.message)}"</i>\n` +
          `Target lama: ${formatTarget(removed.targetAt)}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
