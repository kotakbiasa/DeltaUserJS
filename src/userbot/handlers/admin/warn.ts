import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import { updateUserbotFeature } from '../../../infrastructure/database.js';
import type { CompatClient } from '../../engine/compatClient.js';
import { toPeer } from '../../engine/compatClient.js';
import type { EntityLike, UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { LegacyEntity } from '../../engine/compatClient.js';
import type { UserbotEntityLike } from '../../types.js';
import type { tl } from '@mtcute/core';

// ============================================================
// Warning grup — .warn / .warns / .resetwarn
// Konsep diadaptasi dari plugin warn Ultroid ke pola DeltaUserJS.
// Hanya owner userbot (message.out), hanya di dalam grup. Target:
// reply ATAU username/ID. Setiap .warn menambah 1 warn (maksimal
// MAX_WARNS); saat batas tercapai user otomatis dikick (dua langkah
// ChatBannedRights di supergroup, DeleteChatUser di grup biasa)
// lalu warn-nya direset. State in-memory globalThis per
// chatKey-userId: bertahan antar hot-reload, dan dipersist ke
// Mongo per userbot (field `warn_data` via updateFeature) tiap
// warn/reset — di-load dari settings saat execute pertama.
// ============================================================

const MAX_WARNS = 3;

interface WarnEntry {
  count: number;
  reasons: string[];
}

interface Target {
  id: number;
  name: string;
  entity?: LegacyEntity | UserbotEntityLike | string;
}

interface ResolvedTarget {
  target?: Target;
  reason: string;
  error?: string;
}

// userbotId -> chatKey -> Map<userKey, WarnEntry>
type WarnStore = Map<string, Map<string, WarnEntry>>;

// State tetap survive hot-reload, tetapi setiap userbot mendapat store dan
// flag hydration sendiri. Key chat saja dapat membuat warn bot A muncul di
// bot B ketika keduanya memproses grup Telegram yang sama.
const globalState = globalThis as unknown as {
  __deltauserjs_warn_stores_v2__?: Map<number, WarnStore>;
  __deltauserjs_warn_loaded_v2__?: Set<number>;
};
const warnStores = globalState.__deltauserjs_warn_stores_v2__ ?? new Map<number, WarnStore>();
const loadedIds = globalState.__deltauserjs_warn_loaded_v2__ ?? new Set<number>();
globalState.__deltauserjs_warn_stores_v2__ = warnStores;
globalState.__deltauserjs_warn_loaded_v2__ = loadedIds;

function getWarnStore(telegramId: number): WarnStore {
  const id = Number(telegramId);
  let store = warnStores.get(id);
  if (!store) {
    store = new Map<string, Map<string, WarnEntry>>();
    warnStores.set(id, store);
  }
  return store;
}

// ---- Persistence (Mongo via updateFeature, field: warn_data) ----
// Bentuk tersimpan: { [chatKey]: { [userKey]: { count, reasons[] } } }
// — sama dengan bentuk yang dipakai addWarn/resetWarns di
// UserbotService, jadi data di doc userbot kompatibel antar keduanya.
// Field di doc diisi oleh updateFeature; kalau settings tidak berisi
// field itu (undefined), store mulai kosong.

// Load sekali per proses per telegramId (flag di globalThis agar
// ikut survive hot-reload): isi store dari settings yang diterima
// execute. Settings (doc userbot dari cache) berisi field ini
// karena updateFeature mempersist-nya; kalau tidak berisi field itu
// (undefined), store mulai kosong.
function loadWarnsFromSettings(telegramId: number, settings: UserbotSettings) {
  const idNum = Number(telegramId);
  if (loadedIds.has(idNum)) {return;}
  loadedIds.add(idNum);
  const warnStore = getWarnStore(idNum);
  const data = settings?.warn_data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {return;}
  for (const chatKey of Object.keys(data)) {
    const rawChat = data[chatKey];
    if (!rawChat || typeof rawChat !== 'object') {continue;}
    const chatMap = getChatWarns(warnStore, chatKey);
    const chatEntries = rawChat as Record<string, { count?: unknown; reasons?: unknown }>;
    for (const userKey of Object.keys(chatEntries)) {
      const entry = chatEntries[userKey];
      if (!entry || typeof entry !== 'object' || !Number.isFinite(Number(entry.count))) {continue;}
      chatMap.set(String(userKey), {
        count: Number(entry.count),
        reasons: Array.isArray(entry.reasons) ? entry.reasons.map((r: unknown) => String(r)) : []
      });
    }
  }
}

// Snapshot store ke plain object JSON-safe untuk dipersist.
function serializeWarnStore(telegramId: number) {
  const warnStore = getWarnStore(telegramId);
  const out: Record<string, Record<string, WarnEntry>> = {};
  for (const [chatKey, chatMap] of warnStore) {
    const chatData: Record<string, WarnEntry> = {};
    for (const [userKey, entry] of chatMap) {
      chatData[userKey] = { count: entry.count, reasons: [...entry.reasons] };
    }
    out[chatKey] = chatData;
  }
  return out;
}

// Persist snapshot; kegagalan DB hanya dilog, plugin tetap jalan.
async function persistWarns(telegramId: number) {
  try {
    await updateUserbotFeature(telegramId, 'warn_data', serializeWarnStore(telegramId));
  } catch (err) {
    Logger.logUser(telegramId, `warn: gagal persist warn_data: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
  }
}

// ---- State helpers ----

function getChatWarns(warnStore: WarnStore, chatKey: string): Map<string, WarnEntry> {
  let chatMap = warnStore.get(chatKey);
  if (!chatMap) {
    chatMap = new Map();
    warnStore.set(chatKey, chatMap);
  }
  return chatMap;
}

function getEntry(warnStore: WarnStore, chatKey: string, userKey: string): WarnEntry {
  const chatMap = getChatWarns(warnStore, chatKey);
  let entry = chatMap.get(userKey);
  if (!entry) {
    entry = { count: 0, reasons: [] };
    chatMap.set(userKey, entry);
  }
  return entry;
}

// ---- Target & format helpers ----

function mention(target: Target): string {
  const short = target.name.length > 24 ? `${target.name.slice(0, 24)}…` : target.name;
  return `<a href="tg://user?id=${target.id}">${escapeHtml(short)}</a>`;
}

function listWarns(entry: WarnEntry): string {
  let text = '<b>Daftar warn</b>:\n';
  entry.reasons.forEach((reason, i) => {
    text += `• ${i + 1}. ${escapeHtml(reason)}\n`;
  });
  return text;
}

// Target user: reply ke pesan user, atau token pertama args =
// @username / username / link t.me / ID numerik. Sisa args = alasan.
async function resolveTarget(client: CompatClient, message: UserbotMessageLike, args: string): Promise<ResolvedTarget> {
  let token = '';
  let reason = args;
  if (args !== '') {
    const parts = args.split(/\s+/).filter(Boolean);
    token = parts[0] || '';
    reason = parts.slice(1).join(' ').trim();
  }

  const replied = await message.getReplyMessage();
  if (replied && replied.senderId) {
    let name = `User ${replied.senderId}`;
    let entity;
    try {
      const sender = await replied.getSender();
      if (sender) {
        entity = sender;
        name = [sender.firstName, sender.lastName].filter(Boolean).join(' ') || sender.title || name;
      }
    } catch (_e) { /* pengirim anonim: pakai fallback */ }
    return { target: { id: Number(replied.senderId), name, entity }, reason };
  }

  if (token !== '') {
    const lookup = token.replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
    let entity;
    try {
      entity = await client.getEntity(/^\d+$/.test(lookup) ? Number(lookup) : lookup);
    } catch (_e) { entity = undefined; }
    if (entity) {
      const name = [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.title || lookup;
      return { target: { id: Number(entity.id), name, entity }, reason };
    }
    if (/^\d+$/.test(lookup)) {
      return { target: { id: Number(lookup), name: `User ${lookup}` }, reason };
    }
    return { reason, error: `Tidak bisa menemukan user <code>${escapeHtml(token)}</code>` };
  }

  return { reason, error: 'Balas pesan user yang mau diwarn, atau tulis username/ID-nya' };
}

// Kick = kickChatMember atau ban sekejap lalu unban
async function kickUser(client: CompatClient, chat: UserbotEntityLike, _isChannel: boolean, target: Target) {
  const chatId = (chat as { id?: unknown }).id ?? chat;
  const participant = target.entity ?? target.id;
  if (typeof client.kickChatMember === 'function') {
    // mtcute memakai satu objek params, bukan argumen posisional.
    return await client.kickChatMember({ chatId: toPeer(chatId as EntityLike), userId: toPeer(participant as EntityLike) });
  }
  if (typeof client.call === 'function') {
    // Pemanggilan TL mentah: resolvePeer() mengembalikan InputPeer, sedangkan
    // skema channels.editBanned minta InputChannel. Bentuknya dipakai apa
    // adanya seperti sebelumnya, cuma sekarang cast-nya tertulis eksplisit.
    const channel = (await client.resolvePeer?.(toPeer(chatId as EntityLike)) || chatId) as tl.TypeInputChannel;
    const bannedPeer = (await client.resolvePeer?.(toPeer(participant as EntityLike)) || participant) as tl.TypeInputPeer;
    await client.call({
      _: 'channels.editBanned',
      channel,
      participant: bannedPeer,
      bannedRights: { _: 'chatBannedRights', untilDate: 0, viewMessages: true },
    }).catch(() => {});
    return await client.call({
      _: 'channels.editBanned',
      channel,
      participant: bannedPeer,
      bannedRights: { _: 'chatBannedRights', untilDate: 0, viewMessages: false, sendMessages: false },
    });
  }
  if (typeof client.invoke === 'function') {
    return await client.invoke({
      _: 'messages.deleteChatUser',
      chatId: chatId,
      userId: participant,
    });
  }
}

// ---- Command handlers ----

async function handleWarn(client: CompatClient, message: UserbotMessageLike, chat: UserbotEntityLike, isChannel: boolean, warnStore: WarnStore, chatKey: string, telegramId: number, target: Target, reason: string) {
  const chatMap = getChatWarns(warnStore, chatKey);
  const userKey = String(target.id);
  const entry = getEntry(warnStore, chatKey, userKey);
  entry.count += 1;
  entry.reasons.push(reason || '(tanpa alasan)');

  if (entry.count >= MAX_WARNS) {
    let kicked = false;
    let kickErr = '';
    try {
      await kickUser(client, chat, isChannel, target);
      kicked = true;
    } catch (err) {
      kickErr = err instanceof Error ? err.message : String(err);
    }
    if (kicked) {
      chatMap.delete(userKey);
      if (chatMap.size === 0) {warnStore.delete(chatKey);}
    }
    await persistWarns(telegramId);
    let text =
      `<blockquote>🚫 <b>WARNING ${entry.count}/${MAX_WARNS} — batas tercapai.</b>\n` +
      `${mention(target)} <b>${kicked ? 'dikeluarkan dari grup.' : 'gagal dikick.'}</b></blockquote>\n` +
      listWarns(entry);
    if (!kicked) {
      text += `\n⚠️ Gagal kick: <i>${escapeHtml(kickErr)}</i>\nPastikan Anda admin dengan hak kick. Reset dengan <code>.resetwarn</code>.`;
    }
    await message.edit({ text, parseMode: 'html' });
    return;
  }

  await persistWarns(telegramId);
  const remaining = MAX_WARNS - entry.count;
  await message.edit({
    text:
      `<blockquote>⚠️ <b>WARNING ${entry.count}/${MAX_WARNS}</b>\n` +
      `User: ${mention(target)}\n` +
      `Alasan: <i>${escapeHtml(reason || '(tanpa alasan)')}</i></blockquote>\n` +
      `⤿ <b>${remaining}</b> warn lagi sebelum otomatis dikick.`,
    parseMode: 'html'
  });
}

async function handleWarns(message: UserbotMessageLike, warnStore: WarnStore, chatKey: string, target: Target) {
  const chatMap = warnStore.get(chatKey);
  const entry = chatMap ? chatMap.get(String(target.id)) : undefined;
  if (!entry || entry.count === 0) {
    await message.edit({
      text: `<blockquote>✅ ${mention(target)} <b>bersih — tidak punya warn.</b></blockquote>`,
      parseMode: 'html'
    });
    return;
  }
  await message.edit({
    text: `<blockquote>📋 <b>Warn ${mention(target)}: ${entry.count}/${MAX_WARNS}</b></blockquote>\n${listWarns(entry)}`,
    parseMode: 'html'
  });
}

async function handleResetWarn(message: UserbotMessageLike, warnStore: WarnStore, chatKey: string, telegramId: number, target: Target) {
  const chatMap = warnStore.get(chatKey);
  if (chatMap) {
    chatMap.delete(String(target.id));
    if (chatMap.size === 0) {warnStore.delete(chatKey);}
  }
  await persistWarns(telegramId);
  await message.edit({
    text: `<blockquote>♻️ Semua warn ${mention(target)} <b>direset ke 0/${MAX_WARNS}.</b></blockquote>`,
    parseMode: 'html'
  });
}

const COMMANDS = ['warn', 'warns', 'resetwarn'];

export default {
  name: 'warn',
  version: '1.0.0',
  description: 'Sistem warning grup: .warn, .warns, .resetwarn. Otomatis kick di warn ke-3.',
  help: {
    title: '⚠️ Warning Grup (.warn / .warns / .resetwarn)',
    description: 'Sistem warning grup: 3 warn = otomatis dikick. Alasan opsional, dicatat per user per grup.',
    usage:
      '• Reply user lalu `.warn [alasan]` — beri warn (atau `.warn @username [alasan]`)\n' +
      '• `.warns` — lihat daftar warn user yang di-reply\n' +
      '• `.resetwarn` — reset semua warn user yang di-reply',
    detail: 'Sampai 3 warn per user per grup; warn ke-3 otomatis mengeluarkan user dari grup (butuh hak admin kick). ' +
      'Warn dipersist ke database per userbot (field warn_data) dan di-load ulang otomatis saat userbot start. ' +
      'Hanya owner userbot yang bisa memakai command ini.'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, settings: UserbotSettings, telegramId: number) {
    if (!message.out || !message.message) {return;}

    loadWarnsFromSettings(telegramId, settings);
    const warnStore = getWarnStore(telegramId);

    const match = message.message.trim().match(/^\.([A-Za-z]+)(?:\s+([\s\S]*))?$/);
    if (!match) {return;}
    const cmd = match[1].toLowerCase();
    if (!COMMANDS.includes(cmd)) {return;}
    const args = (match[2] || '').trim();

    let chat;
    try {
      chat = await message.getChat();
    } catch (_e) { chat = undefined; }
    if (!chat || (chat.className !== 'Channel' && chat.className !== 'Chat')) {
      await message.edit({
        text: '<blockquote>❌ <b>Warn hanya bisa dipakai di dalam grup.</b></blockquote>',
        parseMode: 'html'
      });
      return;
    }
    const isChannel = chat.className === 'Channel';
    const chatKey = String(message.chatId ?? chat.id);

    try {
      const resolved = await resolveTarget(client, message, args);
      if (resolved.error || !resolved.target) {
        await message.edit({
          text: `<blockquote>❌ <b>${escapeHtml(resolved.error || 'Target tidak ditemukan')}.</b></blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const target = resolved.target;
      if (String(target.id) === String(telegramId)) {
        await message.edit({
          text: '<blockquote>❌ <b>Tidak bisa memberi warn ke diri sendiri.</b></blockquote>',
          parseMode: 'html'
        });
        return;
      }

      if (cmd === 'warn') {
        await handleWarn(client, message, chat, isChannel, warnStore, chatKey, telegramId, target, resolved.reason);
      } else if (cmd === 'warns') {
        await handleWarns(message, warnStore, chatKey, target);
      } else {
        await handleResetWarn(message, warnStore, chatKey, telegramId, target);
      }
    } catch (err) {
      Logger.logUser(telegramId, `Error in warn plugin (${cmd}): ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      await message.edit({
        text: `<blockquote>❌ <b>Gagal ${escapeHtml(cmd)}:</b> <i>${escapeHtml(err instanceof Error ? err.message : String(err))}</i></blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
