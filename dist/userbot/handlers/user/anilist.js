export default {
    name: 'anilist',
    version: '1.1.0',
    description: 'Pencarian Anime, Manga, dan Karakter via Anilist menggunakan Inline UI.',
    help: {
        title: 'Anilist (Anime & Manga)',
        description: 'Mencari database anime, manga, dan karakter dari Anilist dengan tampilan Rich UI.',
        usage: '`.anime <judul>` | `.anichar <nama>` | `.animanga <judul>` | `.airing <judul>`',
        detail: 'Menggunakan Inline Bot untuk menampilkan gambar dan tombol tautan yang rapi.'
    },
    async execute(client, message, settings, telegramId) {
        if (!message.out || !message.message)
            return;
        const match = message.message.match(/^\.(anime|anichar|animanga|airing)(?:\s+([\s\S]+))?$/i);
        if (!match)
            return;
        const cmd = match[1].toLowerCase();
        const search = match[2];
        if (!search) {
            await message.edit({
                text: `❌ Harap masukkan judul yang ingin dicari!\nContoh: <code>.${cmd} Naruto</code>`,
                parseMode: 'html'
            });
            return;
        }
        await message.edit({ text: `⏳ <b>Mencari informasi di database Anilist...</b>`, parseMode: 'html' });
        try {
            const botUsername = settings.inline_bot_username;
            if (!botUsername) {
                await message.edit({
                    text: `❌ <b>Gagal:</b> Pencarian Anilist membutuhkan <b>Custom Inline Bot</b>.\nHarap atur <code>INLINE_BOT_TOKEN</code> terlebih dahulu di menu Vars Config.`,
                    parseMode: 'html'
                });
                return;
            }
            const results = await client.inlineQuery(botUsername, `anilist_${cmd}_${search}`);
            if (results && results.length > 0) {
                // Kirim hasil inline
                await results[0].click(message.peerId, message.replyToMsgId);
                // Hapus pesan loading
                try {
                    await message.delete();
                }
                catch (e) { }
            }
            else {
                await message.edit({
                    text: `<blockquote>❌ <b>Pencarian tidak ditemukan:</b> <code>${search}</code></blockquote>`,
                    parseMode: 'html'
                });
            }
        }
        catch (err) {
            console.error(err);
            await message.edit({
                text: `<blockquote>❌ <b>Gagal menghubungi Master Bot / Inline Bot:</b>\n${err.message}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
