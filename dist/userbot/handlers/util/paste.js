import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
const MAX_BYTES = 500 * 1024; // 500KB
export default {
    name: 'paste',
    version: '1.0.0',
    description: 'Unggah teks ke paste.rs dan dapatkan URL.',
    help: {
        title: 'Paste (.paste)',
        description: 'Mengunggah teks ke paste.rs lalu membalas dengan URL paste.',
        usage: '`.paste <teks>` atau reply pesan teks lalu `.paste`',
        detail: 'Contoh: `.paste halo dunia`. Bisa juga reply sebuah pesan teks lalu kirim `.paste`. Teks maksimal 500KB.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.match(/^\.paste(?:\s+([\s\S]+))?$/i);
        if (!match) {
            return;
        }
        let text = (match[1] || '').trim();
        if (!text && message.replyToMsgId) {
            try {
                const replied = await message.getReplyMessage();
                if (replied !== null && replied !== undefined && replied.message) {
                    text = replied.message.trim();
                }
            }
            catch (_e) {
                // Abaikan jika pesan reply tidak bisa diambil
            }
        }
        if (!text) {
            await message.edit({
                text: `<blockquote>❌ <b>Format salah:</b> <code>.paste &lt;teks&gt;</code>\nAtau reply sebuah pesan teks lalu kirim <code>.paste</code></blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        const byteLength = Buffer.byteLength(text, 'utf8');
        if (byteLength > MAX_BYTES) {
            await message.edit({
                text: `<blockquote>❌ <b>Terlalu besar:</b> ${byteLength} bytes (maksimal 500KB / ${MAX_BYTES} bytes)</blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        await message.edit({
            text: `<blockquote>⏳ <b>Mengunggah ke paste.rs...</b></blockquote>`,
            parseMode: 'html'
        });
        try {
            const res = await fetch('https://paste.rs/', {
                method: 'POST',
                headers: {
                    'User-Agent': 'DeltaUserJS/1.0',
                    'Content-Type': 'text/plain; charset=utf-8'
                },
                body: text
            });
            if (!res.ok) {
                throw new Error(`paste.rs responded ${res.status}`);
            }
            const url = (await res.text()).trim();
            if (!url.startsWith('http')) {
                throw new Error('Respons tidak valid dari paste.rs');
            }
            await message.edit({
                text: `📝 <b>Paste</b>\n\n🔗 ${url}`,
                parseMode: 'html',
                linkPreview: false
            });
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in paste plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Gagal mengunggah paste:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
