import './config.js';
import bot from './bot/index.js';
import userbotManager from './userbot/manager.js';
import { getAllRegisteredUsers, updateUserbotStatus } from './database/db.js';

const EXPIRATION_CHECK_INTERVAL_MS = 60_000;

/**
 * ⏰ SUBSCRIPTION EXPIRATION CHECKER
 * Berjalan periodik di background untuk mendeteksi userbot yang masa aktifnya habis.
 * Jika habis: matikan userbot, tandai nonaktif di DB, dan kirim notifikasi pribadi.
 *
 * Dilindungi flag `isRunning` agar siklus tidak tumpang-tindih bila pengecekan
 * (banyak user) memakan waktu lebih lama dari interval.
 */
function startExpirationChecker() {
  console.log('⏰ Expiration Checker background service started.');

  let isRunning = false;

  setInterval(async () => {
    if (isRunning) return;
    isRunning = true;

    try {
      const allUsers = getAllRegisteredUsers();
      const now = new Date();

      for (const user of allUsers) {
        // Hanya periksa userbot yang saat ini aktif & punya tanggal kedaluwarsa
        if (user.is_active !== 1 || !user.expired_at) continue;
        if (now <= new Date(user.expired_at)) continue;

        console.log(`⚠️ [DeltaUbotJS] User [${user.telegram_id}] masa aktif telah kadaluwarsa! Menonaktifkan...`);

        // 1. Matikan instans userbot
        await userbotManager.stopUserbot(user.telegram_id);

        // 2. Tandai nonaktif di database
        await updateUserbotStatus(user.telegram_id, false);

        // 3. Kirim notifikasi pribadi via Master Bot
        try {
          await bot.api.sendMessage(user.telegram_id,
            '⚠️ **DELTAUBOTJS - MASA AKTIF HABIS** ⚠️\n' +
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
      console.error('❌ Error in Expiration Checker service:', error);
    } finally {
      isRunning = false;
    }
  }, EXPIRATION_CHECK_INTERVAL_MS);
}

async function main() {
  console.log('🤖 Starting DeltaUbotJS Manager...');

  try {
    // 1. Start Expiration Checker Service
    startExpirationChecker();

    // 2. Start Userbot Watchdog Service
    userbotManager.startWatchdog();

    // 3. Start the Master Bot, and load userbots ONLY after it successfully connects
    console.log('⚡ Starting Master Bot...');
    await bot.start({
      onStart: async (info) => {
        global.MASTER_BOT_USERNAME = info.username;
        console.log(`🤖 Master Bot [@${info.username}] is running successfully!`);

        // 4. Restart all active userbots from database as the final step
        console.log('📦 Starting all active userbots...');
        await userbotManager.restartAllActive();
        console.log('✅ All systems and userbots are fully loaded.');
      }
    });
  } catch (error) {
    console.error('💥 Critical error during system startup:', error);
    process.exit(1);
  }
}

// Graceful shutdown handlers
async function shutdown(signal) {
  console.log(`\n🔌 Received ${signal}. Shutting down gracefully...`);

  try {
    console.log('Stop Master Bot...');
    await bot.stop();

    userbotManager.stopWatchdog();

    console.log('Disconnecting all active userbots...');
    const activeIds = Array.from(userbotManager.clients.keys());
    for (const id of activeIds) {
      await userbotManager.stopUserbot(id);
    }

    // Close MongoDB connection if active
    try {
      const mongoose = await import('mongoose');
      if (mongoose.default.connection.readyState === 1) {
        console.log('Closing MongoDB connection...');
        await mongoose.default.disconnect();
      }
    } catch (err) {
      console.error('Error closing MongoDB connection:', err.message);
    }

    console.log('👋 Shutdown complete.');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the application
main();
