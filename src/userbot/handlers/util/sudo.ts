import config from '../../../config.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import { updateUserbotFeature, UserbotModel, dbCache, isMongo, readDbFromFile } from '../../../infrastructure/database.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';

// ============================================================
// SUDO MANAGER
// Kelola daftar user (selain owner bot) yang boleh memakai
// command userbot. State in-memory Set bertahan antar hot-reload
// dan dipersist ke Mongo per userbot (field `sudo_list` via
// updateFeature): di-load dari settings saat execute pertama
// (juga oleh getSudos()), disimpan tiap add/del. Plugin lain tetap
// bisa memakai helper:
//   isSudo(userId, userbotId) -> boolean
//   getSudos(userbotId) -> number[]
// Legacy one-argument accessors remain available for callers that do not
// have a userbot context; new code should always pass userbotId explicitly.
// ============================================================

interface SudoState {
  users: Set<number>;
  hydrationPromise: Promise<void> | null;
}

type SudoGlobalState = Map<number, SudoState>;

// State tetap survive hot-reload, tetapi setiap userbot mendapat Set dan
// promise hydration sendiri. Jangan gunakan satu Set global untuk semua bot:
// daftar sudo adalah bagian dari konfigurasi userbot yang aktif.
const globalState = globalThis as unknown as { __deltauserjs_sudo_state_v2__?: SudoGlobalState };
const sudoStates = globalState.__deltauserjs_sudo_state_v2__ ?? new Map<number, SudoState>();
globalState.__deltauserjs_sudo_state_v2__ = sudoStates;

function getSudoState(telegramId: number): SudoState {
  const id = Number(telegramId);
  let state = sudoStates.get(id);
  if (!state) {
    state = { users: new Set<number>(), hydrationPromise: null };
    sudoStates.set(id, state);
  }
  return state;
}

// ---- Persistence (Mongo via updateFeature, field: sudo_list) ----
// Bentuk tersimpan: number[] (daftar telegramId sudo). Field di doc
// userbot diisi oleh updateFeature; kalau settings tidak berisi
// field itu (undefined), daftar mulai kosong.

