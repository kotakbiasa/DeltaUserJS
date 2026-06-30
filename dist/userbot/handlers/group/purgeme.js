export default {
    name: 'purgeme',
    help: {
        title: 'Bersihkan Chat (.purgeme)',
        description: 'Menghapus pesan-pesan keluar milik Anda sendiri secara massal untuk merapikan riwayat chat.',
        usage: 'Ketik `.purgeme <jumlah_pesan>` (Batas aman: 1 s.d. 100).',
        detail: 'Contoh: `.purgeme 10` akan mencari dan menghapus 10 pesan terakhir Anda secara permanen.\n• Bisa juga dengan me-reply pesan target lalu ketik `.purgeme` untuk menghapus semua pesan Anda dari pesan tersebut sampai pesan perintah.'
    },
    async execute(client, message, settings, telegramId) {
        if (message.out && message.message && message.message.toLowerCase().startsWith('.purgeme')) {
            try {
                const parts = message.message.split(' ');
                const count = parts[1] ? parseInt(parts[1], 10) : null;
                const replied = await message.getReplyMessage();
                if (!replied && (!count || isNaN(count) || count <= 0 || count > 100)) {
                    await message.edit({
                        text: `<blockquote>❌ <b>Gunakan</b>: <code>.purgeme &lt;1-100&gt;</code> atau balas ke suatu pesan dengan <code>.purgeme</code></blockquote>`,
                        parseMode: 'html'
                    });
                    return;
                }
                // Kirim status menghapus
                await message.edit({
                    text: `<blockquote>🧹 <b>Membersihkan obrolan...</b></blockquote>`,
                    parseMode: 'html'
                });
                let history = [];
                let myMsgIds = [];
                if (replied) {
                    // Ambil semua pesan antara pesan yang direply hingga pesan perintah
                    const chunk = await client.getMessages(message.peerId, {
                        minId: replied.id - 1,
                        maxId: message.id + 1,
                        limit: 500
                    });
                    myMsgIds = chunk.filter(msg => msg.out).map(msg => msg.id);
                }
                else {
                    // Ambil riwayat pesan terakhir dan saring hanya pesan sendiri
                    // Kita butuh (count + 1) pesan sendiri (termasuk command)
                    const chunk = await client.getMessages(message.peerId, {
                        fromUser: 'me',
                        limit: count + 1
                    });
                    myMsgIds = chunk.map(msg => msg.id);
                    // Fallback jika fromUser: 'me' tidak jalan di private chat
                    if (myMsgIds.length < count + 1) {
                        const manualChunk = await client.getMessages(message.peerId, { limit: (count + 1) * 10 });
                        myMsgIds = manualChunk.filter(msg => msg.out).map(msg => msg.id).slice(0, count + 1);
                    }
                }
                if (myMsgIds.length > 0) {
                    try {
                        await client.deleteMessages(message.peerId, myMsgIds, { revoke: true });
                        const m = await client.sendMessage(message.peerId, {
                            message: `<blockquote>✅ <b>Berhasil menghapus ${myMsgIds.length - 1} pesan!</b></blockquote>`,
                            parseMode: 'html'
                        });
                        // Auto delete pesan sukses setelah 3 detik
                        setTimeout(async () => {
                            try {
                                await m.delete({ revoke: true });
                            }
                            catch (e) { }
                        }, 3000);
                    }
                    catch (err) {
                        console.error('Failed to purge own messages:', err);
                        await message.edit({
                            text: `<blockquote>❌ <b>Gagal</b>: Terjadi kesalahan saat menghapus pesan.</blockquote>`,
                            parseMode: 'html'
                        });
                    }
                }
                else {
                    await message.edit({
                        text: `<blockquote>❌ <b>Gagal</b>: Tidak ada pesan yang dihapus.</blockquote>`,
                        parseMode: 'html'
                    });
                }
            }
            catch (err) {
                console.error('Error in purgeme plugin:', err);
                await message.edit({
                    text: `<blockquote>❌ <b>Gagal melakukan purgeme:</b>\n<i>${err.message}</i></blockquote>`,
                    parseMode: 'html'
                });
            }
        }
    }
};
