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
        const startMs = Date.now();
        await message.edit({
          text: '<b>🏓 PONG!</b>\n<blockquote>⏱️ Mengukur latensi...</blockquote>',
          parseMode: 'html'
        });
        
        // Menghitung One-Way Latency
        const rawLatency = Date.now() - startMs;
        
        const uptimeTotal = process.uptime();
        const hours = Math.floor(uptimeTotal / 3600);
        const minutes = Math.floor((uptimeTotal % 3600) / 60);
        const seconds = Math.floor(uptimeTotal % 60);
        let uptimeStr = '';
        if (hours > 0) uptimeStr += `${hours}j `;
        if (minutes > 0) uptimeStr += `${minutes}m `;
        uptimeStr += `${seconds}d`;

        const newDesign = `🏓 <b>ＰＯＮＧ！</b>\n` +
                          `──────────────────\n` +
                          `🚀 <b>Speed</b> : <code>${rawLatency} ms</code>\n` +
                          `⏱️ <b>Uptime</b> : <code>${uptimeStr}</code>\n` +
                          `🛡️ <b>Status</b> : <code>Online</code>\n` +
                          `──────────────────\n` +
                          `⚡ <i>Userbot</i>`;
        
        await message.edit({
          text: newDesign,
          parseMode: 'html'
        });
      } catch (err) {
        console.error('Error in ping plugin:', err.message);
      }
    }
  }
};
