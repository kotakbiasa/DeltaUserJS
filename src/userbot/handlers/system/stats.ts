import { helpRegistry } from '../../engine/pluginRegistry.js';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { formatUptimeStats, formatBytes } from '../../../utils/format.js';

export default {
  name: 'stats',
  help: {
    title: 'Statistics (.stats)',
    description: 'Menampilkan statistik dan informasi sistem ubot.',
    usage: 'Ketik `.stats`',
    detail: 'Menampilkan detail versi NodeJS, grammY, Teleproto, serta penggunaan RAM dan Uptime.'
  },
  async execute(client, message, settings, telegramId) {
    if (message.out && message.message && message.message.toLowerCase() === '.stats') {
      try {
        const plugins = Object.keys(helpRegistry);
        const pluginCount = plugins.length;
        const memUsage = process.memoryUsage();
        const rssMB = Math.round(memUsage.rss / 1024 / 1024);
        const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        
        const uptimeStr = formatUptimeStats(Math.round(process.uptime()));

        // Ambil versi package dari package.json
        let grammyVer = 'N/A';
        let teleprotoVer = 'N/A';
        try {
           const pkgPath = path.join(process.cwd(), 'package.json');
           const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
           grammyVer = (pkg.dependencies['grammy'] || 'N/A').replace(/^[\^~>=]+/, '');
           teleprotoVer = (pkg.dependencies['teleproto'] || 'N/A').replace(/^[\^~>=]+/, '');
        } catch (e) {}

        const text = `📊 <b>USERBOT STATS</b>\n\n` +
          `<blockquote>` +
          `🤖 <b>Modul Aktif:</b> <code>${pluginCount}</code>\n` +
          `⏳ <b>Uptime:</b> <code>${uptimeStr}</code>\n` +
          `💾 <b>RAM:</b> <code>${rssMB} MB</code> (Heap: <code>${heapMB} MB</code>)\n` +
          `🌐 <b>Node.js:</b> <code>${process.version}</code>\n` +
          `📦 <b>grammY:</b> <code>v${grammyVer}</code>\n` +
          `📦 <b>Teleproto:</b> <code>v${teleprotoVer}</code>\n` +
          `💻 <b>OS:</b> <code>${os.type()} ${os.release()} (${os.arch()})</code>` +
          `</blockquote>`;

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
