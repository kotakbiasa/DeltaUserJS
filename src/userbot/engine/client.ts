import { TelegramClient, InputMedia } from '@mtcute/node';
import { MemoryStorage } from '@mtcute/core';
import { Dispatcher } from '@mtcute/dispatcher';
import { convertFromGramjsSession } from '@mtcute/convert';
import config from '../../config.js';
import { getUserbotSession, updateTelegramPremiumStatus } from '../../infrastructure/database.js';
import { loadAllPlugins } from './pluginLoader.js';
import { loadedPlugins, normalizePluginName, parseCommandName, getPluginForCommand } from './pluginRegistry.js';
import { Logger } from '../../utils/logger.js';
import { checkRateLimit, shouldCountForRateLimit } from './rateLimiter.js';
import { isTestEnv } from '../../utils/env.js';
import { animateEmojisWithRestrictedPack, stripTgEmojiTags } from '../../utils/customEmoji.js';
import { createUserbotMessageAdapter } from './adapter.js';
import type { CompatClient, LegacyPeer, LegacySendMessageParams, LegacySendFileOptions } from './compatClient.js';
import type { InputPeerLike } from '@mtcute/core';

function disabledSet(settings: { disabled_plugins?: string[] } | null | undefined) {
  return new Set((settings?.disabled_plugins || []).map(normalizePluginName));
}

let pluginLoadPromise: Promise<unknown> | null = null;

export class UserbotClient {
  public telegramId: number;
  public sessionString: string;
  /** mtcute client + alias legacy; null sebelum start()/setelah stop(). */
  public client: CompatClient;
  public dp: Dispatcher | null;
  public isActive: boolean;
  public floodWaitUntil: number | null;
  public lastFloodSeconds: number;
  public lastError: string | null;
  private _stopping: boolean;

  constructor(telegramId: number, sessionString: string) {
    this.telegramId = Number(telegramId);
    this.sessionString = sessionString;
    this.client = null;
    this.dp = null;
    this.isActive = false;
    this.floodWaitUntil = null;
    this.lastFloodSeconds = 0;
    this.lastError = null;
    this._stopping = false;
  }

  isFloodWaiting(): boolean {
    return Boolean(this.floodWaitUntil && Date.now() < this.floodWaitUntil);
  }

  getFloodWaitSecondsLeft(): number {
    if (!this.floodWaitUntil || Date.now() >= this.floodWaitUntil) {
      return 0;
    }
    return Math.max(0, Math.ceil((this.floodWaitUntil - Date.now()) / 1000));
  }

  recordFloodWait(seconds: number) {
    const sec = Math.max(1, Number(seconds) || 1);
    this.floodWaitUntil = Date.now() + sec * 1000;
    this.lastFloodSeconds = sec;
    this.lastError = `FLOOD_WAIT_${sec}`;
    Logger.logUser(
      this.telegramId,
      `🛡️ [FloodGuard] FLOOD_WAIT_${sec} terdeteksi! Akun memasuki mode hibernasi aman selama ${sec} detik.`,
      'WARN'
    );
  }

  handlePossibleFloodError(err: unknown) {
    const errStr = String(err || '');
    const seconds =
      typeof err === 'object' && err !== null && 'seconds' in err && typeof (err as { seconds?: unknown }).seconds === 'number'
        ? (err as { seconds: number }).seconds
        : null;
    const match = errStr.match(/FLOOD_WAIT_(\d+)/i) || (seconds !== null ? [null, String(seconds)] : null);
    if (match && match[1]) {
      const sec = parseInt(match[1], 10);
      this.recordFloodWait(sec);
    }
  }

