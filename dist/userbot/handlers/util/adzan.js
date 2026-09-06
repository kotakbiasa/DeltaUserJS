import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
// Sumber data: api.aladhan.com (gratis, tanpa API key).
// Sebelumnya pakai muslimsalat.com — endpoint .json-nya sudah 404 (audit Sep 2026).
export default {
    name: 'adzan',
    version: '2.0.0',
    description: 'Menunjukkan jadwal waktu sholat dari kota yang diberikan.',
    help: {
        title: 'Adzan / Jadwal Sholat',
        description: 'Menampilkan jadwal sholat 5 waktu secara lengkap menggunakan API AlAdhan.',
        usage: '`.adzan <nama kota>`',
        detail: 'Contoh: `.adzan Bandung`\nJika kota tidak disebutkan, secara default akan menampilkan jadwal untuk Jakarta.'
    },
    async execute(client, message, _settings, telegramId) {
        if (!message.out || !message.message) {
            return;
        }
        const match = message.message.match(/^\.adzan(?:\s+([\s\S]+))?$/i);
        if (!match) {
            return;
        }
        const inputStr = match[1];
        const lokasi = inputStr ? inputStr.trim() : 'Jakarta';
        await message.edit({
            text: `⏳ <b>Mencari jadwal sholat untuk ${escapeHtml(lokasi)}...</b>`,
            parseMode: 'html'
        });
        try {
            const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(lokasi)}&country=Indonesia&method=11`;
            const response = await fetch(url, { headers: { 'User-Agent': 'DeltaUserJS/1.0' } });
            if (!response.ok) {
                await message.edit({
                    text: `<blockquote>❌ <b>Tidak Dapat Menemukan Kota:</b> <code>${escapeHtml(lokasi)}</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const result = await response.json();
            if (result.code !== 200 || !result.data?.timings) {
                await message.edit({
                    text: `<blockquote>❌ <b>Tidak Dapat Menemukan Kota:</b> <code>${escapeHtml(lokasi)}</code></blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            const t = result.data.timings;
            const tanggal = result.data.date?.readable || '';
            // Trim keterangan "(WIB)" dsb dari nilai timing
            const clean = (s) => escapeHtml(String(s || '').replace(/\s*\([^)]*\)\s*/g, ''));
            const catResult = `🕌 <b>Jadwal Shalat Hari Ini</b>\n` +
                `\n` +
                `<b>📆 Tanggal :</b> <code>${escapeHtml(tanggal)}</code>\n` +
                `<b>📍 Kota :</b> <code>${escapeHtml(lokasi)}</code>\n` +
                `\n` +
                `<b>Terbit  :</b> <code>${clean(t.Sunrise)}</code>\n` +
                `<b>Subuh   :</b> <code>${clean(t.Fajr)}</code>\n` +
                `<b>Zuhur   :</b> <code>${clean(t.Dhuhr)}</code>\n` +
                `<b>Ashar   :</b> <code>${clean(t.Asr)}</code>\n` +
                `<b>Maghrib :</b> <code>${clean(t.Maghrib)}</code>\n` +
                `<b>Isya    :</b> <code>${clean(t.Isha)}</code>`;
            await message.edit({
                text: catResult,
                parseMode: 'html'
            });
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in adzan plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `<blockquote>❌ <b>Terjadi kesalahan:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}</blockquote>`,
                parseMode: 'html'
            });
        }
    }
};
