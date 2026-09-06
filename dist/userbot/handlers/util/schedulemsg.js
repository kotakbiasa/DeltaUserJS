import { Api } from 'teleproto';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
// ============================================================
// Schedule Message — jadwalkan kirim ulang PESAN ASLI.
// Perintah:
//   .schedule <durasi>   (reply pesan yang mau dikirim ulang)
//   .listschedule        (daftar jadwal aktif)
//   .delschedule <nomor> (batalkan jadwal)
// Beda dengan .remind: yang dikirim ulang adalah konten asli
// pesan yang di-reply (teks persis + media), bukan teks
// pengingat. Teks dikirim dengan parseMode false sehingga
// karakter seperti < > & dikirim apa adanya.
// State in-memory per telegramId (Map) — hilang ketika proses
// userbot restart, pola sama dengan remind.ts. Maksimal 7 hari.
// ============================================================
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
const UNIT_MS = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
};
// telegramId -> daftar jadwal aktif (urut waktu pembuatan)
const scheduleStore = new Map();
// ---- Helpers ----
/**
 * Parse token durasi gabungan seperti "30m", "1h", "1h30m", "2d12h".
 * Satuan: s (detik), m (menit), h (jam), d (hari).
 * Mengembalikan total milidetik, atau null bila format tidak valid.
 */
function parseDurationMs(raw) {
    const clean = String(raw || '').toLowerCase().replace(/\s+/g, '');
    if (!clean) {
        return null;
    }
    if (!/^(\d+[smhd])+$/.test(clean)) {
        return null;
    }
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
    if (d > 0) {
        parts.push(`${d} hari`);
    }
    if (h > 0) {
        parts.push(`${h} jam`);
    }
    if (m > 0) {
        parts.push(`${m} menit`);
    }
    if (s > 0 || parts.length === 0) {
        parts.push(`${s} detik`);
    }
    return parts.join(' ');
}
/** Cuplikan teks untuk ditampilkan (maks 40 karakter). */
function snippet(text, fallback) {
    if (!text) {
        return fallback;
    }
    return text.length > 40 ? text.substring(0, 40) + '...' : text;
}
/** Label jenis konten yang dijadwalkan. */
function contentKind(entry) {
    if (entry.media) {
        return entry.text ? 'media + caption' : 'media';
    }
    return 'teks';
}
/**
 * Pasang timer jadwal. Saat waktu tiba, entry dihapus dari store
 * dan PESAN ASLI dikirim ulang ke chat tempat jadwal dibuat.
 * parseMode: false => teks dikirim apa adanya (tanpa parsing),
 * sehingga konten persis sama dengan pesan aslinya.
 */
