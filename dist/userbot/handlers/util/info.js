import { Api } from 'teleproto';
import { escapeHtml } from '../../../utils/richMessage.js';
import fs from 'fs';
import { Logger } from '../../../utils/logger.js';
export default {
    name: 'info',
    help: {
        title: 'Whois / Info (.info)',
        description: 'Menarik data lengkap dari pengguna atau grup (termasuk Foto Profil).',
        usage: '• `.info` (Melihat info diri sendiri, atau grup jika di grup)\n• `.info <username>` (Melihat info username)\n• Balas pesan orang lalu ketik `.info` (Melihat info orang tersebut)',
        detail: 'Menampilkan foto profil utama, bio, status akun, dan data detail lainnya dengan tampilan elegan.'
    },
    async execute(client, message, settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const text = message.message.trim();
        const args = text.split(/\s+/);
        const cmd = args[0].toLowerCase();
        if (cmd !== '.info') {
            return;
        }
        await message.edit({
            text: `<blockquote>🔍 <b>Mengekstrak informasi target...</b></blockquote>`,
            parseMode: 'html'
        });
        let targetEntity;
        let _isGroup = false;
        try {
            const repliedMsg = await message.getReplyMessage();
            if (repliedMsg) {
                targetEntity = await client.getEntity(repliedMsg.senderId);
            }
            else if (args[1]) {
                if (args[1].toLowerCase() === 'me') {
                    targetEntity = await client.getEntity('me');
                }
                else {
                    targetEntity = await client.getEntity(args[1]);
                }
            }
            else {
                if (message.isPrivate) {
                    targetEntity = await client.getEntity('me');
                }
                else {
                    targetEntity = await client.getEntity(message.chatId);
                    _isGroup = true;
                }
            }
            // 1. Ambil Foto Profil Target
            let profilePhotoBuffer = null;
            try {
                profilePhotoBuffer = await client.downloadProfilePhoto(targetEntity);
            }
            catch (e) {
                Logger.logUser(telegramId, `Gagal download foto profil: ${e.message}`, 'ERROR');
            }
            // 2. Ambil Full Info (Bio, dll)
            let captionText = ``;
            if (targetEntity.className === 'User' || targetEntity.className === 'UserEmpty') {
                const fullInfo = await client.invoke(new Api.users.GetFullUser({ id: targetEntity }));
                const u = fullInfo.users[0];
                const f = fullInfo.fullUser;
                const pName = [u.firstName, u.lastName].filter(Boolean).join(' ');
                const pUser = u.username ? `@${u.username}` : 'Tidak disetel';
                const pId = u.id.toString();
                const pBio = f.about || 'Tidak ada deskripsi / bio';
                const tags = [];
                if (u.premium) {
                    tags.push('💎 Premium');
                }
                if (u.bot) {
                    tags.push('🤖 Bot');
                }
                if (u.verified) {
                    tags.push('✅ Verified');
                }
                if (u.scam) {
                    tags.push('⚠️ Scam');
                }
                if (u.fake) {
                    tags.push('🎭 Fake');
                }
                let photoCount = 0;
                try {
                    const userPhotos = await client.invoke(new Api.photos.GetUserPhotos({
                        userId: targetEntity,
                        offset: 0,
                        maxId: 0,
                        limit: 1
                    }));
                    photoCount = userPhotos.count || userPhotos.photos.length || 0;
                }
                catch (_e) { /* ignore */ }
                captionText = `<blockquote>👤 <b>USER INFORMATION</b>\n` +
                    `───────────────────────\n` +
                    `📛 <b>Nama:</b> ${escapeHtml(pName)}\n` +
                    `👤 <b>Username:</b> ${escapeHtml(pUser)}\n` +
                    `🆔 <b>User ID:</b> <code>${escapeHtml(pId)}</code>\n` +
                    `📸 <b>Total Foto Profil:</b> ${photoCount}\n` +
                    `📝 <b>Bio:</b> \n<i>${escapeHtml(pBio)}</i>\n` +
                    `───────────────────────\n` +
                    `🔖 <b>Status:</b> ${tags.length > 0 ? tags.join(' | ') : 'Normal User'}</blockquote>\n\n` +
                    ``;
            }
            else {
                // Group Info (Megagroup/Channel or Basic Chat)
                try {
                    // Coba ambil sebagai Channel/Supergroup
                    const fullInfo = await client.invoke(new Api.channels.GetFullChannel({ channel: targetEntity }));
                    const c = fullInfo.chats[0];
                    const f = fullInfo.fullChat;
                    const cName = c.title;
                    const cUser = c.username ? `@${c.username}` : 'Private Group';
                    const cId = c.id.toString();
                    const cBio = f.about || 'Tidak ada deskripsi grup';
                    const cMembers = f.participantsCount || c.participantsCount || '?';
                    captionText = `<blockquote>👥 <b>GROUP INFORMATION</b>\n` +
                        `───────────────────────\n` +
                        `📌 <b>Nama Grup:</b> ${escapeHtml(cName)}\n` +
                        `🔗 <b>Username:</b> ${escapeHtml(cUser)}\n` +
                        `🆔 <b>Group ID:</b> <code>${escapeHtml(cId)}</code>\n` +
                        `👥 <b>Total Member:</b> ${cMembers}\n` +
                        `📝 <b>Deskripsi:</b> \n<i>${escapeHtml(cBio)}</i>\n` +
                        `───────────────────────</blockquote>\n\n` +
                        ``;
                }
                catch (_chanErr) {
                    // Jika Basic Chat
                    const cName = targetEntity.title;
                    const cId = targetEntity.id.toString();
                    captionText = `<blockquote>👥 <b>BASIC GROUP INFO</b>\n` +
                        `───────────────────────\n` +
                        `📌 <b>Nama:</b> ${escapeHtml(cName)}\n` +
                        `🆔 <b>ID:</b> <code>-${escapeHtml(cId)}</code>\n` +
                        `───────────────────────</blockquote>\n\n` +
                        ``;
                }
            }
            if (profilePhotoBuffer && profilePhotoBuffer.length > 0) {
                const tmpPath = `/tmp/info_${Date.now()}.jpg`;
                fs.writeFileSync(tmpPath, profilePhotoBuffer);
                await client.sendMessage(message.peerId, {
                    message: captionText,
                    file: tmpPath,
                    parseMode: 'html',
                    replyTo: message.replyToMsgId
                });
                await message.delete();
                fs.unlinkSync(tmpPath);
            }
            else {
                await message.edit({ text: captionText, parseMode: 'html' });
            }
        }
        catch (err) {
            Logger.logUser(telegramId, `Info Error: ${err}`, 'ERROR');
            let errMsg = err.message;
            if (errMsg.includes('Cannot read properties of undefined')) {
                errMsg = 'Username/ID tidak ditemukan.';
            }
            await message.edit({
                text: `<blockquote>❌ <b>Gagal menarik data:</b>\n<i>${errMsg}</i></blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
