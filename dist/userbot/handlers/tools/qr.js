import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
const BROWER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export default {
    name: 'qr',
    version: '1.0.0',
    description: 'Membuat QR Code dari teks/URL.',
    help: {
        title: 'QR Code Maker (.qr)',
        description: 'Mengubah teks atau URL menjadi gambar QR Code.',
        usage: '`.qr <teks>`',
        detail: 'Contoh: `.qr https://example.com`. Hasil dikirim sebagai gambar PNG.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.match(/^\.qr(?:\s+([\s\S]+))?$/i);
        if (!match) {
            return;
        }
        const text = (match[1] || '').trim();
        if (!text) {
            await message.edit({
                text: `<blockquote>❌ <b>Format salah:</b> <code>.qr &lt;teks&gt;</code>\nContoh: <code>.qr halo semua</code></blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        await message.edit({
            text: `<blockquote>⏳ <b>Membuat QR Code...</b></blockquote>`,
            parseMode: 'html'
        });
        try {
            const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(text)}`;
            const res = await fetch(apiUrl, { headers: { 'User-Agent': BROWER_UA } });
            if (!res.ok) {
                throw new Error(`API responded ${res.status}`);
            }
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length < 100) {
                throw new Error('QR terlalu kecil / tidak valid');
            }
            await client.sendMessage(message.chatId, {
                message: `🔗 <b>QR Code</b>\n<blockquote>${escapeHtml(text)}</blockquote>`,
                file: { source: buf, filename: 'qr.png' },
                parseMode: 'html',
                replyTo: message.replyToMsgId
            });
            try {
                await message.delete();
            }
            catch (_e) { /* ignore */ }
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in qr plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Gagal membuat QR:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
