import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
const BROWER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
export default {
    name: 'brat',
    version: '1.0.0',
    description: 'Membuat gambar tulisan brat (gaya TikTok) / iPhone quoted.',
    help: {
        title: 'Brat Text (.brat)',
        description: 'Membuat gambar bergaya brat (video TikTok nulis blur) dari teks.',
        usage: '`.brat <teks>`',
        detail: 'Contoh: `.brat halo semua`. Hasil dikirim sebagai gambar PNG.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.match(/^\.brat(?:\s+([\s\S]+))?$/i);
        if (!match) {
            return;
        }
        const text = (match[1] || '').trim();
        if (!text) {
            await message.edit({
                text: `<blockquote>❌ <b>Format salah:</b> <code>.brat &lt;teks&gt;</code>\nContoh: <code>.brat halo semua</code></blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        await message.edit({
            text: `<blockquote>⏳ <b>Membuat gambar brat...</b></blockquote>`,
            parseMode: 'html'
        });
        try {
            // Endpoint terverifikasi: api.siputzx.my.id/api/m/brat mengembalikan PNG.
            const endpoints = [
                `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(text)}`
            ];
            let buf = null;
            let lastErr = null;
            for (const url of endpoints) {
                try {
                    const res = await fetch(url, { headers: { 'User-Agent': BROWER_UA } });
                    if (!res.ok) {
                        throw new Error(`${res.status}`);
                    }
                    const b = Buffer.from(await res.arrayBuffer());
                    if (b.length < 1000) {
                        throw new Error('gambar tidak valid');
                    }
                    buf = b;
                    break;
                }
                catch (e) {
                    lastErr = e;
                }
            }
            if (!buf) {
                throw new Error(`API brat gagal: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
            }
            await client.sendMessage(message.chatId, {
                message: `🎨 Brat: ${text.slice(0, 100)}`,
                file: { source: buf, filename: 'brat.png' },
                parseMode: 'html',
                replyTo: message.replyToMsgId
            });
            try {
                await message.delete();
            }
            catch (_e) { /* ignore */ }
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in brat plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Gagal membuat brat:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
