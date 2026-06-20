import { helpRegistry } from '../../../userbot/engine/pluginRegistry.js';
import { getUserbotSession } from '../../../core/database.js';
import { escapeHtml } from '../../ui/dashboard.js';

function table(caption, rows) {
  return `<table bordered striped><caption>${escapeHtml(caption)}</caption>` +
    `<tr><th align="center">Item</th><th align="center">Detail</th></tr>` +
    rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td align="center">${escapeHtml(v)}</td></tr>`).join('') +
    `</table>`;
}

function moduleNames() {
  return Object.keys(helpRegistry).sort();
}

function formatModuleName(name) {
  if (name.toLowerCase() === 'antipm') return 'AntiPM';
  if (name.length <= 3) return name.toUpperCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}


// Inject Master Bot modules manually since they don't use the Userbot PluginRegistry
helpRegistry['moderation'] = {
  title: 'Moderation (Master)',
  description: 'Sistem perlindungan grup: ban, kick, mute, dan pembersihan pesan.',
  usage: '/ban | /unban | /kick | /mute | /unmute | /purge | /del | /pin | /unpin | /unpinall',
  detail: 'Modul ini hanya bekerja di dalam grup dan hanya bisa dipanggil oleh Admin grup.'
};
helpRegistry['security'] = {
  title: 'Security & Spam (Master)',
  description: 'Proteksi ekstra untuk melawan botnet dan spammer (Locks, Blacklist, Captcha).',
  usage: '/lock <tipe> | /unlock <tipe> | /captcha <on/off> | /addbl <kata> | /rmbl <kata> | /listbl',
  detail: 'Tipe lock: url, forward, sticker, arabic, bots. Segala pelanggaran akan otomatis dihapus oleh bot.'
};
helpRegistry['federation'] = {
  title: 'Federation F-Ban (Master)',
  description: 'Jaringan keamanan global antar grup. Scammer diban di satu grup, akan terblokir di semua cabang.',
  usage: '/newfed | /joinfed | /leavefed | /fban | /unfban | /fedinfo',
  detail: 'Tautkan banyak grup untuk membagi daftar hitam (blacklist) secara real-time antar grup.'
};
helpRegistry['utils'] = {
  title: 'Group Utils (Master)',
  description: 'Fungsi otomatisasi untuk mempermudah manajemen grup.',
  usage: '/autoapprove <on/off> | /nightmode <on/off> | /setwelcome | /setgoodbye | /save <nama> | /info',
  detail: 'Memiliki sistem Rich Messages! Anda bisa mengetik [Tombol](buttonurl://link.com) saat menyimpan notes atau welcome.'
};

export function buildHelpMenuRichHtml(session, page = 1, totalPages = 1) {
  return `<h1>📖 Module Library</h1>` +
    `<blockquote>Pilih modul untuk melihat command dan detail penggunaan.</blockquote>` +
    table('Library Overview', [
      ['Halaman', `${page}/${totalPages}`],
      ['Total Modul', moduleNames().length],
    ]);
}

function plain(value = '-') {
  return String(value || '-').replace(/<[^>]+>/g, '');
}

function buildHelpMenuClassicHtml(session, page = 1, totalPages = 1) {
  return `<b>📖 Module Library</b>\n` +
    `<blockquote>Pilih modul lewat tombol di bawah.</blockquote>\n` +
    `<b>Halaman:</b> <code>${page}/${totalPages}</code>\n` +
    `<b>Total Modul:</b> <code>${moduleNames().length}</code>`;
}

function buildModuleRichHtml(moduleName, session) {
  const mod = helpRegistry[moduleName];
  if (!mod) return `<h1>📦 Modul Tidak Ditemukan</h1>`;
  return `<h1>📦 ${escapeHtml(mod.title || formatModuleName(moduleName))}</h1>` +
    `<blockquote>${escapeHtml(mod.description)}</blockquote>` +
    table('Usage Detail', [
      ['Command', `<code>${escapeHtml(mod.usage)}</code>`],
      ['Penjelasan', `<i>${escapeHtml(mod.detail)}</i>`]
    ]);
}

function buildModuleClassicHtml(moduleName, session) {
  const mod = helpRegistry[moduleName];
  if (!mod) return `<b>📦 Modul Tidak Ditemukan</b>`;
  return `<b>📦 ${escapeHtml(mod.title || formatModuleName(moduleName))}</b>\n` +
    `<blockquote>${escapeHtml(plain(mod.description))}</blockquote>\n` +
    `<b>Penggunaan</b>\n<code>${escapeHtml(plain(mod.usage))}</code>\n\n` +
    `<b>Detail</b>\n${escapeHtml(plain(mod.detail))}`;
}

export function helpKeyboard(page = 1, backTarget = 'main') {
  const names = moduleNames();
  const perPage = 6;
  const totalPages = Math.max(1, Math.ceil(names.length / perPage));
  page = Math.min(Math.max(1, page), totalPages);
  const items = names.slice((page - 1) * perPage, page * perPage);
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map(name => ({ text: formatModuleName(name), callback_data: `help:module:${name}:${backTarget}` })));
  }
  if (totalPages > 1) {
    const nav = [];
    if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `help:page:${page - 1}:${backTarget}` });
    nav.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'help:noop' });
    if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `help:page:${page + 1}:${backTarget}` });
    rows.push(nav);
  }
  if (backTarget !== 'none') {
    rows.push([{ text: backTarget === 'ubot' ? '🔙 Userbot Dashboard' : '🔙 Dashboard', callback_data: `rich:${backTarget === 'ubot' ? 'ubot' : 'main'}` }]);
  } else {
    rows.push([{ text: '❌ Tutup', callback_data: 'help:close' }]);
  }
  return { inline_keyboard: rows };
}

async function sendHelpRich(ctx, html, keyboard, deleteOld = false) {
  if (ctx.inlineMessageId) {
    await ctx.api.editMessageTextInline(ctx.inlineMessageId, { html }, { reply_markup: keyboard }).catch(() => {});
  } else {
    await ctx.replyWithRichMessage(
      { html },
      { reply_markup: keyboard }
    );
    if (deleteOld) {
      try { await ctx.deleteMessage(); } catch (_) {}
    }
  }
}

export function registerInlineHelpHandlers(bot) {
  bot.on('inline_query', async (ctx, next) => {
    const query = ctx.inlineQuery.query.trim();
    const moduleMatch = query.match(/^help(?:\s+|:)([a-z0-9_-]+)$/i);
    if (moduleMatch) {
      const moduleName = moduleMatch[1].toLowerCase();
      if (!helpRegistry[moduleName]) {
        await ctx.answerInlineQuery([], { cache_time: 0, is_personal: true });
        return;
      }
      const session = getUserbotSession(ctx.from.id);
      await ctx.answerInlineQuery([{
        type: 'article',
        id: `help-module-${moduleName}-rich-v2`,
        title: `Module · ${formatModuleName(moduleName)}`,
        description: helpRegistry[moduleName]?.description || `Detail modul ${ctx.me?.first_name || 'Bot'}`,
        input_message_content: {
          message_text: buildModuleClassicHtml(moduleName, session),
          parse_mode: 'HTML',
        },
        reply_markup: { inline_keyboard: [[{ text: '🔙 Module Library', callback_data: 'help:page:1:none' }]] },
      }], { cache_time: 0, is_personal: true });
      return;
    }

    if (query === 'tes') {
      await ctx.answerInlineQuery([{
        type: 'article',
        id: 'inline-test-v1',
        title: 'Inline Tester Berhasil!',
        description: 'Pancingan dari userbot sukses!',
        input_message_content: {
          message_text: '🎣 <b>Pancingan Sukses!</b>\n\nInline bot merespon dengan baik dari trigger Userbot.',
          parse_mode: 'HTML',
        },
        reply_markup: { inline_keyboard: [[{ text: '✅ Tombol Test', callback_data: 'help:noop' }]] }
      }], { cache_time: 0, is_personal: true });
      return;
    }

    if (query !== 'help') return next();

    const session = getUserbotSession(ctx.from.id);
    const totalPages = Math.max(1, Math.ceil(moduleNames().length / 6));
    await ctx.answerInlineQuery([{
      type: 'article',
      id: 'help-menu-rich-v2',
      title: 'Module Library',
      description: `Buka library command ${ctx.me?.first_name || 'Bot'}`,
      input_message_content: {
        message_text: buildHelpMenuClassicHtml(session, 1, totalPages),
        parse_mode: 'HTML',
      },
      reply_markup: helpKeyboard(1, 'none'),
    }], { cache_time: 0, is_personal: true });
  });

  bot.on('chosen_inline_result', async (ctx) => {
    const inlineMessageId = ctx.chosenInlineResult.inline_message_id;
    if (!inlineMessageId) return;

    const query = ctx.chosenInlineResult.query.trim();
    const session = getUserbotSession(ctx.from.id);

    const moduleMatch = query.match(/^help(?:\s+|:)([a-z0-9_-]+)$/i);
    if (moduleMatch) {
      const moduleName = moduleMatch[1].toLowerCase();
      if (!helpRegistry[moduleName]) return;
      await ctx.api.editMessageTextInline(inlineMessageId, { html: buildModuleRichHtml(moduleName, session) }, { reply_markup: { inline_keyboard: [[{ text: '🔙 Module Library', callback_data: 'help:page:1:none' }]] } }).catch(() => {});
      return;
    }

    if (query === 'help') {
      const totalPages = Math.max(1, Math.ceil(moduleNames().length / 6));
      await ctx.api.editMessageTextInline(inlineMessageId, { html: buildHelpMenuRichHtml(session, 1, totalPages) }, { reply_markup: helpKeyboard(1, 'none') }).catch(() => {});
    }
  });

  bot.callbackQuery(/^help:page:(\d+)(?::(.+))?$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    const backTarget = ctx.match[2] || 'main';
    const session = getUserbotSession(ctx.from.id);
    const totalPages = Math.max(1, Math.ceil(moduleNames().length / 6));
    await ctx.answerCallbackQuery();
    await sendHelpRich(ctx, buildHelpMenuRichHtml(session, page, totalPages), helpKeyboard(page, backTarget), true);
  });

  bot.callbackQuery(/^help:module:([^:]+)(?::(.+))?$/, async (ctx) => {
    const moduleName = ctx.match[1];
    const backTarget = ctx.match[2] || 'main';
    const session = getUserbotSession(ctx.from.id);
    await ctx.answerCallbackQuery();
    await sendHelpRich(ctx, buildModuleRichHtml(moduleName, session), { inline_keyboard: [[{ text: '🔙 Module Library', callback_data: `help:page:1:${backTarget}` }]] }, true);
  });

  bot.callbackQuery('help:noop', async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('help:close', async (ctx) => {
    await ctx.answerCallbackQuery('Tutup menu bantuan');
    if (ctx.inlineMessageId) {
      await ctx.api.editMessageTextInline(
        ctx.inlineMessageId,
        { text: 'Menu bantuan ditutup.' },
        { reply_markup: { inline_keyboard: [] } }
      ).catch(() => {});
    } else {
      try { await ctx.deleteMessage(); } catch (_) {}
    }
  });
}
function getLatexFormula(query) {
  const match = query.match(/^(?:latex|math)\s+([\s\S]+)/i);
  return match ? match[1].trim() : '';
}

/**
 * Register LaTeX rich message inline handler.
 */
export function registerInlineLatexHandlers(bot) {
  bot.on('inline_query', async (ctx, next) => {
    const query = ctx.inlineQuery.query.trim();
    const formula = getLatexFormula(query);

    if (!formula) {
      return next();
    }

    await ctx.answerInlineQuery([{
      type: 'article',
      id: `latex-${Buffer.from(formula).toString('base64url').slice(0, 32)}`,
      title: 'LaTeX Rich Message',
      description: formula,
      input_message_content: {
        rich_message: {
          markdown: `$$${formula}$$`,
          skip_entity_detection: true,
        }
      }
    }], {
      cache_time: 0
    });
  });
}
