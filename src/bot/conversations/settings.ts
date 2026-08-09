/**
 * Settings conversations — AFK reason, user vars (Vars Config), dan system vars.
 * Dipulihkan setelah terhapus pada refactor besar.
 */
import { InlineKeyboard } from 'grammy';
import config from '../../config.js';
import { replyRich } from '../../utils/richMessage.js';
import { Logger } from '../../utils/logger.js';
import { cancelKeyboard } from './registration.js';

/**
 * Helper: tunggu input teks atau tombol batal.
 */
async function waitForInput(conversation, ctx) {
  const result = await conversation.waitFor(['message:text', 'callback_query:data']);
  const cbData = result.callbackQuery?.data;

  if (cbData === 'cancel' || cbData === 'cancel_reg') {
    try { await result.answerCallbackQuery('Dibatalkan.'); } catch (_e) { /* ignore: already answered */ }
    try { await result.deleteMessage(); } catch (_e) { /* ignore: already deleted */ }
    await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Aksi dibatalkan.</blockquote>`);
    throw new Error('USER_CANCELLED');
  }

  try { await result.react('👍'); } catch (_e) { /* ignore: reaction may fail */ }

  return result.message.text.trim();
}

/**
 * Conversation to set custom AFK reason
 */
export async function afkReasonConversation(conversation, ctx) {
  const telegramId = ctx.from.id;

  try {
    await replyRich(ctx, `<h1>📝 Setel Alasan AFK Baru</h1><blockquote>Silakan kirimkan teks alasan AFK Anda yang baru. Contoh:\n<code>Sedang tidur, jangan spam ya!</code></blockquote>`, { reply_markup: cancelKeyboard });

    let newReason;
    try {
      newReason = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') {return;}
      throw err;
    }

    if (newReason.length > 200) {
      await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Alasan AFK terlalu panjang! Maksimal 200 karakter. Pengaturan dibatalkan.</blockquote>`);
      return;
    }

    const { updateUserbotFeature } = await import('../../infrastructure/database.js');
    await updateUserbotFeature(telegramId, 'afk_reason', newReason);

    await replyRich(ctx, `✅ <b>Alasan AFK berhasil diperbarui menjadi:</b>\n<blockquote>"${newReason}"</blockquote>`);
    await replyRich(ctx, `<blockquote>Gunakan <code>/menu</code> untuk kembali ke Panel Kontrol Utama.</blockquote>`);

  } catch (error) {
    if (error.message !== 'USER_CANCELLED') {
      Logger.logUser(telegramId, `Error in AFK reason conversation: ${error.message}`, 'ERROR');
      await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Terjadi kesalahan sistem. Gagal mengubah alasan AFK.</blockquote>`);
    }
  }
}

/**
 * User Vars — template var yang tersedia (tabel panduan).
 */
const USER_VAR_TEMPLATE: { key: string; desc: string }[] = [
  { key: 'INLINE_BOT_TOKEN', desc: 'Token bot inline (validasi via getMe)' },
  { key: 'LOG_CHAT_ID', desc: 'Chat ID tujuan log userbot' },
  { key: 'PREFIX', desc: 'Prefix perintah (default: .)' },
];

/**
 * Conversation to manage generic user vars (Vars Config)
 */
export async function manageVarsConv(conversation, ctx) {
  const telegramId = ctx.from.id;

  const buildVarsKeyboard = (varsMap) => {
    const kb = new InlineKeyboard();

    // Tombol untuk variabel umum
    kb.text('🔑 INLINE_BOT_TOKEN', 'var:set:INLINE_BOT_TOKEN').row();
    kb.text('💬 LOG_CHAT_ID', 'var:set:LOG_CHAT_ID').row();
    kb.text('⚙️ PREFIX', 'var:set:PREFIX').row();
    kb.text('➕ Tambah Kustom', 'var:custom').row();

    // Jika ada variabel yang bisa dihapus, munculkan tombol Hapus
    if (Object.keys(varsMap).length > 0) {
      kb.text('🗑️ Hapus Variabel', 'var:delete_menu').row();
    }

    kb.text('❌ Selesai & Kembali', 'var:cancel');
    return kb;
  };

  try {
    let loop = true;
    while (loop) {
      // 1. Ambil data vars terbaru
      const currentVars = await conversation.external(async () => {
        const db = await import('../../infrastructure/database.js');
        return db.getAllUserVars(telegramId);
      });

      // Tabel nilai aktif + spoiler
      const varRows = Object.entries(currentVars)
        .map(([k, v], i) => `<tr><td align="center">${i + 1}</td><td><code>${k}</code></td><td align="center"><tg-spoiler><code>${String(v)}</code></tg-spoiler></td></tr>`)
        .join('');
      const varTable = varRows
        ? `<table bordered striped><caption>📋 Variabel Aktif</caption><tr><th>#</th><th>Kunci</th><th>Nilai</th></tr>${varRows}</table>`
        : `<blockquote><i>Belum ada variabel yang diatur.</i></blockquote>`;

      // Tabel template yang tersedia
      const tplRows = USER_VAR_TEMPLATE.map((v, i) => {
        const hasValue = currentVars[v.key] !== undefined && String(currentVars[v.key]) !== '';
        return `<tr><td align="center">${i + 1}</td><td>${hasValue ? '🟢' : '⚪'} <code>${v.key}</code></td><td>${v.desc}</td></tr>`;
      }).join('');

      // Kirim menu utama vars
      const menuMsg = await replyRich(ctx, `<h1>⚙️ Pengaturan Variabel (Vars)</h1>` +
        `<blockquote>Kelola variabel khusus untuk userbot Anda. Nilai tersembunyi (spoiler) — tap untuk melihat.</blockquote>` +
        `<table bordered striped><caption>📋 Template Variabel</caption>` +
        `<tr><th>#</th><th>Variabel</th><th>Fungsi</th></tr>` +
        tplRows +
        `</table>` +
        varTable +
        `<p>Pilih tombol di bawah untuk menambah, mengubah, atau menghapus variabel.</p>`, { reply_markup: buildVarsKeyboard(currentVars) });

      // Tunggu input callback_query
      const result = await conversation.waitFor('callback_query:data');
      const data = result.callbackQuery.data;
      await result.answerCallbackQuery();

      // Hapus menu utama vars agar rapi sebelum masuk sub-prompt
      try { await ctx.api.deleteMessage(ctx.chat.id, menuMsg.message_id); } catch (_) { /* empty */ }

      if (data === 'var:cancel') {
        await replyRich(ctx, `<blockquote><b>🚪 Selesai</b><br>Keluar dari pengaturan variabel. Gunakan /menu untuk membuka menu utama.</blockquote>`);
        loop = false;
        break;
      }

      if (data.startsWith('var:set:')) {
        const key = data.split('var:set:')[1];

        // --- Panel detail variabel: status + nilai + aksi ---
        const showVarDetail = async (): Promise<boolean> => {
          const latest = await conversation.external(async () => {
            const db = await import('../../infrastructure/database.js');
            return db.getAllUserVars(telegramId);
          });
          const current = latest[key];
          const hasValue = current !== undefined && String(current) !== '';

          const detailKb = new InlineKeyboard();
          detailKb.text('✏️ Ganti Nilai', `var:edit:${key}`).row();
          if (hasValue) {
            detailKb.text('🗑️ Hapus Nilai', `var:del:${key}`).row();
          }
          detailKb.text('🔙 Kembali', 'var:back');

          await replyRich(ctx,
            `<h1>📦 Variabel <code>${key}</code></h1>` +
            `<table bordered striped><caption>📋 Detail</caption>` +
            `<tr><th>Item</th><th>Detail</th></tr>` +
            `<tr><td>Status</td><td align="center">${hasValue ? '🟢 Sudah diset' : '⚪ Belum diset'}</td></tr>` +
            `<tr><td>Nilai</td><td align="center">${hasValue ? `<tg-spoiler><code>${String(current)}</code></tg-spoiler>` : '<i>—</i>'}</td></tr>` +
            `</table>` +
            `<p>Pilih aksi di bawah:</p>`,
            { reply_markup: detailKb },
          );
          return hasValue;
        };

        await showVarDetail();

        // Tunggu aksi pada panel detail
        const detailResult = await conversation.waitFor('callback_query:data');
        const detailData = detailResult.callbackQuery.data;
        await detailResult.answerCallbackQuery();

        if (detailData === 'var:back') {continue;}

        if (detailData.startsWith('var:del:')) {
          const keyToDelete = detailData.split('var:del:')[1];
          await conversation.external(async () => {
            const db = await import('../../infrastructure/database.js');
            await db.deleteUserVar(telegramId, keyToDelete);
            if (keyToDelete === 'INLINE_BOT_TOKEN') {
              await db.updateUserbotFeature(telegramId, 'inline_bot_token', null);
              await db.updateUserbotFeature(telegramId, 'inline_bot_username', null);
            }
          });
          await replyRich(ctx, `<blockquote><b>✅ BERHASIL</b><br>Variabel <b>${keyToDelete}</b> berhasil dihapus.</blockquote>`);
          continue;
        }

        if (detailData.startsWith('var:edit:')) {
          const editKey = detailData.split('var:edit:')[1];
          await replyRich(ctx, `<h1>📝 Mengatur <code>${editKey}</code></h1><blockquote>Silakan kirimkan nilai/value baru untuk <code>${editKey}</code>:</blockquote>`, { reply_markup: cancelKeyboard });

          let value;
          try {
            value = await waitForInput(conversation, ctx);
          } catch (err) {
            if (err.message === 'USER_CANCELLED') {continue;}
            throw err;
          }

          // Simpan nilai
          await replyRich(ctx, `<blockquote>⏳ Menyimpan variabel ${editKey}...</blockquote>`);

          if (editKey === 'INLINE_BOT_TOKEN') {
            const botData = await conversation.external(async () => {
              try {
                const response = await fetch(`https://api.telegram.org/bot${value}/getMe`);
                return await response.json();
              } catch (e) {
                return { ok: false, description: e.message };
              }
            });

            if (!botData.ok) {
              await replyRich(ctx, `❌ <b>Token Bot tidak valid!</b>\n<blockquote>${botData.description || 'Gagal terhubung ke API'}</blockquote>`);
              continue;
            }

            const botUsername = botData.result.username;
            await conversation.external(async () => {
              const db = await import('../../infrastructure/database.js');
              await db.setUserVar(telegramId, editKey, value);
              await db.updateUserbotFeature(telegramId, 'inline_bot_token', value);
              await db.updateUserbotFeature(telegramId, 'inline_bot_username', botUsername);
              // Start polling inline bot untuk menu help tombol (tanpa restart)
              const svc = await import('../services/inlineBotService.js');
              await svc.startInlineBotForUser(telegramId, value);
            });
            await replyRich(ctx, `<blockquote><b>✅ BERHASIL</b><br><b>Token Inline Bot Disimpan!</b><br>Bot Anda: @${botUsername} siap digunakan — menu <code>.help</code> kini memakai tombol.</blockquote>`);
          } else {
            await conversation.external(async () => {
              const db = await import('../../infrastructure/database.js');
              await db.setUserVar(telegramId, editKey, value);
            });
            await replyRich(ctx, `<blockquote><b>✅ BERHASIL</b><br>Variabel <b>${editKey}</b> berhasil disimpan!</blockquote>`);
          }
          continue;
        }

        // Aksi lain yang tidak dikenal → kembali ke menu utama
        continue;
      }

      if (data === 'var:custom') {
        await replyRich(ctx, `<h1>➕ Variabel Kustom Baru</h1><blockquote>Silakan kirimkan <b>NAMA (KUNCI)</b> variabel baru Anda (gunakan huruf besar, contoh: <code>MY_VAR</code>):</blockquote>`, { reply_markup: cancelKeyboard });

        let key;
        try {
          key = await waitForInput(conversation, ctx);
        } catch (err) {
          if (err.message === 'USER_CANCELLED') {continue;}
          throw err;
        }

        key = key.toUpperCase().replace(/[^A-Z0-9_]/g, '');
        if (!key) {
          await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Nama variabel tidak valid!</blockquote>`);
          continue;
        }

        await replyRich(ctx, `<h1>📝 Nilai Variabel</h1><blockquote>Silakan kirimkan nilai/value untuk <code>${key}</code>:</blockquote>`, { reply_markup: cancelKeyboard });

        let value;
        try {
          value = await waitForInput(conversation, ctx);
        } catch (err) {
          if (err.message === 'USER_CANCELLED') {continue;}
          throw err;
        }

        // Validate value: limit length to prevent database bloat
        const MAX_VAR_VALUE_LENGTH = 4096;
        if (value && value.length > MAX_VAR_VALUE_LENGTH) {
          await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Nilai variabel terlalu panjang! Maksimum ${MAX_VAR_VALUE_LENGTH} karakter.</blockquote>`);
          continue;
        }

        // Restrict sensitive variable names that could be exploited
        const RESTRICTED_VARS = ['BOT_TOKEN', 'API_ID', 'API_HASH', 'MONGO_URI', 'ENCRYPTION_KEY', 'OWNER_ID'];
        if (RESTRICTED_VARS.includes(key)) {
          await replyRich(ctx, `<blockquote><b>❌ DITOLAK</b><br>Variabel <code>${key}</code> adalah sistem reserved dan tidak boleh diubah melalui menu ini.</blockquote>`);
          continue;
        }

        await conversation.external(async () => {
          const db = await import('../../infrastructure/database.js');
          await db.setUserVar(telegramId, key, value);
        });

        await replyRich(ctx, `<blockquote><b>✅ BERHASIL</b><br>Variabel <b>${key}</b> berhasil disimpan!</blockquote>`);
        continue;
      }

      if (data === 'var:delete_menu') {
        const deleteKb = new InlineKeyboard();
        Object.keys(currentVars).forEach(k => {
          deleteKb.text(`🗑️ Hapus ${k}`, `var:del:${k}`).row();
        });
        deleteKb.text('❌ Batal', 'var:del_cancel');

        const delMenuMsg = await replyRich(ctx, `<h1>🗑️ Hapus Variabel</h1><blockquote>Pilih variabel yang ingin Anda hapus:</blockquote>`, { reply_markup: deleteKb });

        const delResult = await conversation.waitFor('callback_query:data');
        const delData = delResult.callbackQuery.data;
        await delResult.answerCallbackQuery();

        try { await ctx.api.deleteMessage(ctx.chat.id, delMenuMsg.message_id); } catch (_) { /* empty */ }

        if (delData === 'var:del_cancel') {continue;}

        if (delData.startsWith('var:del:')) {
          const keyToDelete = delData.split('var:del:')[1];
          await conversation.external(async () => {
            const db = await import('../../infrastructure/database.js');
            await db.deleteUserVar(telegramId, keyToDelete);
            if (keyToDelete === 'INLINE_BOT_TOKEN') {
              await db.updateUserbotFeature(telegramId, 'inline_bot_token', null);
              await db.updateUserbotFeature(telegramId, 'inline_bot_username', null);
              // Inline bot manager removed; only clear stored token/username.
            }
          });
          await replyRich(ctx, `<blockquote><b>✅ BERHASIL</b><br>Variabel <b>${keyToDelete}</b> berhasil dihapus.</blockquote>`);
        }
        continue;
      }
    }
  } catch (error) {
    if (error.message !== 'USER_CANCELLED') {
      Logger.logUser(telegramId, `Error in manageVarsConv: ${error.message}`, 'ERROR');
      await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Terjadi kesalahan sistem.</blockquote>`);
    }
  }
}

/**
 * System Vars — template var yang tersedia (tabel panduan).
 * Ditampilkan di menu System Vars; nilai diisi oleh owner via format KUNCI NILAI.
 */
const SYSTEM_VAR_TEMPLATE: { key: string; desc: string; example: string }[] = [
  { key: 'SYSTEM_LOG_CHAT_ID', desc: 'Chat ID tujuan log sistem', example: '-1001234567890' },
  { key: 'SYSTEM_LOG_TOPIC_ID', desc: 'Topic ID (forum) untuk log', example: '2' },
  { key: 'MASTER_BOT_TOKEN', desc: 'Token bot master (fallback)', example: '123456:ABC-DEF...' },
  { key: 'MASTER_BOT_USERNAME', desc: 'Username bot master', example: 'PanelDeltaUbot' },
  { key: 'DEFAULT_PREFIX', desc: 'Prefix default userbot', example: '.' },
  { key: 'TRIAL_DAYS', desc: 'Durasi trial (hari)', example: '7' },
  { key: 'SUBSCRIPTION_DAYS', desc: 'Durasi langganan (hari)', example: '30' },
  { key: 'DONATE_EWALLET', desc: 'Nomor e-wallet donasi', example: '0821xxxxxxx' },
  { key: 'DONATE_EWALLET_NAME', desc: 'Nama e-wallet donasi', example: 'Dana / OVO' },
  { key: 'DONATE_BANK', desc: 'Nomor rekening donasi', example: '883xxxxxxx' },
  { key: 'DONATE_BANK_NAME', desc: 'Nama bank donasi', example: 'BCA / BRI' },
];

/** Wrap nilai sensitif dalam spoiler (klik untuk lihat). */
function spoiler(value: string): string {
  return `<tg-spoiler><code>${value}</code></tg-spoiler>`;
}

function systemVarTableHtml(currentVars: Record<string, unknown>): string {
  const rows = SYSTEM_VAR_TEMPLATE.map((v, i) => {
    const hasValue = currentVars[v.key] !== undefined && String(currentVars[v.key]) !== '';
    const valueCell = hasValue
      ? spoiler(String(currentVars[v.key]))
      : `<i>—</i>`;
    const status = hasValue ? '🟢' : '⚪';
    return `<tr><td align="center">${i + 1}</td><td>${status} <code>${v.key}</code></td><td>${v.desc}</td><td align="center">${valueCell}</td></tr>`;
  }).join('');

  const extraKeys = Object.keys(currentVars).filter(k => !SYSTEM_VAR_TEMPLATE.some(t => t.key === k));
  const extraRows = extraKeys.length
    ? `<tr><td colspan="4" align="center"><b>🔧 Variabel Kustom</b></td></tr>` +
      extraKeys.map(k => `<tr><td align="center">•</td><td>🟢 <code>${k}</code></td><td><i>kustom</i></td><td align="center">${spoiler(String(currentVars[k]))}</td></tr>`).join('')
    : '';

  return `<h1>⚙️ System Vars</h1>` +
    `<blockquote>Kelola variabel sistem bot. Ketik <code>KUNCI NILAI</code> untuk set, atau <code>HAPUS KUNCI</code> untuk hapus. Nilai tersembunyi (spoiler) — tap untuk melihat.</blockquote>` +
    `<table bordered striped><caption>📋 Template Variabel</caption>` +
    `<tr><th>#</th><th>Variabel</th><th>Fungsi</th><th>Nilai</th></tr>` +
    rows +
    extraRows +
    `</table>` +
    `<p>💡 Contoh: <code>SYSTEM_LOG_CHAT_ID -1001234567890</code></p>` +
    `<p>🗑️ Hapus: <code>HAPUS SYSTEM_LOG_CHAT_ID</code></p>`;
}

/**
 * Conversation to manage system vars (Owner only)
 */
export async function manageSystemVarsConv(conversation, ctx) {
  const telegramId = ctx.from.id;
  if (Number(telegramId) !== Number(config.ownerId)) {return;}

  try {
    const currentVars = await conversation.external(async () => {
      const db = await import('../../infrastructure/database.js');
      return db.getAllSystemVars();
    });

    await replyRich(ctx, systemVarTableHtml(currentVars), { reply_markup: cancelKeyboard });

    let input;
    try {
      input = await waitForInput(conversation, ctx);
    } catch (err) {
      if (err.message === 'USER_CANCELLED') {return;}
      throw err;
    }

    const parts = input.trim().split(/\s+/);
    if (parts.length < 2) {
      await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Format salah! Harus berupa: <code>KUNCI NILAI</code> atau <code>HAPUS KUNCI</code>.</blockquote>`);
      return;
    }

    const command = parts[0].toUpperCase();

    if (command === 'HAPUS') {
      const key = parts[1].toUpperCase();
      await conversation.external(async () => {
        const db = await import('../../infrastructure/database.js');
        await db.deleteSystemVar(key);
      });
      await replyRich(ctx, `<blockquote><b>✅ BERHASIL</b><br>Variabel sistem <b>${key}</b> berhasil dihapus.</blockquote>`);
      return;
    }

    const key = parts[0].toUpperCase();
    const value = parts.slice(1).join(' ');

    await conversation.external(async () => {
      const db = await import('../../infrastructure/database.js');
      await db.setSystemVar(key, value);
    });

    await replyRich(ctx, `<blockquote><b>✅ BERHASIL</b><br>Variabel sistem <b>${key}</b> berhasil disimpan!</blockquote>`);

  } catch (error) {
    if (error.message !== 'USER_CANCELLED') {
      Logger.logUser(telegramId, `Error in manageSystemVarsConv: ${error.message}`, 'ERROR');
      await replyRich(ctx, `<blockquote><b>❌ KESALAHAN</b><br>Terjadi kesalahan sistem.</blockquote>`);
    }
  }
}
