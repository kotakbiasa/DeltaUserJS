import { helpRegistry } from '../../engine/pluginRegistry.js';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { formatUptimeStats } from '../../../utils/format.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
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
                }
                catch (_e) { /* ignore */ }
                const text = `<h1>📊 Userbot Stats</h1>` +
                    `<table bordered striped><caption>📋 Detail</caption>` +
                    `<tr><th>Item</th><th>Detail</th></tr>` +
                    `<tr><td>🤖 Modul Aktif</td><td align="center"><code>${escapeHtml(String(pluginCount))}</code></td></tr>` +
                    `<tr><td>⏳ Uptime</td><td align="center"><code>${escapeHtml(uptimeStr)}</code></td></tr>` +
                    `<tr><td>💾 RAM</td><td align="center"><code>${rssMB} MB</code> (Heap: <code>${heapMB} MB</code>)</td></tr>` +
                    `<tr><td>🌐 Node.js</td><td align="center"><code>${escapeHtml(process.version)}</code></td></tr>` +
                    `<tr><td>📦 grammY</td><td align="center"><code>v${escapeHtml(grammyVer)}</code></td></tr>` +
                    `<tr><td>📦 Teleproto</td><td align="center"><code>v${escapeHtml(teleprotoVer)}</code></td></tr>` +
                    `<tr><td>💻 OS</td><td align="center"><code>${escapeHtml(os.type())} ${escapeHtml(os.release())} (${escapeHtml(os.arch())})</code></td></tr>` +
                    `</table>`;
                await message.edit({
                    text: text,
                    parseMode: 'html'
                });
            }
            catch (err) {
                Logger.logUser(telegramId, `Error in stats plugin: ${err}`, 'ERROR');
            }
        }
    }
};
