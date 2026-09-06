import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
const MAX_INFO_LEN = 500;
const STORE_KEY = '__deltaProfileCards';
const globalStore = globalThis;
const infoStore = globalStore[STORE_KEY] ?? new Map();
globalStore[STORE_KEY] = infoStore;
function buildCardText(entity, card, isSelf) {
    const name = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || 'Tanpa Nama';
    const uname = entity.username ? `@${entity.username}` : 'Tidak ada';
    const infoLine = card
        ? `<i>${escapeHtml(card.text)}</i>`
        : (isSelf
            ? '<i>Belum diatur — ketik <code>.setinfo</code> &lt;teks&gt; untuk membuat kartu.</i>'
            : '<i>User ini belum mengatur kartu profil.</i>');
    return `🎴 <b>PROFILE CARD</b>\n` +
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
        `📛 <b>Nama:</b> ${escapeHtml(name)}\n` +
        `🔗 <b>Username:</b> ${escapeHtml(uname)}\n` +
        `🆔 <b>ID:</b> <code>${String(entity.id)}</code>\n` +
        `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n` +
        `ℹ️ <b>Info:</b>\n${infoLine}`;
}
export default {
    name: 'me',
    version: '1.0.0',
    description: 'Kartu profil custom: .setinfo, .resetinfo, .me (bisa reply user lain).',
    help: {
        title: 'Profile Card (.setinfo / .me / .resetinfo)',
        description: 'Buat kartu profil custom (bio singkat) dan tampilkan sebagai kartu ber-foto profil.',
        usage: '• `.setinfo <teks>` — set isi kartu (max 500 karakter)\n• `.resetinfo` — hapus kartu\n• `.me` — lihat kartumu\n• Reply pesan user lain + `.me` — lihat kartu dia',
        detail: 'Kartu berisi foto profil, nama, username, dan info custom dari .setinfo. ' +
            'Kalau ada foto profil, kartu dikirim sebagai photo dengan caption; kalau tidak, dikirim sebagai text blockquote. ' +
            'Data kartu disimpan di memori (globalThis) per telegramId dan bertahan saat plugin hot-reload.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const raw = message.message.trim();
        // ============================================================
        // .setinfo <teks> — set isi kartu profil (max 500 char)
        // ============================================================
        const setMatch = raw.match(/^\.setinfo(?:\s+([\s\S]+))?$/i);
        if (setMatch) {
            const text = (setMatch[1] || '').trim();
            if (!text) {
                await message.edit({
                    text: '<blockquote>ℹ️ <b>Format:</b> <code>.setinfo &lt;teks bio kartu, max 500 karakter&gt;</code></blockquote>',
                    parseMode: 'html'
                });
                return;
            }
            if (text.length > MAX_INFO_LEN) {
                await message.edit({
                    text: `<blockquote>⚠️ <b>Terlalu panjang!</b> Maksimal ${MAX_INFO_LEN} karakter, teksmu ${text.length} karakter.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            infoStore.set(Number(telegramId), { text, updatedAt: Date.now() });
            await message.edit({
                text: `<blockquote>✅ <b>Kartu profil tersimpan!</b>\n\n<i>${escapeHtml(text)}</i>\n\nLihat: <code>.me</code> · Hapus: <code>.resetinfo</code></blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        // ============================================================
        // .resetinfo — hapus kartu profil
        // ============================================================
        if (raw.toLowerCase() === '.resetinfo') {
            if (!infoStore.has(Number(telegramId))) {
                await message.edit({
                    text: '<blockquote>ℹ️ Kamu memang belum punya kartu profil. Set dulu: <code>.setinfo &lt;teks&gt;</code></blockquote>',
                    parseMode: 'html'
                });
                return;
            }
            infoStore.delete(Number(telegramId));
            await message.edit({
                text: '<blockquote>🗑️ <b>Kartu profil berhasil dihapus.</b></blockquote>',
                parseMode: 'html'
            });
            return;
        }
        // ============================================================
        // .me — tampilkan kartu (sendiri, atau user yang di-reply)
        // ============================================================
        if (raw.toLowerCase() === '.me') {
            try {
                const replied = await message.getReplyMessage();
                let entity;
                let targetId;
                if (replied && replied.senderId) {
                    // Reply ke user lain → ambil entity pengirim pesan itu
                    try {
                        entity = await replied.getSender();
                    }
                    catch (_e) {
                        entity = undefined;
                    }
                    if (!entity) {
                        try {
                            entity = await client.getEntity(replied.senderId);
                        }
                        catch (_e) {
                            entity = undefined;
                        }
                    }
                    if (!entity) {
                        await message.edit({
                            text: '<blockquote>❌ <b>Tidak bisa mengambil data pengguna (mungkin pengirim anonim/tersembunyi).</b></blockquote>',
                            parseMode: 'html'
                        });
                        return;
                    }
                    if (entity.className && entity.className !== 'User' && entity.className !== 'UserEmpty') {
                        await message.edit({
                            text: '<blockquote>⚠️ <b>Kartu profil hanya untuk user, bukan channel/grup.</b></blockquote>',
                            parseMode: 'html'
                        });
                        return;
                    }
                    targetId = Number(String(replied.senderId));
                }
                else {
                    entity = await client.getEntity('me');
                    targetId = Number(telegramId);
                }
                const isSelf = targetId === Number(telegramId);
                const card = infoStore.get(targetId);
                const cardText = buildCardText(entity, card, isSelf);
                // Foto profil (besar bila ada)
                let photo = undefined;
                try {
                    photo = await client.downloadProfilePhoto(entity, { isBig: true });
                }
                catch (_e) {
                    photo = undefined;
                }
                if (photo && typeof photo !== 'string' && photo.length > 0) {
                    await client.sendMessage(message.peerId, {
                        message: cardText,
                        file: photo,
                        parseMode: 'html',
                        linkPreview: false
                    });
                    try {
                        await message.delete();
                    }
                    catch (_e) { /* ignore */ }
                }
                else {
                    await message.edit({
                        text: `<blockquote>${cardText}</blockquote>`,
                        parseMode: 'html',
                        linkPreview: false
                    });
                }
            }
            catch (err) {
                Logger.logUser(telegramId, `Me plugin error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal menampilkan kartu:</b> <i>${escapeHtml(err instanceof Error ? err.message : String(err))}</i></blockquote>`,
                    parseMode: 'html'
                }).catch(() => { });
            }
        }
    }
};
