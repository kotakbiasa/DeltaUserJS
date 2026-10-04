import { getCustomEmoji, parseTgEmojiTemplate, escapeHtmlPreservingTgEmoji } from '../../../utils/customEmoji.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';

// State AFK per telegramId: { reason, since }
const afkStore = new Map();

export function isAfk(telegramId: number) {
  return afkStore.has(Number(telegramId));
}

export function getAfkInfo(telegramId: number) {
  return afkStore.get(Number(telegramId)) || null;
}

export default {
  name: 'afk',
  version: '1.0.0',
  description: 'Mode AFK: auto-reply saat kamu ditandai/di-reply.',
  help: {
    title: 'AFK Mode (.afk / .unafk)',
    description: 'Menandai akun sedang Away From Keyboard. Mendukung emoji premium pada alasan AFK. Saat ada yang me-reply/tag kamu, bot membalas otomatis.',
    usage: '• `.afk <alasan>` — aktifkan (bisa gunakan emoji premium / {emoji:id})\n• `.unafk` — matikan',
    detail: 'Saat AFK aktif dan seseorang me-reply pesanmu atau menyebut @username kamu, bot membalas dengan alasan AFK dan lama waktu.'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, settings: UserbotSettings, telegramId: number) {
    const idNum = Number(telegramId);
    const afkEmoji = getCustomEmoji(settings, 'afk', '😴');

    // ===== 1. Pesan keluar: kontrol .afk / .unafk =====
    if (message.out && message.message) {
      const afkMatch = message.message.match(/^\.afk(?:\s+([\s\S]+))?$/i);
      if (afkMatch) {
        const rawReason = (afkMatch[1] || 'Tanpa alasan').trim();
        const reason = parseTgEmojiTemplate(rawReason);
        afkStore.set(idNum, { reason, since: Date.now() });
        const safeReason = escapeHtmlPreservingTgEmoji(reason);
        await message.edit({
          text: `<blockquote>${afkEmoji} <b>AFK Aktif</b>\n\nAlasan: <i>${safeReason}</i>\nKetik <code>.unafk</code> saat kembali.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }

      if (message.message.trim().toLowerCase() === '.unafk') {
        if (!afkStore.has(idNum)) {
          await message.edit({
            text: `<blockquote>ℹ️ Kamu memang tidak sedang AFK.</blockquote>`,
            parseMode: 'html'
          });
          return;
        }
        const info = afkStore.get(idNum);
        afkStore.delete(idNum);
        const mins = Math.floor((Date.now() - info.since) / 60000);
        const durasi = mins >= 60 ? `${Math.floor(mins / 60)} jam ${mins % 60} menit` : `${mins} menit`;
        await message.edit({
          text: `<blockquote>👋 <b>Selamat datang kembali!</b>\n\nKamu AFK selama <b>${durasi}</b>.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }
    }

    // ===== 2. Pesan masuk: auto-reply jika ditag/direply saat AFK =====
    if (!message.out && afkStore.has(idNum)) {
      const info = afkStore.get(idNum);
      const isMentioned = Boolean(message.mentioned);
      let isReplyToMe = false;

      if (message.replyTo) {
        try {
          const repliedMsg = await message.getReplyMessage();
          if (repliedMsg && Number(repliedMsg.senderId) === idNum) {
            isReplyToMe = true;
          }
        } catch (_e) { /* ignore */ }
      }

      if (isMentioned || isReplyToMe) {
        const mins = Math.floor((Date.now() - info.since) / 60000);
        const durasi = mins >= 60 ? `${Math.floor(mins / 60)} jam ${mins % 60} menit` : `${mins} menit`;
        const safeReason = escapeHtmlPreservingTgEmoji(info.reason);
        try {
          await message.reply?.({
            message: `<blockquote>${afkEmoji} <b>Owner sedang AFK</b>\n\nAlasan: <i>${safeReason}</i>\nSejak: <b>${durasi}</b> yang lalu.</blockquote>`,
            parseMode: 'html'
          });
        } catch (_e) { /* ignore reply errors */ }
      }
    }
  }
};
