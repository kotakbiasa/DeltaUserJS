/**
 * Keyboard loop user, tombol kembali, dan pewarnaan tombol payload.
 *
 * Dipecah dari dashboard/keyboards.ts (575 baris). Isi tiap fungsi
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import type { BotContext } from '../../../../context.js';
import { getSchedules } from '../../../../../infrastructure/database.js';
import { LOOPS_PER_PAGE } from '.././shared.js';

import { restrictedEmojiMap } from '../../../../../utils/restrictedEmojiMap.js';

export type DashboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  style?: 'primary' | 'success' | 'danger';
  icon_custom_emoji_id?: string;
};
export type DashboardButtonRows = DashboardButton[][];

export const BUTTON_CUSTOM_EMOJI_MAP: Record<string, string> = {
  // Override / Verified Khusus yang diprioritaskan
  '🤖': '5372981976804366741', // Robot Premium
  '📊': '5431577498364158238', // Chart Premium
  '👑': '5467406098367521267', // Crown Premium
  '💰': '5375296873982604963', // Money Premium
  '❓': '5467666648263564704', // Question / Help dari restrictedEmojiMap

  // Navigation
  '🔙': '6206505206197261313',
  '⬅️': '6206505206197261313',
  '⬅': '6206505206197261313',
  '➡️': '5875506366050734240',
  '➡': '5875506366050734240',
  '◀️': '5983279327574233274',
  '◀': '5983279327574233274',
  '▶️': '5875506366050734240',
  '▶': '5875506366050734240',
  '🚀': '5445284980978621387',
  '🧩': '5814426016931647060', // RestrictedEmoji: Puzzle
  '⚙️': '5875033614705495771', // RestrictedEmoji: Settings/Control Knobs
  '⚙': '5875033614705495771',
  '🩺': '5359299744302639114', // RestrictedEmoji: Stethoscope Diagnostics
  '📜': '5897517150024766102', // RestrictedEmoji: Scroll/Cheatsheet
  '💡': '5472146462362048818', // RestrictedEmoji: Lightbulb
  '🛡️': '5789716881099199246', // TgPremiumIcons: Security/Shield
  '🛡': '5789716881099199246',
  '👥': '5371073319107827779', // RestrictedEmoji: Users/Group
  '📦': '5449428597922079323', // RestrictedEmoji: Toolbox / Package
  '📱': '5407025283456835913', // RestrictedEmoji: Phone
  '💾': '5897942815643537848', // TgPremiumIcons: Disk/Backup
  '📢': '5789559036756104168', // TgPremiumIcons: Broadcast/Megaphone
  '📄': '5897517150024766102', // RestrictedEmoji: Document
  '🔍': '5445284980978621387', // Search
  '⏰': '5413704112220949842', // RestrictedEmoji: Clock/Timer
  '⏳': '5451732530048802485', // RestrictedEmoji: Hourglass

  // Controls & Actions
  '🔌': '5789716881099199246', // TgPremiumIcons: Power/Unplug
  '⚡': '5789716881099199246', // TgPremiumIcons: Power/Lightning
  '🗑️': '5465665476971471368', // RestrictedEmoji: Trash/Delete
  '🗑': '5465665476971471368',
  '🏷️': '5895542564580234154', // TgPremiumIcons: Tag/Label
  '🏷': '5895542564580234154',
  '💬': '5789724345752358924', // TgPremiumIcons: Chat/Prefix
  '📝': '5897517150024766102', // TgPremiumIcons: Note/AFK
  '🚫': '5465665476971471368', // RestrictedEmoji: Ban/Anti-PM
  '🔑': '5983458930221650762', // TgPremiumIcons: Key/Lock
  '🔒': '5983458930221650762', // TgPremiumIcons: Lock
  '📩': '5897517150024766102', // TgPremiumIcons: Request/Mail
  '➕': '5427009714745517609', // RestrictedEmoji: Add/Plus
  '🔹': '5848259999763011021', // TgPremiumIcons: Diamond/Star
  '⭐': '5848259999763011021', // TgPremiumIcons: Star
  '✨': '5848021027782661221', // TgPremiumIcons: Sparkles
  '📡': '6176750364260305527', // Status Animated: Satellite/Ping
  '🆘': '6301027265899661025', // Status Animated: SOS
  '⚖️': '5400250414929041085', // Finance: Scales
  '⚖': '5400250414929041085',
  '✅': '5427009714745517609', // RestrictedEmoji: Check
  '❌': '5465665476971471368', // RestrictedEmoji: Cross
  '🟢': '5427009714745517609', // RestrictedEmoji: Active
  '🔴': '5465665476971471368', // RestrictedEmoji: Inactive
  '🟡': '5848259999763011021', // TgPremiumIcons: Idle
  '🔵': '6256052494384760637', // Video Status: Blue
  '🛑': '5465665476971471368', // Stop / Danger Red
  '⏹️': '5465665476971471368', // Stop Square Red
  '⏹': '5465665476971471368',
  '🛠️': '5445284980978621387', // Tools / Utility
  '🛠': '5445284980978621387',
  '🎨': '5431456208487716895', // Artist / Tools Palette
  'ℹ️': '5467666648263564704', // Info / Help Question
  'ℹ': '5467666648263564704',
  '⚠️': '5467890025217661107', // Warning
  '🚨': '5467928559664242360', // Siren / Alert
  '🔘': '5427009714745517609', // Radio button active
};

export function keyboardUserLoops(ctx: BotContext, page = 1) {
  const telegramId = ctx.from.id;
  const allSchedules = getSchedules(telegramId);
  const loops = allSchedules.filter((s: { type?: string }) => s.type === 'loop');
  const totalPages = Math.max(1, Math.ceil(loops.length / LOOPS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);

  const rows: DashboardButtonRows = [];
  rows.push([
    { text: '➕ Tambah Jadwal Loop', callback_data: 'rich:add_loop', style: 'primary' },
  ]);

  if (totalPages > 1) {
    const nav: DashboardButton[] = [];
    if (currentPage > 1) {
      nav.push({ text: '⬅️ Prev', callback_data: `rich:user_loops:${currentPage - 1}` });
    }
    nav.push({ text: `${currentPage}/${totalPages}`, callback_data: 'rich:noop' });
    if (currentPage < totalPages) {
      nav.push({ text: 'Next ➡️', callback_data: `rich:user_loops:${currentPage + 1}` });
    }
    rows.push(nav);
  }

  rows.push([
    { text: '🔄 Refresh', callback_data: `rich:user_loops:${currentPage}` },
    { text: '🤖 Dashboard Userbot', callback_data: 'rich:ubot' },
  ]);

  return { inline_keyboard: rows };
}

export function keyboardBack(target = 'main') {
  return { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: `rich:${target}` }]] };
}

interface RawButton {
  text?: string;
  callback_data?: string;
  url?: string;
  style?: 'primary' | 'success' | 'danger';
  icon_custom_emoji_id?: string;
  [key: string]: unknown;
}

export function applyButtonStylesToPayload(payload: unknown) {
  const keyboard = (payload as { reply_markup?: { inline_keyboard?: unknown } } | undefined)
    ?.reply_markup?.inline_keyboard;
  if (!Array.isArray(keyboard)) {return;}

  for (const row of keyboard) {
    if (!Array.isArray(row)) {continue;}
    for (const btn of row) {
      if (!btn || typeof btn !== 'object') {continue;}
      const button = btn as RawButton;
      if (typeof button.text !== 'string') {continue;}

      // 1. Semantic button style (danger / primary) if not explicitly set
      if (!button.style && button.callback_data) {
        const cb = button.callback_data;
        if (cb.includes('danger') || cb.includes('delete') || cb.includes('del_session')) {
          button.style = 'danger';
        } else if (cb === 'rich:ubot' || cb === 'rich:register' || cb === 'rich:add_loop') {
          button.style = 'primary';
        }
      }

      // 2. Button custom emoji icon: pasang icon_custom_emoji_id dan bersihkan emoji unicode teks agar tidak dobel
      if (!button.icon_custom_emoji_id) {
        const trimmed = button.text.trim();
        // Cek dulu di override map khusus
        let foundEmoji = '';
        let foundId = '';

        for (const [emoji, emojiId] of Object.entries(BUTTON_CUSTOM_EMOJI_MAP)) {
          if (trimmed.startsWith(emoji)) {
            foundEmoji = emoji;
            foundId = emojiId;
            break;
          }
        }

        // Jika tidak ada di override map, cek langsung ke 1000+ restrictedEmojiMap
        if (!foundId) {
          for (const [emoji, emojiId] of Object.entries(restrictedEmojiMap)) {
            if (trimmed.startsWith(emoji)) {
              foundEmoji = emoji;
              foundId = emojiId;
              break;
            }
          }
        }

        if (foundId && foundEmoji) {
          button.icon_custom_emoji_id = String(foundId);
          const remainder = trimmed.slice(foundEmoji.length).trim();
          if (remainder.length > 0) {
            button.text = remainder;
          } else if (foundEmoji === '⬅️' || foundEmoji === '⬅' || foundEmoji === '◀️' || foundEmoji === '◀') {
            button.text = 'Prev';
          } else if (foundEmoji === '➡️' || foundEmoji === '➡' || foundEmoji === '▶️' || foundEmoji === '▶') {
            button.text = 'Next';
          }
        }
      }
    }
  }
}

export function stripButtonCustomEmoji(payload: unknown) {
  const keyboard = (payload as { reply_markup?: { inline_keyboard?: unknown } } | undefined)
    ?.reply_markup?.inline_keyboard;
  if (!Array.isArray(keyboard)) {return;}
  for (const row of keyboard) {
    if (!Array.isArray(row)) {continue;}
    for (const btn of row) {
      if (!btn || typeof btn !== 'object') {continue;}
      const button = btn as RawButton;
      delete button.icon_custom_emoji_id;
      delete button.style;
    }
  }
}

