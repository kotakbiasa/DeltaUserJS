import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { NewMessage, Raw } from 'teleproto/events/index.js';
import { Api } from 'teleproto';
import type { EditMessageParams } from 'teleproto/client/messages.js';
import config from '../../config.js';
import { getUserbotSession } from '../../infrastructure/database.js';
import { loadAllPlugins } from './pluginLoader.js';
import { loadedPlugins, normalizePluginName } from './pluginRegistry.js';
import { Logger } from '../../utils/logger.js';
import { checkRateLimit } from './rateLimiter.js';
import { isTestEnv } from '../../utils/env.js';

function disabledSet(settings) {
  return new Set((settings?.disabled_plugins || []).map(normalizePluginName));
}

// Load-once memoization: the FIRST caller kicks off loadAllPlugins() and every
// concurrent starter awaits the same promise. A bare boolean flag was racy —
// two userbots starting at once could both enter loadAllPlugins() and clobber
// the registry mid-clear.
let pluginLoadPromise: Promise<unknown> | null = null;

export class UserbotClient {
  public telegramId: number;
  public sessionString: string;
  public client: TelegramClient | null;
  public isActive: boolean;
  private _stopping: boolean;
  /**
   * @param {number} telegramId
   * @param {string} sessionString
   */
  constructor(telegramId, sessionString) {
    this.telegramId = telegramId;
    this.sessionString = sessionString;
    this.client = null;
    this.isActive = false;
    this._stopping = false;
  }

