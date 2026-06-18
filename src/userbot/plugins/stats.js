import fs from 'fs';
import path from 'path';
import os from 'os';
import { helpRegistry } from '../pluginRegistry.js';
import { block, footer } from '../ui.js';

function uptimeText() {
  const total = Math.round(process.uptime());
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [d && `${d} hari`, h && `${h} jam`, m && `${m} menit`, `${s} detik`].filter(Boolean).join(' ');
}

function packageVersions() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    return {
      grammy: String(pkg.dependencies?.grammy || 'Unknown').replace(/^[\^~>=]+/, ''),
      gramjs: String(pkg.dependencies?.telegram || 'Unknown').replace(/^[\^~>=]+/, ''),
    };
  } catch (_) {
    return { grammy: 'Unknown', gramjs: 'Unknown' };
  }
}

export default {
  name: 'stats',
  help: {
    title: 'Statistics (.stats)',
    description: 'Menampilkan statistik runtime userbot.',
    usage: 'Ketik `.stats`',
    detail: 'Menampilkan jumlah modul, uptime, versi runtime, dan platform.'
  },
  async execute(client, message, settings) {
    if (!message.isOutgoing || String(message.text || '').trim().toLowerCase() !== '.stats') return;

    const versions = packageVersions();
    const rows = [
      `Modules     ${Object.keys(helpRegistry).length}`,
      `Uptime      ${uptimeText()}`,
      `Node        ${process.version}`,
      `GrammY      ${versions.grammy}`,
      `GramJS      ${versions.gramjs}`,
      `Platform    ${os.platform()} ${os.arch()}`,
    ];

    await message.edit({
      text: block('Userbot Stats', `<pre>${rows.join('\n')}</pre>`) + footer(settings),
      parseMode: 'html',
    });
  },
};
