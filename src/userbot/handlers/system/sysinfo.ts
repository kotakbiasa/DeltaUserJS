import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import config from '../../../config.js';
import { formatUptimeAlt, formatBytes } from '../../../utils/format.js';
import { escapeHtml } from '../../../utils/richMessage.js';

const execAsync = util.promisify(exec);

function getCpuUsage() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }
  const usage = ((1 - totalIdle / totalTick) * 100).toFixed(1);
  return usage;
}

export default {
  name: 'sysinfo',
  help: {
    title: 'System Info (.sysinfo)',
    description: 'Menampilkan informasi lengkap tentang server/VPS tempat bot berjalan.',
    usage: 'Ketik `.sysinfo`',
    detail: 'Menampilkan detail CPU, RAM, Disk, Network, OS kernel, hostname, dan load average dari server.'
  },
  async execute(client, message, settings, telegramId) {
    if (!message.out || !message.message) return;
    if (message.message.toLowerCase() !== '.sysinfo') return;

    // Proteksi: hanya owner
    if (Number(telegramId) !== Number(config.ownerId)) return;

    try {
      await message.edit({
        text: '⏳ <b>Mengumpulkan informasi sistem...</b>',
        parseMode: 'html'
      });

      // CPU Info
      const cpus = os.cpus();
      const cpuModel = cpus[0]?.model || 'Unknown';
      const cpuCores = cpus.length;
      const cpuUsage = getCpuUsage();

      // Memory Info
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memPercent = ((usedMem / totalMem) * 100).toFixed(1);

      // Process Memory
      const procMem = process.memoryUsage();

      // OS Info
      const hostname = os.hostname();
      const platform = os.type();
      const release = os.release();
      const arch = os.arch();
      const osUptime = formatUptimeAlt(os.uptime());
      const processUptime = formatUptimeAlt(process.uptime());

      // Load Average (Linux/Mac)
      const loadAvg = os.loadavg().map(l => l.toFixed(2)).join(' / ');

      // Disk Info (Linux)
      let diskInfo = 'N/A';
      try {
        const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $2 \" total, \" $3 \" used, \" $4 \" free (\" $5 \" used)\"}'", { timeout: 5000 });
        diskInfo = stdout.trim() || 'N/A';
      } catch (e) { /* ignore */ }

      // Network interfaces
      const nets = os.networkInterfaces();
      let ipAddr = 'N/A';
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            ipAddr = net.address;
            break;
          }
        }
        if (ipAddr !== 'N/A') break;
      }

      const text = `🖥️ <b>SYSTEM INFORMATION</b>\n\n` +

        `<b>── CPU ──</b>\n` +
        `<blockquote>` +
        `📛 <b>Model:</b> <code>${escapeHtml(cpuModel)}</code>\n` +
        `🧠 <b>Cores:</b> <code>${escapeHtml(String(cpus.length))}</code>\n` +
        `📈 <b>Usage:</b> <code>${escapeHtml(cpuUsage)}%</code>\n` +
        `</blockquote>\n\n` +

        `<b>── MEMORY ──</b>\n` +
        `<blockquote>` +
        `💾 <b>Total:</b> <code>${formatBytes(totalMem)}</code>\n` +
        `📊 <b>Used:</b> <code>${formatBytes(usedMem)}</code> (<code>${memPercent}%</code>)\n` +
        `🟢 <b>Free:</b> <code>${formatBytes(freeMem)}</code>\n` +
        `🤖 <b>Bot RSS:</b> <code>${formatBytes(procMem.rss)}</code>\n` +
        `📦 <b>Bot Heap:</b> <code>${formatBytes(procMem.heapUsed)}</code>` +
        `</blockquote>\n\n` +

        `<b>── DISK ──</b>\n` +
        `<blockquote>` +
        `💿 <b>Root (/):</b> <code>${escapeHtml(diskInfo)}</code>` +
        `</blockquote>\n\n` +

        `<b>── SYSTEM ──</b>\n` +
        `<blockquote>` +
        `🏷️ <b>Hostname:</b> <code>${escapeHtml(hostname)}</code>\n` +
        `🐧 <b>OS:</b> <code>${escapeHtml(platform)} ${escapeHtml(release)}</code>\n` +
        `🏗️ <b>Arch:</b> <code>${escapeHtml(arch)}</code>\n` +
        `🌐 <b>Node.js:</b> <code>${escapeHtml(process.version)}</code>\n` +
        `⏳ <b>OS Uptime:</b> <code>${escapeHtml(osUptime)}</code>\n` +
        `🤖 <b>Bot Uptime:</b> <code>${escapeHtml(processUptime)}</code>` +
        `</blockquote>`;

      await message.edit({
        text: text,
        parseMode: 'html'
      });
    } catch (err) {
      console.error('Error in sysinfo plugin:', err);
      await message.edit({
        text: `❌ <b>Gagal mengambil informasi sistem:</b>\n<code>${escapeHtml(err.message)}</code>`,
        parseMode: 'html'
      });
    }
  }
};
