import { Api } from 'teleproto';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
/**
 * Profiles — info pengguna & info grup/channel.
 *
 * .info  → hanya untuk reply ke pesan user (ambil via getSender + getChat),
 *          kirim kartu info + foto profil besar (isBig: true) bila ada.
 *          Catatan: plugin info.ts juga menangani .info (non-reply & username).
 *          Supaya tidak dobel output, plugin ini cek ulang pesan perintah:
 *          kalau sudah diedit/dihapus oleh info.ts, langsung skip.
 * .cinfo → info grup/channel di chat saat ini (bisa reply maupun biasa):
 *          nama, id, username, jumlah member, deskripsi.
 * .id    → SUDAH ADA di plugin id.ts, tidak dibuat di sini.
 */
const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function statusTags(u) {
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
    return tags.length > 0 ? tags.join(' · ') : 'Normal User';
}
export default {
    name: 'profiles',
    help: {
        title: 'Profiles (.info / .cinfo)',
        description: 'Info lengkap pengguna (nama, ID, username, bio, foto profil besar) dan info grup/channel (nama, ID, member, deskripsi).',
        usage: '• `.info` — balas pesan user untuk melihat info + foto profil besarnya\n• `.cinfo` — lihat info grup/channel di chat saat ini (bisa juga sambil reply)',
        detail: '• `.info` hanya aktif saat me-reply pesan seseorang; foto dikirim dalam ukuran besar jika profilnya punya foto.\n' +
            '• `.info <username>` / `.info` tanpa reply ditangani plugin info (.info lain).\n' +
            '• `.cinfo` menampilkan jumlah member lewat full-chat API (supergroup/channel) atau daftar participant (grup biasa).\n' +
            '• `.id` untuk ID chat/user cepat ada di plugin terpisah.'
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
        // .info — reply ke pesan user → kartu info + foto profil besar
        // ============================================================
        if (cmd === '.info') {
            const replied = await message.getReplyMessage();
            if (!replied) {
                return;
            } // bukan reply → biarkan plugin info.ts yang menangani
            try {
                // Anti-dobel: kalau pesan perintah sudah diedit/dihapus plugin lain (info.ts), skip.
                const fresh = (await client.getMessages(message.peerId, { ids: [message.id] }))?.[0];
                if (!fresh || fresh.message !== message.message) {
                    return;
                }
                await message.edit({
                    text: '<blockquote>🔍 <b>Mengambil info pengguna...</b></blockquote>',
                    parseMode: 'html'
                });
                // getSender dulu, fallback getEntity/getChat
                let target;
                try {
                    target = await replied.getSender();
                }
                catch (_e) {
                    target = undefined;
                }
                if (!target && replied.senderId) {
                    try {
                        target = await client.getEntity(replied.senderId);
                    }
                    catch (_e) {
                        target = undefined;
                    }
                }
                if (!target) {
                    try {
                        target = await message.getChat();
                    }
                    catch (_e) {
                        target = undefined;
                    }
                }
                if (!target) {
                    await message.edit({
                        text: '<blockquote>❌ <b>Tidak bisa mengambil data pengguna (mungkin anonim/tersembunyi).</b></blockquote>',
                        parseMode: 'html'
                    });
                    return;
                }
                let caption;
                if (target.className === 'User' || target.className === 'UserEmpty') {
                    const full = await client.invoke(new Api.users.GetFullUser({ id: target }));
                    const u = full.users?.[0];
                    const f = full.fullUser;
                    if (!u) {
                        throw new Error('Data user kosong dari server.');
                    }
                    const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Tanpa Nama';
                    const uname = u.username ? `@${u.username}` : 'Tidak ada';
                    caption =
                        `<blockquote>👤 <b>USER INFO</b>\n` +
                            `📛 <b>Nama:</b> ${escapeHtml(name)}\n` +
                            `🆔 <b>ID:</b> <code>${u.id}</code>\n` +
                            `🔗 <b>Username:</b> ${escapeHtml(uname)}\n` +
                            `🔖 <b>Status:</b> ${statusTags(u)}\n` +
                            `📝 <b>Bio:</b> <i>${escapeHtml(f?.about || 'Tidak ada bio')}</i></blockquote>`;
                }
                else {
                    const name = target.title || 'Tanpa Nama';
                    const uname = target.username ? `@${target.username}` : 'Tidak ada';
                    caption =
                        `<blockquote>📣 <b>CHAT INFO</b>\n` +
                            `📛 <b>Nama:</b> ${escapeHtml(name)}\n` +
                            `🆔 <b>ID:</b> <code>${target.id}</code>\n` +
                            `🔗 <b>Username:</b> ${escapeHtml(uname)}\n` +
                            `📌 <b>Tipe:</b> ${escapeHtml(target.className)}</blockquote>`;
                }
                // Foto profil besar
                let photo = undefined;
                try {
                    photo = await client.downloadProfilePhoto(target, { isBig: true });
                }
                catch (e) {
                    Logger.logUser(telegramId, `Profiles: gagal download foto profil: ${e instanceof Error ? e.message : String(e)}`, 'WARN');
                }
                if (photo && typeof photo !== 'string' && photo.length > 0) {
                    await client.sendMessage(message.peerId, {
                        message: caption,
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
                    await message.edit({ text: caption, parseMode: 'html', linkPreview: false });
                }
            }
            catch (err) {
                Logger.logUser(telegramId, `Profiles .info Error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal mengambil info:</b> <i>${escapeHtml(err instanceof Error ? err.message : String(err))}</i></blockquote>`,
                    parseMode: 'html'
                }).catch(() => { });
            }
            return;
        }
        // ============================================================
        // .cinfo — info grup/channel di chat saat ini
        // ============================================================
        if (cmd === '.cinfo') {
            try {
                const chat = await message.getChat();
                if (!chat || chat.className === 'User') {
                    await message.edit({
                        text: '<blockquote>❌ <b>Gunakan <code>.cinfo</code> di dalam grup/channel.</b></blockquote>',
                        parseMode: 'html'
                    });
                    return;
                }
                await message.edit({
                    text: '<blockquote>🔍 <b>Mengambil info chat...</b></blockquote>',
                    parseMode: 'html'
                });
                const title = chat.title || 'Tanpa Nama';
                const uname = chat.username ? `@${chat.username}` : 'Private';
                const typeLabel = chat.className === 'Channel' ? (chat.megagroup ? 'Supergroup' : 'Channel') : 'Grup';
                let about = '';
                let members;
                if (chat.className === 'Channel') {
                    const full = await client.invoke(new Api.channels.GetFullChannel({ channel: chat }));
                    about = full.fullChat?.about || '';
                    members = full.fullChat?.participantsCount;
                }
                else {
                    // Grup basic → messages.GetFullChat, jumlah member dari participants
                    try {
                        const full = await client.invoke(new Api.messages.GetFullChat({ chatId: chat.id }));
                        about = full.fullChat?.about || '';
                        const p = full.fullChat?.participants;
                        members = p && p.className === 'ChatParticipants' ? p.participants.length : undefined;
                    }
                    catch (_e) { /* fallback ke participantsCount entity di bawah */ }
                }
                if (members === undefined || members === null) {
                    members = chat.participantsCount ?? 'Tidak diketahui';
                }
                const text = `<blockquote>👥 <b>CHAT INFO</b>\n` +
                    `📌 <b>Nama:</b> ${escapeHtml(title)}\n` +
                    `🆔 <b>ID:</b> <code>${chat.id}</code>\n` +
                    `🔗 <b>Username:</b> ${escapeHtml(uname)}\n` +
                    `📌 <b>Tipe:</b> ${escapeHtml(typeLabel)}\n` +
                    `👥 <b>Member:</b> ${escapeHtml(String(members))}\n` +
                    `📝 <b>Deskripsi:</b>\n<i>${escapeHtml(about || 'Tidak ada deskripsi')}</i></blockquote>`;
                await message.edit({ text, parseMode: 'html', linkPreview: false });
            }
            catch (err) {
                Logger.logUser(telegramId, `Profiles .cinfo Error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal mengambil info chat:</b> <i>${escapeHtml(err instanceof Error ? err.message : String(err))}</i></blockquote>`,
                    parseMode: 'html'
                }).catch(() => { });
            }
            return;
        }
    }
};
