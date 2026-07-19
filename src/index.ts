import './config.js';
import bot from './bot/index.js';
import userbotManager from './userbot/engine/manager.js';
import { getAllRegisteredUsers, updateUserbotStatus, initDatabaseAndCache } from './infrastructure/database.js';
import { setMasterBotUsername } from './bot/state/botUsername.js';

const EXPIRATION_CHECK_INTERVAL_MS = 60_000;

// --- Helper Logger dengan Style ANSI ---
function getTimestamp() {
  const now = new Date();
  return `\x1b[2m[${now.toLocaleTimeString()}]\x1b[0m`;
}

function logInfo(message) {
  console.log(`${getTimestamp()} \x1b[36m[SYSTEM]\x1b[0m ${message}`);
}

function logSuccess(message) {
  console.log(`${getTimestamp()} \x1b[32m[SUCCESS]\x1b[0m ${message}`);
}

function logWarn(message) {
  console.log(`${getTimestamp()} \x1b[33m[WARN]\x1b[0m ${message}`);
}

function logError(message, err = null) {
  console.error(`${getTimestamp()} \x1b[31m[ERROR]\x1b[0m ${message}`, err || '');
}

/**
 * ⏰ SUBSCRIPTION EXPIRATION CHECKER
 * Berjalan periodik di background untuk mendeteksi userbot yang masa aktifnya habis.
 */
function startExpirationChecker() {
  logInfo('Expiration Checker background service started.');

  let isRunning = false;

  setInterval(async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const allUsers = getAllRegisteredUsers();
      const now = new Date();

      for (const user of allUsers) {
        if (user.is_active !== 1 || !user.expired_at) continue;
        if (now <= new Date(user.expired_at)) continue;

        logWarn(`User [${user.telegram_id}] masa aktif telah kadaluwarsa! Menonaktifkan...`);

        // 1. Matikan instans userbot
        await userbotManager.stopUserbot(user.telegram_id);

        // 2. Tandai nonaktif di database
        await updateUserbotStatus(user.telegram_id, false);

        // 3. Kirim notifikasi pribadi via Master Bot
        try {
          await bot.api.sendMessage(user.telegram_id,
            '⚠️ **USERBOT - MASA AKTIF HABIS** ⚠️\n' +
            '────────────────────────\n' +
            'Halo, masa aktif layanan userbot Anda telah berakhir secara otomatis.\n\n' +
            'Seluruh sistem otomatisasi Anda telah **dinonaktifkan**. Silakan hubungi Owner atau lakukan perpanjangan langganan melalui menu **💰 Donasi** di bot ini untuk mengaktifkannya kembali!\n' +
            '────────────────────────'
          );
        } catch {
          // Abaikan jika pengguna memblokir bot
        }
      }
    } catch (error) {
      logError('Error in Expiration Checker service', error);
    } finally {
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

  logInfo('Starting Ubot Manager...');

  try {
    // 0. Initialize database explicitly (no more top-level await in dbCore)
    logInfo('Initializing database...');
    try {
      await initDatabaseAndCache();
    } catch (dbErr) {
      logError('Failed to initialize database. Please check your .env configuration.', dbErr);
      process.exit(1);
    }

    // 1. Start Expiration Checker Service
    startExpirationChecker();

    // 2. Start Userbot Watchdog Service
    userbotManager.startWatchdog();

    // 3. Start the Master Bot, and load userbots ONLY after it successfully connects
    logInfo('Starting Master Bot...');
    await bot.start({
      onStart: async (info) => {
        setMasterBotUsername(info.username);
        logSuccess(`Master Bot [@${info.username}] is running successfully!`);

        // 4. Restart all active userbots from database as the final step
        logInfo('Starting all active userbots...');
        await userbotManager.restartAllActive();
        logSuccess('All systems and userbots are fully loaded.');
      }
    });
  } catch (error) {
    logError('Critical error during system startup', error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
async function shutdown(signal) {
  console.log('');
  logWarn(`Received ${signal}. Shutting down gracefully...`);

  try {
    logInfo('Stopping Master Bot...');
    await bot.stop();

    userbotManager.stopWatchdog();

    logInfo('Disconnecting all active userbots...');
    const activeIds = Array.from(userbotManager.clients.keys());
    for (const id of activeIds) {
      await userbotManager.stopUserbot(id);
    }

    // Close MongoDB connection if active
    try {
      const mongoose = await import('mongoose');
      if (mongoose.default.connection.readyState === 1) {
        logInfo('Closing MongoDB connection...');
        await mongoose.default.disconnect();
      }
    } catch (err) {
      logError('Error closing MongoDB connection', err);
    }

    logSuccess('Shutdown complete. Bye! 👋');
    process.exit(0);
  } catch (error) {
    logError('Error during shutdown', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the application
main();