  async start() {
    try {
      if (!pluginLoadPromise) {
        pluginLoadPromise = loadAllPlugins();
      }
      try {
        await pluginLoadPromise;
      } catch (err) {
        pluginLoadPromise = null;
        throw err;
      }

      // 1. Prepare mtcute storage & client
      const storage = new MemoryStorage();
      // Alias legacy baru ditempel setelahnya oleh setupClientCompatibility(),
      // jadi satu cast terdokumentasi di sini, bukan `any` yang menyebar.
      this.client = new TelegramClient({
        apiId: config.apiId,
        apiHash: config.apiHash,
        storage,
        initConnectionOptions: {
          deviceModel: 'Chrome 147',
          systemVersion: 'Android 11',
          appVersion: '2.2 K',
          langCode: 'id',
          systemLangCode: 'id-ID',
        },
      }) as unknown as CompatClient;

      // 2. Import session (with automatic GramJS session conversion)
      if (this.sessionString) {
        let imported = false;
        // Try importing directly as mtcute session
        try {
          await this.client.importSession(this.sessionString);
          imported = true;
        } catch {
          // If direct import fails, try converting from GramJS format
          try {
            const converted = convertFromGramjsSession(this.sessionString);
            await this.client.importSession(converted);
            imported = true;
            Logger.logUser(this.telegramId, `🔄 Sesi GramJS berhasil dimigrasi ke mtcute on-the-fly.`, 'INFO');
          } catch (convErr) {
            Logger.logUser(this.telegramId, `⚠️ Gagal konversi sesi GramJS: ${convErr}`, 'WARN');
          }
        }

        if (!imported) {
          throw new Error('Sesi userbot tidak valid atau gagal diimpor ke mtcute');
        }
      }

      // 3. Connect & start mtcute
      await this.client.start();
      this.setupClientCompatibility();
      this.setupEmojiInterceptor();
      this.isActive = true;
      Logger.logUser(this.telegramId, `🤖 DeltaUbotJS (mtcute) [${this.telegramId}] connected successfully.`, 'SUCCESS');

      // 4. Detect and sync official Telegram Premium status
      try {
        const me = await this.client.getMe();
        if (me && typeof me.isPremium === 'boolean') {
          await updateTelegramPremiumStatus(this.telegramId, me.isPremium ? 1 : 0);
        }
      } catch (err) {
        Logger.logUser(this.telegramId, `⚠️ Could not sync Telegram Premium status: ${err}`, 'WARN');
      }

      // 5. Register dispatcher handlers
      this.registerHandlers();

      // 6. Restart persistent schedules on startup
      await this.restartSchedules();
    } catch (error) {
      Logger.logUser(this.telegramId, `❌ Failed to start DeltaUbotJS for user ${this.telegramId}: ${error}`, 'ERROR');
      this.isActive = false;
      throw error;
    }
  }

