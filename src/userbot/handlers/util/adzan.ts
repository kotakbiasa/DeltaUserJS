import config from '../../../config.js';
import { escapeHtml } from '../../../utils/richMessage.js';

export default {
  name: 'adzan',
  version: '1.0.0',
  description: 'Menunjukkan jadwal waktu sholat dari kota yang diberikan.',
  help: {
    title: 'Adzan / Jadwal Sholat',
    description: 'Menampilkan jadwal sholat 5 waktu secara lengkap menggunakan API muslimsalat.com.',
    usage: '`.adzan <nama kota>`',
    detail: 'Contoh: `.adzan Bandung`\nJika kota tidak disebutkan, secara default akan menampilkan jadwal untuk Jakarta.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;

    const match = message.message.match(/^\.adzan(?:\s+([\s\S]+))?$/i);
    if (!match) return;

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
      const catResult = `🕌 <b>Jadwal Shalat Hari Ini</b>\n` +
        `\n` +
        `<b>📆 Tanggal :</b> <code>${escapeHtml(item.date_for)}</code>\n` +
        `<b>📍 Kota :</b> <code>${escapeHtml(result.query)}</code> | <code>${escapeHtml(result.country)}</code>\n` +
        `\n` +
        `<b>Terbit  :</b> <code>${escapeHtml(item.shurooq)}</code>\n` +
        `<b>Subuh  :</b> <code>${escapeHtml(item.fajr)}</code>\n` +
        `<b>Zuhur   :</b> <code>${escapeHtml(item.dhuhr)}</code>\n` +
        `<b>Ashar   :</b> <code>${escapeHtml(item.asr)}</code>\n` +
        `<b>Maghrib :</b> <code>${escapeHtml(item.maghrib)}</code>\n` +
        `<b>Isya    :</b> <code>${escapeHtml(item.isha)}</code>`;

      await message.edit({
        text: catResult,
        parseMode: 'html'
      });

    } catch (err) {
      await message.edit({
        text: `<blockquote>❌ <b>Terjadi kesalahan:</b> ${escapeHtml(err.message)}</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
