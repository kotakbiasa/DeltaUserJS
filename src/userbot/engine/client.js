import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { NewMessage, Raw } from 'teleproto/events/index.js';
import { Api } from 'teleproto';
import config from '../../config.js';
import { getUserbotSession } from '../../core/database.js';
import { loadAllPlugins } from './pluginLoader.js';
import { loadedPlugins, normalizePluginName } from './pluginRegistry.js';
import { Logger } from '../../utils/logger.js';

function disabledSet(settings) {
  return new Set((settings?.disabled_plugins || []).map(normalizePluginName));
}

// Flag untuk memastikan plugin hanya di-load sekali di seluruh proses
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
        systemLangCode: 'id-ID'
      });

      await this.client.connect();
      this.client.setParseMode('html');
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
   * Returns true if the client is currently active
   */
  isConnected() {
    return this.isActive;
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

      // 1. Ambil setelan terkini dari in-memory cache (0ms)
      const settings = getUserbotSession(this.telegramId);
      if (!settings) return;

      // 2. Jalankan seluruh plugin secara sekuensial
      const disabled = disabledSet(settings);
      for (const plugin of loadedPlugins) {
        if (disabled.has(normalizePluginName(plugin.name))) continue;

        try {
          await plugin.execute(this.client, message, settings, this.telegramId);
        } catch (err) {
          Logger.logUser(this.telegramId, `Error in plugin ${plugin.name}: ${err.message}`, 'ERROR');
        }
      }
    }, new NewMessage({}));

    // ==========================================
    // Handler 2: Callback Query (Inline Button Clicks)
    // Menggunakan Raw event untuk menangkap UpdateBotCallbackQuery
    // ==========================================
    this.client.addEventHandler(async (event) => {
      const update = event.update;

      // Objek event yang kompatibel dengan plugin
      const callbackEvent = {
        data: update.data,
        getMessage: async () => {
          try {
            const msgs = await this.client.getMessages(update.peer, { ids: [update.msgId] });
            return msgs[0] || null;
          } catch (err) {
            console.error(`❌ Error fetching callback message for [${this.telegramId}]:`, err.message);
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
          } catch (err) {
            console.error(`❌ Error answering callback for [${this.telegramId}]:`, err.message);
          }
        }
      };

      const settings = getUserbotSession(this.telegramId);
      const disabled = disabledSet(settings);

      // Jalankan onCallbackQuery pada setiap plugin yang memilikinya
      for (const plugin of loadedPlugins) {
        if (disabled.has(normalizePluginName(plugin.name))) continue;
        if (typeof plugin.onCallbackQuery !== 'function') continue;

        try {
          const handled = await plugin.onCallbackQuery(this.client, callbackEvent, settings, this.telegramId);
          if (handled) break; // Stop jika sudah ditangani
        } catch (err) {
          Logger.logUser(this.telegramId, `Error in plugin ${plugin.name} callback: ${err.message}`, 'ERROR');
        }
      }
    }, new Raw({ types: [Api.UpdateBotCallbackQuery] }));

    // ==========================================
    // Handler 3: Edit Message (Hapus pesan otomatis berdasarkan sinyal bot)
    // ==========================================
    this.client.addEventHandler(async (event) => {
      try {
        const update = event.update || event;
        if (!update) return;
        
        const msg = update.message;
        if (msg && msg.out && msg.message === '␡') {
          const peer = msg.peerId;
          if (peer && msg.id) {
            await this.client.deleteMessages(peer, [msg.id], { revoke: true });
          }
        }
      } catch (err) {
        // Abaikan error sunyi untuk event handler
      }
    }, new Raw({ types: [Api.UpdateEditMessage, Api.UpdateEditChannelMessage] }));
  }
}


