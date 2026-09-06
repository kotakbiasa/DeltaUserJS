import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';

// Fun generator: hasil random, tidak butuh API. Daftar dibuat lebih sopan dari aslinya.
const KHODAM = [
  'Macan Yatim', 'Buaya Darat', 'Kuda Kayang', 'Dugong Terbang', 'Gajah Siluman',
  'Naga Rambut Panda', 'Cicak Pemalu', 'Kucing Oren Lemah', 'Singa Kekar',
  'Rusa Kantor', 'Ayam Berjas', 'Bebek Ngebut', 'Sapi Glowing', 'Kambing Cukur',
  'Kelinci Alfa', 'Semut Raksasa', 'Kunang-kunang Pensiun', 'Laba-laba Soleha',
  'Elang Kenyang', 'Ular Kejedot', 'Babi Hutan Sendirian', 'Kucing Anggoro ABG',
  'Harimau Kertas', 'Beruang Costumer Service', 'Capung PM', 'Landak Pengangguran'
];

export default {
  name: 'cekkhodam',
  version: '1.0.0',
  description: 'Cek khodam dari sebuah nama (banyak lucu-lucuan).',
  help: {
    title: 'Cek Khodam (.cekkhodam)',
    description: 'Melihat "khodam" dari sebuah nama — hasil acak, hanya untuk hiburan.',
    usage: '`.cekkhodam <nama>`',
    detail: 'Contoh: `.cekkhodam Budi`. Hasil murni random tiap pengecekan.'
  },
  async execute(client, message, _settings, _telegramId) {
    if (!message.out || !message.message) {return;}

    const match = message.message.match(/^\.cekkhodam(?:\s+([\s\S]+))?$/i);
    if (!match) {return;}

    const nama = (match[1] || '').trim();
    if (!nama) {
      await message.edit({
        text: `<blockquote>🤓 Namanya mana?</blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    const khodam = KHODAM[Math.floor(Math.random() * KHODAM.length)];
    const keberuntungan = Math.floor(Math.random() * 100) + 1;

    try {
      await message.edit({
        text: `🔮 <b>Hasil Cek Khodam</b>\n\n` +
          `<blockquote>` +
          `• <b>Nama</b>: ${escapeHtml(nama)}\n` +
          `• <b>Khodamnya</b>: <i>${escapeHtml(khodam)}</i>\n` +
          `• <b>Level Auranya</b>: ${keberuntungan}%` +
          `</blockquote>`,
        parseMode: 'html'
      });
    } catch (err) {
      Logger.logUser(0, `Error in cekkhodam: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    }
  }
};