  /**
   * Start the userbot instance
   */
  async start() {
    try {
      // Load plugins exactly once across the whole process. Concurrent starts
      // all await the same in-flight promise instead of each triggering a load.
      if (!pluginLoadPromise) {
        pluginLoadPromise = loadAllPlugins();
      }
      try {
        await pluginLoadPromise;
      } catch (err) {
        // Allow a later start to retry if the initial load failed.
        pluginLoadPromise = null;
        throw err;
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
      Logger.logUser(this.telegramId, `🤖 DeltaUbotJS [${this.telegramId}] connected successfully.`, 'SUCCESS');

      // Register handlers
      this.registerHandlers();

      // Restart persistent schedules on startup
      await this.restartSchedules();
    } catch (error) {
      Logger.logUser(this.telegramId, `❌ Failed to start DeltaUbotJS for user ${this.telegramId}: ${error}`, 'ERROR');
      this.isActive = false;
      throw error;
    }
  }

  /**
   * Restart persistent loop schedules
   */
  async restartSchedules() {
    try {
      const { getSchedules } = await import('../../infrastructure/database.js');
      const { startLoop } = await import('../handlers/util/schedule.js');
      
      const schedules = getSchedules(this.telegramId);
      for (const s of schedules) {
        if (s.type === 'loop') {
          startLoop(this.client, this.telegramId, s.chatKey, s.value, s.message, false);
        }
      }
      Logger.logUser(this.telegramId, `🔁 Restored ${schedules.length} loop schedules for [${this.telegramId}].`, 'INFO');
    } catch (err) {
      Logger.logUser(this.telegramId, `❌ Failed to restart schedules for [${this.telegramId}]: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
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
    if (this._stopping) {
      Logger.logUser(this.telegramId, `⚠️ Stop already in progress for [${this.telegramId}], skipping.`, 'WARN');
      return;
    }
    this._stopping = true;

    // Cleanup: stop all active loops for this userbot to prevent memory leaks
    try {
      const { loopStore } = await import('../handlers/util/schedule.js');
      const loops = loopStore.get(Number(this.telegramId));
      if (loops) {
        const loopCount = loops.size;
        for (const [_chatKey, loopData] of loops.entries()) {
          clearInterval(loopData.intervalId);
        }
        loops.clear();
        loopStore.delete(Number(this.telegramId));
        if (loopCount > 0) {Logger.logUser(this.telegramId, `🧹 Cleaned up ${loopCount} active loops for [${this.telegramId}]`, 'INFO');}
      }
    } catch (_e) { /* ignore: schedule module may not be loaded */ }

    if (this.client) {
      try {
        await this.client.disconnect();
        Logger.logUser(this.telegramId, `🔌 DeltaUbotJS [${this.telegramId}] disconnected gracefully.`, 'INFO');
      } catch (err) {
        Logger.logUser(this.telegramId, `❌ Error disconnecting DeltaUbotJS [${this.telegramId}]: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      }
    }
    this.isActive = false;
    this._stopping = false;
  }

  /**
   * Register event handlers for the userbot
   */
  registerHandlers() {
    if (!this.client) {return;}

    // ==========================================
    // Handler 1: Pesan Masuk (NewMessage)
    // ==========================================
    this.client.addEventHandler(async (event) => {
      const message = event.message;
      if (!message) {return;}

      // 1. Ambil setelan terkini dari in-memory cache (0ms)
      const settings = getUserbotSession(this.telegramId);
      if (!settings) {return;}

      // Get prefix setting for the current chat (fallback to global PREFIX var)
      const chatId = message.chatId;
      const chatKey = String(chatId);
      const chatSettings = (settings.chat_settings || {})[chatKey] || {};
      const globalPrefix = settings.vars?.PREFIX || '.';
      const customPrefix = chatSettings.prefix || globalPrefix;

      // If message is outgoing, intercept custom prefix to '.' and enforce signature
      if (message.out && message.message) {
        const text = message.message;
        if (customPrefix !== '.') {
          if (text.startsWith(customPrefix)) {
            message.message = '.' + text.slice(customPrefix.length);
          } else if (text.startsWith('.')) {
            // Ignore old prefix
            message.message = '_\x00_' + text;
          }
        }
      }

      // 2. Rate limit check — prevent command spam (e.g., rapid .exec/.gcast)
      // Skip in test environment to avoid breaking E2E tests that send many
      // messages in rapid succession.
      if (!isTestEnv && !checkRateLimit(Number(this.telegramId))) {
        Logger.logUser(this.telegramId, '⚠️ Rate limit exceeded — ignoring command.', 'WARN');
        return;
      }

      // 3. Jalankan seluruh plugin secara sekuensial
      const disabled = disabledSet(settings);
      for (const plugin of loadedPlugins) {
        if (disabled.has(normalizePluginName(plugin.name))) {continue;}

        try {
          await plugin.execute(this.client, message, settings, this.telegramId);
        } catch (err) {
          Logger.logUser(this.telegramId, `Error in plugin ${plugin.name}: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
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
        peer: update.peer,
        msgId: update.msgId,
        message: null as unknown,
        getMessage: async () => {
          try {
            const msgs = await this.client.getMessages(update.peer, { ids: [update.msgId] });
            callbackEvent.message = msgs[0] || null;
            return msgs[0] || null;
          } catch (err) {
            Logger.logUser(this.telegramId, `❌ Error fetching callback message for [${this.telegramId}]: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            return null;
          }
        },
        editMessage: async (text: string, options: Omit<EditMessageParams, 'message'> = {}) => {
          try {
            await this.client.editMessage(update.peer, {
              message: update.msgId,
              text,
              parseMode: options.parseMode || 'html',
              buttons: options.buttons,
            });
          } catch (err) {
            if (!String(err).includes('not modified')) {
              Logger.logUser(this.telegramId, `❌ Error editing callback message: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            }
          }
        },
        answer: async (options: { alert?: boolean; message?: string } = {}) => {
          try {
            await this.client.invoke(
              new Api.messages.SetBotCallbackAnswer({
                queryId: update.queryId,
                alert: options.alert || false,
                message: options.message || ''
              })
            );
          } catch (err) {
            Logger.logUser(this.telegramId, `❌ Error answering callback for [${this.telegramId}]: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
          }
        }
      };

      const settings = getUserbotSession(this.telegramId);
      const disabled = disabledSet(settings);

      // Jalankan onCallbackQuery pada setiap plugin yang memilikinya
      for (const plugin of loadedPlugins) {
        if (disabled.has(normalizePluginName(plugin.name))) {continue;}
        if (typeof plugin.onCallbackQuery !== 'function') {continue;}

        try {
          const handled = await plugin.onCallbackQuery(this.client, callbackEvent, settings, this.telegramId);
          if (handled) {break;} // Stop jika sudah ditangani
        } catch (err) {
          Logger.logUser(this.telegramId, `Error in plugin ${plugin.name} callback: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        }
      }
    }, new Raw({ types: [Api.UpdateBotCallbackQuery] }));

    // ==========================================
    // Handler 3: Edit Message (Hapus pesan otomatis berdasarkan sinyal bot)
    // ==========================================
    this.client.addEventHandler(async (event) => {
      try {
        const update = event.update || event;
        if (!update) {return;}
        
        const msg = update.message;
        if (msg && msg.out && msg.message === '␡') {
          const peer = msg.peerId;
          if (peer && msg.id) {
            await this.client.deleteMessages(peer, [msg.id], { revoke: true });
          }
        }
      } catch (_err) {
        // Abaikan error sunyi untuk event handler
      }
    }, new Raw({ types: [Api.UpdateEditMessage, Api.UpdateEditChannelMessage] }));
  }
}


