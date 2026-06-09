import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';
import { registerInlineHelpHandlers } from '../bot/inlineHelp.js';
import { registerInlineAntiPmHandlers } from '../bot/inlineAntiPm.js';
import { setupSettingsHandlers, sendFeaturesMenu } from '../bot/settingsHandler.js';
import { afkReasonConversation, customNameConversation } from '../bot/conversations.js';

class InlineBotManager {
  constructor() {
    // Menyimpan instance bot aktif (telegramId -> Bot instance)
    this.activeBots = new Map(); 
  }

  /**
   * Mulai custom inline bot untuk user tertentu
   * @param {number} telegramId 
   * @param {string} token 
   */
  async startInlineBot(telegramId, token) {
    if (!token) return;
    if (this.activeBots.has(telegramId)) {
      console.log(`🤖 Inline Bot for [${telegramId}] is already running.`);
      return;
    }

    try {
      const bot = new Bot(token);
      
      // Register handler yang sama dengan Master Bot agar bisa menjawab .help
      registerInlineHelpHandlers(bot);
      registerInlineAntiPmHandlers(bot);

      // Konfigurasi session & conversations
      bot.use(session({ initial: () => ({}) }));
      bot.use(conversations());
      bot.use(createConversation(afkReasonConversation, 'afk-reason-conv'));
      bot.use(createConversation(customNameConversation, 'custom-name-conv'));

      // Commands
      bot.command(['start', 'menu', 'settings'], async (ctx) => {
        // Cek apakah yang memanggil command adalah pemilik (Owner) dari bot ini
        if (ctx.from.id !== Number(telegramId)) {
          await ctx.reply("Halo! Saya adalah bot asisten pribadi.");
          return;
        }
        // Jika owner, tampilkan menu pengaturan
        await sendFeaturesMenu(ctx, false);
      });

      // Pasang handler pengaturan (callback untuk manage_features, toggle_reply, dll)
      setupSettingsHandlers(bot);

      // Jalankan bot di latar belakang
      bot.start({
        onStart: (botInfo) => {
          console.log(`✅ Custom Inline Bot started for [${telegramId}] as @${botInfo.username}`);
        }
      }).catch(err => {
        console.error(`❌ Custom Inline Bot polling error for [${telegramId}]:`, err.message);
        this.activeBots.delete(telegramId);
      });

      this.activeBots.set(telegramId, bot);
    } catch (err) {
      console.error(`❌ Failed to instantiate custom Inline Bot for [${telegramId}]:`, err.message);
    }
  }

  /**
   * Matikan custom inline bot untuk user tertentu
   * @param {number} telegramId 
   */
  async stopInlineBot(telegramId) {
    const bot = this.activeBots.get(telegramId);
    if (bot) {
      try {
        await bot.stop();
        console.log(`🔌 Custom Inline Bot for [${telegramId}] stopped.`);
      } catch (err) {
        console.error(`❌ Error stopping Custom Inline Bot for [${telegramId}]:`, err.message);
      }
      this.activeBots.delete(telegramId);
    }
  }

  /**
   * Matikan semua bot inline
   */
  async stopAll() {
    const promises = [];
    for (const telegramId of this.activeBots.keys()) {
      promises.push(this.stopInlineBot(telegramId));
    }
    await Promise.all(promises);
  }
}

const inlineBotManager = new InlineBotManager();
export default inlineBotManager;