async function hydrateSudos(telegramId: number, state: SudoState): Promise<void> {
  // 1. Kalau settings (doc userbot dari cache) sudah berisi field-nya,
  //    langsung pakai itu — tidak perlu query Mongo.
  const cachedList = dbCache.get(Number(telegramId))?.sudo_list;
  if (Array.isArray(cachedList)) {
    for (const id of cachedList) {
      const parsed = Number(id);
      if (Number.isInteger(parsed) && parsed > 0) {state.users.add(parsed);}
    }
    return;
  }

  // 2. Fallback: settings tidak berisi sudo_list (field belum masuk
  //    whitelist normalizeBot) — baca hanya userbot yang sedang aktif.
  try {
    if (isMongo) {
      const raw = await UserbotModel.findOne({ telegram_id: Number(telegramId) }, { sudo_list: 1 });
      const list = raw?.sudo_list;
      if (Array.isArray(list)) {
        for (const id of list) {
          const parsed = Number(id);
          if (Number.isInteger(parsed) && parsed > 0) {state.users.add(parsed);}
        }
      }
    } else {
      // Mode file-DB: field ada di database.json, bukan di Mongoose.
      const data = await readDbFromFile();
      const bot = (data?.userbots || {})[String(Number(telegramId))] as Record<string, unknown> | undefined;
      const list = bot?.sudo_list;
      if (Array.isArray(list)) {
        for (const id of list) {
          const parsed = Number(id);
          if (Number.isInteger(parsed) && parsed > 0) {state.users.add(parsed);}
        }
      }
    }
  } catch (err) {
    Logger.logSystem(`sudo: gagal load sudo_list dari DB: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
  }
}

function ensureHydrated(telegramId: number): Promise<void> {
  const state = getSudoState(telegramId);
  if (state.hydrationPromise === null) {
    state.hydrationPromise = hydrateSudos(Number(telegramId), state);
  }
  return state.hydrationPromise;
}

// Persist snapshot; kegagalan DB hanya dilog, plugin tetap jalan.
async function persistSudos(telegramId: number): Promise<void> {
  const state = getSudoState(telegramId);
  try {
    await updateUserbotFeature(telegramId, 'sudo_list', Array.from(state.users));
  } catch (err) {
    Logger.logUser(Number(telegramId), `sudo: gagal persist sudo_list: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
  }
}

export function isSudo(userId: number, userbotId?: number): boolean {
  // This helper intentionally remains synchronous for existing callers;
  // command execution awaits ensureHydrated() before using the Set.
  if (userbotId !== undefined) {
    void ensureHydrated(userbotId);
    return getSudoState(userbotId).users.has(Number(userId));
  }
  // Compatibility path for the old one-argument API. It never merges the
  // stores; it only answers whether a hydrated store contains the ID.
  for (const state of sudoStates.values()) {
    if (state.users.has(Number(userId))) {return true;}
  }
  return false;
}

export function getSudos(userbotId?: number): number[] {
  if (userbotId !== undefined) {
    void ensureHydrated(userbotId);
    return Array.from(getSudoState(userbotId).users);
  }
  const all = new Set<number>();
  for (const state of sudoStates.values()) {
    for (const id of state.users) {all.add(id);}
  }
  return Array.from(all);
}

function isOwnerBot(telegramId: number) {
  return Boolean(config.ownerId) && Number(telegramId) === config.ownerId;
}

// Prioritas: argumen ID langsung (.addsudo 12345), lalu reply ke pesan user.
async function resolveTargetId(message: UserbotMessageLike) {
  const arg = (message.message ?? '').trim().split(/\s+/)[1];
  if (arg) {
    const id = Number(arg);
    if (Number.isInteger(id) && id > 0) {return id;}
  }

  const replied = await message.getReplyMessage();
  if (replied && replied.senderId) {
    const id = Number(replied.senderId);
    if (Number.isInteger(id) && id > 0) {return id;}
  }

  return null;
}

export default {
  name: 'sudo',
  version: '1.0.0',
  description: 'Manajemen sudo: user tambahan (selain owner) yang boleh memakai command userbot.',
  help: {
    title: 'Sudo Manager (.addsudo / .delsudo / .sudolist)',
    description: 'Kelola daftar pengguna sudo — user selain owner bot yang diizinkan menggunakan command userbot.',
    usage: '• `.addsudo` — balas pesan user untuk menambahkan\n' +
      '• `.addsudo <id>` — tambah sudo via user ID\n' +
      '• `.delsudo` — balas pesan user untuk menghapus\n' +
      '• `.delsudo <id>` — hapus sudo via user ID\n' +
      '• `.sudolist` — lihat daftar pengguna sudo',
    detail: 'Hanya owner bot (cek telegramId === config.ownerId) yang dapat menambah/menghapus sudo. ' +
      'Daftar sudo dipersist ke database per userbot (field sudo_list) dan di-load ulang otomatis saat userbot start. ' +
      'Plugin lain bisa memakai helper isSudo(userId, userbotId) dan getSudos(userbotId) untuk validasi akses sudo.'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, _settings: UserbotSettings, telegramId: number) {
    await ensureHydrated(telegramId);
    const sudoUsers = getSudoState(telegramId).users;

    if (!message.out || !message.message) {return;}

    const parts = message.message.trim().split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();

    if (cmd !== '.addsudo' && cmd !== '.delsudo' && cmd !== '.sudolist') {return;}

    if (!isOwnerBot(telegramId)) {
      await message.edit({
        text: '<blockquote>⛔ <b>Akses Ditolak.</b>\nPerintah sudo hanya bisa dipakai oleh owner bot.</blockquote>',
        parseMode: 'html'
      });
      return;
    }

    if (cmd === '.addsudo' || cmd === '.delsudo') {
      const targetId = await resolveTargetId(message);
      if (!targetId) {
        await message.edit({
          text: `<blockquote>📚 <b>Penggunaan:</b> <code>${cmd} &lt;user_id&gt;</code>\natau balas pesan user yang dimaksud.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      if (cmd === '.addsudo') {
        if (sudoUsers.has(targetId)) {
          await message.edit({
            text: `<blockquote>ℹ️ User <code>${escapeHtml(String(targetId))}</code> sudah terdaftar sebagai sudo.</blockquote>`,
            parseMode: 'html'
          });
          return;
        }
        sudoUsers.add(targetId);
        await persistSudos(telegramId);
        await message.edit({
          text: `<blockquote>✅ <b>Sudo Ditambahkan</b>\nUser <code>${escapeHtml(String(targetId))}</code> kini boleh memakai command userbot.\nTotal sudo: <b>${sudoUsers.size}</b></blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      if (!sudoUsers.has(targetId)) {
        await message.edit({
          text: `<blockquote>ℹ️ User <code>${escapeHtml(String(targetId))}</code> tidak ada di daftar sudo.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      sudoUsers.delete(targetId);
      await persistSudos(telegramId);
      await message.edit({
        text: `<blockquote>🗑️ <b>Sudo Dihapus</b>\nUser <code>${escapeHtml(String(targetId))}</code> tidak lagi bisa memakai command userbot.\nTotal sudo: <b>${sudoUsers.size}</b></blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    // .sudolist
    const sudos = getSudos(telegramId);
    if (sudos.length === 0) {
      await message.edit({
        text: '<blockquote>📭 Belum ada pengguna sudo terdaftar.\nTambahkan dengan <code>.addsudo &lt;id&gt;</code>.</blockquote>',
        parseMode: 'html'
      });
      return;
    }

    let rows = '';
    let i = 1;
    for (const id of sudos) {
      rows += `${i}. <code>${escapeHtml(String(id))}</code>\n`;
      i++;
    }
    await message.edit({
      text: `🛡️ <b>Daftar Pengguna Sudo (${sudos.length})</b>\n\n<blockquote>${rows}</blockquote>`,
      parseMode: 'html'
    });
  }
};
