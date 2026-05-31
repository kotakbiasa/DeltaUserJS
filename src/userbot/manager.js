import { UserbotClient } from './client.js';
import { getAllActiveUserbots } from '../database/db.js';

class UserbotManager {
  constructor() {
    this.clients = new Map(); // Store active clients: telegramId -> UserbotClient
  }

  /**
   * Start a userbot instance
   * @param {number} telegramId 
   * @param {string} sessionString 
   */
  async startUserbot(telegramId, sessionString) {
    // If already running, stop it first
    if (this.clients.has(telegramId)) {
      console.log(`🔄 Userbot [${telegramId}] is already running. Stopping before restart...`);
      await this.stopUserbot(telegramId);
    }

    const userbot = new UserbotClient(telegramId, sessionString);
    this.clients.set(telegramId, userbot);

    try {
      await userbot.start();
      return true;
    } catch (error) {
      this.clients.delete(telegramId);
      throw error;
    }
  }

  /**
   * Stop a userbot instance
   * @param {number} telegramId 
   */
  async stopUserbot(telegramId) {
    const userbot = this.clients.get(telegramId);
    if (userbot) {
      await userbot.stop();
      this.clients.delete(telegramId);
      return true;
    }
    return false;
  }

  /**
   * Restart all userbots marked active in the database
   */
  async restartAllActive() {
    console.log('🚀 Restarting all active userbots from database...');
    try {
      const activeBots = getAllActiveUserbots();
      console.log(`found ${activeBots.length} active userbots to start.`);
      
      for (const bot of activeBots) {
        try {
          // Add a random delay of 2 to 5 seconds between starting each userbot client
          // This avoids sending too many connection requests simultaneously (anti-flood check)
          const delayMs = Math.floor(Math.random() * 3000) + 2000;
          console.log(`⏳ Waiting ${delayMs}ms before starting userbot [${bot.telegram_id}]...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));

          await this.startUserbot(bot.telegram_id, bot.session_string);
        } catch (err) {
          console.error(`❌ Failed to auto-restart userbot for ${bot.telegram_id}:`, err.message);
        }
      }
    } catch (error) {
      console.error('❌ Error during auto-restart of userbots:', error);
    }
  }

  /**
   * Check if a userbot is currently running
   * @param {number} telegramId 
   * @returns {boolean}
   */
  isRunning(telegramId) {
    const client = this.clients.get(telegramId);
    return client ? client.isActive : false;
  }
}

// Export a single instance to be used everywhere
const userbotManager = new UserbotManager();
export default userbotManager;
