import { addApprovedUser, removeApprovedUser, getApprovedUsers } from '../../../infrastructure/database.js';
import { escapeHtml } from '../../../utils/richMessage.js';
export default {
    name: 'approve',
    async execute(client, message, settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const text = message.message.trim();
        const args = text.split(/\s+/);
        const cmd = args[0].toLowerCase();
        if (cmd === '.approve') {
            const replied = await message.getReplyMessage();
            if (!replied) {
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal:</b> Balas pesan pengguna yang ingin di-approve!</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const targetId = Number(replied.senderId);
            if (!targetId) {
                return;
            }
            const success = await addApprovedUser(telegramId, targetId);
            if (success) {
                await message.edit({
                    text: `<blockquote>✅ <b>Pengguna Diizinkan (Approved)!</b>\nPengguna dengan ID <code>${escapeHtml(String(targetId))}</code> tidak akan diblokir oleh Anti-PM.</blockquote>`,
                    parseMode: 'html'
                });
            }
        }
        else if (cmd === '.disapprove') {
            const replied = await message.getReplyMessage();
            if (!replied) {
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal:</b> Balas pesan pengguna yang ingin di-disapprove!</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const targetId = Number(replied.senderId);
            if (!targetId) {
                return;
            }
            const success = await removeApprovedUser(telegramId, targetId);
            if (success) {
                await message.edit({
                    text: `<blockquote>❌ <b>Pengguna Dihapus (Disapproved)!</b>\nPengguna dengan ID <code>${escapeHtml(String(targetId))}</code> telah dihapus dari daftar aman Anti-PM.</blockquote>`,
                    parseMode: 'html'
                });
            }
        }
        else if (cmd === '.approved') {
            const list = getApprovedUsers(telegramId);
            if (list.length === 0) {
                await message.edit({
                    text: `<blockquote>📝 <b>Daftar Approved Kosong.</b>\nBelum ada pengguna yang Anda masukkan ke daftar putih.</blockquote>`,
                    parseMode: 'html'
                });
            }
            else {
                const listText = list.map(id => `• <code>${escapeHtml(String(id))}</code>`).join('\n');
                await message.edit({
                    text: `<blockquote>🛡️ <b>Daftar Pengguna Aman (Approved):</b>\n\n${listText}</blockquote>`,
                    parseMode: 'html'
                });
            }
        }
    }
};
