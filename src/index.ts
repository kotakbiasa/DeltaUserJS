import './config.js';
import config from './config.js';
import bot from './bot/index.js';
import { setupBotCommands } from './bot/index.js';
import userbotManager from './userbot/engine/manager.js';
import { getAllRegisteredUsers, updateUserbotStatus, initDatabaseAndCache } from './infrastructure/database.js';
import { setMasterBotUsername } from './bot/state/botUsername.js';
import { Logger } from './utils/logger.js';

const EXPIRATION_CHECK_INTERVAL_MS = 60_000;

/**
 * ⏰ SUBSCRIPTION EXPIRATION CHECKER
 * Berjalan periodik di background untuk mendeteksi userbot yang masa aktifnya habis.
 */
function startExpirationChecker() {
  Logger.logSystem('Expiration Checker background service started.');

  let isRunning = false;

  setInterval(async () => {
    if (isRunning) {return;}
    isRunning = true;

    try {
      const allUsers = getAllRegisteredUsers();
      const now = new Date();

      for (const user of allUsers) {
        // Owner's userbot is exempt from expiration — never auto-deactivate.
        if (Number(user.telegram_id) === Number(config.ownerId)) {continue;}
        if (user.is_active !== 1 || !user.expired_at) {continue;}
        if (now <= new Date(user.expired_at)) {continue;}

        Logger.logSystem(`User [${user.telegram_id}] masa aktif telah kadaluwarsa! Menonaktifkan...`, 'WARN');

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
      Logger.logSystem(`Error in Expiration Checker service: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
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

  Logger.logSystem('Starting Ubot Manager...');

  try {
    // 0. Initialize database explicitly (no more top-level await in dbCore)
    Logger.logSystem('Initializing database...');
    try {
      await initDatabaseAndCache();
    } catch (dbErr) {
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
      timeout: 5,  // Polling 5 detik untuk inline query MTProto
      onStart: async (info) => {
        setMasterBotUsername(info.username);
        await setupBotCommands();
        Logger.logSystem(`Master Bot [@${info.username}] is running successfully!`, 'SUCCESS');

        // 4. Restart all active userbots from database as the final step
        Logger.logSystem('Starting all active userbots...');
        await userbotManager.restartAllActive();
        Logger.logSystem('All systems and userbots are fully loaded.', 'SUCCESS');
      }
    });
  } catch (error) {
    Logger.logSystem(`Critical error during system startup: ${error instanceof Error ? error.message : String(error)}`, 'ERROR');
    process.exit(1);
  }
}

// Graceful shutdown handlers
async function shutdown(signal) {
  console.log('');
  Logger.logSystem(`Received ${signal}. Shutting down gracefully...`, 'WARN');

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
    } catch (err) {
      Logger.logSystem(`Error closing MongoDB connection: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    }

    Logger.logSystem('Shutdown complete. Bye! 👋', 'SUCCESS');
    process.exit(0);
  } catch (error) {
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
