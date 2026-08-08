import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import config from '../../../config.js';
import { formatUptimeAlt, formatBytes } from '../../../utils/format.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
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
        if (!message.out || !message.message) {
            return;
        }
        if (message.message.toLowerCase() !== '.sysinfo') {
            return;
        }
        // Proteksi: hanya owner
        if (Number(telegramId) !== Number(config.ownerId)) {
            return;
        }
        try {
            await message.edit({
                text: '⏳ <b>Mengumpulkan informasi sistem...</b>',
                parseMode: 'html'
            });
            // CPU Info
            const cpus = os.cpus();
            const cpuModel = cpus[0]?.model || 'Unknown';
            const _cpuCores = cpus.length;
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
            const _loadAvg = os.loadavg().map(l => l.toFixed(2)).join(' / ');
            // Disk Info (Linux)
            let diskInfo = 'N/A';
            try {
                const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $2 \" total, \" $3 \" used, \" $4 \" free (\" $5 \" used)\"}'", { timeout: 5000 });
                diskInfo = stdout.trim() || 'N/A';
            }
            catch (_e) { /* ignore */ }
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
                if (ipAddr !== 'N/A') {
                    break;
                }
            }
            const text = `<h1>🖥️ System Information</h1>` +
                `<table bordered striped><caption>🧠 CPU</caption>` +
                `<tr><th>Item</th><th>Detail</th></tr>` +
                `<tr><td>📛 Model</td><td align="center"><code>${escapeHtml(cpuModel)}</code></td></tr>` +
                `<tr><td>🧠 Cores</td><td align="center"><code>${escapeHtml(String(cpus.length))}</code></td></tr>` +
                `<tr><td>📈 Usage</td><td align="center"><code>${escapeHtml(cpuUsage)}%</code></td></tr>` +
                `</table>` +
                `<table bordered striped><caption>💾 Memory</caption>` +
                `<tr><th>Item</th><th>Detail</th></tr>` +
                `<tr><td>Total</td><td align="center"><code>${formatBytes(totalMem)}</code></td></tr>` +
                `<tr><td>Used</td><td align="center"><code>${formatBytes(usedMem)}</code> (<code>${memPercent}%</code>)</td></tr>` +
                `<tr><td>Free</td><td align="center"><code>${formatBytes(freeMem)}</code></td></tr>` +
                `<tr><td>Bot RSS</td><td align="center"><code>${formatBytes(procMem.rss)}</code></td></tr>` +
                `<tr><td>Bot Heap</td><td align="center"><code>${formatBytes(procMem.heapUsed)}</code></td></tr>` +
                `</table>` +
                `<table bordered striped><caption>💿 Disk</caption>` +
                `<tr><th>Item</th><th>Detail</th></tr>` +
                `<tr><td>Root (/)</td><td align="center"><code>${escapeHtml(diskInfo)}</code></td></tr>` +
                `</table>` +
                `<table bordered striped><caption>🏷️ System</caption>` +
                `<tr><th>Item</th><th>Detail</th></tr>` +
                `<tr><td>Hostname</td><td align="center"><code>${escapeHtml(hostname)}</code></td></tr>` +
                `<tr><td>OS</td><td align="center"><code>${escapeHtml(platform)} ${escapeHtml(release)}</code></td></tr>` +
                `<tr><td>Arch</td><td align="center"><code>${escapeHtml(arch)}</code></td></tr>` +
                `<tr><td>Node.js</td><td align="center"><code>${escapeHtml(process.version)}</code></td></tr>` +
                `<tr><td>OS Uptime</td><td align="center"><code>${escapeHtml(osUptime)}</code></td></tr>` +
                `<tr><td>Bot Uptime</td><td align="center"><code>${escapeHtml(processUptime)}</code></td></tr>` +
                `</table>`;
            await message.edit({
                text: text,
                parseMode: 'html'
            });
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in sysinfo plugin: ${err}`, 'ERROR');
            await message.edit({
                text: `❌ <b>Gagal mengambil informasi sistem:</b>\n<code>${escapeHtml(err.message)}</code>`,
                parseMode: 'html'
            });
        }
    }
};
