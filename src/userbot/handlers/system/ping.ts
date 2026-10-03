import { formatUptime } from '../../../utils/format.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import { getCustomEmoji } from '../../../utils/customEmoji.js';

export default {
  name: 'ping',
  help: {
    title: 'Utility (.ping)',
    description: 'Menguji respon dan keaktifan userbot Anda.',
    usage: 'Ketik `.ping` di chat mana pun.',
    detail: 'Userbot akan mengedit pesan `.ping` Anda secara instan menjadi *Pong!* untuk mengonfirmasi bahwa ubot terhubung ke server dengan stabil.'
  },
  async execute(client, message, settings, telegramId) {
    if (message.out && message.message && message.message.toLowerCase() === '.ping') {
      try {
        const pingEmoji = getCustomEmoji(settings, 'ping');
        const startMs = Date.now();
        await message.edit({
          text: `<b>${pingEmoji} PONG!</b>\n<blockquote>⏱️ Mengukur latensi...</blockquote>`,
          parseMode: 'html'
        });

        // Menghitung One-Way Latency
        const rawLatency = Date.now() - startMs;

        const uptimeTotal = process.uptime();
        const uptimeStr = formatUptime(uptimeTotal);

        const pongEmoji = getCustomEmoji(settings, 'pong');
        const speedEmoji = getCustomEmoji(settings, 'speed');
        const uptimeEmoji = getCustomEmoji(settings, 'uptime');
        const statusEmoji = getCustomEmoji(settings, 'status');

        const newDesign = `${pongEmoji} <b>PING！</b>\n` +
          `<blockquote>` +
          `${speedEmoji} <b>Speed</b> : <code>${escapeHtml(String(rawLatency))} ms</code>\n` +
          `${uptimeEmoji} <b>Uptime</b> : <code>${escapeHtml(uptimeStr)}</code>\n` +
          `${statusEmoji} <b>Status</b> : <code>Online</code></blockquote>`;

        await message.edit({
          text: newDesign,
          parseMode: 'html'
        });
      } catch (err) {
        Logger.logUser(telegramId, `Error in ping plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      }
    }
  }
};