  async restartSchedules() {
    try {
      const { getSchedules } = await import('../../infrastructure/database.js');
      const { startLoop } = await import('../handlers/util/loop.js');

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

  isConnected() {
    return this.isActive;
  }

  async stop() {
    if (this._stopping) {
      Logger.logUser(this.telegramId, `⚠️ Stop already in progress for [${this.telegramId}], skipping.`, 'WARN');
      return;
    }
    this._stopping = true;

    try {
      const { loopStore } = await import('../handlers/util/loop.js');
      const loops = loopStore.get(Number(this.telegramId));
      if (loops) {
        const loopCount = loops.size;
        for (const [, loopData] of loops.entries()) {
          clearInterval(loopData.intervalId);
        }
        loops.clear();
        loopStore.delete(Number(this.telegramId));
        if (loopCount > 0) {
          Logger.logUser(this.telegramId, `🧹 Cleaned up ${loopCount} active loops for [${this.telegramId}]`, 'INFO');
        }
      }
    } catch {
      // ignore
    }

    if (this.client) {
      try {
        if (this.dp) {
          this.dp.destroy();
        }
        // mtcute: destroy(). close()/disconnect() hanya ada di klien mock test.
        const shutdown = this.client as unknown as {
          destroy?: () => Promise<void>;
          close?: () => Promise<void>;
          disconnect?: () => Promise<void>;
        };
        if (typeof shutdown.destroy === 'function') {
          await shutdown.destroy();
        } else if (typeof shutdown.close === 'function') {
          await shutdown.close();
        } else if (typeof shutdown.disconnect === 'function') {
          await shutdown.disconnect();
        }
        Logger.logUser(this.telegramId, `🔌 DeltaUbotJS [${this.telegramId}] disconnected gracefully.`, 'INFO');
      } catch (err) {
        Logger.logUser(this.telegramId, `❌ Error disconnecting DeltaUbotJS [${this.telegramId}]: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      }
    }
    this.isActive = false;
    this._stopping = false;
  }

  registerHandlers() {
    if (!this.client) {return;}

    // In testing or mock mode, we might register mock event handlers directly
    if (typeof this.client.addEventHandler === 'function' && !this.dp) {
      this.registerMockHandlers();
      return;
    }

    // Dispatcher menuntut TelegramClient asli; CompatClient hanya beda di
    // signature alias legacy, instance-nya tetap klien mtcute yang sama.
    this.dp = Dispatcher.for(this.client as unknown as TelegramClient);

    // ==========================================
    // Handler 1: Pesan Masuk (NewMessage)
    // ==========================================
    this.dp.onNewMessage(async (rawMsg) => {
      if (!rawMsg) {return;}

      if (this.isFloodWaiting()) {
        Logger.logUser(this.telegramId, `🛡️ FloodGuard Active (${this.getFloodWaitSecondsLeft()}s left) — suppressing command execution.`, 'WARN');
        return;
      }

      const settings = getUserbotSession(this.telegramId);
      if (!settings) {return;}

      const message = createUserbotMessageAdapter(rawMsg, this.client);

      const chatId = message.chatId;
      const chatKey = String(chatId);
      const chatSettings = (settings.chat_settings || {})[chatKey] || {};
      const globalPrefix = settings.vars?.PREFIX || '.';
      const customPrefix = chatSettings.prefix || globalPrefix;

      if (message.out && message.message) {
        const text = message.message;
        if (customPrefix !== '.') {
          if (text.startsWith(customPrefix)) {
            message.message = '.' + text.slice(customPrefix.length);
          } else if (text.startsWith('.')) {
            message.message = '_\x00_' + text;
          }
        }
      }

      const isOwnCommand = shouldCountForRateLimit(message);
      if (isOwnCommand && !isTestEnv && !checkRateLimit(Number(this.telegramId))) {
        Logger.logUser(this.telegramId, '⚠️ Rate limit exceeded — ignoring command.', 'WARN');
        return;
      }

      const activeCommand = message.out ? parseCommandName(message.message) : null;
      const targetPlugin = activeCommand ? getPluginForCommand(activeCommand) : null;

      const disabled = disabledSet(settings);
      for (const plugin of loadedPlugins) {
        if (disabled.has(normalizePluginName(plugin.name))) {continue;}
        if (plugin.commands && plugin.commands.length > 0 && plugin !== targetPlugin) {continue;}

        try {
          await plugin.execute(this.client, message, settings, this.telegramId);
        } catch (err) {
          this.handlePossibleFloodError(err);
          Logger.logUser(this.telegramId, `Error in plugin ${plugin.name}: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        }
      }
    });

    // ==========================================
    // Handler 2: Callback Query (Inline Button Clicks)
    // ==========================================
    // Hanya callback dari pesan chat biasa: inline & business callback query
    // tidak punya `chat`/`messageId`, dan seluruh UI userbot ini berbasis
    // pesan chat. Dulu dipasang lewat onAnyCallbackQuery dan dua jenis
    // lainnya pasti gagal diam-diam di `query.chat.id`.
    this.dp.onCallbackQuery(async (query) => {
      if (this.isFloodWaiting()) {return;}

      let cachedMessage: ReturnType<typeof createUserbotMessageAdapter> | null = null;
      const fetchMessage = async () => {
        if (cachedMessage) {return cachedMessage;}
        try {
          // mtcute tidak punya getMessage() tunggal — pemanggilan lama selalu
          // melempar dan tertelan catch, jadi pesan tidak pernah ketemu.
          const [found] = await this.client.getMessages(query.chat.id, [query.messageId]);
          cachedMessage = found ? createUserbotMessageAdapter(found, this.client) : null;
          return cachedMessage;
        } catch {
          return null;
        }
      };

      const callbackEvent = {
        data: query.data,
        peer: query.chat.id,
        msgId: query.messageId,
        message: null,
        getMessage: fetchMessage,
        editMessage: async (text: string, options: { parseMode?: 'html' | 'markdown'; replyMarkup?: unknown; buttons?: unknown } = {}) => {
          try {
            await this.client.editMessage({
              chat: query.chat.id,
              id: query.messageId,
              text,
              parseMode: options.parseMode || 'html',
              replyMarkup: options.replyMarkup || options.buttons,
            });
          } catch (err) {
            this.handlePossibleFloodError(err);
            if (!String(err).includes('not modified')) {
              Logger.logUser(this.telegramId, `❌ Error editing callback message: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
            }
          }
        },
        answer: async (options: { alert?: boolean; message?: string } = {}) => {
          try {
            await query.answer({
              text: options.message || '',
              alert: options.alert || false,
            });
          } catch (err) {
            this.handlePossibleFloodError(err);
            Logger.logUser(this.telegramId, `❌ Error answering callback for [${this.telegramId}]: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
          }
        },
      };

      const settings = getUserbotSession(this.telegramId);
      const disabled = disabledSet(settings);

      for (const plugin of loadedPlugins) {
        if (disabled.has(normalizePluginName(plugin.name))) {continue;}
        if (typeof plugin.onCallbackQuery !== 'function') {continue;}

        try {
          const handled = await plugin.onCallbackQuery(this.client, callbackEvent, settings, this.telegramId);
          if (handled) {break;}
        } catch (err) {
          this.handlePossibleFloodError(err);
          Logger.logUser(this.telegramId, `Error in plugin ${plugin.name} callback: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        }
      }
    });

    // ==========================================
    // Handler 3: Edit Message (Auto-delete signal '␡')
    // ==========================================
    this.dp.onEditMessage(async (msg) => {
      try {
        if (msg && msg.isOutgoing && msg.text === '␡') {
          await this.client.deleteMessages(msg.chat.id, [msg.id]);
        }
      } catch {
        // ignore
      }
    });
  }

  /**
   * Fallback for mock environments (such as E2E test runner)
   */
  private registerMockHandlers() {
    /** Bentuk pesan yang dikirim mock client E2E (gaya legacy, bukan mtcute). */
    type MockEventMessage = {
      chatId: number | string;
      out?: boolean;
      message: string;
    };

    this.client.addEventHandler?.(async (rawEvent: unknown) => {
      const message = (rawEvent as { message?: MockEventMessage }).message;
      if (!message) {return;}

      const settings = getUserbotSession(this.telegramId);
      if (!settings) {return;}

      const chatId = message.chatId;
      const chatKey = String(chatId);
      const chatSettings = (settings.chat_settings || {})[chatKey] || {};
      const globalPrefix = settings.vars?.PREFIX || '.';
      const customPrefix = chatSettings.prefix || globalPrefix;

      if (message.out && message.message) {
        const text = message.message;
        if (customPrefix !== '.') {
          if (text.startsWith(customPrefix)) {
            message.message = '.' + text.slice(customPrefix.length);
          } else if (text.startsWith('.')) {
            message.message = '_\x00_' + text;
          }
        }
      }

      const activeCommand = message.out ? parseCommandName(message.message) : null;
      const targetPlugin = activeCommand ? getPluginForCommand(activeCommand) : null;

      const disabled = disabledSet(settings);
      for (const plugin of loadedPlugins) {
        if (disabled.has(normalizePluginName(plugin.name))) {continue;}
        if (plugin.commands && plugin.commands.length > 0 && plugin !== targetPlugin) {continue;}

        try {
          await plugin.execute(this.client, message, settings, this.telegramId);
        } catch (err) {
          this.handlePossibleFloodError(err);
          Logger.logUser(this.telegramId, `Error in plugin ${plugin.name}: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        }
      }
    }, { constructor: { name: 'NewMessage' } });
  }

  /**
   * Add compatibility aliases to mtcute client so plugins calling legacy GramJS methods continue working
   */
  private setupClientCompatibility(): void {
    if (!this.client) {return;}

    if (!this.client.sendMessage) {
      this.client.sendMessage = async (peer: LegacyPeer, params: LegacySendMessageParams | string) => {
        const opts = typeof params === 'string' ? {} : (params ?? {});
        const text = typeof params === 'string' ? params : (opts.message ?? opts.text ?? '');
        return await this.client.sendText(peer, text, {
          replyTo: opts.replyTo,
          parseMode: opts.parseMode || 'html',
        });
      };
    }

    if (!this.client.getEntity) {
      this.client.getEntity = async (peer: LegacyPeer) => {
        try {
          const chat = await this.client.getChat(peer);
          return {
            id: chat.id,
            title: chat.title,
            username: chat.username,
            // Chat mtcute hanya mengekspos nama ini untuk peer user.
            firstName: (chat as { firstName?: string }).firstName,
            lastName: (chat as { lastName?: string }).lastName,
          };
        } catch {
          return { id: peer };
        }
      };
    }

    if (!this.client.invoke) {
      this.client.invoke = async (call: unknown) => 
        // Objek TL mentah (punya `_`); mtcute mengeksposnya lewat call().
         await this.client.call(call as Parameters<CompatClient['call']>[0])
      ;
    }

    if (!this.client.getMessages) {
      this.client.getMessages = async (peer: LegacyPeer, params?: { ids?: number[] } & Record<string, unknown>) => {
        if (params?.ids) {
          return await this.client.getMessages(peer, params.ids);
        }
        return await this.client.getHistory(peer, params as Parameters<CompatClient['getHistory']>[1]);
      };
    }

    if (!this.client.sendFile) {
      this.client.sendFile = async (chat: LegacyPeer, options: LegacySendFileOptions) => {
        const file = options?.file ?? options;
        const caption = options?.caption ?? options?.message ?? '';
        const params: Record<string, unknown> = {
          caption,
          replyTo: options?.replyTo,
          parseMode: options?.parseMode || 'html',
        };
        let mediaObj: unknown;
        if (options?.forceDocument) {
          mediaObj = InputMedia.document(file as Parameters<typeof InputMedia.document>[0]);
        } else if (
          options?.attributes?.some(
            (a) => a?._ === 'documentAttributeAnimated' || a?.className === 'DocumentAttributeAnimated'
          )
        ) {
          mediaObj = InputMedia.animation(file as Parameters<typeof InputMedia.animation>[0]);
        } else {
          mediaObj = InputMedia.auto(file as Parameters<typeof InputMedia.auto>[0]);
        }
        return await this.client.sendMedia(chat, mediaObj as Parameters<CompatClient['sendMedia']>[1], params);
      };
    }

    const origDeleteMessages = this.client.deleteMessages?.bind(this.client);
    this.client.deleteMessages = async (chatOrMsgs: unknown, idsOrParams?: unknown, maybeParams?: unknown) => {
      if (Array.isArray(idsOrParams) && typeof idsOrParams[0] === 'number') {
        return await this.client.deleteMessagesById(chatOrMsgs as InputPeerLike, idsOrParams, maybeParams);
      }
      if (Array.isArray(chatOrMsgs) && typeof chatOrMsgs[0] === 'object') {
        return await origDeleteMessages(chatOrMsgs, idsOrParams);
      }
      if (Array.isArray(idsOrParams)) {
        return await this.client.deleteMessagesById(chatOrMsgs as InputPeerLike, idsOrParams as number[], maybeParams);
      }
      return await this.client.deleteMessagesById(chatOrMsgs as InputPeerLike, [idsOrParams as number], maybeParams);
    };

    if (!this.client.downloadProfilePhoto) {
      this.client.downloadProfilePhoto = async (peer: LegacyPeer) => {
        try {
          // getProfilePhoto() mtcute butuh photoId; ambil foto terbaru dulu.
          const [photo] = await this.client.getProfilePhotos(peer as InputPeerLike, { limit: 1 });
          if (!photo) {return undefined;}
          return Buffer.from(await this.client.downloadAsBuffer(photo));
        } catch {
          return undefined;
        }
      };
    }
  }

  private setupEmojiInterceptor(): void {
    if (!this.client) {return;}

    const accountIsPremium = () => {
      const premium = getUserbotSession(this.telegramId)?.is_telegram_premium;
      return premium === true || Number(premium) === 1;
    };

    const renderEmojiText = (text: string) =>
      accountIsPremium() ? animateEmojisWithRestrictedPack(text) : stripTgEmojiTags(text);

    // Intercept sendText
    const origSendText = this.client.sendText?.bind(this.client);
    if (origSendText) {
      this.client.sendText = (chat: LegacyPeer, text: unknown, params?: unknown) => {
        if (typeof text === 'string') {
          text = renderEmojiText(text);
        }
        return origSendText(chat, text, params);
      };
    }

    // Intercept editMessage
    const origEditMessage = this.client.editMessage?.bind(this.client);
    if (origEditMessage) {
      type EditPayload = { text?: string } & Record<string, unknown>;
      this.client.editMessage = (params: EditPayload, maybeParams?: EditPayload) => {
        if (maybeParams !== undefined) {
          // Legacy call (peer, { message, text })
          if (typeof maybeParams.text === 'string') {
            maybeParams.text = renderEmojiText(maybeParams.text);
          }
          return origEditMessage(params, maybeParams);
        }
        if (params && typeof params.text === 'string') {
          params.text = renderEmojiText(params.text);
        }
        return origEditMessage(params);
      };
    }
  }
}
