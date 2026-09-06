import { escapeHtml } from '../../../utils/richMessage.js';

// State AFK per telegramId: { reason, since }
const afkStore = new Map();

export function isAfk(telegramId) {
  return afkStore.has(Number(telegramId));
}

export function getAfkInfo(telegramId) {
  return afkStore.get(Number(telegramId)) || null;
}

export default {
  name: 'afk',
  version: '1.0.0',
  description: 'Mode AFK: auto-reply saat kamu ditandai/di-reply.',
  help: {
    title: 'AFK Mode (.afk / .unafk)',
    description: 'Menandai akun sedang Away From Keyboard. Saat ada yang me-reply/tag kamu, bot membalas otomatis.',
    usage: '• `.afk <alasan>` — aktifkan\n• `.unafk` — matikan',
    detail: 'Saat AFK aktif dan seseorang me-reply pesanmu atau menyebut @username kamu, bot membalas dengan alasan AFK dan lama waktu.'
  },
  async execute(client, message, _settings, telegramId) {
    if (!message.out || !message.message) {return;}

    const afkMatch = message.message.match(/^\.afk(?:\s+([\s\S]+))?$/i);
    if (afkMatch) {
      const reason = (afkMatch[1] || 'Tanpa alasan').trim();
      afkStore.set(Number(telegramId), { reason, since: Date.now() });
      await message.edit({
        text: `<blockquote>😴 <b>AFK Aktif</b>\n\nAlasan: <i>${escapeHtml(reason)}</i>\nKetik <code>.unafk</code> saat kembali.</blockquote>`,
        parseMode: 'html'
      });
      return;
    }

    if (message.message.trim().toLowerCase() === '.unafk') {
      if (!afkStore.has(Number(telegramId))) {
        await message.edit({
          text: `<blockquote>ℹ️ Kamu memang tidak sedang AFK.</blockquote>`,
          parseMode: 'html'
        });
        return;
      }
      const info = afkStore.get(Number(telegramId));
      afkStore.delete(Number(telegramId));
      const mins = Math.floor((Date.now() - info.since) / 60000);
      const durasi = mins >= 60 ? `${Math.floor(mins / 60)} jam ${mins % 60} menit` : `${mins} menit`;
      await message.edit({
        text: `<blockquote>👋 <b>Selamat datang kembali!</b>\n\nKamu AFK selama <b>${durasi}</b>.</blockquote>`,
        parseMode: 'html'
      });
    }
  }
};
