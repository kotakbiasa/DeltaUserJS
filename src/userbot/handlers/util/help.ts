import { helpRegistry } from '../../engine/pluginRegistry.js';
import { Logger } from '../../../utils/logger.js';
import { escapeHtml } from '../../../utils/richMessage.js';

/**
 * Format nama modul agar rapi
 */
function formatModuleName(name) {
  if (name.toLowerCase() === 'antipm') {return 'AntiPM';}
  if (name.length <= 3) {return name.toUpperCase();}
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Escape HTML untuk konten aman
 */

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
// HELP MENU — Inline Keyboard via GramJS
// ============================================================

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
    `💡 Ketik <code>.help [nama_modul]</code> untuk detail, atau klik tombol di bawah.`
  );
}

/**
 * Bangun inline keyboard untuk halaman menu utama (GramJS format)
 */
function buildMenuKeyboard(page = 1) {
  const names = getModuleNames();
  const totalPages = Math.max(1, Math.ceil(names.length / MODULES_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * MODULES_PER_PAGE;
  const items = names.slice(start, start + MODULES_PER_PAGE);

  const rows = [];

  // Module buttons — 2 per row
  for (let i = 0; i < items.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, items.length); j++) {
      const name = items[j];
      row.push({
        text: formatModuleName(name),
        data: `help:mod:${name}`,
      });
    }
    rows.push(row);
  }

  // Navigation row
  const nav = [];
  if (currentPage > 1) {
    nav.push({ text: '⬅️ Prev', data: `help:page:${currentPage - 1}` });
  }
  nav.push({ text: `📄 ${currentPage}/${totalPages}`, data: 'help:noop' });
  if (currentPage < totalPages) {
    nav.push({ text: 'Next ➡️', data: `help:page:${currentPage + 1}` });
  }
  rows.push(nav);

  // Close button
  rows.push([{ text: '✖️ Tutup', data: 'help:close' }]);

  return rows;
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

/**
 * Bangun keyboard untuk halaman detail modul
 */
function buildModuleKeyboard(moduleName, fromPage = 1) {
  return [
    [{ text: '🔙 Kembali ke Menu', data: `help:page:${fromPage}` }],
    [{ text: '✖️ Tutup', data: 'help:close' }],
  ];
}

/**
 * Helper: Dapatkan replyTo untuk forum topic
 */
function getReplyToForTopic(message) {
  if (message.replyTo) {
    return message.replyTo.replyToTopId || message.replyTo.replyToMsgId || message.id;
  }
  return message.id;
}

export default {
  name: 'help',
  help: {
    title: 'Help Menu',
    description: 'Menampilkan panduan penggunaan dan daftar modul yang tersedia di userbot Anda.',
    usage: 'Ketik `.help` untuk menu utama atau `.help [nama_modul]` untuk detail spesifik.',
    detail: 'Menu help sekarang menggunakan inline keyboard interaktif. Klik tombol modul untuk melihat detail.'
  },

  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}
    if (!message.message.toLowerCase().startsWith('.help')) {return;}

    try {
      const parts = message.message.trim().split(/\s+/);
      const _replyToMsgId = getReplyToForTopic(message);

      if (parts.length === 1) {
        // --- .help → Menu utama dengan inline keyboard ---
        const text = buildMenuText(1);
        const buttons = buildMenuKeyboard(1);

        await message.edit({
          text,
          parseMode: 'html',
          buttons,
        });
        return;
      } else {
        // --- .help <nama_modul> → Detail modul ---
        const moduleName = parts[1].toLowerCase();
        const targetModule = helpRegistry[moduleName];

        if (targetModule) {
          const text = buildModuleDetail(moduleName);
          const buttons = buildModuleKeyboard(moduleName, 1);
          await message.edit({
            text,
            parseMode: 'html',
            buttons,
          });
        } else {
          const available = Object.keys(helpRegistry).join(', ');
          const safeName = escapeHtml(parts[1]);
          await message.edit({
            text: `❌ Modul "<b>${safeName}</b>" tidak ditemukan!\n\nModul tersedia: <code>${available}</code>\n\nKetik <code>.help</code> untuk melihat daftar modul.`,
            parseMode: 'html',
          });
        }
      }
    } catch (err) {
      Logger.logUser(telegramId, `Error in help plugin: ${err}`, 'ERROR');
      try {
        await message.edit({ text: `❌ Terjadi kesalahan saat memproses bantuan: ${err.message}` });
      } catch (_e) { /* ignore */ }
    }
  },

  // ============================================================
  // CALLBACK HANDLER — Dipanggil saat user klik tombol inline
  // ============================================================
  async onCallbackQuery(client, callbackEvent, _settings, _telegramId) {
    if (!callbackEvent) {return;}

    const data = callbackEvent.data || '';

    // Parse callback data
    if (data === 'help:noop') {
      await callbackEvent.answer({ message: '', alert: false });
      return true;
    }

    if (data === 'help:close') {
      await callbackEvent.answer({ message: '', alert: false });
      try {
        const msg = await callbackEvent.getMessage();
        if (msg) {await msg.delete({ revoke: true });}
      } catch (_) { /* ignore */ }
      return true;
    }

    // Page navigation
    const pageMatch = data.match(/^help:page:(\d+)$/);
    if (pageMatch) {
      const page = Number(pageMatch[1]);
      const text = buildMenuText(page);
      const buttons = buildMenuKeyboard(page);
      await callbackEvent.answer({ message: '', alert: false });
      await callbackEvent.editMessage(text, { parseMode: 'html', buttons });
      return true;
    }

    // Module detail
    const modMatch = data.match(/^help:mod:(.+)$/);
    if (modMatch) {
      const moduleName = modMatch[1].toLowerCase();
      const text = buildModuleDetail(moduleName);
      if (!text) {
        await callbackEvent.answer({ message: 'Modul tidak ditemukan', alert: true });
        return true;
      }
      const buttons = buildModuleKeyboard(moduleName, 1);
      await callbackEvent.answer({ message: '', alert: false });
      await callbackEvent.editMessage(text, { parseMode: 'html', buttons });
      return true;
    }

    return false;
  },
};
