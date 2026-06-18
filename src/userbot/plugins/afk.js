import { updateUserbotFeature } from '../../database/db.js';
import { block, escapeHtml, footer } from '../ui.js';

const afkSince = new Map();
const lastReply = new Map();
const COOLDOWN_MS = 30_000;

function durationText(start) {
  const mins = Math.round((Date.now() - start) / 60000);
  if (mins <= 0) return 'kurang dari 1 menit';
  if (mins < 60) return `${mins} menit`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} jam${m ? ` ${m} menit` : ''}`;
}

export default {
  name: 'afk',
  help: {
    title: 'AFK Auto Reply',
    description: 'Membalas PM/mention otomatis saat Anda sedang AFK.',
    usage: '`.afk [alasan]` lalu kirim pesan apa pun untuk menonaktifkan.',
    detail: 'Saat aktif, PM akan dibaca otomatis dan dibalas dengan alasan AFK. Ada cooldown agar tidak spam.'
  },
  async execute(client, message, settings, telegramId) {
    const text = String(message.text || '').trim();

    if (message.isOutgoing) {
      if (text.toLowerCase() === '.afk' || text.toLowerCase().startsWith('.afk ')) {
        const reason = text.split(' ').slice(1).join(' ').trim() || 'Saya sedang AFK. Harap tunggu sebentar.';
        updateUserbotFeature(telegramId, 'auto_reply', 1);
        updateUserbotFeature(telegramId, 'afk_reason', reason);
        afkSince.set(telegramId, Date.now());
        await message.edit({
          text: block('AFK aktif', `<pre>Alasan      ${escapeHtml(reason)}</pre>`) + footer(settings),
          parseMode: 'html',
        });
        return;
      }

      if (settings.auto_reply === 1) {
        updateUserbotFeature(telegramId, 'auto_reply', 0);
        const since = afkSince.get(telegramId) || Date.now();
        afkSince.delete(telegramId);
        await message.reply({
          message: block('AFK nonaktif', `Anda kembali online setelah ${escapeHtml(durationText(since))}.`) + footer(settings),
          parseMode: 'html',
        });
      }
      return;
    }

    if (settings.auto_reply !== 1) return;

    const senderId = Number(message.sender.id);
    const sender = await message.getSender();
    if (sender?.bot || senderId === 777000) return;

    const shouldReply = message.isPrivate || message.mentioned;
    if (!shouldReply) return;

    const key = `${telegramId}:${senderId}`;
    const now = Date.now();
    if (now - (lastReply.get(key) || 0) < COOLDOWN_MS) {
      if (message.isPrivate) {
        try { await client.markAsRead(message.chat.id); } catch (_) {}
      }
      return;
    }

    if (lastReply.size > 1000) lastReply.clear();
    lastReply.set(key, now);

    if (message.isPrivate) {
      try { await client.markAsRead(message.chat.id); } catch (_) {}
    }

    const since = afkSince.get(telegramId) || Date.now();
    await message.reply({
      message: block(`Auto Reply`, `<pre>Status      AFK\nSejak       ${escapeHtml(durationText(since))}\nAlasan      ${escapeHtml(settings.afk_reason || 'Sedang AFK')}</pre>`) + '\nPesan Anda sudah dibaca otomatis.',
      parseMode: 'html',
    });
  },
};
