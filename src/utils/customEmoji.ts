import { escapeHtml } from './richMessage.js';
import { getUserbotSession } from '../infrastructure/database.js';

export const DEFAULT_EMOJIS: Record<string, string> = {
  ping: '🏓',
  pong: '🏓',
  proses: '⏳',
  loading: '⏳',
  done: '✅',
  success: '✅',
  batal: '❌',
  error: '❌',
  warn: '⚠️',
  uptime: '⏱️',
  speed: '🚀',
  status: '🛡️',
  item: '📦',
  time: '🕒',
  afk: '😴'
};

const EMOJI_ALIASES: Record<string, string[]> = {
  proses: ['loading'],
  loading: ['proses'],
  done: ['success'],
  success: ['done'],
  batal: ['error'],
  error: ['batal'],
  pong: ['ping']
};

/**
 * Format a Telegram custom emoji tag.
 */
export function formatTgEmoji(documentId: string | number | bigint, fallbackChar = '⭐'): string {
  const cleanId = String(documentId).trim();
  const safeChar = escapeHtml(fallbackChar || '⭐');
  return `<tg-emoji emoji-id="${cleanId}">${safeChar}</tg-emoji>`;
}

/**
 * Escape HTML in text while safely preserving valid <tg-emoji emoji-id="...">...</tg-emoji> tags.
 */
export function escapeHtmlPreservingTgEmoji(text: string): string {
  if (!text) {return '';}
  const placeholders: { id: string; char: string }[] = [];
  const tokenized = String(text).replace(/<tg-emoji\s+emoji-id=["'](\d+)["']>([^<]*)<\/tg-emoji>/gi, (_match, id, char) => {
    const idx = placeholders.length;
    placeholders.push({ id, char: escapeHtml(char) });
    return `__TG_EMOJI_HOLD_${idx}__`;
  });

  let escaped = escapeHtml(tokenized);
  placeholders.forEach((item, idx) => {
    escaped = escaped.replace(`__TG_EMOJI_HOLD_${idx}__`, `<tg-emoji emoji-id="${item.id}">${item.char}</tg-emoji>`);
  });

  return escaped;
}

/**
 * Parse template tags like {emoji:123456789} or {emoji:123456789:🔥} into <tg-emoji emoji-id="...">...</tg-emoji>.
 */
export function parseTgEmojiTemplate(text: string): string {
  if (!text) {return '';}
  return String(text).replace(/\{emoji:(\d+)(?::([^}]+))?\}/gi, (_match, id, char) => {
    const fallbackChar = char ? char.trim() : '⭐';
    return formatTgEmoji(id, fallbackChar);
  });
}

/**
 * Resolve settings object from either telegramId (number/string) or existing session object.
 */
function resolveSession(settingsOrTelegramId: unknown): Record<string, any> | null {
  if (!settingsOrTelegramId) {return null;}
  if (typeof settingsOrTelegramId === 'number' || typeof settingsOrTelegramId === 'string') {
    const id = Number(settingsOrTelegramId);
    if (!Number.isFinite(id) || id <= 0) {return null;}
    return getUserbotSession(id) || null;
  }
  if (typeof settingsOrTelegramId === 'object' && settingsOrTelegramId !== null) {
    return settingsOrTelegramId as Record<string, any>;
  }
  return null;
}

/**
 * Get active custom emoji or fallback for a specific key (e.g. 'ping', 'proses', 'done', 'error').
 */
export function getCustomEmoji(settingsOrTelegramId: unknown, key: string, fallback?: string): string {
  const normKey = String(key || '').toLowerCase().trim();
  const session = resolveSession(settingsOrTelegramId);
  const customMap = session?.custom_emojis || {};

  // 1. Direct key in custom_emojis
  if (customMap[normKey]) {
    return String(customMap[normKey]);
  }

  // 2. Alias fallback in custom_emojis
  const aliases = EMOJI_ALIASES[normKey] || [];
  for (const alias of aliases) {
    if (customMap[alias]) {
      return String(customMap[alias]);
    }
  }

  // 3. User vars check (e.g. EMOJI_PING or EMOJI_PROSES)
  const varKey = `EMOJI_${normKey.toUpperCase()}`;
  if (session?.vars?.[varKey]) {
    return String(session.vars[varKey]);
  }

  // 4. Fallback provided or default
  if (fallback !== undefined) {
    return fallback;
  }

  return DEFAULT_EMOJIS[normKey] || '⭐';
}

/**
 * Get a complete overview of all configured emojis for a userbot.
 */
