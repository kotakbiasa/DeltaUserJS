/**
 * Tipe klien userbot: `TelegramClient` mtcute **plus** alias kompatibilitas
 * yang ditempel runtime oleh `UserbotClient.setupClientCompatibility()`.
 *
 * Kenapa ada file ini: sebelumnya `UserbotClient.client` bertipe `any`,
 * sehingga seluruh pemanggilan ke klien tidak diperiksa compiler sama sekali.
 * Itu yang membuat ketidakcocokan GramJS↔mtcute di jalur Voice Chat
 * (lihat docs/known_issues.md §1) lolos tanpa satu pun error build.
 *
 * Beberapa nama di sini sengaja MENIMPA signature asli mtcute karena alias
 * legacy menerima bentuk argumen gaya GramJS. Itulah alasan memakai `Omit`
 * alih-alih `extends`: kita menyatakan secara eksplisit mana yang sudah
 * menyimpang dari API asli, bukan menyembunyikannya di balik `any`.
 */
import type { TelegramClient } from '@mtcute/node';
import type { InputPeerLike, Message } from '@mtcute/core';
import type { EntityLike } from '../types.js';

/** Peer gaya legacy: plugin lama kerap mengoper id mentah atau objek entity. */
export type LegacyPeer = InputPeerLike | string | number;

/** Parameter `sendMessage` gaya GramJS (`{ message }`) maupun mtcute (`{ text }`). */
export interface LegacySendMessageParams {
  message?: string;
  text?: string;
  replyTo?: number | unknown;
  /** `false` berarti kirim verbatim (gaya GramJS), bukan HTML. */
  parseMode?: string | false;
  /** Bila diisi, pesan dikirim sebagai media dengan `message` jadi caption. */
  file?: unknown;
  [key: string]: unknown;
}

/** Bentuk entity yang dikembalikan alias `getEntity`. */
export interface LegacyEntity {
  id: unknown;
  /** 'User' atau 'Chat', meniru className GramJS yang masih dibaca plugin. */
  className?: string;
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface LegacySendFileOptions {
  file?: unknown;
  caption?: string;
  message?: string;
  parseMode?: string | false;
  replyTo?: number | unknown;
  forceDocument?: boolean;
  voiceNote?: boolean;
  fileName?: string;
  filename?: string;
  name?: string;
  mimeType?: string;
  fileMime?: string;
  fileSize?: number;
  attributes?: Array<{ _?: string; className?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Method mtcute yang signature-nya ditimpa alias legacy. */
type LegacyOverridden =
  | 'sendMessage'
  | 'getMessages'
  | 'deleteMessages'
  | 'sendText'
  | 'editMessage';

export type CompatClient = Omit<TelegramClient, LegacyOverridden> & {
  // --- alias legacy (ditambahkan setupClientCompatibility) ---
  sendMessage(peer: LegacyPeer, params: LegacySendMessageParams | string): Promise<Message>;
  getEntity(peer: LegacyPeer): Promise<LegacyEntity>;
  invoke(call: unknown): Promise<unknown>;
  getMessages(peer: LegacyPeer, params?: unknown): Promise<Array<Message | null>>;
  sendFile(chat: LegacyPeer, fileOrOptions: LegacySendFileOptions | unknown, maybeOptions?: LegacySendFileOptions | unknown): Promise<Message>;
  deleteMessages(chatOrMsgs: unknown, idsOrParams?: unknown, maybeParams?: unknown): Promise<unknown>;
  downloadProfilePhoto(peer: LegacyPeer): Promise<Buffer | undefined>;

  // --- dibungkus interceptor emoji, signature longgar untuk pemanggil legacy ---
  sendText(chat: LegacyPeer, text: string, params?: { replyTo?: unknown; parseMode?: string } & Record<string, unknown>): Promise<Message>;
  editMessage(params: unknown, maybeParams?: unknown): Promise<unknown>;

  // --- dipakai mock test & tgcalls-js, tidak ada di TelegramClient mtcute ---
  getInputEntity?(peer: unknown): Promise<unknown>;
  addEventHandler?(handler: (event: unknown) => unknown, builder?: unknown): void;
  removeEventHandler?(handler: (event: unknown) => unknown, builder?: unknown): void;
};

/**
 * Menormalkan identitas peer gaya legacy (`message.chatId`/`peerId`, yang
 * bisa berupa bigint atau objek entitas) menjadi bentuk yang diterima mtcute.
 *
 * ID Telegram selalu muat di `Number` (jauh di bawah 2^53), jadi konversi
 * bigint di sini tidak kehilangan presisi.
 */
export function toPeer(entity: unknown): LegacyPeer {
  if (typeof entity === 'bigint') {return Number(entity);}
  if (typeof entity === 'string' || typeof entity === 'number') {return entity;}
  if (entity && typeof entity === 'object') {
    const id = (entity as { id?: unknown }).id;
    if (typeof id === 'bigint') {return Number(id);}
    if (typeof id === 'string' || typeof id === 'number') {return id;}
    return entity as LegacyPeer;
  }
  throw new TypeError('Peer tidak valid: ' + String(entity));
}
