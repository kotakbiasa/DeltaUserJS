import { Logger } from '../../../utils/logger.js';
import { updateUserbotFeature, UserbotModel, isMongo, readDbFromFile } from '../../../infrastructure/database.js';

// ============================================================
// PM Guard — anti-PM sederhana ala getter pmpermit
// Commands:
//   .pmguard on|off — aktifkan/matikan guard
//   .pmallow <id>   — whitelist user via ID atau reply pesannya
//   .pmlist         — lihat daftar whitelist
// Perilaku (saat aktif): setiap pesan masuk (non-out, private chat)
// dari user di luar whitelist dibalas SEKALI ("owner sedang away"),
// selanjutnya tidak dibalas lagi. Tidak ada auto-block — cukup warn.
// State globalThis Map per telegramId — bertahan saat plugin
// di-hot-reload, dan dipersist ke Mongo per userbot (field
// `pmguard_data` via updateFeature): di-load dari settings saat
// execute pertama, disimpan tiap on/off/allow. Gagal persist tidak
// mengganggu jalannya plugin.
// ============================================================

interface PmGuardState {
  enabled: boolean;
  whitelist: Set<number>;
  warned: Set<number>;
}

// Simpan store di globalThis agar tidak reset saat module di-reload.
interface PmGuardGlobal {
  __pmguardStore?: Map<number, PmGuardState>;
  __pmguardLoadedIds?: Set<number>;
}
const pmguardGlobal = globalThis as typeof globalThis & PmGuardGlobal;
const pmguardStore: Map<number, PmGuardState> = pmguardGlobal.__pmguardStore ?? new Map();
pmguardGlobal.__pmguardStore = pmguardStore;
// Id yang sudah pernah di-hydrate dari settings (sekali per proses).
const loadedIds: Set<number> = pmguardGlobal.__pmguardLoadedIds ?? new Set();
pmguardGlobal.__pmguardLoadedIds = loadedIds;

function getState(telegramId) {
  const idNum = Number(telegramId);
  const existing = pmguardStore.get(idNum);
  if (existing) {return existing;}
  const fresh: PmGuardState = { enabled: false, whitelist: new Set(), warned: new Set() };
  pmguardStore.set(idNum, fresh);
  return fresh;
}

// ---- Persistence (Mongo via updateFeature, field: pmguard_data) ----
// Bentuk tersimpan: { enabled: boolean, whitelist: number[] } per
// telegramId. Set `warned` sengaja tidak dipersist (ephemeral per
// sesi). Field di doc userbot diisi oleh updateFeature; kalau
// settings tidak berisi field itu (undefined), coba baca sekali
// langsung dari Mongo (fallback karena field belum masuk whitelist
// normalizeBot); kalau tetap kosong, state mulai kosong.

