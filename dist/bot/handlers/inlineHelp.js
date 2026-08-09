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
import { replyRich } from '../../utils/richMessage.js';
// Registry modul Master Bot (kosong sejak fitur group management dihapus;
// tetap disediakan agar mudah diperluas kembali di masa depan).
export const masterHelpRegistry = {};
function getRegistry(target) {
    if (target === 'ubot') {
        return userbotHelpRegistry;
    }
    return masterHelpRegistry;
}
function moduleNames(target = 'main') {
    return Object.keys(getRegistry(target)).sort();
}
function formatModuleName(name) {
    if (name.toLowerCase() === 'antipm') {
        return 'AntiPM';
    }
    if (name.length <= 3) {
        return name.toUpperCase();
    }
    return name.charAt(0).toUpperCase() + name.slice(1);
}
function plain(value = '-') {
    return String(value || '-').replace(/<[^>]+>/g, '');
}
// --- Builders ---
export function buildHelpMenuHtml(page = 1, target = 'main') {
    const names = moduleNames(target);
    const perPage = 8;
    const totalPages = Math.max(1, Math.ceil(names.length / perPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    // Untuk userbot: teks singkat + tombol (menu tetap ringkas)
    if (target === 'ubot') {
        return `<b>📖 Help (Userbot)</b>\n` +
            `<code>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</code>\n` +
            `✨ Pilih modul lewat <b>tombol</b> di bawah.\n\n` +
            `📄 Halaman: <b>${currentPage}/${totalPages}</b> · 📦 Total: <b>${names.length}</b>`;
    }
    // Master bot: tetap tampilkan daftar
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
    return `<b>📖 Help (Master)</b>\n` +
        `📦 Total: ${names.length} · 📄 Hal ${currentPage}/${totalPages}\n\n` +
        (list || 'Tidak ada modul.');
}
export function buildModuleHtml(moduleName, target = 'main') {
    const mod = getRegistry(target)[moduleName];
    if (!mod) {
        return `<b>📦 Modul Tidak Ditemukan</b>`;
    }
    const title = mod.title || formatModuleName(moduleName);
    const desc = plain(mod.description);
    const usage = plain(mod.usage);
    const detail = mod.detail ? plain(mod.detail) : '';
    let html = `<b>📦 ${escapeHtml(title)}</b>\n` +
        `<code>⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯</code>\n\n`;
    if (desc) {
        html += `<b>📝 Deskripsi</b>\n<blockquote>${escapeHtml(desc)}</blockquote>\n\n`;
    }
    if (usage) {
        html += `<b>⚙️ Penggunaan</b>\n<code>${escapeHtml(usage)}</code>\n`;
    }
    if (detail) {
        html += `\n<b>🔎 Detail</b>\n<blockquote>${escapeHtml(detail)}</blockquote>`;
    }
    return html;
}
export function helpKeyboard(page = 1, target = 'main') {
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
        if (currentPage > 1) {
            nav.push({ text: '⬅️', callback_data: `help:page:${currentPage - 1}:${target}` });
        }
        nav.push({ text: `${currentPage}/${totalPages}`, callback_data: 'help:noop' });
        if (currentPage < totalPages) {
            nav.push({ text: '➡️', callback_data: `help:page:${currentPage + 1}:${target}` });
        }
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
    if (userbotHelpRegistry[moduleName]) {
        return 'ubot';
    }
    if (masterHelpRegistry[moduleName]) {
        return 'main';
    }
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
// --- Register callback & inline_query handlers ---
export function registerInlineHelpHandlers(bot) {
    // inline_query: dipicu saat userbot memanggil getInlineBotResults
    // untuk mendapatkan menu help + tombol, lalu userbot posting via
    // sendInlineBotResult ke chat manapun (termasuk Chat Pribadi/Saved).
    bot.on('inline_query', async (ctx) => {
        console.log(`[INLINE-QUERY-DEBUG] Received inline query: "${ctx.inlineQuery.query}" from user ${ctx.from?.id}`);
        const query = (ctx.inlineQuery.query || '').trim().toLowerCase();
        // Module detail: query adalah nama modul
        if (query && query !== 'help' && query !== 'menu') {
            const registry = getRegistry('ubot');
            const mod = registry[query];
            if (mod) {
                const html = buildModuleHtml(query, 'ubot');
                const result = {
                    type: 'article',
                    id: `help:module:${query}`,
                    title: `📦 ${mod.title || formatModuleName(query)}`,
                    description: plain(mod.description || '').slice(0, 80),
                    input_message_content: { message_text: html, parse_mode: 'HTML' },
                    reply_markup: moduleBackKeyboard('ubot'),
                };
                return ctx.answerInlineQuery([result], { cache_time: 30 });
            }
        }
        // Help menu: tampilkan semua modul dengan tombol navigasi
        const html = buildHelpMenuHtml(1, 'ubot');
        const names = moduleNames('ubot');
        const result = {
            type: 'article',
            id: 'help:menu',
            title: `📖 Help Menu (${names.length} modul)`,
            description: `Pilih modul — tombol navigasi tersedia`,
            input_message_content: { message_text: html, parse_mode: 'HTML' },
            reply_markup: helpKeyboard(1, 'ubot'),
        };
        return ctx.answerInlineQuery([result], { cache_time: 60 });
    });
    // Pesan "help_ubot" / "help_ubot:<module>" dari userbot (dikirim via DM ke
    // Master Bot oleh plugin .help userbot — userbot tidak bisa render tombol).
    bot.on('message:text', async (ctx) => {
        const text = (ctx.message.text || '').trim();
        if (!text.startsWith('help_ubot')) {
            return;
        }
        console.log(`[HELP-DEBUG] Master Bot terima: "${text}" dari user ${ctx.from?.id}`);
        const moduleArg = text.split(':')[1]?.toLowerCase() || '';
        if (moduleArg) {
            const html = buildModuleHtml(moduleArg, 'ubot');
            await replyRich(ctx, html, { reply_markup: moduleBackKeyboard('ubot') });
            return;
        }
        await replyRich(ctx, buildHelpMenuHtml(1, 'ubot'), {
            reply_markup: helpKeyboard(1, 'ubot'),
        });
    });
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
        try {
            await ctx.deleteMessage();
        }
        catch (_) { /* empty */ }
    });
}
