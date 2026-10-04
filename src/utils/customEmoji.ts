import { escapeHtml } from './richMessage.js';
import { getUserbotSession } from '../infrastructure/database.js';

// Default animated emoji pack: https://t.me/addemoji/RestrictedEmoji
export const RESTRICTED_EMOJI_PACK = 'https://t.me/addemoji/RestrictedEmoji';

export const DEFAULT_EMOJIS: Record<string, string> = {
  ping: '<tg-emoji emoji-id="5269563867305879894">🏓</tg-emoji>',
  pong: '<tg-emoji emoji-id="5269563867305879894">🏓</tg-emoji>',
  proses: '<tg-emoji emoji-id="5451732530048802485">⏳</tg-emoji>',
  loading: '<tg-emoji emoji-id="5451732530048802485">⏳</tg-emoji>',
  done: '<tg-emoji emoji-id="5427009714745517609">✅</tg-emoji>',
  success: '<tg-emoji emoji-id="5427009714745517609">✅</tg-emoji>',
  batal: '<tg-emoji emoji-id="5465665476971471368">❌</tg-emoji>',
  error: '<tg-emoji emoji-id="5465665476971471368">❌</tg-emoji>',
  warn: '<tg-emoji emoji-id="5467928559664242360">❗</tg-emoji>',
  uptime: '<tg-emoji emoji-id="5413704112220949842">⏰</tg-emoji>',
  speed: '<tg-emoji emoji-id="5445284980978621387">🚀</tg-emoji>',
  status: '<tg-emoji emoji-id="5431449001532594346">⚡</tg-emoji>',
  item: '<tg-emoji emoji-id="5199749070830197566">🎁</tg-emoji>',
  time: '<tg-emoji emoji-id="5413704112220949842">⏰</tg-emoji>',
  afk: '<tg-emoji emoji-id="5372923973271034075">😴</tg-emoji>'
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
 * Convert custom emoji tags back to their fallback character.
 *
 * This is used for userbot accounts that are not Telegram Premium. The
 * fallback keeps the message readable instead of sending unsupported HTML
 * custom-emoji entities to Telegram.
 */
export function stripTgEmojiTags(text: string): string {
  if (!text) {return '';}
  return String(text).replace(
    /<tg-emoji\s+emoji-id=["']\d+["']>([^<]*)<\/tg-emoji>/gi,
    '$1'
  );
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
interface EmojiSession {
  custom_emojis?: Record<string, string>;
  vars?: Record<string, unknown>;
}

function resolveSession(settingsOrTelegramId: unknown): EmojiSession | null {
  if (!settingsOrTelegramId) {return null;}
  if (typeof settingsOrTelegramId === 'number' || typeof settingsOrTelegramId === 'string') {
    const id = Number(settingsOrTelegramId);
    if (!Number.isFinite(id) || id <= 0) {return null;}
    return getUserbotSession(id) || null;
  }
  if (typeof settingsOrTelegramId === 'object' && settingsOrTelegramId !== null) {
    return settingsOrTelegramId as EmojiSession;
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

interface EmojiEntity {
  className?: string;
  documentId?: string | number | bigint;
  offset?: number;
  length?: number;
  alt?: string;
}

interface EmojiContextMessage {
  message?: string;
  entities?: EmojiEntity[];
  media?: {
    document?: {
      id?: string | number | bigint;
      attributes?: EmojiEntity[];
    };
  };
}

/**
 * Extract custom or standard emoji from command arguments, message entities, or a replied message.
 */
export function extractEmojiFromContext(arg: string | undefined, message?: EmojiContextMessage, replyMessage?: EmojiContextMessage): ExtractedEmoji | null {
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
    const customEntity = message.entities.find((e) => e.className === 'MessageEntityCustomEmoji');
    if (customEntity && customEntity.documentId) {
      const docId = customEntity.documentId.toString();
      const rawText = String(message.message || '');
      const char = rawText.slice(customEntity.offset || 0, (customEntity.offset || 0) + (customEntity.length || 1)) || '⭐';
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
      const customEntity = replyMessage.entities.find((e) => e.className === 'MessageEntityCustomEmoji');
      if (customEntity && customEntity.documentId) {
        const docId = customEntity.documentId.toString();
        const rawText = String(replyMessage.message || '');
        const char = rawText.slice(customEntity.offset || 0, (customEntity.offset || 0) + (customEntity.length || 1)) || '⭐';
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
      const hasCustomAttr = document.attributes?.some((a) => a.className === 'DocumentAttributeCustomEmoji');
      if (hasCustomAttr && document.id) {
        const docId = document.id.toString();
        // find alt char from DocumentAttributeSticker if available
        const stickerAttr = document.attributes.find((a) => a.className === 'DocumentAttributeSticker');
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

import { restrictedEmojiMap } from './restrictedEmojiMap.js';

const ALIASES: Record<string, string> = {
  // Warnings / Alerts
  '⚠️': '❗',
  '⚠': '❗',
  '🚨': '❗',
  '🛑': '❌',
  '⛔': '❌',
  '🚫': '❌',
  '📛': '❗',

  // Time / Timers / Clocks
  '⏱️': '⏰',
  '⏱': '⏰',
  '🕒': '⏰',
  '⌛': '⏳',

  // System / Settings / Tools
  '⚙️': '🧰',
  '⚙': '🧰',
  '🛠️': '🧰',
  '🛠': '🧰',
  '🔧': '🧰',
  '🔨': '🧰',
  '🏗️': '🧰',
  '🏗': '🧰',

  // Info / Lightbulb / Help
  'ℹ️': '💡',
  'ℹ': '💡',
  '💡': '💡',

  // Speaker / Sound / Notifications
  '📢': '📣',
  '🔊': '🔔',
  '🔇': '🔕',

  // Locks / Keys / Security
  '🔒': '🔐',
  '🔓': '🔐',
  '🛡️': '⚡',
  '🛡': '⚡',

  // Documents / Notes / Lists
  '📋': '📝',
  '🧾': '📝',
  '📄': '📝',
  '📑': '📝',
  '🗂️': '📝',

  // Folders / Storage / Save
  '💾': '📁',
  '🗄️': '📁',
  '🗄': '📁',
  '💿': '💻',

  // Clean / Trash / Delete
  '🗑️': '🧽',
  '🗑': '🧽',
  '🧹': '🧽',

  // Screens / Computers
  '🖥️': '💻',
  '🖥': '💻',

  // Globe / Web
  '🌐': '🌍',

  // Navigation / Target / Pin
  '📌': '🎯',
  '📍': '🎯',

  // Loop / Repeat / Play / Pause
  '🔁': '🔄',
  '▶️': '🚀',
  '▶': '🚀',
  '⏸️': '❌',
  '⏸': '❌',
  '⏹️': '❌',
  '⏹': '❌',
  '⏭️': '🚀',
  '⏭': '🚀',
  '↪️': '🔄',
  '↪': '🔄',

  // Status indicators / Colors
  '🟢': '✅',
  '🔴': '❌',
  '🟡': '⭐',
  '⚪': '🤍',

  // Money / Finance
  '💵': '💸',

  // Badges / Tags / Gifts
  '📦': '🎁',
  '🏷️': '🎫',
  '🏷': '🎫',
  '🔖': '🎫'
};

const allKeys = new Set<string>();
for (const k of Object.keys(restrictedEmojiMap)) {
  allKeys.add(k);
  allKeys.add(k + '\uFE0F');
}
for (const k of Object.keys(ALIASES)) {
  allKeys.add(k);
  const clean = k.replace(/\uFE0F/g, '');
  allKeys.add(clean);
  allKeys.add(clean + '\uFE0F');
}

const allSupportedEmojis = Array.from(allKeys).sort((a, b) => b.length - a.length);
const escapedPatterns = allSupportedEmojis.map(e => e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const emojiRegex = new RegExp(escapedPatterns.join('|'), 'g');

/**
 * Automatically convert all bare standard emojis in text into animated <tg-emoji> from RestrictedEmoji.
 */
export function animateEmojisWithRestrictedPack(html: string): string {
  if (!html || typeof html !== 'string') {return html;}
  const tokens: { id: string; val: string }[] = [];

  // 1. Protect existing <tg-emoji> tags
  let protectedStr = html.replace(/<tg-emoji\s+[^>]*>[\s\S]*?<\/tg-emoji>/gi, m => {
    const id = tokens.length;
    const tokenStr = `___TG_EMOJI_KEEP_${id}___`;
    tokens.push({ id: tokenStr, val: m });
    return tokenStr;
  });

  // 2. Protect <code> and <pre> blocks so code syntax isn't broken
  protectedStr = protectedStr.replace(/<(code|pre)[^>]*>[\s\S]*?<\/\1>/gi, m => {
    const id = tokens.length;
    const tokenStr = `___TG_CODE_HOLD_${id}___`;
    tokens.push({ id: tokenStr, val: m });
    return tokenStr;
  });

  // 3. Protect HTML tags like <a>, <b>, <blockquote>, etc.
  const htmlTags: string[] = [];
  protectedStr = protectedStr.replace(/<[^>]+>/g, m => {
    const id = htmlTags.length;
    htmlTags.push(m);
    return `___HTML_TAG_${id}___`;
  });

  // 4. Replace all bare emojis with animated <tg-emoji> from RestrictedEmoji
  protectedStr = protectedStr.replace(emojiRegex, matched => {
    const clean = matched.replace(/\uFE0F/g, '');
    const target = ALIASES[matched] || ALIASES[clean] || (restrictedEmojiMap[clean] ? clean : (restrictedEmojiMap[matched] ? matched : null));
    if (target && restrictedEmojiMap[target]) {
      return `<tg-emoji emoji-id="${restrictedEmojiMap[target]}">${target}</tg-emoji>`;
    }
    return matched;
  });

  // 5. Restore HTML tags
  htmlTags.forEach((tag, idx) => {
    protectedStr = protectedStr.replace(`___HTML_TAG_${idx}___`, tag);
  });

  // 6. Restore protected code & existing tg-emoji
  tokens.forEach(tok => {
    protectedStr = protectedStr.replace(tok.id, tok.val);
  });

  return protectedStr;
}

/**
 * Apply the animated premium emoji pack to Telegram Bot API payloads.
 *
 * Master Bot responses use grammY and therefore do not pass through the
 * userbot's mtcute interceptor. Keep this adapter at the API boundary so
 * direct replies, edits, captions, and rich-message fallbacks all get the
 * same treatment without changing every handler individually.
 */
type BotApiPayload = Record<string, unknown>;

type BotApiTextTarget = BotApiPayload & {
  parse_mode?: unknown;
  text?: unknown;
  caption?: unknown;
};

export function animateBotApiPayload(method: string, payload: BotApiPayload): BotApiPayload {
  if (!payload || typeof payload !== 'object') {return payload;}

  const canUseHtml = (target: BotApiTextTarget) => {
    const parseMode = target.parse_mode;
    return parseMode === undefined || parseMode === null || String(parseMode).toUpperCase() === 'HTML';
  };

  const transformField = (target: BotApiTextTarget, field: 'text' | 'caption') => {
    const value = target[field];
    if (typeof value !== 'string' || !canUseHtml(target)) {return;}
    const transformed = animateEmojisWithRestrictedPack(value);
    if (transformed === value) {return;}
    target[field] = transformed;
    if (target.parse_mode === undefined || target.parse_mode === null) {
      target.parse_mode = 'HTML';
    }
  };

  const richMessage = payload.rich_message;
  if (richMessage && typeof richMessage === 'object' && !Array.isArray(richMessage)) {
    const rich = richMessage as BotApiPayload;
    if (typeof rich.html === 'string') {
      rich.html = animateEmojisWithRestrictedPack(rich.html);
    }
  }

  const textMethods = new Set([
    'sendMessage',
    'editMessageText',
    'sendPhoto',
    'sendVideo',
    'sendAnimation',
    'sendAudio',
    'sendDocument',
    'sendVoice',
    'editMessageCaption',
  ]);

  if (textMethods.has(method)) {
    const field = method === 'editMessageCaption' || (method.startsWith('send') && method !== 'sendMessage')
      ? 'caption'
      : 'text';
    transformField(payload, field);
  } else if (method === 'sendMediaGroup' && Array.isArray(payload.media)) {
    for (const item of payload.media) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        transformField(item as BotApiTextTarget, 'caption');
      }
    }
  } else if (method === 'editMessageMedia' && payload.media && typeof payload.media === 'object' && !Array.isArray(payload.media)) {
    transformField(payload.media as BotApiTextTarget, 'caption');
  }

  return payload;
}