// Load sekali per proses per id: isi state dari settings yang
// diterima execute.
async function loadPmGuardFromSettings(telegramId, settings) {
  const idNum = Number(telegramId);
  if (loadedIds.has(idNum)) {return;}
  loadedIds.add(idNum);

  let data = settings?.pmguard_data;
  if (!data || typeof data !== 'object') {
    try {
      if (isMongo) {
        const raw = await UserbotModel.findOne({ telegram_id: idNum }, { pmguard_data: 1 });
        data = raw?.pmguard_data;
      } else {
        // Mode file-DB: field ada di database.json, bukan di Mongoose.
        const raw = await readDbFromFile();
        data = raw?.userbots?.[idNum]?.pmguard_data;
      }
    } catch (err) {
      Logger.logSystem(`pmguard: gagal load pmguard_data dari DB: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
    }
  }
  if (!data || typeof data !== 'object') {return;}
  const state = getState(idNum);
  state.enabled = Boolean(data.enabled);
  if (Array.isArray(data.whitelist)) {
    for (const uid of data.whitelist) {
      const parsed = parsePositiveId(uid);
      if (parsed !== null) {state.whitelist.add(parsed);}
    }
  }
}

// Persist snapshot; kegagalan DB hanya dilog, plugin tetap jalan.
async function persistPmGuard(telegramId) {
  try {
    const state = pmguardStore.get(Number(telegramId));
    if (!state) {return;}
    await updateUserbotFeature(telegramId, 'pmguard_data', {
      enabled: state.enabled,
      whitelist: Array.from(state.whitelist)
    });
  } catch (err) {
    Logger.logUser(Number(telegramId), `pmguard: gagal persist pmguard_data: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
  }
}

/** Status aktif/tidaknya PM Guard milik akun tertentu. */
export function isPmGuardOn(telegramId) {
  return pmguardStore.get(Number(telegramId))?.enabled ?? false;
}

/** Cek apakah userId ada di whitelist PM Guard milik telegramId. */
export function isPmAllowed(telegramId, userId) {
  return pmguardStore.get(Number(telegramId))?.whitelist.has(Number(userId)) ?? false;
}

const AWAY_TEXT =
  '🛡️ <b>Auto-Reply</b>\n\n' +
  'Owner sedang away. Pesan kamu sudah diterima dan akan dibalas saat owner kembali aktif. 🙏\n\n' +
  '<i>(Pesan otomatis — PM Guard aktif)</i>';

function parsePositiveId(raw) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default {
  name: 'pmguard',
  version: '1.0.0',
  description: 'Anti-PM sederhana: warn 1x ke PM tak dikenal, whitelist via .pmallow, tanpa auto-block.',
  help: {
    title: '🛡️ PM Guard (.pmguard / .pmallow / .pmlist)',
    description: 'Anti-PM ala getter pmpermit: saat aktif, PM masuk dari user di luar whitelist otomatis dibalas sekali "owner sedang away", lalu diabaikan. Tidak ada auto-block.',
    usage: '• `.pmguard on` — aktifkan\n• `.pmguard off` — matikan\n• `.pmallow <id>` — whitelist via user ID\n• `.pmallow` (reply pesan user) — whitelist via reply\n• `.pmlist` — lihat daftar whitelist',
    detail: 'Hanya pesan masuk di private chat (non-out) yang diwarn, 1x per user per sesi. ' +
      'User yang di-whitelist lewat begitu saja. Whitelist tetap tersimpan walau guard dimatikan. ' +
      'Status dan whitelist dipersist ke database per userbot (field pmguard_data) dan di-load ulang otomatis saat userbot start. ' +
      'Plugin lain bisa memakai helper isPmGuardOn(telegramId) dan isPmAllowed(telegramId, userId).'
  },
  async execute(client, message, settings, telegramId) {
    await loadPmGuardFromSettings(telegramId, settings);
    const text: string = message.message || '';
    const idNum = Number(telegramId);

    // ===== 1. Command dari owner (outgoing) =====
    if (message.out) {
      if (!text) {return;}
      const parts = text.trim().split(/\s+/);
      const cmd = (parts[0] || '').toLowerCase();
      if (cmd !== '.pmguard' && cmd !== '.pmallow' && cmd !== '.pmlist') {return;}

      const state = getState(idNum);

      if (cmd === '.pmguard') {
        const arg = (parts[1] || '').toLowerCase();
        if (!arg) {
          const status = state.enabled ? 'AKTIF ✅' : 'MATI ❌';
          await message.edit({
            text: `<blockquote>🛡️ <b>PM Guard: ${status}</b>\nWhitelist: <b>${state.whitelist.size}</b> user\n\nGunakan <code>.pmguard on</code> / <code>.pmguard off</code>.</blockquote>`,
            parseMode: 'html'
          });
          return;
        }
        if (['on', 'yes', 'true', '1'].includes(arg)) {
          if (state.enabled) {
            await message.edit({ text: '<blockquote>ℹ️ PM Guard memang sudah aktif.</blockquote>', parseMode: 'html' });
            return;
          }
          state.enabled = true;
          await persistPmGuard(idNum);
          await message.edit({
            text: '<blockquote>✅ <b>PM Guard AKTIF.</b>\nPesan masuk (private) dari user di luar whitelist akan diwarn 1x — tanpa auto-block.\nWhitelist: <code>.pmallow &lt;id&gt;</code> atau reply pesan user.</blockquote>',
            parseMode: 'html'
          });
          return;
        }
        if (['off', 'no', 'false', '0'].includes(arg)) {
          if (!state.enabled) {
            await message.edit({ text: '<blockquote>ℹ️ PM Guard memang sudah mati.</blockquote>', parseMode: 'html' });
            return;
          }
          state.enabled = false;
          await persistPmGuard(idNum);
          await message.edit({
            text: '<blockquote>🛑 <b>PM Guard MATI.</b>\nSemua pesan masuk diteruskan seperti biasa. Whitelist tetap tersimpan.</blockquote>',
            parseMode: 'html'
          });
          return;
        }
        await message.edit({
          text: '<blockquote>📚 <b>Penggunaan:</b> <code>.pmguard on</code> atau <code>.pmguard off</code></blockquote>',
          parseMode: 'html'
        });
        return;
      }

      if (cmd === '.pmallow') {
        let targetId = parts[1] ? parsePositiveId(parts[1]) : null;
        if (targetId === null) {
          const replied = await message.getReplyMessage();
          if (replied && replied.senderId) {
            targetId = parsePositiveId(replied.senderId);
          }
        }
        if (targetId === null) {
          await message.edit({
            text: '<blockquote>📚 <b>Penggunaan:</b> <code>.pmallow &lt;user_id&gt;</code>\natau balas pesan user yang ingin di-whitelist.</blockquote>',
            parseMode: 'html'
          });
          return;
        }
        if (state.whitelist.has(targetId)) {
          await message.edit({
            text: `<blockquote>ℹ️ User <code>${targetId}</code> sudah ada di whitelist.</blockquote>`,
            parseMode: 'html'
          });
          return;
        }
        state.whitelist.add(targetId);
        state.warned.delete(targetId);
        await persistPmGuard(idNum);
        await message.edit({
          text: `<blockquote>✅ <b>User Di-whitelist</b>\n<code>${targetId}</code> kini bisa langsung PM tanpa diwarn.\nTotal whitelist: <b>${state.whitelist.size}</b></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      // .pmlist
      if (state.whitelist.size === 0) {
        await message.edit({
          text: '<blockquote>📭 Whitelist kosong. Tambahkan dengan <code>.pmallow &lt;id&gt;</code> atau reply pesan user.</blockquote>',
          parseMode: 'html'
        });
        return;
      }
      let rows = '';
      let i = 1;
      for (const uid of state.whitelist) {
        rows += `${i}. <code>${uid}</code>\n`;
        i++;
      }
      await message.edit({
        text: `🛡️ <b>Whitelist PM Guard (${state.whitelist.size})</b>\n\n<blockquote>${rows.trim()}</blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    // ===== 2. Pesan masuk: warn 1x tanpa auto-block =====
    if (!message.isPrivate) {return;}
    const senderId = message.senderId ? parsePositiveId(message.senderId) : null;
    if (!senderId || senderId === idNum) {return;}
    const guardState = pmguardStore.get(idNum);
    if (!guardState || !guardState.enabled) {return;}
    if (guardState.whitelist.has(senderId)) {return;}
    if (guardState.warned.has(senderId)) {return;}
    guardState.warned.add(senderId);
    try {
      await message.reply({
        message: AWAY_TEXT,
        parseMode: 'html',
        linkPreview: false
      });
    } catch (err) {
      Logger.logUser(idNum, `PM Guard gagal membalas ${senderId}: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
    }
  }
};
