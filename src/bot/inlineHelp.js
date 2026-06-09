import { Menu } from '@grammyjs/menu';
import { helpRegistry } from '../userbot/pluginRegistry.js';
import { getUserbotSession } from '../database/db.js';

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
export function buildHelpMenuText(session) {
  const plugins = Object.keys(helpRegistry);
  const botName = session?.custom_name || 'DeltaUbotJS';
  const headerName = botName.toUpperCase().split('').join(' ');

  let text = `🔺 <b>${headerName}</b> 🔺\n` +
    `───────────────────────\n` +
    `📖 <b>MENU BANTUAN USERBOT</b>\n\n` +
    `<blockquote>` +
    `💡 <i>Pilih salah satu tombol modul di bawah ini untuk melihat detail penggunaannya.</i>` +
    `</blockquote>\n\n` +
    `⚡ <i>${session?.custom_name || 'DeltaUbotJS'}</i>`;

  return text;
}

/**
 * Konversi Markdown sederhana ke HTML
 */
function markdownToHtml(text) {
  if (!text) return text;
  
  // Escape HTML entities first to prevent Telegram parsing errors
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  // Convert basic markdown to HTML tags
  return escaped
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/__(.*?)__/g, '<i>$1</i>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/_(.*?)_/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<code>$1</code>');
}

/**
 * Teks detail modul
 */
function buildModuleDetailText(moduleName, session) {
  const mod = helpRegistry[moduleName];
  if (!mod) return null;

  const botName = session?.custom_name || 'DeltaUbotJS';
  const headerName = botName.toUpperCase().split('').join(' ');

  return (
    `🔺 <b>${headerName}</b> 🔺\n` +
    `───────────────────────\n` +
    `📦 <b>MODUL: ${mod.title}</b>\n\n` +
    `<blockquote>` +
    `📄 <b>Deskripsi</b>:\n${markdownToHtml(mod.description)}\n\n` +
    `⚙️ <b>Penggunaan</b>:\n${markdownToHtml(mod.usage)}\n\n` +
    `📋 <b>Detail Fitur</b>:\n${markdownToHtml(mod.detail)}` +
    `</blockquote>\n\n` +
    `⚡ <i>${session?.custom_name || 'DeltaUbotJS'}</i>`
  );
}

export const inlineHelpMenu = new Menu('inline-help-menu')
  .dynamic((ctx, range) => {
    const isViewingModule = ctx.session?.viewingHelpModule;
    
    if (isViewingModule) {
      // Sub-menu: Tampilkan tombol kembali dan tutup
      range.text('🔙 Kembali ke Daftar Modul', async (ctx) => {
        ctx.session.viewingHelpModule = null;
        const dbSession = getUserbotSession(ctx.from.id);
        await ctx.editMessageText(buildHelpMenuText(dbSession), { parse_mode: 'HTML' });
        ctx.menu.update();
      }).row();
      
      const isInline = !ctx.callbackQuery?.message;
      
      if (isInline) {
        range.text('❌ Tutup Bantuan', async (ctx) => {
          await ctx.editMessageText('❌ <i>Menu bantuan telah ditutup.</i>', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } });
        });
      } else {
        range.text('🔙 Kembali ke Beranda', async (ctx) => {
          ctx.session.viewingHelpModule = null;
          ctx.session.helpPage = 1;
          const { getWelcomeText } = await import('./menus.js');
          await ctx.editMessageText(getWelcomeText(ctx), { parse_mode: 'HTML' });
          ctx.menu.nav('master-main-menu');
        });
      }
    } else {
      // Main menu: Daftar Modul dengan pagination
      const plugins = Object.keys(helpRegistry);
      const itemsPerPage = 4;
      const totalPages = Math.ceil(plugins.length / itemsPerPage) || 1;
      let page = ctx.session?.helpPage || 1;
      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;

      const startIndex = (page - 1) * itemsPerPage;
      const pagePlugins = plugins.slice(startIndex, startIndex + itemsPerPage);

      // Render 2x2 grid
      for (let i = 0; i < pagePlugins.length; i += 2) {
        const row = pagePlugins.slice(i, i + 2);
        for (const p of row) {
          range.text(formatModuleName(p), async (ctx) => {
            ctx.session.viewingHelpModule = p;
            const dbSession = getUserbotSession(ctx.from.id);
            await ctx.editMessageText(buildModuleDetailText(p, dbSession), { parse_mode: 'HTML' });
            ctx.menu.update();
          });
        }
        range.row();
      }

      // Pagination controls
      if (totalPages > 1) {
        if (page > 1) {
          range.text('⬅️ Prev', (ctx) => { ctx.session.helpPage = page - 1; ctx.menu.update(); });
        }
        range.text(`Hal ${page}/${totalPages}`, (ctx) => ctx.answerCallbackQuery(`Halaman ${page}`));
        if (page < totalPages) {
          range.text('Next ➡️', (ctx) => { ctx.session.helpPage = page + 1; ctx.menu.update(); });
        }
        range.row();
      }

      const isInline = !ctx.callbackQuery?.message;
      if (isInline) {
        range.text('❌ Tutup Bantuan', async (ctx) => {
          await ctx.editMessageText('❌ <i>Menu bantuan telah ditutup.</i>', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } });
        });
      } else {
        range.text('🔙 Kembali ke Beranda', async (ctx) => {
          ctx.session.viewingHelpModule = null;
          ctx.session.helpPage = 1;
          const { getWelcomeText } = await import('./menus.js');
          await ctx.editMessageText(getWelcomeText(ctx), { parse_mode: 'HTML' });
          ctx.menu.nav('master-main-menu');
        });
      }
    }
  });

/**
 * Register handlers to the master bot
 */
export function registerInlineHelpHandlers(bot) {
  // Setup Session Variables
  bot.use((ctx, next) => {
    if (ctx.session) {
      ctx.session.viewingHelpModule = ctx.session.viewingHelpModule || null;
      ctx.session.helpPage = ctx.session.helpPage || 1;
    }
    return next();
  });

  // Daftarkan Menu
  bot.use(inlineHelpMenu);

  // Handle inline queries
  bot.on('inline_query', async (ctx, next) => {
    const query = ctx.inlineQuery.query.trim();

    if (query === 'help') {
      const dbSession = getUserbotSession(ctx.from.id);
      const text = buildHelpMenuText(dbSession);

      // Reset state when opening help
      if (ctx.session) {
        ctx.session.viewingHelpModule = null;
        ctx.session.helpPage = 1;
      }

      await ctx.answerInlineQuery([{
        type: 'article',
        id: 'help-menu',
        title: 'Menu Bantuan DeltaUbotJS',
        description: 'Tampilkan menu bantuan interaktif dengan tombol',
        input_message_content: {
          message_text: text,
          parse_mode: 'HTML'
        },
        reply_markup: inlineHelpMenu
      }], {
        cache_time: 0
      });
    } else {
      return next();
    }
  });
}
