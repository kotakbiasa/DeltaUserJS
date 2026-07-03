import { UserbotClient } from './client.js';
import { getAllActiveUserbots, getUserbotSession, updateUserbotStatus } from '../../infrastructure/database.js';
import inlineBotManager from '../../services/inlineBotManager.js';
import { Logger } from '../../utils/logger.js';
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        if (!sessionString)
            throw new Error(`session string kosong untuk ${id}`);
        if (this.clients.has(id)) {
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
    async startInlineBotFor(telegramId) {
        const session = getUserbotSession(telegramId);
        const token = session?.inline_bot_token || session?.vars?.INLINE_BOT_TOKEN;
        if (!token)
            return;
        await inlineBotManager.startInlineBot(telegramId, token);
    }
    async stopUserbot(telegramId) {
        const id = Number(telegramId);
        const userbot = this.clients.get(id);
        if (userbot) {
            await userbot.stop();
            this.clients.delete(id);
        }
        await inlineBotManager.stopInlineBot(id);
        return Boolean(userbot);
    }
    async restartUserbot(telegramId) {
        const session = getUserbotSession(telegramId);
        if (!session?.session_string)
            throw new Error(`session tidak ditemukan untuk ${telegramId}`);
        return this.startUserbot(telegramId, session.session_string);
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
        const activeBots = getAllActiveUserbots();
        for (const bot of activeBots) {
            const id = Number(bot.telegram_id);
            if (this.reconnecting.has(id))
                continue;
            const current = this.clients.get(id);
            if (current?.isConnected())
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
