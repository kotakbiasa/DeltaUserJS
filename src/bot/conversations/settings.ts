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

      let varList = Object.entries(currentVars)
        .map(([k, v]) => `• <b>${k}</b>: <code>${v}</code>`)
        .join('\n');
      if (!varList) {varList = '<i>Belum ada variabel yang diatur.</i>';}

      // Kirim menu utama vars
      const menuMsg = await replyRich(ctx, `<h1>⚙️ Pengaturan Variabel (Vars)</h1><blockquote>Daftar Variabel Anda saat ini:</blockquote>\n<blockquote>${varList}</blockquote>\n\nPilih tombol di bawah untuk menambah, mengubah, atau menghapus variabel.`, { reply_markup: buildVarsKeyboard(currentVars) });

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
        await replyRich(ctx, `📝 <b>Mengatur ${key}</b>\n\nSilakan kirimkan nilai/value baru untuk <code>${key}</code>:`, { reply_markup: cancelKeyboard });

        let value;
        try {
          value = await waitForInput(conversation, ctx);
        } catch (err) {
          if (err.message === 'USER_CANCELLED') {continue;}
          throw err;
        }

        // Simpan nilai
        await replyRich(ctx, `<blockquote>⏳ Menyimpan variabel ${key}...</blockquote>`);

        if (key === 'INLINE_BOT_TOKEN') {
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
            await db.setUserVar(telegramId, key, value);
            await db.updateUserbotFeature(telegramId, 'inline_bot_token', value);
            await db.updateUserbotFeature(telegramId, 'inline_bot_username', botUsername);
            // Inline bot manager removed; settings are still persisted for .help flow.
          });
          await replyRich(ctx, `<blockquote><b>✅ BERHASIL</b><br><b>Token Inline Bot Disimpan!</b>\nBot Anda: @${botUsername} siap digunakan.</blockquote>`);
        } else {
          await conversation.external(async () => {
            const db = await import('../../infrastructure/database.js');
            await db.setUserVar(telegramId, key, value);
          });
          await replyRich(ctx, `<blockquote><b>✅ BERHASIL</b><br>Variabel <b>${key}</b> berhasil disimpan!</blockquote>`);
        }
        continue;
      }

      if (data === 'var:custom') {
        await replyRich(ctx, `📝 <b>Variabel Kustom Baru</b>\n\nSilakan kirimkan <b>NAMA (KUNCI)</b> variabel baru Anda (gunakan huruf besar, contoh: <code>MY_VAR</code>):`, { reply_markup: cancelKeyboard });

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

        await replyRich(ctx, `📝 <b>Nilai Variabel</b>\n\nSilakan kirimkan nilai/value untuk <code>${key}</code>:`, { reply_markup: cancelKeyboard });

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

        const delMenuMsg = await replyRich(ctx, `🗑️ <b>Hapus Variabel</b>\n\nPilih variabel yang ingin Anda hapus:`, { reply_markup: deleteKb });

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

    let varList = Object.entries(currentVars).map(([k, v]) => `<code>${k}</code> = <code>${v}</code>`).join('\n');
    if (!varList) {varList = '<i>Belum ada variabel sistem.</i>';}

    await replyRich(ctx, `<h1>⚙️ System Vars Config</h1><blockquote>${varList}</blockquote>\n\nSilakan kirimkan dengan format: <code>KUNCI NILAI</code>\nContoh: <code>SYSTEM_LOG_CHAT_ID -100123456</code>\nAtau ketik <code>HAPUS KUNCI</code> untuk menghapus.`, { reply_markup: cancelKeyboard });

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
