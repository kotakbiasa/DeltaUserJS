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

/** Peer gaya legacy: plugin lama kerap mengoper id mentah atau objek entity. */
export type LegacyPeer = InputPeerLike | string | number;

/** Parameter `sendMessage` gaya GramJS (`{ message }`) maupun mtcute (`{ text }`). */
export interface LegacySendMessageParams {
  message?: string;
  text?: string;
  replyTo?: number | unknown;
  parseMode?: string;
  [key: string]: unknown;
}

/** Bentuk entity yang dikembalikan alias `getEntity`. */
export interface LegacyEntity {
  id: unknown;
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

export interface LegacySendFileOptions {
  file?: unknown;
  caption?: string;
  message?: string;
  replyTo?: number | unknown;
  parseMode?: string;
  forceDocument?: boolean;
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
  sendMessage(peer: LegacyPeer, params: LegacySendMessageParams | string): Promise<unknown>;
  getEntity(peer: LegacyPeer): Promise<LegacyEntity>;
  invoke(call: unknown): Promise<unknown>;
  getMessages(peer: LegacyPeer, params?: unknown): Promise<Array<Message | null>>;
  sendFile(chat: LegacyPeer, options: LegacySendFileOptions | unknown): Promise<unknown>;
  deleteMessages(chatOrMsgs: unknown, idsOrParams?: unknown, maybeParams?: unknown): Promise<unknown>;
  downloadProfilePhoto(peer: LegacyPeer): Promise<Buffer | undefined>;

  // --- dibungkus interceptor emoji, signature longgar untuk pemanggil legacy ---
  sendText(chat: LegacyPeer, text: unknown, params?: unknown): Promise<unknown>;
  editMessage(params: unknown, maybeParams?: unknown): Promise<unknown>;

  /**
   * Properti era GramJS yang **tidak ada di mtcute** sehingga selalu
   * `undefined`. Dibiarkan opsional (bukan dihapus) supaya pembacaannya di
   * panel dashboard tetap kompilasi, tapi tipenya jujur bahwa nilainya tidak
   * pernah terisi. Lihat docs/known_issues.md §5.
   *
   * @deprecated Tidak tersedia di mtcute — jangan dipakai untuk logika baru.
   */
  connected?: boolean;
  /** @deprecated Tidak tersedia di mtcute — lihat `connected`. */
  session?: { dcId?: number | string };

  // --- dipakai mock test & tgcalls-js, tidak ada di TelegramClient mtcute ---
  addEventHandler?(handler: (event: unknown) => unknown, builder?: unknown): void;
  removeEventHandler?(handler: (event: unknown) => unknown, builder?: unknown): void;
};
