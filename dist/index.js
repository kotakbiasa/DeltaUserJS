import './config.js';
import config from './config.js';
import bot from './bot/index.js';
import { setupBotCommands } from './bot/index.js';
import userbotManager from './userbot/engine/manager.js';
import { getAllRegisteredUsers, updateUserbotStatus, initDatabaseAndCache } from './infrastructure/database.js';
import { setMasterBotUsername } from './bot/state/botUsername.js';
import { Logger } from './utils/logger.js';
import { createServer } from 'http';
import { startPluginWatcher, stopPluginWatcher } from './userbot/engine/pluginLoader.js';
import { handleMidtransWebhook, handleXenditWebhook } from './bot/handlers/subscription.js';
const EXPIRATION_CHECK_INTERVAL_MS = 60_000;
/**
 * ⏰ SUBSCRIPTION EXPIRATION CHECKER
 * Berjalan periodik di background untuk mendeteksi userbot yang masa aktifnya habis.
 */
function startExpirationChecker() {
    Logger.logSystem('Expiration Checker background service started.');
    let isRunning = false;
    setInterval(async () => {
        if (isRunning) {
            return;
        }
        isRunning = true;
        try {
            const allUsers = getAllRegisteredUsers();
            const now = new Date();
            for (const user of allUsers) {
                // Owner's userbot is exempt from expiration — never auto-deactivate.
                if (Number(user.telegram_id) === Number(config.ownerId)) {
                    continue;
                }
                if (user.is_active !== 1 || !user.expired_at) {
                    continue;
                }
                if (now <= new Date(user.expired_at)) {
                    continue;
                }
                Logger.logSystem(`User [${user.telegram_id}] masa aktif telah kadaluwarsa! Menonaktifkan...`, 'WARN');
                // 1. Matikan instans userbot
                await userbotManager.stopUserbot(user.telegram_id);
                // 2. Tandai nonaktif di database
                await updateUserbotStatus(user.telegram_id, false);
                // 3. Kirim notifikasi pribadi via Master Bot
                try {
                    await bot.api.sendMessage(user.telegram_id, '⚠️ **USERBOT - MASA AKTIF HABIS** ⚠️\n' +
                        '────────────────────────\n' +
                        'Halo, masa aktif layanan userbot Anda telah berakhir secara otomatis.\n\n' +
                        'Seluruh sistem otomatisasi Anda telah **dinonaktifkan**. Silakan hubungi Owner atau lakukan perpanjangan langganan melalui menu **💰 Donasi** di bot ini untuk mengaktifkannya kembali!\n' +
                        '────────────────────────');
                }
                catch {
                    // Abaikan jika pengguna memblokir bot
                }
            }
        }
        catch (error) {
            Logger.logSystem(`Error in Expiration Checker service: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
        }
        finally {
            isRunning = false;
        }
    }, EXPIRATION_CHECK_INTERVAL_MS);
}
async function main() {
    const logo = `
\x1b[1m\x1b[35m    __  ______  ____  ____  ______   __  ______    _   __  ___   __________  ____ 
   / / / / __ \\/ __ \\/ __ \\/_  __/  /  |/  /   |  / | / / /   | / ____/ __ \\/ __ \\
  / / / / /_/ / / / / / / / / /    / /|_/ / /| | /  |/ / / /| |/ / __/ /_/ / /_/ /
 / /_/ / /_/ / /_/ / /_/ / / /    / /  / / ___ |/ /|  / / ___ / /_/ / _, _/ _, _/ 
 \\____/\\____/\\____/\\____/ /_/    /_/  /_/_/  |_/_/ |_/ /_/  |_\\____/_/ |_/_/ |_|  
\x1b[0m
\x1b[36m  ⚡ Ubot Manager Advanced Multitenant Bot Engine v1.0.0 ⚡\x1b[0m
\x1b[2m  ─────────────────────────────────────────────────────────────────\x1b[0m
`;
    console.log(logo);
    Logger.logSystem('Starting Ubot Manager...');
    try {
        // 0. Initialize database explicitly (no more top-level await in dbCore)
        Logger.logSystem('Initializing database...');
        try {
            await initDatabaseAndCache();
        }
        catch (dbErr) {
            Logger.logSystem(`Failed to initialize database: ${dbErr.message}`, 'ERROR');
            process.exit(1);
        }
        // 1. Start Expiration Checker Service
        startExpirationChecker();
        // 2. Start Userbot Watchdog Service
        userbotManager.startWatchdog();
        // 3. Start the Master Bot, and load userbots ONLY after it successfully connects
        Logger.logSystem('Starting Master Bot...');
        await bot.start({
            timeout: 5, // Polling 5 detik untuk inline query MTProto
            onStart: async (info) => {
                setMasterBotUsername(info.username);
                await setupBotCommands();
                Logger.logSystem(`Master Bot [@${info.username}] is running successfully!`, 'SUCCESS');
                // 4. Restart all active userbots from database as the final step
                Logger.logSystem('Starting all active userbots...');
                await userbotManager.restartAllActive();
                Logger.logSystem('All systems and userbots are fully loaded.', 'SUCCESS');
                // 5. Start plugin hot-reload watcher (dev only)
                if (process.env.NODE_ENV !== 'production') {
                    startPluginWatcher();
                }
            }
        });
    }
    catch (error) {
        Logger.logSystem(`Critical error during system startup: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
        process.exit(1);
    }
}
// Health check HTTP server (for Docker/load balancer probes)
const HEALTH_PORT = process.env.HEALTH_PORT ? Number(process.env.HEALTH_PORT) : 3000;
const healthServer = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${HEALTH_PORT}`);
    // Midtrans webhook
    if (url.pathname === '/webhook/midtrans' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) {
            body += chunk;
        }
        try {
            const payload = JSON.parse(body);
            const headersObj = {};
            for (const [key, value] of Object.entries(req.headers)) {
                if (typeof value === 'string') {
                    headersObj[key] = value;
                }
                else if (Array.isArray(value)) {
                    headersObj[key] = value.join(', ');
                }
            }
            const result = await handleMidtransWebhook(payload, headersObj);
            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        }
        catch (err) {
            Logger.logSystem(`Midtrans webhook error: ${err}`, 'ERROR');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Internal error' }));
        }
        return;
    }
    // Xendit webhook
    if (url.pathname === '/webhook/xendit' && req.method === 'POST') {
        let body = '';
        for await (const chunk of req) {
            body += chunk;
        }
        try {
            const payload = JSON.parse(body);
            const headersObj = {};
            for (const [key, value] of Object.entries(req.headers)) {
                if (typeof value === 'string') {
                    headersObj[key] = value;
                }
                else if (Array.isArray(value)) {
                    headersObj[key] = value.join(', ');
                }
            }
            const result = await handleXenditWebhook(payload, headersObj);
            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
        }
        catch (err) {
            Logger.logSystem(`Xendit webhook error: ${err}`, 'ERROR');
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: 'Internal error' }));
        }
        return;
    }
    // Health check
    if (url.pathname === '/health' || url.pathname === '/healthz') {
        const mongoose = await import('mongoose');
        const dbState = mongoose.default.connection.readyState; // 1 = connected
        const userbotCount = userbotManager.clients.size;
        const isHealthy = dbState === 1 && bot.api;
        res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: isHealthy ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            mongodb: dbState === 1 ? 'connected' : 'disconnected',
            masterBot: bot.api ? 'running' : 'stopped',
            activeUserbots: userbotCount,
            memory: process.memoryUsage(),
        }));
        return;
    }
    res.writeHead(404);
    res.end('Not Found');
});
healthServer.listen(HEALTH_PORT, '0.0.0.0', () => {
    Logger.logSystem(`Health check server listening on port ${HEALTH_PORT}`);
});
// Graceful shutdown handlers
async function shutdown(signal) {
    console.log('');
    Logger.logSystem(`Received ${signal}. Shutting down gracefully...`, 'WARN');
    // Close health server
    try {
        await new Promise((resolve) => healthServer.close(() => resolve()));
        Logger.logSystem('Health check server closed.');
    }
    catch (_e) { /* empty */ }
    // Stop plugin watcher
    stopPluginWatcher();
    try {
        Logger.logSystem('Stopping Master Bot...');
        await bot.stop();
        userbotManager.stopWatchdog();
        Logger.logSystem('Disconnecting all active userbots...');
        const activeIds = Array.from(userbotManager.clients.keys());
        for (const id of activeIds) {
            await userbotManager.stopUserbot(id);
        }
        // Close MongoDB connection if active
        try {
            const mongoose = await import('mongoose');
            if (mongoose.default.connection.readyState === 1) {
                Logger.logSystem('Closing MongoDB connection...');
                await mongoose.default.disconnect();
            }
        }
        catch (err) {
            Logger.logSystem(`Error closing MongoDB connection: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        }
        Logger.logSystem('Shutdown complete. Bye! 👋', 'SUCCESS');
        process.exit(0);
    }
    catch (error) {
        Logger.logSystem(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
        process.exit(1);
    }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
// Catch unhandled rejections to prevent silent crashes
process.on('unhandledRejection', (reason) => {
    Logger.logSystem(`Unhandled Rejection: ${reason instanceof Error ? reason.message : String(reason)}`, 'ERROR');
});
process.on('uncaughtException', (err) => {
    Logger.logSystem(`Uncaught Exception: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    // Don't exit immediately — let the process attempt graceful shutdown
    shutdown('uncaughtException');
});
// Start the application
main();
