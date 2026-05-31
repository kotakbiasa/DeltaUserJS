import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage, Raw } from 'telegram/events/index.js';
import { Api } from 'telegram';
import config from '../config.js';
import { getUserbotSession } from '../database/db.js';
import { loadAllPlugins } from './pluginLoader.js';
import { loadedPlugins } from './pluginRegistry.js';

// Flag untuk memastikan plugin hanya di-load sekali
let pluginsLoaded = false;

export class UserbotClient {
  /**
   * @param {number} telegramId 
   * @param {string} sessionString 
   */
  constructor(telegramId, sessionString) {
    this.telegramId = telegramId;
    this.sessionString = sessionString;
    this.client = null;
    this.isActive = false;
  }

  /**
   * Start the userbot instance
   */
  async start() {
    try {
      // Load plugins sekali saja saat userbot pertama kali start
      if (!pluginsLoaded) {
        await loadAllPlugins();
        pluginsLoaded = true;
      }

      const stringSession = new StringSession(this.sessionString);
      
      this.client = new TelegramClient(stringSession, config.apiId, config.apiHash, {
        connectionRetries: 5,
        deviceModel: 'Chrome 147',
        systemVersion: 'Android 11',
        appVersion: '2.2 K',
        langCode: 'id',
        systemLangCode: 'id-ID',
      });

      await this.client.connect();
      this.isActive = true;
      console.log(`🤖 DeltaUbotJS [${this.telegramId}] connected successfully.`);

      // Register handlers
      this.registerHandlers();
      
    } catch (error) {
      console.error(`❌ Failed to start DeltaUbotJS for user ${this.telegramId}:`, error);
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Stop the userbot instance
   */
  async stop() {
    if (this.client) {
      try {
        await this.client.disconnect();
        console.log(`🔌 DeltaUbotJS [${this.telegramId}] disconnected.`);
      } catch (err) {
        console.error(`❌ Error disconnecting DeltaUbotJS [${this.telegramId}]:`, err);
      }
    }
    this.isActive = false;
  }

  /**
   * Register event handlers for the userbot
   */
  registerHandlers() {
    if (!this.client) return;

    // ==========================================
    // Handler 1: Pesan Masuk (NewMessage)
    // ==========================================
    this.client.addEventHandler(async (event) => {
      const message = event.message;
      if (!message) return;

      // 1. Ambil setelan terkini dari Database RAM Cache (0ms)
      const settings = getUserbotSession(this.telegramId);
      if (!settings) return;

      // 2. Jalankan seluruh plugin secara sekuensial (dari loadedPlugins)
      for (const plugin of loadedPlugins) {
        try {
          await plugin.execute(this.client, message, settings, this.telegramId);
        } catch (err) {
          console.error(`❌ Error in plugin ${plugin.name} for [${this.telegramId}]:`, err.message);
        }
      }
      
    }, new NewMessage({}));

    // ==========================================
    // Handler 2: Callback Query (Inline Button Clicks)
    // Menggunakan Raw event untuk menangkap UpdateBotCallbackQuery
    // ==========================================
    this.client.addEventHandler(async (event) => {
      const update = event.update;
      
      // Buat object event yang kompatibel dengan plugin
      const callbackEvent = {
        data: update.data,
        getMessage: async () => {
          try {
            // Ambil pesan yang mengandung tombol inline
            const msgs = await this.client.getMessages(update.peer, { ids: [update.msgId] });
            return msgs[0] || null;
          } catch (e) {
            return null;
          }
        },
        answer: async (options = {}) => {
          try {
            await this.client.invoke(
              new Api.messages.SetBotCallbackAnswer({
                queryId: update.queryId,
                alert: options.alert || false,
                message: options.message || ''
              })
            );
          } catch (e) {}
        }
      };

      // Jalankan onCallbackQuery pada setiap plugin yang memilikinya
      for (const plugin of loadedPlugins) {
        if (typeof plugin.onCallbackQuery === 'function') {
          try {
            const handled = await plugin.onCallbackQuery(this.client, callbackEvent);
            if (handled) break; // Stop jika sudah ditangani
          } catch (err) {
            console.error(`❌ Error in plugin ${plugin.name} callback handler for [${this.telegramId}]:`, err.message);
          }
        }
      }
    }, new Raw({ types: [Api.UpdateBotCallbackQuery] }));
  }
}
