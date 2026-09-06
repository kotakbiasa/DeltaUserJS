import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
// Tagall: mention seluruh member grup per 5 mention per pesan, delay 2s anti-flood.
// Port dari PyroUbot tagall.py (zip gilang), diadaptasi ke pola plugin DeltaUserJS.
const emojiPool = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😍',
    '🥰', '😘', '😎', '🥳', '😇', '🙃', '😋', '🤪',
    '🐶', '🐱', '🐰', '🐻', '🐼', '🦁', '🐸', '🦊', '🦄', '🐢',
    '🍎', '🍕', '🍔', '🍟', '🍩', '🍦', '🍓', '🍣',
    '🌲', '🌺', '🌞', '🌈', '🌊', '🌍', '🍁', '🌻',
    '✈️', '🚀', '🚲', '🚗', '⚽', '🏀', '🎾', '🏆',
    '🎵', '🎶', '🎤', '🎧', '🎸', '🎉', '🎊', '🎈', '🎁',
    '❤️', '💔', '😢', '😭', '😠', '😡', '😳'
];
function randEmoji() {
    return emojiPool[Math.floor(Math.random() * emojiPool.length)];
}
// status tagall per chatId
const activeTagAll = new Set();
export default {
    name: 'tagall',
    version: '1.0.0',
    description: 'Tag seluruh anggota grup.',
    help: {
        title: 'Tag All (.tagall)',
        description: 'Menandai (mention) seluruh anggota grup secara berurutan.',
        usage: '• `.tagall <teks>` — mulai tag semua member\n• `.batal` — hentikan proses tagall yang berjalan',
        detail: 'Mention dikirim 5 member per pesan dengan jeda 2 detik agar tidak kena flood limit Telegram. Bisa dibatalkan kapan saja dengan .batal.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const raw = message.message.trim();
        const chatKey = String(message.chatId);
        if (/^\.batal$/i.test(raw)) {
            if (activeTagAll.has(chatKey)) {
                activeTagAll.delete(chatKey);
                await message.edit({
                    text: `<blockquote>✅ <b>Tagall dibatalkan.</b></blockquote>`,
                    parseMode: 'html'
                });
            }
            else {
                await message.edit({
                    text: `<blockquote>ℹ️ Tidak ada tagall yang berjalan di chat ini.</blockquote>`,
                    parseMode: 'html'
                });
            }
            return;
        }
        if (!/^\.tagall/i.test(raw)) {
            return;
        }
        const text = raw.replace(/^\.tagall/i, '').trim();
        const chat = await client.getChat(message.chatId);
        if (!chat) {
            return;
        }
        if (activeTagAll.has(chatKey)) {
            await message.edit({
                text: `<blockquote>⚠️ Tagall sudah berjalan di chat ini. Ketik <code>.batal</code> untuk menghentikan.</blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        activeTagAll.add(chatKey);
        await message.edit({
            text: `<blockquote>⏳ <b>Mulai tag semua member...</b>\nKetik <code>.batal</code> untuk membatalkan.</blockquote>`,
            parseMode: 'html'
        });
        try {
            // GramJS: iterasi member grup
            const members = [];
            for await (const member of client.iterParticipants(message.chatId, { limit: 500 })) {
                const u = member;
                if (u.bot || u.deleted) {
                    continue;
                }
                const uid = String(u.id).replace('-100', '');
                members.push(uid);
            }
            // chunk 5 per pesan
            for (let i = 0; i < members.length; i += 5) {
                if (!activeTagAll.has(chatKey)) {
                    break;
                }
                const chunk = members.slice(i, i + 5)
                    .map(uid => `<a href="tg://user?id=${uid}">${randEmoji()}</a>`)
                    .join(' ');
                await client.sendMessage(message.chatId, {
                    message: `${text ? escapeHtml(text) + '\n\n' : ''}${chunk}`,
                    parseMode: 'html'
                });
                await new Promise(r => setTimeout(r, 2000));
            }
            const total = members.length;
            await client.sendMessage(message.chatId, {
                message: `<blockquote>✅ <b>Selesai.</b> ${total} member ditandai.</blockquote>`,
                parseMode: 'html'
            });
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in tagall plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Gagal tagall:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
                parseMode: 'html'
            });
        }
        finally {
            activeTagAll.delete(chatKey);
        }
    }
};
