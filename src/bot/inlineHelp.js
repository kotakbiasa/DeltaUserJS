import { InlineKeyboard } from 'grammy';
import { helpRegistry } from '../userbot/pluginRegistry.js';

/**
 * Format nama modul agar rapi (kapitalisasi otomatis)
 */
function formatModuleName(name) {
  if (name.toLowerCase() === 'antipm') return 'AntiPM';
  if (name.length <= 3) return name.toUpperCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Teks menu utama help dengan info sistem
 */
function buildHelpMenuText() {
  const plugins = Object.keys(helpRegistry);
  const pluginCount = plugins.length;
  const memoryMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const uptimeMin = Math.round(process.uptime() / 60);

  let text = `D E L T A   U B O T   J S\n` +
    `───────────────────────\n` +
    `MENU BANTUAN USERBOT\n\n` +
    `───────────────────────\n` +
    `💡 <i>Pilih salah satu tombol modul di bawah ini untuk melihat detail penggunaannya.</i>`;

  return text;
}

/**
 * Konversi Markdown sederhana ke HTML
 */
function markdownToHtml(text) {
  if (!text) return text;
  return text
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/__(.*?)__/g, '<i>$1</i>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/_(.*?)_/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

/**
 * Teks detail modul
 */
function buildModuleDetailText(moduleName) {
  const mod = helpRegistry[moduleName];
  if (!mod) return null;

  return (
    `D E L T A   U B O T   J S\n` +
    `───────────────────────\n` +
    `<b>${mod.title}</b>\n\n` +
    `Deskripsi: ${markdownToHtml(mod.description)}\n` +
    `Penggunaan: ${markdownToHtml(mod.usage)}\n\n` +
    `Detail Fitur:\n${markdownToHtml(mod.detail)}\n` +
    `───────────────────────`
  );
}

/**
 * Buat InlineKeyboard untuk menu utama help dengan pagination
 */
function createHelpMenuMarkup(page = 1) {
  const plugins = Object.keys(helpRegistry);
  const itemsPerPage = 4;
  const totalPages = Math.ceil(plugins.length / itemsPerPage) || 1;
  
  // Pastikan page valid
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  const startIndex = (page - 1) * itemsPerPage;
  const pagePlugins = plugins.slice(startIndex, startIndex + itemsPerPage);

  const keyboard = new InlineKeyboard();

  // Buat baris tombol, 2 tombol per baris (2x2 grid style)
  for (let i = 0; i < pagePlugins.length; i += 2) {
    const row = pagePlugins.slice(i, i + 2).map(p => {
      return { text: formatModuleName(p), callback_data: `help:${p}` };
    });
    keyboard.row(...row);
  }
  
  // Tombol navigasi (Next / Prev)
  const navRow = [];
  if (page > 1) {
    navRow.push({ text: '⬅️ Prev', callback_data: `help_page:${page - 1}` });
  }
  if (page < totalPages) {
    navRow.push({ text: 'Next ➡️', callback_data: `help_page:${page + 1}` });
  }
  
  if (navRow.length > 0) {
    keyboard.row(...navRow);
  }

  // Tambahkan tombol Close di paling bawah
  keyboard.row().text('❌ Tutup Bantuan', 'help:close');

  return keyboard;
}

/**
 * Buat InlineKeyboard untuk tombol kembali
 */
function createBackMarkup() {
  return new InlineKeyboard()
    .text('Kembali ke Daftar Modul', 'help_page:1')
    .row()
    .text('❌ Tutup Bantuan', 'help:close');
}

/**
 * Register handlers to the master bot
 */
export function registerInlineHelpHandlers(bot) {
  // Handle inline queries
  bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query.trim();

    if (query === 'help') {
      const text = buildHelpMenuText();
      const markup = createHelpMenuMarkup(1);

      await ctx.answerInlineQuery([{
        type: 'article',
        id: 'help-menu',
        title: 'Menu Bantuan DeltaUbotJS',
        description: 'Tampilkan menu bantuan interaktif dengan tombol',
        input_message_content: {
          message_text: text,
          parse_mode: 'HTML'
        },
        reply_markup: markup
      }], {
        cache_time: 0
      });
    }
  });

  // Handle callback queries
  bot.on('callback_query:data', async (ctx, next) => {
    const data = ctx.callbackQuery.data;

    // Handler untuk navigasi halaman
    if (data.startsWith('help_page:')) {
      const page = parseInt(data.split(':')[1]) || 1;
      try {
        await ctx.editMessageText(buildHelpMenuText(), {
          parse_mode: 'HTML',
          reply_markup: createHelpMenuMarkup(page)
        });
        await ctx.answerCallbackQuery();
      } catch (err) {
        console.error('Error in help_page callback:', err);
        await ctx.answerCallbackQuery({ text: 'Gagal memuat halaman!', show_alert: true });
      }
      return;
    }

    if (data.startsWith('help:')) {
      const action = data.split(':')[1];

      try {
        if (action === 'back') {
          await ctx.editMessageText(buildHelpMenuText(), {
            parse_mode: 'HTML',
            reply_markup: createHelpMenuMarkup(1)
          });
        } else if (action === 'close') {
          // Master bot tidak bisa menghapus pesan inline secara fisik, 
          // jadi kita ubah teksnya dan hilangkan tombol
          await ctx.editMessageText('❌ <i>Menu bantuan telah ditutup.</i>', {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }
          });
        } else if (helpRegistry[action]) {
          await ctx.editMessageText(buildModuleDetailText(action), {
            parse_mode: 'HTML',
            reply_markup: createBackMarkup()
          });
        }
        await ctx.answerCallbackQuery();
      } catch (err) {
        console.error('Error in inline help callback:', err);
        await ctx.answerCallbackQuery({ text: 'Terjadi kesalahan!', show_alert: true });
      }
    } else {
      return next();
    }
  });
}
