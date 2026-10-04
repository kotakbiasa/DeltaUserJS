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
  message?: string;
  peerId?: EntityLike;
  chatId?: EntityLike;
  id?: number;
  replyToMsgId?: number;
  senderId?: EntityLike;
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
  };
  file?: {
    name?: string;
  };
  media?: {
    document?: {
      id?: string | number | bigint;
      attributes?: Array<{
        className?: string;
        alt?: string;
      }>;
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
  reply?: (options: any) => Promise<unknown>;
}
