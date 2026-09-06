import os from 'os';
import config from '../../../config.js';
import { formatUptimeStats, formatUptime } from '../../../utils/format.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import { helpRegistry } from '../../engine/pluginRegistry.js';
// ============================================================
// Health Monitor — monitoring kesehatan userbot (ala Kitsune).
// Perintah:
//   .health        — snapshot kesehatan: uptime, RAM rss/heap,
//                    CPU loadavg, jumlah plugin loaded, status
//                    koneksi DB (mongoose), status monitor.
//   .monitor on    — cek berkala tiap 5 menit; kirim warning ke
//                    OWNER via DM kalau RAM RSS > 500MB atau
//                    CPU load per core tinggi.
//   .monitor off   — matikan monitor.
// State monitor disimpan di globalThis (Map per telegramId) agar
// timer survive hot-reload. Interval pakai unref() supaya tidak
// menahan proses saat shutdown.
// Referensi konsep: Kitsune modules/health.py (probe + threshold
// alert) — ditulis ulang, bukan disalin.
// ============================================================
const MONITOR_INTERVAL_MS = 5 * 60 * 1000; // cek tiap 5 menit
const RAM_WARN_MB = 500; // ambang RAM RSS (MB)
const CPU_LOAD_PER_CORE_WARN = 0.8; // load1m/core >= 80% = tinggi
const WARN_COOLDOWN_MS = 30 * 60 * 1000; // anti-spam warning ke owner
const DB_PING_TIMEOUT_MS = 3000;
const MONGOOSE_STATES = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
    99: 'uninitialized',
};
// telegramId -> MonitorState (pinned di globalThis, survive hot-reload)
const MONITOR_KEY = '__deltauserjs_health_monitor__';
const monitorStore = (globalThis)[MONITOR_KEY] || new Map();
(globalThis)[MONITOR_KEY] = monitorStore;
// ---- Helpers ----
function collectMetrics() {
    const mem = process.memoryUsage();
    const load = os.loadavg();
    const cores = Math.max(1, os.cpus().length);
    return {
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapMB: Math.round(mem.heapUsed / 1024 / 1024),
        load1: load[0] || 0,
        load5: load[1] || 0,
        load15: load[2] || 0,
        cores,
    };
}
/**
 * Cek status koneksi DB via mongoose. Modul infrastructure/database.js
 * di-import dinamis dulu — kalau gagal diakses, kembalikan null dan
 * bagian DB di-skip dari snapshot.
 */
