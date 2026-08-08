/**
 * Help Handlers — Master Bot
 *
 * Callback query handlers untuk tombol help di master bot dashboard.
 * Tidak lagi bergantung pada inline mode — .help userbot sekarang
 * menggunakan inline keyboard langsung dari userbot (GramJS buttons).
 */
import { helpRegistry as userbotHelpRegistry } from '../../userbot/engine/pluginRegistry.js';
import { escapeHtml } from '../../utils/richMessage.js';
import { editRich } from '../../utils/richMessage.js';

// Registry modul Master Bot (kosong sejak fitur group management dihapus;
// tetap disediakan agar mudah diperluas kembali di masa depan).
export const masterHelpRegistry = {};

function getRegistry(target) {
  if (target === 'ubot') {return userbotHelpRegistry;}
  return masterHelpRegistry;
}

function moduleNames(target = 'main') {
  return Object.keys(getRegistry(target)).sort();
}

function formatModuleName(name) {
  if (name.toLowerCase() === 'antipm') {return 'AntiPM';}
  if (name.length <= 3) {return name.toUpperCase();}
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function plain(value = '-') {
  return String(value || '-').replace(/<[^>]+>/g, '');
}

// --- Builders ---

function buildHelpMenuHtml(page = 1, target = 'main') {
  const names = moduleNames(target);
  const perPage = 8;
  const totalPages = Math.max(1, Math.ceil(names.length / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * perPage;
  const items = names.slice(start, start + perPage);

  const list = items
    .map((name, i) => {
      const mod = getRegistry(target)[name];
      const num = start + i + 1;
      const desc = mod ? plain(mod.description).slice(0, 60) : '';
      return `<b>${num}.</b> <code>${escapeHtml(name)}</code>${desc ? ` — <i>${escapeHtml(desc)}…</i>` : ''}`;
    })
    .join('\n');

  return `<b>📖 Help ${target === 'ubot' ? '(Userbot)' : '(Master)'}</b>\n` +
    `📦 Total: ${names.length} · 📄 Hal ${currentPage}/${totalPages}\n\n` +
    (list || 'Tidak ada modul.');
}

function buildModuleHtml(moduleName, target = 'main') {
  const mod = getRegistry(target)[moduleName];
  if (!mod) {return `<b>📦 Modul Tidak Ditemukan</b>`;}
  return `<b>📦 ${escapeHtml(mod.title || formatModuleName(moduleName))}</b>\n` +
    `<blockquote>${escapeHtml(plain(mod.description))}</blockquote>\n` +
    `<b>Penggunaan</b>\n<code>${escapeHtml(plain(mod.usage))}</code>` +
    (mod.detail ? `\n\n<b>Detail</b>\n${escapeHtml(plain(mod.detail))}` : '');
}

function helpKeyboard(page = 1, target = 'main') {
  const names = moduleNames(target);
  const perPage = 8;
  const totalPages = Math.max(1, Math.ceil(names.length / perPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * perPage;
  const items = names.slice(start, start + perPage);

  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map(name => ({
      text: formatModuleName(name),
      callback_data: `help:module:${name}:${target}`
    })));
  }

  if (totalPages > 1) {
    const nav = [];
    if (currentPage > 1) {nav.push({ text: '⬅️', callback_data: `help:page:${currentPage - 1}:${target}` });}
    nav.push({ text: `${currentPage}/${totalPages}`, callback_data: 'help:noop' });
    if (currentPage < totalPages) {nav.push({ text: '➡️', callback_data: `help:page:${currentPage + 1}:${target}` });}
    rows.push(nav);
  }

  rows.push([{ text: '✖️ Tutup', callback_data: 'help:close' }]);
  return { inline_keyboard: rows };
}

function moduleBackKeyboard(target = 'main') {
  return { inline_keyboard: [
    [{ text: '🔙 Kembali', callback_data: `help:page:1:${target}` }],
    [{ text: '✖️ Tutup', callback_data: 'help:close' }],
  ] };
}

function resolveModuleTarget(moduleName) {
  if (userbotHelpRegistry[moduleName]) {return 'ubot';}
  if (masterHelpRegistry[moduleName]) {return 'main';}
  return null;
}

// --- Exported for dashboard ---

export function buildHelpMenuRichHtml(session, _page = 1, target = 'main') {
  return `<h1>📖 Help ${target === 'ubot' ? '(Userbot)' : '(Master)'}</h1>` +
    `<blockquote>Pilih modul untuk melihat command dan detail penggunaan.</blockquote>`;
}

export function helpKeyboardExported(page = 1, target = 'main') {
  return helpKeyboard(page, target);
}

// --- Register callback handlers (no inline_query needed) ---

export function registerInlineHelpHandlers(bot) {
  bot.callbackQuery(/^help:page:(\d+)(?::(.+))?$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    const target = ctx.match[2] || 'main';
    await ctx.answerCallbackQuery();
    await editRich(ctx, buildHelpMenuHtml(page, target), {
      reply_markup: helpKeyboard(page, target),
    });
  });

  bot.callbackQuery(/^help:module:([^:]+)(?::(.+))?$/, async (ctx) => {
    const moduleName = ctx.match[1];
    const target = ctx.match[2] || resolveModuleTarget(moduleName) || 'main';
    await ctx.answerCallbackQuery();
    await editRich(ctx, buildModuleHtml(moduleName, target), {
      reply_markup: moduleBackKeyboard(target),
    });
  });

  bot.callbackQuery('help:noop', async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('help:close', async (ctx) => {
    await ctx.answerCallbackQuery('Tutup menu bantuan');
    try { await ctx.deleteMessage(); } catch (_) { /* empty */ }
  });
}
