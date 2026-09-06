import fs from 'fs';
import os from 'os';
import path from 'path';
import { Jimp } from 'jimp';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
// Imagee: filter gambar lokal via Jimp (tanpa ffmpeg/API eksternal).
// .mirror   — balas foto → flip horizontal, kirim ulang sebagai foto.
// .negative — balas foto → invert warna, kirim ulang sebagai foto.
// Port dari PyroUbot imagee.py (pakai cv2), diadaptasi ke pola plugin
// DeltaUserJS (pola convert.ts: downloadMedia → proses → sendFile → cleanup).
const TMP_DIR = path.join(os.tmpdir(), 'deltauserjs-imagee');
const JPEG_QUALITY = 90;
/** Hapus file temp dengan aman (abaikan error). */
function cleanup(...files) {
    for (const f of files) {
        if (!f) {
            continue;
        }
        try {
            if (fs.existsSync(f)) {
                fs.unlinkSync(f);
            }
        }
        catch (_e) { /* ignore */ }
    }
}
/** Pesan proses dengan blockquote (gaya plugin lain). */
function procText(text) {
    return `<blockquote>⏳ ${text}</blockquote>`;
}
async function editProcess(message, text) {
    await message.edit({ text: procText(text), parseMode: 'html' });
}
async function editError(message, text) {
    await message.edit({
        text: `<blockquote>❌ <b>Gagal:</b> ${escapeHtml(text)}</blockquote>`,
        parseMode: 'html',
    });
}
/** Ambil pesan yang di-reply (null jika tidak ada). */
async function getReplied(message) {
    try {
        return await message.getReplyMessage();
    }
    catch (_e) {
        return null;
    }
}
/** Download media sebagai Buffer (tolak jika kosong). */
async function downloadBuffer(client, replied) {
    const buffer = await client.downloadMedia(replied, {});
    if (!buffer || buffer.length === 0) {
        throw new Error('gagal mengunduh media');
    }
    return buffer;
}
/** Simpan Buffer ke file temp dengan ekstensi tertentu, kembalikan path. */
function bufferToTempFile(buffer, filename) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const filePath = path.join(TMP_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}
/** Reply target untuk pesan hasil (foto asli jika ada, else perintah). */
function replyToId(message) {
    return message.replyToMsgId || message.id;
}
/**
 * Inti filter: validasi reply foto → download → Jimp proses → kirim sebagai foto.
 * @param {'mirror'|'negative'} mode
 */
async function processImage(client, message, telegramId, mode) {
    const replied = await getReplied(message);
    if (!replied || !replied.media) {
        await editError(message, `Balas sebuah foto untuk menggunakan .${mode}!`);
        return;
    }
    if (!replied.photo) {
        await editError(message, 'Media yang dibalas bukan foto. Gunakan .mirror/.negative pada foto.');
        return;
    }
    await editProcess(message, '<b>Mengunduh foto...</b>');
    let tmpOut = null;
    try {
        const buffer = await downloadBuffer(client, replied);
        await editProcess(message, mode === 'mirror'
            ? '<b>Membalik gambar secara horizontal (mirror)...</b>'
            : '<b>Membalik warna gambar (negative)...</b>');
        const image = await Jimp.read(buffer);
        if (mode === 'mirror') {
            image.flip({ horizontal: true, vertical: false });
        }
        else {
            image.invert();
        }
        const outBuffer = await image.getBuffer('image/jpeg', { quality: JPEG_QUALITY });
        if (!outBuffer || outBuffer.length === 0) {
            throw new Error('gagal memproses gambar');
        }
        tmpOut = bufferToTempFile(outBuffer, `imagee_${mode}_${Date.now()}_${message.id}.jpg`);
        await editProcess(message, '<b>Mengunggah foto...</b>');
        await client.sendFile(message.chatId, {
            file: tmpOut,
            forceDocument: false,
            replyTo: replyToId(message),
        });
        try {
            await message.delete();
        }
        catch (_e) { /* ignore */ }
    }
    catch (err) {
        Logger.logUser(telegramId, `Error in imagee.${mode}: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        await editError(message, err instanceof Error ? err.message : String(err));
    }
    finally {
        cleanup(tmpOut);
    }
}
// ============================================================
// Plugin utama — satu file, dua command (.mirror / .negative)
// ============================================================
export default {
    name: 'imagee',
    version: '1.0.0',
    description: 'Filter gambar lokal: mirror (flip horizontal) & negative (invert warna) via Jimp.',
    help: {
        title: 'Image Filter (.mirror / .negative)',
        description: 'Filter gambar lokal tanpa API eksternal: balik gambar secara horizontal (mirror) atau balik warna (negative) pada foto yang dibalas.',
        usage: '• `.mirror` — balas sebuah foto → kirim ulang versi terbalik horizontal (flip horizontal).\n• `.negative` — balas sebuah foto → kirim ulang versi warna terbalik (invert).',
        detail: 'Pemrosesan memakai Jimp sepenuhnya di server (tanpa ffmpeg/API pihak ketiga): foto diunduh sebagai buffer, diproses di memori (flip horizontal / invert RGB), di-encode ulang ke JPEG kualitas 90, lalu dikirim sebagai foto (bukan dokumen). Wajib membalas pesan berisi foto biasa — sticker, video, atau dokumen akan ditolak. Pesan perintah otomatis dihapus setelah hasil terkirim dan file sementara dibersihkan.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.trim().toLowerCase().match(/^\.(mirror|negative)\b/);
        if (!match) {
            return;
        }
        await processImage(client, message, telegramId, match[1]);
    }
};