async function probeDatabase() {
    try {
        await import('../../../infrastructure/database.js');
        const mongoose = (await import('mongoose')).default;
        const conn = mongoose?.connection;
        if (!conn) {
            return null;
        }
        const state = MONGOOSE_STATES[conn.readyState] || `unknown(${conn.readyState})`;
        let latencyMs = null;
        if (conn.readyState === 1 && conn.db) {
            try {
                const t0 = Date.now();
                await Promise.race([
                    conn.db.admin().command({ ping: 1 }),
                    new Promise((_resolve, reject) => {
                        const t = setTimeout(() => reject(new Error(`ping timeout >${DB_PING_TIMEOUT_MS}ms`)), DB_PING_TIMEOUT_MS);
                        if (typeof t.unref === 'function') {
                            t.unref();
                        }
                    }),
                ]);
                latencyMs = Date.now() - t0;
            }
            catch (_e) { /* ping gagal — latency tidak ditampilkan */ }
        }
        return { state, name: conn.name || '', latencyMs };
    }
    catch (_e) {
        return null; // modul DB tidak bisa diakses → skip bagian DB
    }
}
function renderDbLine(probe) {
    if (!probe) {
        return '';
    } // skip bagian DB
    let icon = '❌';
    let extra = '';
    if (probe.state === 'connected') {
        icon = '✅';
        extra = probe.latencyMs !== null ? ` (${probe.latencyMs} ms)` : '';
    }
    else if (probe.state === 'connecting') {
        icon = '🟡';
    }
    const dbName = probe.name ? ` "${probe.name}"` : '';
    const value = `MongoDB${dbName} ${probe.state}${extra}`;
    return `🗄️ <b>DB:</b> ${icon} <code>${escapeHtml(value)}</code>\n`;
}
function renderMonitorLine(telegramId) {
    const st = monitorStore.get(telegramId);
    if (st && st.timer) {
        let extra = '';
        if (st.lastWarnAt) {
            const ago = formatUptime(Math.round((Date.now() - st.lastWarnAt) / 1000));
            extra = ` · warning terakhir ${ago} lalu`;
        }
        return `🟢 <code>AKTIF</code> (cek 5m${escapeHtml(extra)})`;
    }
    return `⚪ <code>OFF</code>`;
}
function stopMonitor(telegramId) {
    const st = monitorStore.get(telegramId);
    if (!st) {
        return false;
    }
    if (st.timer) {
        clearInterval(st.timer);
    }
    monitorStore.delete(telegramId);
    return true;
}
function startMonitor(client, telegramId) {
    stopMonitor(telegramId);
    const st = {};
    st.startedAt = Date.now();
    const timer = setInterval(() => {
        try {
            void runMonitorCheck(client, telegramId);
        }
        catch (err) {
            Logger.logSystem(`Health monitor check error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        }
    }, MONITOR_INTERVAL_MS);
    if (typeof timer.unref === 'function') {
        timer.unref();
    }
    st.timer = timer;
    monitorStore.set(telegramId, st);
}
async function runMonitorCheck(client, telegramId) {
    const st = monitorStore.get(telegramId);
    if (!st || !st.timer) {
        return;
    } // monitor sudah dimatikan
    if (!config.ownerId) {
        return;
    }
    try {
        const m = collectMetrics();
        const reasons = [];
        if (m.rssMB > RAM_WARN_MB) {
            reasons.push(`💾 RAM RSS <code>${m.rssMB} MB</code> melewati ambang <code>${RAM_WARN_MB} MB</code>`);
        }
        const loadPerCore = m.load1 / m.cores;
        if (loadPerCore >= CPU_LOAD_PER_CORE_WARN) {
            reasons.push(`⚙️ CPU load <code>${m.load1.toFixed(2)}</code> / ${m.cores} core (<code>${Math.round(loadPerCore * 100)}%</code>)`);
        }
        if (reasons.length === 0) {
            return;
        }
        const now = Date.now();
        if (st.lastWarnAt && (now - st.lastWarnAt) < WARN_COOLDOWN_MS) {
            return; // masih dalam cooldown anti-spam
        }
        st.lastWarnAt = now;
        const warnText = `⚠️ <b>HEALTH WARNING</b>\n` +
            `<blockquote>\n` +
            `${reasons.join('\n')}\n` +
            `⏳ Uptime: <code>${escapeHtml(formatUptimeStats(Math.round(process.uptime())))}</code>\n` +
            `ℹ️ Matikan dengan <code>.monitor off</code>\n` +
            `</blockquote>`;
        try {
            await client.sendMessage(config.ownerId, {
                message: warnText,
                parseMode: 'html',
                linkPreview: false,
            });
        }
        catch (sendErr) {
            Logger.logSystem(`Health monitor gagal kirim warning ke owner: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`, 'ERROR');
        }
    }
    catch (err) {
        Logger.logSystem(`Health monitor check error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    }
}
export default {
    name: 'health',
    version: '1.0.0',
    description: 'Health monitor userbot: snapshot .health + monitor berkala .monitor on/off. Khusus Owner.',
    help: {
        title: 'Health Monitor (.health, .monitor)',
        description: 'Snapshot kesehatan userbot dan monitor berkala penggunaan sumber daya.',
        usage: '• `.health`\n• `.monitor on`\n• `.monitor off`',
        detail: 'Monitor cek tiap 5 menit dan kirim warning ke Owner via DM kalau RAM RSS > 500MB atau CPU load tinggi (anti-spam 30 menit). State bertahan saat plugin hot-reload.'
    },
    onLoad: () => {
        Logger.logSystem(`💗 Plugin Health loaded (${monitorStore.size} monitor aktif survive hot-reload)`, 'INFO');
    },
    execute: async (client, message, settings, telegramId) => {
        if (!message.out || !message.message) {
            return;
        }
        // Proteksi: hanya owner
        if (Number(telegramId) !== Number(config.ownerId)) {
            return;
        }
        const text = String(message.message).trim();
        const healthMatch = text.match(/^\.health$/i);
        const monitorMatch = text.match(/^\.monitor(?:\s+(\S+))?$/i);
        if (!healthMatch && !monitorMatch) {
            return;
        }
        try {
            if (healthMatch) {
                await message.edit({
                    text: '⏳ <b>Memeriksa kesehatan...</b>',
                    parseMode: 'html'
                });
                const m = collectMetrics();
                const probe = await probeDatabase();
                const idNum = Number(telegramId);
                const pluginCount = Object.keys(helpRegistry).length;
                const snapshot = `💗 <b>USERBOT HEALTH</b>\n\n` +
                    `<blockquote>` +
                    `⏳ <b>Uptime:</b> <code>${escapeHtml(formatUptimeStats(Math.round(process.uptime())))}</code>\n` +
                    `💾 <b>RAM RSS:</b> <code>${m.rssMB} MB</code> (Heap: <code>${m.heapMB} MB</code>)\n` +
                    `⚙️ <b>Loadavg:</b> <code>${m.load1.toFixed(2)} / ${m.load5.toFixed(2)} / ${m.load15.toFixed(2)}</code> (${m.cores} core)\n` +
                    `🔌 <b>Plugin:</b> <code>${pluginCount}</code> loaded\n` +
                    renderDbLine(probe) +
                    `🔔 <b>Monitor:</b> ${renderMonitorLine(idNum)}\n` +
                    `</blockquote>`;
                await message.edit({
                    text: snapshot,
                    parseMode: 'html'
                });
                return;
            }
            // ---- .monitor on|off|status ----
            const arg = monitorMatch[1] ? monitorMatch[1].toLowerCase() : '';
            const idNum = Number(telegramId);
            if (arg === 'on') {
                startMonitor(client, idNum);
                await message.edit({
                    text: `✅ <b>Monitor aktif</b>\n` +
                        `<blockquote>` +
                        `🔔 Cek tiap <code>5 menit</code>\n` +
                        `💾 Warning RAM RSS &gt; <code>${RAM_WARN_MB} MB</code>\n` +
                        `⚙️ Warning CPU load/core ≥ <code>${Math.round(CPU_LOAD_PER_CORE_WARN * 100)}%</code>\n` +
                        `📨 Warning dikirim ke Owner (anti-spam 30m)\n` +
                        `</blockquote>`,
                    parseMode: 'html'
                });
                return;
            }
            if (arg === 'off') {
                const stopped = stopMonitor(idNum);
                await message.edit({
                    text: stopped ? '🛑 <b>Monitor dimatikan.</b>' : 'ℹ️ <b>Monitor memang tidak aktif.</b>',
                    parseMode: 'html'
                });
                return;
            }
            // Tanpa argumen / argumen tak dikenal → status + usage
            await message.edit({
                text: `ℹ️ <b>Monitor:</b> ${renderMonitorLine(idNum)}\n` +
                    `<blockquote>` +
                    `Usage:\n` +
                    `<code>.monitor on</code> — aktifkan\n` +
                    `<code>.monitor off</code> — matikan\n` +
                    `</blockquote>`,
                parseMode: 'html'
            });
        }
        catch (err) {
            Logger.logUser(telegramId, `Error in health plugin: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            await message.edit({
                text: `❌ <b>Gagal memproses health command:</b>\n<code>${escapeHtml(err instanceof Error ? err.message : String(err))}</code>`,
                parseMode: 'html'
            }).catch(() => { });
        }
    }
};
