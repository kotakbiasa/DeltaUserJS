import { updateUserbotFeature } from '../../../infrastructure/database.js';
// Map in-memory untuk menyimpan waktu kapan pengguna mulai AFK (per akun userbot)
// Struktur: telegramId -> timestamp (angka)
const afkTimestamps = new Map();
// Map untuk menyimpan waktu balasan terakhir per pengguna untuk menghindari spam
// Struktur: telegramId-senderId -> timestamp (angka)
const lastReplied = new Map();
const COOLDOWN_MS = 30000; // 30 detik cooldown
export default {
    name: 'afk',
    help: {
        title: 'Auto-Read & Auto-Reply',
        description: 'Mengotomatiskan penanganan pesan pribadi masuk saat Anda sedang sibuk.',
        usage: 'Aktifkan melalui tombol di Master Bot, lalu ketik `.afk [alasan]` di chat mana pun.',
        detail: '• **Auto-Read**: Langsung menandai semua pesan pribadi masuk sebagai telah dibaca (centang biru).\n• **Auto-Reply**: Membalas pesan PM masuk dari orang lain secara otomatis menggunakan alasan kustom yang Anda setel di Master Bot.\n• Ketik `.afk [alasan]` untuk mengaktifkan.\n• Kirim pesan apa pun untuk menonaktifkan otomatis.'
    },
    async execute(client, message, settings, telegramId) {
        const isPrivate = message.isPrivate;
        const msgText = message.message ? message.message.trim() : '';
        // ==========================================
        // 1. LOGIKA OUTGOING (Pesan keluar dari kita sendiri)
        // ==========================================
        if (message.out) {
            // A. PERINTAH AKTIVASI: .afk [alasan]
            if (msgText.toLowerCase() === '.afk' || msgText.toLowerCase().startsWith('.afk ')) {
                const parts = msgText.split(' ');
                parts.shift(); // Hapus ".afk"
                const reason = parts.join(' ').trim() || 'Saya sedang AFK/Sibuk. Harap tunggu sebentar.';
                // Nyalakan status AFK di Database (auto_reply === 1)
                updateUserbotFeature(telegramId, 'auto_reply', 1);
                updateUserbotFeature(telegramId, 'afk_reason', reason);
                // Catat waktu mulai AFK di memori
                afkTimestamps.set(telegramId, Date.now());
                try {
                    await message.edit({
                        text: `💤 <b>Saya Sekarang AFK!</b>\n\n📝 <b>Alasan</b>: <i>"${reason}"</i>\n\n<i>Userbot akan membalas pesan masuk secara otomatis dan menandai obrolan pribadi Anda sebagai dibaca.</i>`,
                        parseMode: 'html'
                    });
                }
                catch (e) {
                    console.error('Gagal mengedit pesan .afk:', e.message);
                }
                return; // Hentikan agar tidak mentrigger deteksi aktif kembali
            }
            // B. DEAKTIVASI OTOMATIS: Pengguna mengirim chat apa pun saat AFK
            if (settings.auto_reply === 1) {
                // Matikan status AFK di database
                updateUserbotFeature(telegramId, 'auto_reply', 0);
                // Hitung berapa lama kita AFK tadi
                const startTime = afkTimestamps.get(telegramId) || Date.now();
                const durationMins = Math.round((Date.now() - startTime) / 60000);
                const durationText = durationMins > 0 ? `${durationMins} menit` : 'kurang dari 1 menit';
                afkTimestamps.delete(telegramId); // Hapus timestamp cache
                try {
                    // Kirim pesan pemberitahuan bahwa kita sudah kembali online
                    await client.sendMessage(message.peerId, {
                        message: `☀️ <b>Saya telah kembali online!</b>\n\n<i>Mode AFK otomatis dinonaktifkan. Anda tadi AFK selama ${durationText}.</i>`,
                        parseMode: 'html'
                    });
                }
                catch (e) {
                    console.error('Gagal mengirim pesan kembali online:', e.message);
                }
            }
        }
        // ==========================================
        // 2. LOGIKA INCOMING (Pesan masuk dari orang lain)
        // ==========================================
        if (!message.out && settings.auto_reply === 1) {
            const senderId = Number(message.senderId);
            const sender = await message.getSender();
            if (sender?.bot || senderId === 777000)
                return; // Abaikan bot dan Telegram resmi
            // Pemicu Balasan AFK:
            // - Pesan masuk di Chat Pribadi (PM/Private)
            // - ATAU Anda di-mention/ditag di obrolan grup
            const isMentioned = message.mentioned;
            if (isPrivate || isMentioned) {
                const cooldownKey = `${telegramId}-${senderId}`;
                const now = Date.now();
                const lastReplyTime = lastReplied.get(cooldownKey) || 0;
                // Jika dalam masa cooldown, lewati auto-reply
                if (now - lastReplyTime < COOLDOWN_MS) {
                    // Tetap tandai sebagai dibaca di PM jika diaktifkan
                    if (isPrivate) {
                        try {
                            await client.markAsRead(message.peerId);
                        }
                        catch (e) { }
                    }
                    return;
                }
                // Catat waktu reply sekarang
                if (lastReplied.size > 1000)
                    lastReplied.clear(); // Mencegah memory leak
                lastReplied.set(cooldownKey, now);
                // ⚡ Aksi A: Auto-Read (Hanya jika chat pribadi agar centang biru)
                if (isPrivate) {
                    try {
                        await client.markAsRead(message.peerId);
                    }
                    catch (e) { }
                }
                // ⚡ Aksi B: Auto-Reply dengan penghitungan durasi waktu AFK
                try {
                    if (message.message) {
                        const startTime = afkTimestamps.get(telegramId) || Date.now();
                        const elapsedMins = Math.round((Date.now() - startTime) / 60000);
                        let timeText = 'baru saja';
                        if (elapsedMins > 0) {
                            if (elapsedMins >= 60) {
                                const hours = Math.floor(elapsedMins / 60);
                                const mins = elapsedMins % 60;
                                timeText = `${hours} jam ${mins} menit yang lalu`;
                            }
                            else {
                                timeText = `${elapsedMins} menit yang lalu`;
                            }
                        }
                        // Balas dengan me-reply pesan pengirim asli
                        await client.sendMessage(message.peerId, {
                            message: `<b>💤 ${settings.custom_name || 'Userbot'} — Auto Reply</b>\n\n` +
                                `Halo! Saya sedang <b>AFK (Away From Keyboard)</b> saat ini.\n\n` +
                                `📝 <b>Alasan</b>: <i>${settings.afk_reason}</i>\n` +
                                `🕒 <b>Sejak</b>: <i>${timeText}</i>\n\n` +
                                `<i>Pesan Anda telah dibaca otomatis. Harap tunggu sampai saya online kembali.</i>`,
                            replyTo: message.id,
                            parseMode: 'html'
                        });
                    }
                }
                catch (err) {
                    console.error(`❌ Error in AFK auto-reply for [${telegramId}]:`, err.message);
                }
            }
        }
    }
};
