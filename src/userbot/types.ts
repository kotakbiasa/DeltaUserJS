/**
 * Pengaturan userbot seperti yang disimpan di database (lihat
 * `src/services/UserbotService.ts`). Hanya field yang benar-benar dibaca kode
 * TypeScript yang dideklarasikan; sisanya dibiarkan terbuka karena dokumen
 * database memang bebas-bentuk.
 */
export interface UserbotSettings {
  telegram_id?: number;
  is_active?: number;
  vars?: Record<string, string | undefined>;
  chat_settings?: Record<string, { prefix?: string } & Record<string, unknown>>;
  disabled_plugins?: string[];
  [key: string]: unknown;
}

export type EntityLike = string | number | bigint | { id?: unknown; [key: string]: unknown };

export type MessageEditOptions = {
  text?: string;
  parseMode?: string;
  linkPreview?: boolean;
  [key: string]: unknown;
};

export interface UserbotEntityLike {
  id?: unknown;
  className?: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  title?: string;
  premium?: boolean;
  bot?: boolean;
  verified?: boolean;
  scam?: boolean;
  fake?: boolean;
  about?: string;
  participantsCount?: number;
  megagroup?: boolean;
}

export interface UserbotMessageLike {
  out?: boolean;
  /** True bila pesan menyebut/mention kita (mtcute: Message.isMention). */
  mentioned?: boolean;
  /** Tipe chat mtcute: 'private' | 'group' | 'supergroup' | 'channel' | 'bot'. */
  chatType?: string;
  /**
   * Aksi service message (join/leave/dll). mtcute memakai `type` bergaya
   * snake_case; `className` hanya ada pada klien mock legacy.
   */
  action?: ({ type?: string; className?: string } & Record<string, unknown>) | null;
  message?: string;
  // Adapter mtcute selalu mengisinya dengan ID numerik, bukan objek peer.
  peerId?: string | number | bigint;
  chatId?: string | number | bigint;
  id?: number;
  replyToMsgId?: number;
  senderId?: string | number | bigint;
  date?: number;
  isPrivate?: boolean;
  isGroup?: boolean;
  isChannel?: boolean;
  replyTo?: {
    replyToMsgId?: number;
    replyToTopId?: number;
    [key: string]: unknown;
  };
  entities?: Array<{
    className?: string;
    documentId?: string | number | bigint;
    offset?: number;
    length?: number;
  }>;
  document?: {
    mimeType?: string;
    [key: string]: unknown;
  };
  /**
   * Penanda jenis media gaya lama (GramJS). Di mtcute informasi ini ada pada
   * `media.type`, jadi adapter yang menurunkannya agar plugin lama tetap jalan.
   */
  sticker?: unknown;
  photo?: unknown;
  video?: unknown;
  videoNote?: unknown;
  voice?: unknown;
  audio?: unknown;
  gif?: unknown;
  groupedId?: string | number | bigint;
  file?: {
    name?: string;
  };
  media?: {
    document?: {
      id?: string | number | bigint;
      mimeType?: string;
      attributes?: Array<{
        className?: string;
        alt?: string;
      }>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  getReplyMessage: () => Promise<UserbotMessageLike | null>;
  getSender: () => Promise<UserbotEntityLike | null>;
  getChat: () => Promise<UserbotEntityLike | null>;
  copy: (entity: EntityLike) => Promise<unknown>;
  downloadMedia: () => Promise<Buffer | string | undefined>;
  edit: (options: MessageEditOptions) => Promise<unknown>;
  delete: (options?: Record<string, unknown>) => Promise<unknown>;
  reply?: (options: { text?: string; message?: string; parseMode?: string } & Record<string, unknown>) => Promise<unknown>;
}
