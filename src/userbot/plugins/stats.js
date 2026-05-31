import { helpRegistry } from '../pluginRegistry.js';
import os from 'os';
import fs from 'fs';
import path from 'path';

export default {
  name: 'stats',
  help: {
    title: 'Statistics (.stats)',
    description: 'Menampilkan statistik dan informasi sistem ubot.',
    usage: 'Ketik `.stats`',
    detail: 'Menampilkan detail versi NodeJS, GrammY, GramJS, serta penggunaan RAM dan Uptime.'
  },
  async execute(client, message, settings, telegramId) {
    if (message.out && message.message && message.message.toLowerCase() === '.stats') {
      try {
        const plugins = Object.keys(helpRegistry);
        const pluginCount = plugins.length;
        const memoryMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
        
        const uptimeSeconds = Math.round(process.uptime());
        const days = Math.floor(uptimeSeconds / (3600 * 24));
        const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        const seconds = Math.floor(uptimeSeconds % 60);
        
        let uptimeStr = '';
        if (days > 0) uptimeStr += `${days} hari `;
        if (hours > 0) uptimeStr += `${hours} jam `;
        if (minutes > 0) uptimeStr += `${minutes} menit `;
        uptimeStr += `${seconds} detik`;

        // Ambil versi package dari package.json
        let grammyVer = 'Unknown';
        let gramjsVer = 'Unknown';
        try {
           const pkgPath = path.join(process.cwd(), 'package.json');
           const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
           grammyVer = (pkg.dependencies['grammy'] || 'Unknown').replace(/^[\^~>=]+/, '');
           gramjsVer = (pkg.dependencies['telegram'] || 'Unknown').replace(/^[\^~>=]+/, '');
        } catch (e) {}

        const text = `📊 <b>USERBOT STATS</b>\n\n` +
          `<blockquote>` +
          `🤖 <b>Modul Aktif:</b> <code>${pluginCount}</code>\n` +
          `⏳ <b>Waktu Aktif:</b> <code>${uptimeStr}</code>\n` +
          `💾 <b>Penggunaan RAM:</b> <code>${memoryMB} MB</code>\n` +
          `🌐 <b>Node.js:</b> <code>${process.version}</code>\n` +
          `📦 <b>GrammY:</b> <code>${grammyVer}</code>\n` +
          `📦 <b>GramJS:</b> <code>${gramjsVer}</code>\n` +
          `💻 <b>Sistem OS:</b> <code>${os.platform()} (${os.arch()})</code>\n` +
          `</blockquote>\n\n` +
          `⚡ <i>Userbot</i>`;

        await message.edit({
          text: text,
          parseMode: 'html'
        });
      } catch (err) {
        console.error('Error in stats plugin:', err);
      }
    }
  }
};
