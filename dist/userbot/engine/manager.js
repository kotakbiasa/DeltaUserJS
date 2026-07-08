import { UserbotClient } from './client.js';
import { getAllActiveUserbots, getUserbotSession, updateUserbotStatus } from '../../infrastructure/database.js';
import { dbCache } from '../../infrastructure/dbCore.js';
import inlineBotManager from '../../services/inlineBotManager.js';
import { Logger } from '../../utils/logger.js';
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Per-ID async lock — simple mutex untuk mencegah race condition di lifecycle userbot.
 * NON-reentrant: jika dipanggil nested, akan wait sampai outer lock released.
 * Ini intentional agar tidak ada concurrent access.
 */
const locks = new Map();
/**
 * Acquire lock for a specific userbot ID.
 * Returns a release function that MUST be called in finally block.
 */
async function acquireLock(id) {
    while (locks.has(id)) {
        await locks.get(id);
    }
    let releaseFn;
    const lock = new Promise((resolve) => { releaseFn = resolve; });
    locks.set(id, lock);
    return () => {
        locks.delete(id);
        releaseFn();
    };
}
class UserbotManager {
    clients;
    reconnecting;
    watchdogInterval;
    watchdogRunning;
    constructor() {
        this.clients = new Map();
        this.reconnecting = new Set();
        this.watchdogInterval = null;
        this.watchdogRunning = false;
    }
    async startUserbot(telegramId, sessionString) {
        const id = Number(telegramId);
        const release = await acquireLock(id);
        try {
            if (!sessionString)
                throw new Error(`session string kosong untuk ${id}`);
            // Guard: pastikan tidak ada duplikasi client untuk telegram ID yang sama
            if (this.clients.has(id)) {
                const existing = this.clients.get(id);
                if (existing && existing.isConnected()) {
                    console.warn(`⚠️ Userbot [${id}] sudah berjalan, skip start.`);
                    return true;
                }
                // Stop existing userbot (will be locked by stopUserbot)
                await this.stopUserbot(id);
            }
            const userbot = new UserbotClient(id, sessionString);
            this.clients.set(id, userbot);
            try {
                await userbot.start();
                await this.startInlineBotFor(id);
                return true;
            }
            catch (err) {
                this.clients.delete(id);
                throw err;
            }
        }
        finally {
            release();
        }
    }
    async startInlineBotFor(telegramId) {
        const session = getUserbotSession(telegramId);
        const token = session?.inline_bot_token || session?.vars?.INLINE_BOT_TOKEN;
        if (!token)
            return;
        await inlineBotManager.startInlineBot(telegramId, token);
    }
    async stopUserbot(telegramId) {
        const id = Number(telegramId);
        const release = await acquireLock(id);
        try {
            const userbot = this.clients.get(id);
            if (userbot) {
                await userbot.stop();
                this.clients.delete(id);
            }
            await inlineBotManager.stopInlineBot(id);
            return Boolean(userbot);
        }
        finally {
            release();
        }
    }
    async restartUserbot(telegramId) {
        const id = Number(telegramId);
        const session = getUserbotSession(telegramId);
        if (!session?.session_string)
            throw new Error(`session tidak ditemukan untuk ${id}`);
        const release = await acquireLock(id);
        try {
            // Inline stop logic directly — don't call stopUserbot() to avoid double-lock
            const userbot = this.clients.get(id);
            if (userbot) {
                await userbot.stop();
                this.clients.delete(id);
            }
            await inlineBotManager.stopInlineBot(id);
            // Inline start logic directly — don't call startUserbot() to avoid double-lock
            const newUserbot = new UserbotClient(id, session.session_string);
            this.clients.set(id, newUserbot);
            try {
                await newUserbot.start();
                await this.startInlineBotFor(id);
                return true;
            }
            catch (err) {
                this.clients.delete(id);
                throw err;
            }
        }
        finally {
            release();
        }
    }
    async restartAllActive() {
        console.log('🚀 Starting active DeltaUserJS userbots...');
        const activeBots = getAllActiveUserbots();
        console.log(`found ${activeBots.length} active userbots to start.`);
        for (const bot of activeBots) {
            try {
                const delayMs = Math.floor(Math.random() * 3000) + 2000;
                console.log(`⏳ Waiting ${delayMs}ms before starting userbot [${bot.telegram_id}]...`);
                await sleep(delayMs);
                await this.startUserbot(bot.telegram_id, bot.session_string);
            }
            catch (err) {
                Logger.logSystem(`Failed to start userbot [${bot.telegram_id}]: ${err.message || err}`, 'ERROR');
            }
        }
    }
    startWatchdog(intervalMs = 120000) {
        if (this.watchdogInterval)
            return;
        console.log(`🛡️ Userbot Watchdog started (${intervalMs}ms interval).`);
        this.watchdogInterval = setInterval(() => {
            // Cegah siklus tumpang-tindih bila pengecekan sebelumnya belum selesai
            if (this.watchdogRunning)
                return;
            this.watchdogRunning = true;
            this.checkAndReconnect()
                .catch(err => console.error('Watchdog error:', err.message || err))
                .finally(() => { this.watchdogRunning = false; });
        }, intervalMs);
    }
    stopWatchdog() {
        if (!this.watchdogInterval)
            return;
        clearInterval(this.watchdogInterval);
        this.watchdogInterval = null;
        console.log('🛡️ Userbot Watchdog stopped.');
    }
    async checkAndReconnect() {
        // Snapshot aktif bots agar tidak terpengaruh perubahan saat iterasi
        const activeBots = getAllActiveUserbots().map(bot => ({ ...bot }));
        for (const bot of activeBots) {
            const id = Number(bot.telegram_id);
            // Double-check: apakah userbot masih aktif setelah snapshot diambil?
            const fresh = dbCache.get(id);
            if (!fresh || fresh.is_active !== 1)
                continue;
            // Cek lagi apakah sudah terhubung (mungkin sudah di-reconnect oleh eksekusi sebelumnya)
            if (this.clients.has(id)) {
                const existing = this.clients.get(id);
                if (existing?.isConnected())
                    continue;
            }
            if (this.reconnecting.has(id))
                continue;
            this.reconnecting.add(id);
            try {
                console.log(`🛡️ Watchdog reconnecting userbot [${id}]...`);
                await this.startUserbot(id, bot.session_string);
                console.log(`✓ Watchdog reconnected userbot [${id}].`);
                await sleep(1500);
            }
            catch (err) {
                Logger.logSystem(`Watchdog failed for [${id}]: ${err.message || err}`, 'ERROR');
                if (err.message && (err.message.includes('Not a valid string') || err.message.includes('session string'))) {
                    Logger.logSystem(`Sesi untuk [${id}] tidak valid/rusak. Menonaktifkan userbot secara otomatis agar tidak loop.`, 'ERROR');
                    Logger.logUser(id, 'Sesi Telegram Anda tidak valid atau telah dicabut. Userbot telah dinonaktifkan secara otomatis. Silakan daftar ulang.', 'ERROR');
                    await updateUserbotStatus(id, false);
                }
            }
            finally {
                this.reconnecting.delete(id);
            }
        }
    }
    isRunning(telegramId) {
        return Boolean(this.clients.get(Number(telegramId))?.isConnected());
    }
    status() {
        return {
            running: this.clients.size,
            ids: [...this.clients.keys()]
        };
    }
}
const userbotManager = new UserbotManager();
export default userbotManager;
