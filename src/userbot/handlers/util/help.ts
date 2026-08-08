import { helpRegistry } from '../../engine/pluginRegistry.js';
import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { getMasterBotUsername } from '../../../bot/state/botUsername.js';

/**
 * Format nama modul agar rapi
 */
function formatModuleName(name) {
  if (name.toLowerCase() === 'antipm') {return 'AntiPM';}
  if (name.length <= 3) {return name.toUpperCase();}
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Strip HTML tags untuk preview singkat
 */
function stripHtml(text) {
  return String(text ?? '').replace(/<[^>]+>/g, '');
}

/**
 * Konversi Markdown sederhana ke HTML
 */
function markdownToHtml(text) {
  if (!text) {return '';}
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/__(.*?)__/g, '<i>$1</i>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

// ============================================================
// HELP MENU — Inline Keyboard via Master Bot
// ============================================================
//
// CATATAN PENTING: Userbot (akun user) TIDAK BISA menampilkan
// inline keyboard — parameter `buttons` di teleproto hanya bekerja
// untuk akun BOT. Jadi alurnya:
//   1. User ketik `.help` di chat userbot
//   2. Userbot kirim request "help_ubot" ke Master Bot (via DM)
//   3. Master Bot balas dengan rich message + inline keyboard
//      yang bisa diklik (page nav, detail modul, tutup)

const MODULES_PER_PAGE = 8;

function getModuleNames() {
  return Object.keys(helpRegistry).sort();
}

/**
 * Bangun teks HTML untuk halaman menu utama
 */
function buildMenuText(page = 1) {
  const names = getModuleNames();
  const totalPages = Math.max(1, Math.ceil(names.length / MODULES_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * MODULES_PER_PAGE;
  const items = names.slice(start, start + MODULES_PER_PAGE);

  const moduleList = items
    .map((name, i) => {
      const mod = helpRegistry[name];
      const num = start + i + 1;
      const title = mod?.title || formatModuleName(name);
      const desc = mod ? stripHtml(mod.description).slice(0, 60) : '';
      return `<b>${num}.</b> <code>${escapeHtml(name)}</code> — ${escapeHtml(title)}${desc ? `\n    <i>${escapeHtml(desc)}…</i>` : ''}`;
    })
    .join('\n\n');

  return (
    `📖 <b>HELP MENU — DAFTAR MODUL</b>\n` +
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
    `📦 <b>Total Modul:</b> ${names.length}\n` +
    `📄 <b>Halaman:</b> ${currentPage}/${totalPages}\n\n` +
    `${moduleList}\n\n` +
    `💡 Menu interaktif dengan tombol sudah dikirim ke chat Master Bot. Klik tombol di sana untuk navigasi.`
  );
}

/**
 * Bangun teks HTML untuk detail modul
 */
function buildModuleDetail(moduleName) {
  const mod = helpRegistry[moduleName];
  if (!mod) {return null;}

  return (
    `📦 <b>MODUL: ${escapeHtml(mod.title?.toUpperCase() || formatModuleName(moduleName).toUpperCase())}</b>\n` +
    `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯\n\n` +
    `📝 <b>Deskripsi:</b>\n` +
    `<blockquote>${markdownToHtml(mod.description)}</blockquote>\n\n` +
    `🚀 <b>Penggunaan:</b>\n` +
    `<blockquote>${markdownToHtml(mod.usage)}</blockquote>` +
    (mod.detail ? `\n\n💡 <b>Detail Tambahan:</b>\n<blockquote>${markdownToHtml(mod.detail)}</blockquote>` : '')
  );
}

export default {
  name: 'help',
  help: {
    title: 'Help Menu',
    description: 'Menampilkan panduan penggunaan dan daftar modul yang tersedia di userbot Anda.',
    usage: 'Ketik `.help` untuk menu utama atau `.help [nama_modul]` untuk detail spesifik.',
    detail: 'Menu help interaktif ditampilkan oleh Master Bot dengan tombol yang bisa diklik (navigasi halaman, detail modul, tutup).'
  },

  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}
    if (!message.message.toLowerCase().startsWith('.help')) {return;}

    try {
      const parts = message.message.trim().split(/\s+/);
      const masterBot = getMasterBotUsername();

      if (!masterBot) {
        // Fallback: Master Bot belum siap — tampilkan teks statis
        const text = buildMenuText(1);
        await message.edit({ text, parseMode: 'html' });
        return;
      }

      const moduleArg = parts.length > 1 ? parts[1].toLowerCase() : '';
      const helpTarget = moduleArg ? `help_ubot:${moduleArg}` : 'help_ubot';

      // Kirim request ke Master Bot — dia yang render inline keyboard
      await client.sendMessage(masterBot, { message: helpTarget });

      // Update pesan userbot di chat asal dengan konfirmasi
      if (moduleArg) {
        const targetModule = helpRegistry[moduleArg];
        if (targetModule) {
          const text = buildModuleDetail(moduleArg);
          await message.edit({ text, parseMode: 'html' });
        } else {
          const available = Object.keys(helpRegistry).join(', ');
          const safeName = escapeHtml(parts[1]);
          await message.edit({
            text: `❌ Modul "<b>${safeName}</b>" tidak ditemukan!\n\nModul tersedia: <code>${available}</code>\n\nKetik <code>.help</code> untuk melihat daftar modul.`,
            parseMode: 'html',
          });
        }
        return;
      }

      const text = buildMenuText(1);
      await message.edit({
        text,
        parseMode: 'html',
      });
    } catch (err) {
      Logger.logUser(telegramId, `Error in help plugin: ${err}`, 'ERROR');
      try {
        await message.edit({ text: `❌ Terjadi kesalahan saat memproses bantuan: ${err.message}` });
      } catch (_e) { /* ignore */ }
    }
  },
};