function startScheduleTimer(client, idNum, entry, delayMs) {
    const timeoutId = setTimeout(() => {
        const list = scheduleStore.get(idNum);
        if (list) {
            const idx = list.indexOf(entry);
            if (idx !== -1) {
                list.splice(idx, 1);
            }
            if (list.length === 0) {
                scheduleStore.delete(idNum);
            }
        }
        const sendPromise = entry.media
            ? client.sendFile(entry.chatId, {
                file: entry.media,
                caption: entry.text || undefined,
                parseMode: false
            })
            : client.sendMessage(entry.chatId, {
                message: entry.text,
                parseMode: false,
                linkPreview: false
            });
        sendPromise.catch((err) => {
            Logger.logUser(idNum, `Gagal kirim pesan terjadwal: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        });
    }, delayMs);
    if (typeof timeoutId.unref === 'function') {
        timeoutId.unref();
    }
    return timeoutId;
}
export default {
    name: 'schedulemsg',
    version: '1.0.0',
    description: 'Jadwalkan kirim ulang pesan asli (teks/media persis) setelah durasi tertentu.',
    help: {
        title: '📤 Schedule Message (.schedule / .listschedule / .delschedule)',
        description: 'Reply sebuah pesan lalu tentukan durasi: userbot akan mengirim ulang pesan tersebut (konten persis, termasuk media) ke chat yang sama saat waktunya tiba.',
        usage: '• `.schedule <durasi>` (reply pesan yang mau dikirim ulang) — contoh: reply lalu `.schedule 1h30m`\n' +
            '• `.listschedule` — lihat daftar jadwal aktif milikmu\n' +
            '• `.delschedule <nomor>` — batalkan jadwal sesuai nomor pada .listschedule',
        detail: 'Format durasi: kombinasi <angka><satuan> dengan satuan s (detik), m (menit), h (jam), d (hari). ' +
            'Contoh valid: 30m, 1h, 1h30m, 2d12h. Durasi maksimal 7 hari. ' +
            'Beda dengan .remind: yang dikirim adalah pesan asli yang di-reply (teks persis + media), bukan teks pengingat. ' +
            'Waktu target ditampilkan dalam format id-ID dengan timezone Asia/Jakarta (WIB). ' +
            'Jadwal disimpan in-memory per akun — hilang jika userbot direstart.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const text = message.message.trim();
        const cmd = (text.split(/\s+/)[0] || '').toLowerCase();
        if (!['.schedule', '.listschedule', '.delschedule'].includes(cmd)) {
            return;
        }
        const idNum = Number(telegramId);
        const chatId = message.chatId;
        if (chatId === null || chatId === undefined) {
            return;
        }
        if (!scheduleStore.has(idNum)) {
            scheduleStore.set(idNum, []);
        }
        const mySchedules = scheduleStore.get(idNum);
        // ============ 1. .schedule <durasi> (reply pesan) ============
        if (cmd === '.schedule') {
            const argMatch = text.match(/^\.schedule\s+(\S+)$/i);
            if (!argMatch) {
                await message.edit({
                    text: `<blockquote>❌ <b>Format salah:</b> reply pesan yang mau dikirim ulang, lalu ketik <code>.schedule &lt;durasi&gt;</code>\n` +
                        `Contoh: reply pesan → <code>.schedule 1h30m</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const durationText = argMatch[1];
            const delayMs = parseDurationMs(durationText);
            if (delayMs === null) {
                await message.edit({
                    text: `<blockquote>❌ <b>Durasi tidak valid:</b> <code>${escapeHtml(durationText)}</code>\n` +
                        `Gunakan kombinasi <code>s</code> (detik), <code>m</code> (menit), <code>h</code> (jam), <code>d</code> (hari).\n` +
                        `Contoh: <code>30m</code>, <code>1h</code>, <code>1h30m</code>, <code>2d12h</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            if (delayMs > MAX_DURATION_MS) {
                await message.edit({
                    text: `<blockquote>❌ <b>Terlalu lama:</b> durasi maksimal jadwal adalah <b>7 hari</b>.\n` +
                        `Contoh maksimal: <code>.schedule 7d</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const replied = await message.getReplyMessage();
            if (!replied) {
                await message.edit({
                    text: `<blockquote>❌ <b>Reply pesan dulu.</b> Pesan yang di-reply itulah yang akan dikirim ulang (teks/media persis).</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            // Preview web bukan media sungguhan — kirim sebagai teks saja.
            const isWebPage = replied.media instanceof Api.MessageMediaWebPage;
            const media = isWebPage ? null : replied.media;
            const replyText = String(replied.message || '');
            if (!media && !replyText) {
                await message.edit({
                    text: `<blockquote>❌ <b>Tidak ada konten.</b> Reply pesan teks/media yang mau dikirim ulang.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const targetAt = Date.now() + delayMs;
            const entry = {
                chatId,
                text: replyText,
                media,
                durationText,
                targetAt,
                timeoutId: null
            };
            mySchedules.push(entry);
            entry.timeoutId = startScheduleTimer(client, idNum, entry, delayMs);
            await message.edit({
                text: `📤 <b>Pesan Terjadwal!</b>\n\n` +
                    `<blockquote>├ Nomor: <b>${mySchedules.length}</b>\n` +
                    `├ Jenis: <b>${contentKind(entry)}</b>\n` +
                    `├ Cuplikan: <i>"${escapeHtml(snippet(replyText, '(media tanpa caption)'))}"</i>\n` +
                    `├ Durasi: <code>${escapeHtml(durationText)}</code>\n` +
                    `└ Target: <b>${formatTarget(targetAt)}</b></blockquote>\n\n` +
                    `💬 Sisa waktu: ${formatRemaining(delayMs)}\n` +
                    `📋 Cek: <code>.listschedule</code> | Batal: <code>.delschedule &lt;nomor&gt;</code>`,
                parseMode: 'html'
            });
            return;
        }
        // ============ 2. .listschedule ============
        if (cmd === '.listschedule') {
            if (mySchedules.length === 0) {
                await message.edit({
                    text: `<blockquote>ℹ️ Tidak ada pesan terjadwal. Reply sebuah pesan lalu ketik <code>.schedule &lt;durasi&gt;</code>.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const now = Date.now();
            let listText = `📤 <b>Daftar Pesan Terjadwal (${mySchedules.length})</b>\n\n<blockquote>`;
            let i = 1;
            for (const entry of mySchedules) {
                listText += `<b>${i}.</b> [${contentKind(entry)}] <i>"${escapeHtml(snippet(entry.text, '(media tanpa caption)'))}"</i>\n`;
                listText += `├ Target: ${formatTarget(entry.targetAt)}\n`;
                listText += `├ Sisa: ${formatRemaining(entry.targetAt - now)}\n`;
                listText += `└ Chat: <code>${String(entry.chatId)}</code>\n\n`;
                i++;
            }
            listText += `</blockquote>Batal: <code>.delschedule &lt;nomor&gt;</code>`;
            await message.edit({
                text: listText,
                parseMode: 'html'
            });
            return;
        }
        // ============ 3. .delschedule <nomor> ============
        if (cmd === '.delschedule') {
            if (mySchedules.length === 0) {
                await message.edit({
                    text: `<blockquote>ℹ️ Tidak ada pesan terjadwal untuk dibatalkan.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const num = parseInt(text.split(/\s+/)[1] || '', 10);
            if (Number.isNaN(num) || num < 1 || num > mySchedules.length) {
                await message.edit({
                    text: `<blockquote>❌ <b>Nomor tidak valid.</b> Pilih nomor 1-${mySchedules.length} dari daftar <code>.listschedule</code>.\n` +
                        `Penggunaan: <code>.delschedule &lt;nomor&gt;</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const removed = mySchedules.splice(num - 1, 1)[0];
            if (removed.timeoutId !== null) {
                clearTimeout(removed.timeoutId);
            }
            if (mySchedules.length === 0) {
                scheduleStore.delete(idNum);
            }
            await message.edit({
                text: `🗑️ <b>Pesan Terjadwal Dibatalkan</b>\n\n` +
                    `<blockquote>Nomor: <b>${num}</b>\n` +
                    `Jenis: <b>${contentKind(removed)}</b>\n` +
                    `Cuplikan: <i>"${escapeHtml(snippet(removed.text, '(media tanpa caption)'))}"</i>\n` +
                    `Target lama: ${formatTarget(removed.targetAt)}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
