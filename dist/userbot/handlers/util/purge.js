import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
/**
 * Purge — hapus pesan massal & kirim ulang konten.
 *
 * .purge          → reply ke sebuah pesan → hapus semua pesan dari pesan
 *                   yang di-reply sampai pesan perintah (maks 100 per eksekusi,
 *                   deleteMessages dengan revoke=true supaya hilang untuk semua).
 * .purgeme <n>    → hapus n pesan terakhir milik akun userbot di chat ini.
 * .copy           → reply ke pesan media/teks → kirim ulang konten persis ke
 *                   chat yang sama TANPA header "Diteruskan dari ...".
 *                   Utama: message.copy() (forward + dropAuthor).
 *                   Fallback: downloadMedia() → kirim file + caption asli.
 */
const MAX_PURGE = 100; // safety: jangan lebih dari 100 pesan per eksekusi
const CHUNK_SIZE = 100; // Telegram batas deleteMessages per request
function chunks(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}
export default {
    name: 'purge',
    help: {
        title: 'Purge & Copy (.purge / .purgeme / .copy)',
        description: 'Bersihkan riwayat chat secara massal dan kirim ulang pesan/media tanpa header forward.',
        usage: '• `.purge` — balas pesan tertua yang mau dihapus (hapus dari situ sampai sekarang, maks 100)\n' +
            '• `.purgeme <n>` — hapus n pesan terakhir milikmu di chat ini\n' +
            '• `.copy` — balas pesan media/teks untuk kirim ulang kontennya tanpa "Diteruskan dari"',
        detail: '• `.purge` dan `.purgeme` memakai deleteMessages revoke=true, jadi pesan hilang untuk SEMUA peserta (bukan hanya untukmu).\n' +
            '• `.purge` dibatasi maksimal 100 pesan per eksekusi demi keamanan; balas lebih awal lagi bila butuh menghapus lebih banyak.\n' +
            '• `.purgeme` pakai angka 1–100, contoh: `.purgeme 10`.\n' +
            '• `.copy` memakai message.copy (forward dengan dropAuthor) — kalau itu gagal, media diunduh lalu dikirim ulang beserta caption aslinya.\n' +
            '• Semua perintah dijalankan sebagai reply/perintah keluar dari akun userbot sendiri.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        if (!message.peerId) {
            return;
        }
        const args = message.message.trim().split(/\s+/);
        const cmd = (args[0] || '').toLowerCase();
        // ============================================================
        // .purge — hapus semua pesan dari reply sampai sekarang (max 100)
        // ============================================================
        if (cmd === '.purge') {
            const replied = await message.getReplyMessage();
            if (!replied) {
                await message.edit({
                    text: '<blockquote>❌ <b>Balas (reply) pesan yang mau dijadikan titik awal penghapusan.</b></blockquote>',
                    parseMode: 'html'
                });
                return;
            }
            const startId = replied.id;
            const endId = message.id; // termasuk pesan perintah sendiri
            if (endId - startId < 0) {
                await message.edit({
                    text: '<blockquote>❌ <b>Pesan yang dibalas lebih baru dari perintah ini.</b></blockquote>',
                    parseMode: 'html'
                });
                return;
            }
            const totalSpan = endId - startId + 1;
            if (totalSpan > MAX_PURGE) {
                await message.edit({
                    text: `<blockquote>⚠️ <b>Terlalu banyak pesan (${totalSpan}).</b> Batas maksimal ${MAX_PURGE} pesan per eksekusi. Balas pesan yang lebih baru.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            await message.edit({
                text: `<blockquote>🗑️ <b>Menghapus hingga ${totalSpan} pesan...</b></blockquote>`,
                parseMode: 'html'
            });
            try {
                // Ambil pesan via ids array (getMessages) supaya hanya ID valid yang dihapus
                const ids = [];
                for (let id = startId; id <= endId; id++) {
                    ids.push(id);
                }
                const msgs = await client.getMessages(message.peerId, { ids });
                const validIds = (msgs || [])
                    .filter((m) => m && m.id >= startId && m.id <= endId)
                    .map((m) => m.id);
                let deleted = 0;
                for (const batch of chunks(validIds, CHUNK_SIZE)) {
                    await client.deleteMessages(message.peerId, batch, { revoke: true });
                    deleted += batch.length;
                }
                // Pesan perintah .purge sendiri dihapus belakangan supaya status bisa tampil
                try {
                    await message.delete({ revoke: true });
                }
                catch (_e) { /* ignore */ }
                // Konfirmasi singkat lalu hapus juga
                const confirm = await client.sendMessage(message.peerId, {
                    message: `<blockquote>🗑️ <b>${deleted}</b> pesan dihapus.</blockquote>`,
                    parseMode: 'html',
                    linkPreview: false
                });
                await sleep(4000);
                try {
                    await confirm.delete({ revoke: true });
                }
                catch (_e) { /* ignore */ }
            }
            catch (err) {
                Logger.logUser(telegramId, `Purge .purge Error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal purge:</b> <i>${escapeHtml(err instanceof Error ? err.message : String(err))}</i></blockquote>`,
                    parseMode: 'html'
                }).catch(() => { });
            }
            return;
        }
        // ============================================================
        // .purgeme <n> — hapus n pesan own userbot di chat ini
        // ============================================================
        if (cmd === '.purgeme') {
            const nRaw = (args[1] || '').trim();
            const n = parseInt(nRaw, 10);
            if (!/^\d+$/.test(nRaw) || Number.isNaN(n) || n < 1 || n > MAX_PURGE) {
                await message.edit({
                    text: `<blockquote>❌ <b>Format salah:</b> <code>.purgeme 1-${MAX_PURGE}</code>\nContoh: <code>.purgeme 10</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            await message.edit({
                text: `<blockquote>🗑️ <b>Menghapus ${n} pesan terakhirmu...</b></blockquote>`,
                parseMode: 'html'
            });
            try {
                // Ambil riwayat chat lalu saring milik sendiri; include pesan perintah ini
                const history = await client.getMessages(message.peerId, { limit: Math.max(n * 3, 30) });
                const mine = (history || []).filter((m) => m && m.out).slice(0, n).map((m) => m.id);
                let deleted = 0;
                for (const batch of chunks(mine, CHUNK_SIZE)) {
                    await client.deleteMessages(message.peerId, batch, { revoke: true });
                    deleted += batch.length;
                }
                try {
                    await message.delete({ revoke: true });
                }
                catch (_e) { /* ignore */ }
                const confirm = await client.sendMessage(message.peerId, {
                    message: `<blockquote>🗑️ <b>${deleted}</b> pesanmu dihapus.</blockquote>`,
                    parseMode: 'html',
                    linkPreview: false
                });
                await sleep(4000);
                try {
                    await confirm.delete({ revoke: true });
                }
                catch (_e) { /* ignore */ }
            }
            catch (err) {
                Logger.logUser(telegramId, `Purge .purgeme Error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal purgeme:</b> <i>${escapeHtml(err instanceof Error ? err.message : String(err))}</i></blockquote>`,
                    parseMode: 'html'
                }).catch(() => { });
            }
            return;
        }
        // ============================================================
        // .copy — kirim ulang pesan media/teks tanpa header forward
        // ============================================================
        if (cmd === '.copy') {
            const replied = await message.getReplyMessage();
            if (!replied) {
                await message.edit({
                    text: '<blockquote>❌ <b>Balas pesan yang mau di-copy.</b></blockquote>',
                    parseMode: 'html'
                });
                return;
            }
            await message.edit({
                text: '<blockquote>📋 <b>Meng-copy pesan...</b></blockquote>',
                parseMode: 'html'
            });
            try {
                let sent = false;
                // 1) Cara paling bersih: message.copy → forwardMessages + dropAuthor (tanpa header forward)
                if (typeof replied.copy === 'function') {
                    try {
                        const result = await replied.copy(message.peerId);
                        if (result) {
                            sent = true;
                        }
                    }
                    catch (_e) { /* coba fallback di bawah */ }
                }
                // 2) Fallback: unduh media + kirim ulang dengan caption asli
                if (!sent && replied.media) {
                    const buf = await replied.downloadMedia();
                    if (buf && typeof buf !== 'string' && buf.length > 0) {
                        await client.sendFile(message.peerId, {
                            file: buf,
                            caption: replied.message || '',
                            parseMode: 'html',
                            forceDocument: false
                        });
                        sent = true;
                    }
                    else if (buf && typeof buf === 'string' && buf.length > 0) {
                        await client.sendFile(message.peerId, {
                            file: buf,
                            caption: replied.message || '',
                            parseMode: 'html',
                            forceDocument: false
                        });
                        sent = true;
                    }
                }
                // 3) Pesan teks biasa (tanpa media)
                if (!sent && replied.message && !replied.media) {
                    await client.sendMessage(message.peerId, {
                        message: replied.message,
                        parseMode: false, // entitas formatting sudah ada di pesan asli
                        formattingEntities: replied.entities,
                        linkPreview: false
                    });
                    sent = true;
                }
                if (!sent) {
                    await message.edit({
                        text: '<blockquote>❌ <b>Tidak ada konten yang bisa di-copy dari pesan ini.</b></blockquote>',
                        parseMode: 'html'
                    });
                    return;
                }
                try {
                    await message.delete();
                }
                catch (_e) { /* ignore */ }
            }
            catch (err) {
                Logger.logUser(telegramId, `Purge .copy Error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal copy:</b> <i>${escapeHtml(err instanceof Error ? err.message : String(err))}</i></blockquote>`,
                    parseMode: 'html'
                }).catch(() => { });
            }
            return;
        }
    }
};
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
