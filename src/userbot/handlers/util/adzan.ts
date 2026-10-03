import { escapeHtml } from '../../../utils/richMessage.js';
import { fetchWithTimeout } from '../../../utils/http.js';
import { defineCommand } from '../../engine/defineCommand.js';

// Sumber data: api.aladhan.com (gratis, tanpa API key).
// Sebelumnya pakai muslimsalat.com — endpoint .json-nya sudah 404 (audit Sep 2026).
export default defineCommand({
  name: 'adzan',
  version: '2.0.0',
  description: 'Menunjukkan jadwal waktu sholat dari kota yang diberikan.',
  help: {
    title: 'Adzan / Jadwal Sholat',
    description: 'Menampilkan jadwal sholat 5 waktu secara lengkap menggunakan API AlAdhan.',
    usage: '`.adzan <nama kota>`',
    detail: 'Contoh: `.adzan Bandung`\nJika kota tidak disebutkan, secara default akan menampilkan jadwal untuk Jakarta.'
  },
  defaultArg: 'Jakarta',
  loading: (lokasi) => `Mencari jadwal sholat untuk ${escapeHtml(lokasi)}...`,
  loadingStyle: 'plain',
  errorTitle: 'Terjadi kesalahan',
  logErrors: true,

  async run({ arg: lokasi, edit }) {
    const notFound = `<blockquote>❌ <b>Tidak Dapat Menemukan Kota:</b> <code>${escapeHtml(lokasi)}</code></blockquote>`;

    const url = `https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(lokasi)}&country=Indonesia&method=11`;
    const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'DeltaUserJS/1.0' } }, 15_000);
    if (!response.ok) {
      await edit(notFound);
      return;
    }

    const result = await response.json();
    if (result.code !== 200 || !result.data?.timings) {
      await edit(notFound);
      return;
    }

    const t = result.data.timings;
    const tanggal = result.data.date?.readable || '';
    // Trim keterangan "(WIB)" dsb dari nilai timing
    const clean = (s: string) => escapeHtml(String(s || '').replace(/\s*\([^)]*\)\s*/g, ''));

    return `🕌 <b>Jadwal Shalat Hari Ini</b>\n` +
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
  }
});