export function getAllEmojis(settingsOrTelegramId: unknown): Record<string, { value: string; isCustom: boolean; default: string }> {
  const session = resolveSession(settingsOrTelegramId);
  const customMap = session?.custom_emojis || {};
  const result: Record<string, { value: string; isCustom: boolean; default: string }> = {};

  for (const [key, defVal] of Object.entries(DEFAULT_EMOJIS)) {
    const hasCustom = Boolean(customMap[key]);
    const val = getCustomEmoji(session, key);
    result[key] = {
      value: val,
      isCustom: hasCustom,
      default: defVal
    };
  }

  return result;
}

/**
 * Extracted emoji payload.
 */
export interface ExtractedEmoji {
  documentId?: string;
  char?: string;
  tag: string;
  isCustomEmoji: boolean;
}

/**
 * Extract custom or standard emoji from command arguments, message entities, or a replied message.
 */
export function extractEmojiFromContext(arg: string | undefined, message: any, replyMessage?: any): ExtractedEmoji | null {
  const cleanArg = (arg || '').trim();

  // 1. Check if argument contains explicit <tg-emoji emoji-id="...">...</tg-emoji> tag
  const tagMatch = cleanArg.match(/<tg-emoji\s+emoji-id=["'](\d+)["']>([^<]*)<\/tg-emoji>/i);
  if (tagMatch) {
    const documentId = tagMatch[1];
    const char = tagMatch[2] || '⭐';
    return {
      documentId,
      char,
      tag: `<tg-emoji emoji-id="${documentId}">${char}</tg-emoji>`,
      isCustomEmoji: true
    };
  }

  // 2. Check if argument contains shortcode {emoji:123456789:🔥} or {emoji:123456789}
  const shortcodeMatch = cleanArg.match(/\{emoji:(\d+)(?::([^}]+))?\}/i);
  if (shortcodeMatch) {
    const documentId = shortcodeMatch[1];
    const char = shortcodeMatch[2] ? shortcodeMatch[2].trim() : '⭐';
    return {
      documentId,
      char,
      tag: `<tg-emoji emoji-id="${documentId}">${char}</tg-emoji>`,
      isCustomEmoji: true
    };
  }

  // 3. Check if argument is pure numeric document ID
  if (/^\d{10,25}$/.test(cleanArg)) {
    return {
      documentId: cleanArg,
      char: '⭐',
      tag: `<tg-emoji emoji-id="${cleanArg}">⭐</tg-emoji>`,
      isCustomEmoji: true
    };
  }

  // 4. Check message entities for MessageEntityCustomEmoji in the current message
  if (message?.entities && Array.isArray(message.entities)) {
    const customEntity = message.entities.find((e: any) => e.className === 'MessageEntityCustomEmoji');
    if (customEntity && customEntity.documentId) {
      const docId = customEntity.documentId.toString();
      const rawText = String(message.message || '');
      const char = rawText.slice(customEntity.offset, customEntity.offset + customEntity.length) || '⭐';
      return {
        documentId: docId,
        char,
        tag: `<tg-emoji emoji-id="${docId}">${char}</tg-emoji>`,
        isCustomEmoji: true
      };
    }
  }

  // 5. Check replied message entities or sticker attributes if present
  if (replyMessage) {
    // 5a. Custom emoji entity in replied message
    if (replyMessage.entities && Array.isArray(replyMessage.entities)) {
      const customEntity = replyMessage.entities.find((e: any) => e.className === 'MessageEntityCustomEmoji');
      if (customEntity && customEntity.documentId) {
        const docId = customEntity.documentId.toString();
        const rawText = String(replyMessage.message || '');
        const char = rawText.slice(customEntity.offset, customEntity.offset + customEntity.length) || '⭐';
        return {
          documentId: docId,
          char,
          tag: `<tg-emoji emoji-id="${docId}">${char}</tg-emoji>`,
          isCustomEmoji: true
        };
      }
    }

    // 5b. Replied sticker/document with DocumentAttributeCustomEmoji
    const media = replyMessage.media;
    const document = media?.document;
    if (document) {
      const hasCustomAttr = document.attributes?.some((a: any) => a.className === 'DocumentAttributeCustomEmoji');
      if (hasCustomAttr && document.id) {
        const docId = document.id.toString();
        // find alt char from DocumentAttributeSticker if available
        const stickerAttr = document.attributes.find((a: any) => a.className === 'DocumentAttributeSticker');
        const altChar = stickerAttr?.alt || '⭐';
        return {
          documentId: docId,
          char: altChar,
          tag: `<tg-emoji emoji-id="${docId}">${altChar}</tg-emoji>`,
          isCustomEmoji: true
        };
      }
    }
  }

  // 6. Unicode emoji / plain text provided in argument
  if (cleanArg) {
    return {
      char: cleanArg,
      tag: cleanArg,
      isCustomEmoji: false
    };
  }

  return null;
}
