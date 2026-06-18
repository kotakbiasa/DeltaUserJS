import { getChatSettings } from '../../database/db.js';
import { block, footer } from '../ui.js';

function formatUptime(seconds) {
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor((seconds / 3600) % 24);
  const d = Math.floor(seconds / 86400);
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

export default {
  name: 'ping',
  help: {
    title: 'Utility (.ping)',
    description: 'Menguji respon dan keaktifan userbot Anda.',
    usage: 'Ketik `.ping` di chat mana pun.',
    detail: 'Userbot mengedit pesan menjadi ringkasan latency dan uptime runtime.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.isOutgoing || !message.text) return;

    const key = String(message.chat.id || message.chat.id || '');
    const chatConfig = getChatSettings(telegramId, key);
    const prefix = chatConfig.prefix || '.';

    const text = message.text.trim().toLowerCase();
    if (text !== `${prefix}ping`) return;

    const start = Date.now();
    await message.edit({ text: block('Pong', 'Mengukur latency...') + footer(settings), parseMode: 'html' });
    const latency = Date.now() - start;

    await message.edit({
      text: block('Pong', `Latency: ${latency} ms\nUptime: ${formatUptime(process.uptime())}`) + footer(settings),
      parseMode: 'html',
    });
  },
};
