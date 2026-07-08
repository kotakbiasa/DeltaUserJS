import config from '../../../config.js';
export default {
    name: 'adzan',
    version: '1.0.0',
    description: 'Menunjukkan jadwal waktu sholat dari kota yang diberikan.',
    help: {
        title: 'Adzan / Jadwal Sholat',
        description: 'Menampilkan jadwal sholat 5 waktu secara lengkap menggunakan API muslimsalat.com.',
        usage: '`.adzan <nama kota>`',
        detail: 'Contoh: `.adzan Bandung`\\nJika kota tidak disebutkan, secara default akan menampilkan jadwal untuk Jakarta.'
    },
    async execute(client, message, settings, telegramId) {
        if (!message.out || !message.message)
            return;
        const match = message.message.match(/^\.adzan(?:\s+([\s\S]+))?$/i);
        if (!match)
            return;
        const inputStr = match[1];
        const lokasi = inputStr ? inputStr.trim() : 'Jakarta';
        if (!config.muslimSalatApiKey) {
            await message.edit({
                text: `<blockquote>❌ <b>Konfigurasi kurang:</b> MUSLIM_SALAT_API_KEY belum diset di .env.</blockquote>`,
                parseMode: 'html'
            });
            return;
        }
        await message.edit({
            text: `⏳ <b>Mencari jadwal sholat untuk ${lokasi}...</b>`,
            parseMode: 'html'
        });
        try {
            const url = `http://muslimsalat.com/${encodeURIComponent(lokasi)}.json?key=${config.muslimSalatApiKey}`;
            const response = await fetch(url);
            if (!response.ok) {
                await message.edit({
                    text: `<blockquote>❌ <b>Tidak Dapat Menemukan Kota:</b> <code>${lokasi}</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const result = await response.json();
            if (!result.items || result.items.length === 0 || result.status_code === 0) {
                await message.edit({
                    text: `<blockquote>❌ <b>Tidak Dapat Menemukan Kota:</b> <code>${lokasi}</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const item = result.items[0];
            const catResult = `🕌 <b>Jadwal Shalat Hari Ini</b>
            
<b>📆 Tanggal :</b> <code>${item.date_for}</code>
<b>📍 Kota :</b> <code>${result.query}</code> | <code>${result.country}</code>

<b>Terbit  :</b> <code>${item.shurooq}</code>
<b>Subuh  :</b> <code>${item.fajr}</code>
<b>Zuhur   :</b> <code>${item.dhuhr}</code>
<b>Ashar   :</b> <code>${item.asr}</code>
<b>Maghrib :</b> <code>${item.maghrib}</code>
<b>Isya    :</b> <code>${item.isha}</code>`;
            await message.edit({
                text: catResult,
                parseMode: 'html'
            });
        }
        catch (err) {
            await message.edit({
                text: `<blockquote>❌ <b>Terjadi kesalahan:</b> ${err.message}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
