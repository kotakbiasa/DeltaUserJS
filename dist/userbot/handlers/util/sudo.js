import config from '../../../config.js';
import { escapeHtml } from '../../../utils/richMessage.js';
// ============================================================
// SUDO MANAGER
// Kelola daftar user (selain owner bot) yang boleh memakai
// command userbot. State in-memory — direset saat restart.
// Plugin lain dapat memakai helper:
//   isSudo(telegramId) -> boolean
//   getSudos()         -> number[]
// ============================================================
const sudoUsers = new Set();
export function isSudo(telegramId) {
    return sudoUsers.has(Number(telegramId));
}
export function getSudos() {
    return Array.from(sudoUsers);
}
function isOwnerBot(telegramId) {
    return Boolean(config.ownerId) && Number(telegramId) === config.ownerId;
}
// Prioritas: argumen ID langsung (.addsudo 12345), lalu reply ke pesan user.
async function resolveTargetId(message) {
    const arg = message.message.trim().split(/\s+/)[1];
    if (arg) {
        const id = Number(arg);
        if (Number.isInteger(id) && id > 0) {
            return id;
        }
    }
    const replied = await message.getReplyMessage();
    if (replied && replied.senderId) {
        const id = Number(replied.senderId);
        if (Number.isInteger(id) && id > 0) {
            return id;
        }
    }
    return null;
}
export default {
    name: 'sudo',
    version: '1.0.0',
    description: 'Manajemen sudo: user tambahan (selain owner) yang boleh memakai command userbot.',
    help: {
        title: 'Sudo Manager (.addsudo / .delsudo / .sudolist)',
        description: 'Kelola daftar pengguna sudo — user selain owner bot yang diizinkan menggunakan command userbot.',
        usage: '• `.addsudo` — balas pesan user untuk menambahkan\n' +
            '• `.addsudo <id>` — tambah sudo via user ID\n' +
            '• `.delsudo` — balas pesan user untuk menghapus\n' +
            '• `.delsudo <id>` — hapus sudo via user ID\n' +
            '• `.sudolist` — lihat daftar pengguna sudo',
        detail: 'Hanya owner bot (cek telegramId === config.ownerId) yang dapat menambah/menghapus sudo. ' +
            'Data disimpan in-memory dan kosong kembali setelah userbot restart. ' +
            'Plugin lain bisa memakai helper isSudo(telegramId) dan getSudos() untuk validasi akses sudo.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const parts = message.message.trim().split(/\s+/);
        const cmd = (parts[0] || '').toLowerCase();
        if (cmd !== '.addsudo' && cmd !== '.delsudo' && cmd !== '.sudolist') {
            return;
        }
        if (!isOwnerBot(telegramId)) {
            await message.edit({
                text: '<blockquote>⛔ <b>Akses Ditolak.</b>\nPerintah sudo hanya bisa dipakai oleh owner bot.</blockquote>',
                parseMode: 'html'
            });
            return;
        }
        if (cmd === '.addsudo' || cmd === '.delsudo') {
            const targetId = await resolveTargetId(message);
            if (!targetId) {
                await message.edit({
                    text: `<blockquote>📚 <b>Penggunaan:</b> <code>${cmd} &lt;user_id&gt;</code>\natau balas pesan user yang dimaksud.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            if (cmd === '.addsudo') {
                if (sudoUsers.has(targetId)) {
                    await message.edit({
                        text: `<blockquote>ℹ️ User <code>${escapeHtml(String(targetId))}</code> sudah terdaftar sebagai sudo.</blockquote>`,
                        parseMode: 'html'
                    });
                    return;
                }
                sudoUsers.add(targetId);
                await message.edit({
                    text: `<blockquote>✅ <b>Sudo Ditambahkan</b>\nUser <code>${escapeHtml(String(targetId))}</code> kini boleh memakai command userbot.\nTotal sudo: <b>${sudoUsers.size}</b></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            if (!sudoUsers.has(targetId)) {
                await message.edit({
                    text: `<blockquote>ℹ️ User <code>${escapeHtml(String(targetId))}</code> tidak ada di daftar sudo.</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            sudoUsers.delete(targetId);
            await message.edit({
                text: `<blockquote>🗑️ <b>Sudo Dihapus</b>\nUser <code>${escapeHtml(String(targetId))}</code> tidak lagi bisa memakai command userbot.\nTotal sudo: <b>${sudoUsers.size}</b></blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        // .sudolist
        const sudos = getSudos();
        if (sudos.length === 0) {
            await message.edit({
                text: '<blockquote>📭 Belum ada pengguna sudo terdaftar.\nTambahkan dengan <code>.addsudo &lt;id&gt;</code>.</blockquote>',
                parseMode: 'html'
            });
            return;
        }
        let rows = '';
        let i = 1;
        for (const id of sudos) {
            rows += `${i}. <code>${escapeHtml(String(id))}</code>\n`;
            i++;
        }
        await message.edit({
            text: `🛡️ <b>Daftar Pengguna Sudo (${sudos.length})</b>\n\n<blockquote>${rows}</blockquote>`,
            parseMode: 'html'
        });
    }
};
