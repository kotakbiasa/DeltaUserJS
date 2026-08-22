import { Api } from 'teleproto';
import fs from 'fs';
import path from 'path';
import { Jimp } from 'jimp';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
const EMOJIS = [
    "☕", "🤡", "🙂", "🤔", "🔪", "😂", "💀", "🔥", "❤️", "✨",
    "💯", "👍", "🎉", "😎", "😭", "🥺", "😱", "🤯", "😴", "🤪",
    "🥰", "😈", "👻", "🎭", "🎨", "🎮", "🎵", "⚡", "💎", "🌟",
    "🌙", "☀️", "🌈", "⭐", "💫", "🍕", "🍔", "🍿", "🎂", "🍰",
    "🍩", "🍪", "🐱", "🐶", "🐺", "🦊", "🐼", "🐯", "🦁", "💪",
    "🙏", "👏", "✌️", "🤝", "👊", "🤘"
];
export default {
    name: 'kang',
    help: {
        title: 'Sticker Kanger (.kang)',
        description: 'Mencuri (kang) sticker dan menambahkannya ke pack Anda secara instan menggunakan Raw API Telegram.',
        usage: 'Balas sebuah sticker/foto dengan `.kang [emoji]`.',
        detail: 'Modul ini akan mendownload media yang Anda balas, menyesuaikan ukurannya, lalu membuat/menambahkan stiker ke pack pribadi Anda secara kilat tanpa harus ngobrol dengan bot @Stickers.'
    },
    async execute(client, message, settings, telegramId) {
        if (message.out && message.message && message.message.toLowerCase().startsWith('.kang')) {
            const parts = message.message.split(' ');
            const customEmoji = parts[1];
            const emoji = customEmoji || EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
            const replyMsg = await message.getReplyMessage();
            if (!replyMsg || !replyMsg.media || (!replyMsg.media.document && !replyMsg.media.photo)) {
                await message.edit({
                    text: `<blockquote>❌ Balas ke sebuah sticker atau foto untuk melakukan kang!</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            try {
                let mediaMessages = [replyMsg];
                // Cek jika ini adalah bagian dari media group (album)
                if (replyMsg.groupedId) {
                    await message.edit({
                        text: `<blockquote>⏳ <b>Menganalisis album foto...</b></blockquote>`,
                        parseMode: 'html'
                    });
                    const history = await client.getMessages(message.chatId, { limit: 20, offsetId: replyMsg.id + 10 });
                    mediaMessages = history.filter(m => m.groupedId && m.groupedId.toString() === replyMsg.groupedId.toString());
                    mediaMessages.sort((a, b) => a.id - b.id); // Urutkan dari terlama
                }
                const me = await client.getMe();
                const total = mediaMessages.length;
                let successCount = 0;
                let lastShortName = null;
                for (let i = 0; i < total; i++) {
                    const currentMsg = mediaMessages[i];
                    if (!currentMsg.media || (!currentMsg.media.document && !currentMsg.media.photo)) {
                        continue;
                    }
                    await message.edit({
                        text: `<blockquote>📥 <b>Mencuri (kang) media...</b> [${escapeHtml(String(i + 1))}/${escapeHtml(String(total))}]</blockquote>`,
                        parseMode: 'html'
                    });
                    // Download media
                    const buffer = await client.downloadMedia(currentMsg.media, { workers: 1 });
                    if (!buffer) {
                        continue;
                    }
                    let tmpPath = path.join(process.cwd(), `kang_${Date.now()}`);
                    let sentMsgId = null;
                    try {
                        if (currentMsg.media.document && currentMsg.media.document.mimeType === 'image/webp') {
                            tmpPath += '.webp';
                            fs.writeFileSync(tmpPath, buffer);
                        }
                        else {
                            tmpPath += '.png';
                            fs.writeFileSync(tmpPath, buffer);
                            try {
                                const image = await Jimp.read(tmpPath);
                                image.scaleToFit({ w: 512, h: 512 });
                                await image.write(tmpPath);
                            }
                            catch (e) {
                                Logger.logUser(telegramId, `Jimp resize error: ${e.message}`, 'WARN');
                            }
                        }
                        // Upload ke Saved Messages ("me") untuk mendapatkan InputDocument
                        const sentMsg = await client.sendFile('me', { file: tmpPath, forceDocument: true });
                        if (!sentMsg || !sentMsg.media || !sentMsg.media.document) {
                            continue;
                        }
                        sentMsgId = sentMsg.id;
                        const doc = sentMsg.media.document;
                        const inputDocument = new Api.InputDocument({
                            id: doc.id,
                            accessHash: doc.accessHash,
                            fileReference: doc.fileReference
                        });
                        const packSuffix = me.username ? `_by_${me.username}` : `_by_user_${me.id}`;
                        const shortName = `kang_${me.id}_1${packSuffix}`.toLowerCase();
                        const title = `${escapeHtml(me.firstName || 'User')}'s Kang Pack`;
                        lastShortName = shortName;
                        let createNew = false;
                        let stickerSet = null;
                        try {
                            const setInfo = await client.invoke(new Api.messages.GetStickerSet({
                                stickerset: new Api.InputStickerSetShortName({ shortName: shortName }),
                                hash: 0
                            }));
                            stickerSet = setInfo.set;
                        }
                        catch (e) {
                            if (e.message.includes('STICKERSET_INVALID') || e.message.includes('invalid')) {
                                createNew = true;
                            }
                            else {
                                throw e;
                            }
                        }
                        const stickerItem = new Api.InputStickerSetItem({
                            document: inputDocument,
                            emoji: emoji
                        });
                        if (createNew) {
                            await client.invoke(new Api.stickers.CreateStickerSet({
                                userId: new Api.InputUserSelf(),
                                title: title,
                                shortName: shortName,
                                stickers: [stickerItem]
                            }));
                        }
                        else {
                            await client.invoke(new Api.stickers.AddStickerToSet({
                                stickerset: new Api.InputStickerSetID({
                                    id: stickerSet.id,
                                    accessHash: stickerSet.accessHash
                                }),
                                sticker: stickerItem
                            }));
                        }
                        successCount++;
                        // Kasih jeda sedikit agar tidak flood API Telegram
                        if (i < total - 1) {
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                    finally {
                        // Cleanup
                        if (sentMsgId) {
                            try {
                                await client.deleteMessages('me', [sentMsgId], { revoke: true });
                            }
                            catch (_e) { /* ignore */ }
                        }
                        try {
                            if (fs.existsSync(tmpPath)) {
                                fs.unlinkSync(tmpPath);
                            }
                        }
                        catch (_e) { /* ignore */ }
                    }
                }
                if (successCount > 0) {
                    const packUrl = `https://t.me/addstickers/${lastShortName}`;
                    await message.edit({
                        text: `<blockquote>✅ <b>Berhasil!</b>\nBerhasil mencuri (kang) ${escapeHtml(String(successCount))} stiker.\n\n👉 <a href="${escapeHtml(packUrl)}">Lihat Pack Stiker Anda</a></blockquote>`,
                        parseMode: 'html'
                    });
                }
                else {
                    await message.edit({
                        text: `<blockquote>❌ <b>Gagal!</b>\nTidak ada stiker yang berhasil dicuri.</blockquote>`,
                        parseMode: 'html'
                    });
                }
            }
            catch (err) {
                await message.edit({
                    text: `<blockquote>❌ <b>Terjadi kesalahan saat memproses kang:</b>\n<i>${escapeHtml(err.message)}</i></blockquote>`,
                    parseMode: 'html'
                });
                Logger.logSystem(`❌ Error in kang plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            }
        }
    }
};
