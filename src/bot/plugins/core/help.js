import { helpRegistry as userbotHelpRegistry } from '../../../userbot/engine/pluginRegistry.js';
import { getUserbotSession } from '../../../core/database.js';
import { escapeHtml } from '../../ui/dashboard.js';

function table(caption, rows) {
  return `<table bordered striped><caption>${escapeHtml(caption)}</caption>` +
    `<tr><th align="center">Item</th><th align="center">Detail</th></tr>` +
    rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td align="center">${v}</td></tr>`).join('') +
    `</table>`;
}

export const masterHelpRegistry = {};

function getRegistry(target) {
  if (target === 'ubot') return userbotHelpRegistry;
  return masterHelpRegistry;
}

function moduleNames(target = 'main') {
  return Object.keys(getRegistry(target)).sort();
}

function formatModuleName(name) {
  if (name.toLowerCase() === 'antipm') return 'AntiPM';
  if (name.length <= 3) return name.toUpperCase();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Inject Master Bot modules manually
masterHelpRegistry['antispam'] = {
  title: 'Anti-Spam (Master)',
  description: 'Mendeteksi dan menghapus pesan spam atau link mencurigakan.',
  usage: '/antispam <on/off>',
  detail: 'Modul ini membantu melindungi grup dari serangan bot spam.'
};
masterHelpRegistry['approve'] = {
  title: 'Auto-Approve (Master)',
  description: 'Persetujuan otomatis untuk anggota baru yang meminta bergabung.',
  usage: '/autoapprove <on/off> | /approve | /disapprove',
  detail: 'Berguna untuk grup yang menggunakan sistem persetujuan masuk (Join Request).'
};
masterHelpRegistry['blacklist'] = {
  title: 'Blacklist (Master)',
  description: 'Memblokir kata-kata tertentu di grup.',
  usage: '/addbl <kata> | /rmbl <kata> | /listbl',
  detail: 'Setiap pesan yang mengandung kata dalam blacklist akan otomatis dihapus.'
};
masterHelpRegistry['captcha'] = {
  title: 'Captcha (Master)',
  description: 'Verifikasi anggota baru untuk mencegah bot.',
  usage: '/captcha <on/off>',
  detail: 'Anggota baru harus menyelesaikan captcha tombol sebelum bisa mengirim pesan.'
};
masterHelpRegistry['federation'] = {
  title: 'Federation (Master)',
  description: 'Jaringan keamanan global antar grup. F-Ban scammer di semua grup yang tergabung.',
  usage: '/newfed | /joinfed | /leavefed | /fban | /unfban | /fedinfo',
  detail: 'Tautkan banyak grup untuk membagi daftar hitam (blacklist) secara real-time antar grup.'
};
masterHelpRegistry['info'] = {
  title: 'Information (Master)',
  description: 'Melihat ID dan informasi pengguna atau grup.',
  usage: '/info [reply/username] | /id',
  detail: 'Menampilkan data lengkap Telegram dari entitas tersebut.'
};
masterHelpRegistry['locks'] = {
  title: 'Locks (Master)',
  description: 'Mengunci tipe media tertentu di grup.',
  usage: '/lock <tipe> | /unlock <tipe> | /locks',
  detail: 'Tipe yang bisa dikunci: url, forward, sticker, arabic, bots, photo, video, document, dll.'
};
masterHelpRegistry['moderation'] = {
  title: 'Moderation (Master)',
  description: 'Perintah moderasi dasar untuk admin grup.',
  usage: '/ban | /unban | /kick | /mute | /unmute | /purge | /del | /pin | /unpin | /unpinall',
  detail: 'Pastikan bot memiliki hak akses Admin yang cukup untuk mengeksekusi ini.'
};
masterHelpRegistry['nightmode'] = {
  title: 'Nightmode (Master)',
  description: 'Mode malam untuk grup (otomatis tutup grup di jam tertentu).',
  usage: '/nightmode <on/off>',
  detail: 'Saat nightmode aktif, grup hanya bisa dikirimi pesan oleh Admin.'
};
masterHelpRegistry['notes'] = {
  title: 'Notes (Master)',
  description: 'Menyimpan catatan atau teks panjang di grup.',
  usage: '/save <nama> | /get <nama> | /clear <nama> | /notes',
  detail: 'Mendukung Rich Messages! Anda bisa menggunakan format markdown untuk tombol: [Teks](buttonurl://link.com).'
};
masterHelpRegistry['report'] = {
  title: 'Report (Master)',
  description: 'Melaporkan pesan ke admin grup.',
  usage: '/report | @admin',
  detail: 'Balas pesan yang melanggar dengan /report agar Admin grup dinotifikasi.'
};
masterHelpRegistry['warns'] = {
  title: 'Warnings (Master)',
  description: 'Sistem peringatan untuk member yang melanggar aturan.',
  usage: '/warn | /unwarn | /warns',
  detail: 'Member yang mencapai batas peringatan maksimum akan otomatis dibanned atau dimute.'
};
masterHelpRegistry['welcome'] = {
  title: 'Welcome (Master)',
  description: 'Pesan sambutan otomatis untuk anggota baru.',
  usage: '/welcome <on/off> | /setwelcome | /setgoodbye | /resetwelcome',
  detail: 'Sama seperti Notes, Anda dapat menggunakan tombol interaktif pada pesan sambutan.'
};
masterHelpRegistry['zombies'] = {
  title: 'Zombies (Master)',
  description: 'Membersihkan akun yang sudah dihapus (Deleted Accounts) dari grup.',
  usage: '/zombies | /zombies clean',
  detail: 'Hanya bisa dijalankan oleh Owner grup untuk menjaga kebersihan anggota.'
};

export function buildHelpMenuRichHtml(session, page = 1, target = 'main') {
  const names = moduleNames(target);
  const totalPages = Math.max(1, Math.ceil(names.length / 4));
  return `<h1>📖 Help ${target === 'ubot' ? '(Userbot)' : '(Master)'}</h1>` +
    `<blockquote>Pilih modul untuk melihat command dan detail penggunaan.</blockquote>` +
    table('Library Overview', [
      ['Halaman', `${page}/${totalPages}`],
      ['Total Modul', names.length],
    ]);
}

function plain(value = '-') {
  return String(value || '-').replace(/<[^>]+>/g, '');
}

function buildHelpMenuClassicHtml(session, page = 1, target = 'main') {
  const names = moduleNames(target);
  const totalPages = Math.max(1, Math.ceil(names.length / 4));
  return `<b>📖 Help ${target === 'ubot' ? '(Userbot)' : '(Master)'}</b>\n` +
    `<blockquote>Pilih modul lewat tombol di bawah.</blockquote>\n` +
    `<b>Halaman:</b> <code>${page}/${totalPages}</code>\n` +
    `<b>Total Modul:</b> <code>${names.length}</code>`;
}

function buildModuleRichHtml(moduleName, session, target = 'main') {
  const mod = getRegistry(target)[moduleName];
  if (!mod) return `<h1>📦 Modul Tidak Ditemukan</h1>`;
  return `<h1>📦 ${escapeHtml(mod.title || formatModuleName(moduleName))}</h1>` +
    `<blockquote>${escapeHtml(mod.description)}</blockquote>` +
    table('Usage Detail', [
      ['Command', `<code>${escapeHtml(mod.usage)}</code>`],
      ['Penjelasan', `<i>${escapeHtml(mod.detail)}</i>`]
    ]);
}

function buildModuleClassicHtml(moduleName, session, target = 'main') {
  const mod = getRegistry(target)[moduleName];
  if (!mod) return `<b>📦 Modul Tidak Ditemukan</b>`;
  return `<b>📦 ${escapeHtml(mod.title || formatModuleName(moduleName))}</b>\n` +
    `<blockquote>${escapeHtml(plain(mod.description))}</blockquote>\n` +
    `<b>Penggunaan</b>\n<code>${escapeHtml(plain(mod.usage))}</code>\n\n` +
    `<b>Detail</b>\n${escapeHtml(plain(mod.detail))}`;
}

export function helpKeyboard(page = 1, target = 'main', isInline = false) {
  const names = moduleNames(target);
  const perPage = 4;
  const totalPages = Math.max(1, Math.ceil(names.length / perPage));
  page = Math.min(Math.max(1, page), totalPages);
  const items = names.slice((page - 1) * perPage, page * perPage);
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2).map(name => ({ text: formatModuleName(name), callback_data: `help:module:${name}:${target}` })));
  }
  if (totalPages > 1) {
    const nav = [];
    if (page > 1) nav.push({ text: '⬅️ Prev', callback_data: `help:page:${page - 1}:${target}` });
    nav.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'help:noop' });
    if (page < totalPages) nav.push({ text: 'Next ➡️', callback_data: `help:page:${page + 1}:${target}` });
    rows.push(nav);
  }
  if (!isInline) {
    rows.push([{ text: target === 'ubot' ? '🔙 Userbot Dashboard' : '🔙 Dashboard', callback_data: `rich:${target === 'ubot' ? 'ubot' : 'main'}` }]);
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
      if (!masterHelpRegistry[moduleName]) {
        await ctx.answerInlineQuery([], { cache_time: 0, is_personal: true });
        return;
      }
      const session = getUserbotSession(ctx.from.id);
      await ctx.answerInlineQuery([{
        type: 'article',
        id: `help-module-${moduleName}-rich-v2`,
        title: `Module · ${formatModuleName(moduleName)}`,
        description: masterHelpRegistry[moduleName]?.description || `Detail modul ${ctx.me?.first_name || 'Bot'}`,
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

    if (query !== 'help' && query !== 'help_ubot') return next();

    const target = query === 'help_ubot' ? 'ubot' : 'main';
    const session = getUserbotSession(ctx.from.id);
    await ctx.answerInlineQuery([{
      type: 'article',
      id: `help-menu-rich-v2-${target}`,
      title: `Module Library (${target === 'ubot' ? 'Userbot' : 'Master'})`,
      description: `Buka library command ${ctx.me?.first_name || 'Bot'}`,
      input_message_content: {
        message_text: buildHelpMenuClassicHtml(session, 1, target),
        parse_mode: 'HTML',
      },
      reply_markup: helpKeyboard(1, target, true),
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
      if (!masterHelpRegistry[moduleName]) return;
      await ctx.api.editMessageTextInline(inlineMessageId, { html: buildModuleRichHtml(moduleName, session, 'main') }, { reply_markup: { inline_keyboard: [[{ text: '🔙 Module Library', callback_data: 'help:page:1:main' }]] } }).catch(() => {});
      return;
    }

    if (query === 'help' || query === 'help_ubot') {
      const target = query === 'help_ubot' ? 'ubot' : 'main';
      await ctx.api.editMessageTextInline(inlineMessageId, { html: buildHelpMenuRichHtml(session, 1, target) }, { reply_markup: helpKeyboard(1, target, true) }).catch(() => {});
    }
  });

  bot.callbackQuery(/^help:page:(\d+)(?::(.+))?$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    const target = ctx.match[2] || 'main';
    const session = getUserbotSession(ctx.from.id);
    const isInline = !!ctx.inlineMessageId;
    await ctx.answerCallbackQuery();
    await sendHelpRich(ctx, buildHelpMenuRichHtml(session, page, target), helpKeyboard(page, target, isInline), true);
  });

  bot.callbackQuery(/^help:module:([^:]+)(?::(.+))?$/, async (ctx) => {
    const moduleName = ctx.match[1];
    const target = ctx.match[2] || 'main';
    const session = getUserbotSession(ctx.from.id);
    const isInline = !!ctx.inlineMessageId;
    await ctx.answerCallbackQuery();
    
    const backKeyboard = { inline_keyboard: [[{ text: '🔙 Module Library', callback_data: `help:page:1:${target}` }]] };
    await sendHelpRich(ctx, buildModuleRichHtml(moduleName, session, target), backKeyboard, true);
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
