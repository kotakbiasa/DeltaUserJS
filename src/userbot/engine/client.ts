import fs from 'node:fs';
import path from 'node:path';
import { TelegramClient, InputMedia } from '@mtcute/node';
import { MemoryStorage, Long } from '@mtcute/core';
import { Dispatcher } from '@mtcute/dispatcher';
import config from '../../config.js';
import { getUserbotSession, updateTelegramPremiumStatus } from '../../infrastructure/database.js';
import { loadAllPlugins } from './pluginLoader.js';
import { loadedPlugins, normalizePluginName, parseCommandName, getPluginForCommand } from './pluginRegistry.js';
import { Logger } from '../../utils/logger.js';
import { checkRateLimit, shouldCountForRateLimit } from './rateLimiter.js';
import { isTestEnv } from '../../utils/env.js';
import { animateEmojisWithRestrictedPack, stripTgEmojiTags } from '../../utils/customEmoji.js';
import { createUserbotMessageAdapter } from './adapter.js';
import { thtml } from '@mtcute/html-parser';
import { md } from '@mtcute/markdown-parser';
import { toPeer } from './compatClient.js';
import type { EntityLike } from '../types.js';
import type { Message, InputPeerLike, InputText } from '@mtcute/core';
import type { CompatClient, LegacyPeer, LegacySendMessageParams, LegacySendFileOptions } from './compatClient.js';

function toTlParams(val: unknown): unknown {
  if (val === null || val === undefined) {return val;}
  if (typeof val === 'bigint') {
    return Long.fromValue(val);
  }
  if (Array.isArray(val)) {
    return val.map(toTlParams);
  }
  if (typeof val === 'object') {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = toTlParams(v);
    }
    return res;
  }
  return val;
}

function toLegacyResult(val: unknown): unknown {
  if (val === null || val === undefined) {return val;}
  if (Long.isLong(val)) {
    return BigInt(val.toString());
  }
  if (Array.isArray(val)) {
    return val.map(toLegacyResult);
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = toLegacyResult(v);
    }
    if (!res.className && typeof res._ === 'string') {
      const parts = (res._ as string).split('.');
      const last = parts[parts.length - 1];
      res.className = last ? last.charAt(0).toUpperCase() + last.slice(1) : res._;
    }
    return res;
  }
  return val;
}

function isLikelyImage(rawFile: unknown, fileName?: string): boolean {
  if (fileName && /\.(jpe?g|png|webp|bmp|gif)$/i.test(fileName)) {
    return true;
  }
  if (typeof rawFile === 'string') {
    const clean = rawFile.replace(/^file:/, '').split('?')[0];
    if (/\.(jpe?g|png|webp|bmp|gif)$/i.test(clean)) {
      return true;
    }
  }
  if (Buffer.isBuffer(rawFile) || rawFile instanceof Uint8Array) {
    const buf = rawFile as Uint8Array;
    if (buf.length >= 4) {
      // PNG: 89 50 4E 47
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {return true;}
      // JPEG: FF D8 FF
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {return true;}
      // GIF: GIF8
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {return true;}
      // WEBP: RIFF....WEBP
      if (
        buf.length >= 12 &&
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
      ) {
        return true;
      }
    }
  }
  return false;
}

function detectImageExtension(rawFile: unknown): string {
  if (Buffer.isBuffer(rawFile) || rawFile instanceof Uint8Array) {
    const buf = rawFile as Uint8Array;
    if (buf.length >= 4) {
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {return 'image.png';}
      if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {return 'image.jpg';}
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {return 'image.gif';}
      if (
        buf.length >= 12 &&
        buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
      ) {
        return 'image.webp';
      }
    }
  }
  return 'image.png';
}

function disabledSet(settings: { disabled_plugins?: string[] } | null | undefined) {
  return new Set((settings?.disabled_plugins || []).map(normalizePluginName));
}

let pluginLoadPromise: Promise<unknown> | null = null;

/**
 * `parseMode: false` gaya GramJS berarti "kirim verbatim". Di mtcute itu
 * dinyatakan dengan `undefined` (tanpa parser), bukan string kosong.
 * Default tetap 'html' seperti perilaku lama.
 */
function resolveParseMode(mode: string | false | undefined): string | undefined {
  if (mode === false) {return undefined;}
  return mode || 'html';
}

export class UserbotClient {
  public telegramId: number;
  public sessionString: string;
  /** mtcute client + alias legacy; null sebelum start()/setelah stop(). */
  /**
   * Diisi di `start()`. Ditandai `!` karena seluruh method publik lain memang
   * baru dipanggil setelah userbot berjalan, dan jalur yang bisa berjalan
   * lebih awal sudah menjaga dengan `if (!this.client) return;`.
   */
  public client!: CompatClient;
  public dp: Dispatcher | null;
  public isActive: boolean;
  public floodWaitUntil: number | null;
  public lastFloodSeconds: number;
  public lastError: string | null;
  /**
   * Status koneksi MTProto nyata dari `client.onConnectionState`.
   * Sebelumnya dashboard membaca `client.connected` — properti GramJS yang
   * tidak ada di mtcute, jadi indikatornya permanen "tidak terhubung".
   */
  public connectionState: 'offline' | 'connecting' | 'updating' | 'connected' | 'unknown';
  private _dcId: number | null;
  private _stopping: boolean;

  constructor(telegramId: number, sessionString: string) {
    this.telegramId = Number(telegramId);
    this.sessionString = sessionString;
    this.dp = null;
    this.isActive = false;
    this.floodWaitUntil = null;
    this.lastFloodSeconds = 0;
    this.lastError = null;
    this.connectionState = 'offline';
    this._dcId = null;
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

      // 2. Import sesi. Hanya format mtcute yang didukung: konversi sesi
      //    GramJS on-the-fly sudah dihapus (repo full mtcute). Sesi lama harus
      //    dibuat ulang lewat login dari awal.
      if (this.sessionString) {
        try {
          await this.client.importSession(this.sessionString);
        } catch (err) {
          Logger.logUser(this.telegramId, `⚠️ Sesi gagal diimpor: ${err}`, 'WARN');
          throw new Error(
            'Sesi userbot tidak valid atau bukan format mtcute. ' +
              'Hapus userbot ini lalu login ulang untuk membuat sesi baru.',
            { cause: err },
          );
        }
      }

      // 3. Connect & start mtcute
      await this.client.start();
      this.trackConnectionState();
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

      // Prefetch DC utama supaya panel dashboard yang sinkron bisa membacanya.
      void this.getDcId();

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
      const { startLoop } = await import('../../services/loopService.js');

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
   * Berlangganan status koneksi mtcute. Emitter-nya opsional di sini karena
   * mock test tidak menyediakannya — dalam kasus itu statusnya 'unknown' dan
   * `isConnected()` kembali bersandar pada `isActive`.
   */
  private trackConnectionState() {
    const emitter = (this.client as unknown as {
      onConnectionState?: { add?: (fn: (state: string) => void) => void };
    }).onConnectionState;

    if (!emitter || typeof emitter.add !== 'function') {
      this.connectionState = 'unknown';
      return;
    }

    this.connectionState = 'connecting';
    emitter.add((state: string) => {
      this.connectionState = state as UserbotClient['connectionState'];
      if (state === 'offline') {
        Logger.logUser(this.telegramId, `🔌 Koneksi MTProto terputus (offline).`, 'WARN');
      }
    });
  }

  isConnected() {
    if (!this.isActive) {return false;}
    // 'unknown' = emitter tidak tersedia (mock test), jadi jangan dianggap mati.
    return this.connectionState !== 'offline';
  }

  /**
   * DC utama akun. Dulu dibaca dari `client.session.dcId` yang tidak ada di
   * mtcute, sehingga dashboard SELALU menampilkan hardcode DC 4.
   */
  /** DC yang sudah di-prefetch (null bila belum/ tidak tersedia). */
  get dcId(): number | null {
    return this._dcId;
  }

  async getDcId(): Promise<number | null> {
    if (this._dcId !== null) {return this._dcId;}
    const getter = (this.client as unknown as { getPrimaryDcId?: () => Promise<number> })?.getPrimaryDcId;
    if (typeof getter !== 'function') {return null;}
    try {
      this._dcId = await getter.call(this.client);
      return this._dcId;
    } catch {
      return null;
    }
  }

  async stop() {
    if (this._stopping) {
      Logger.logUser(this.telegramId, `⚠️ Stop already in progress for [${this.telegramId}], skipping.`, 'WARN');
      return;
    }
    this._stopping = true;

    try {
      const { loopStore } = await import('../../services/loopService.js');
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
    this.connectionState = 'offline';
    this._dcId = null;
    this._stopping = false;
  }

  registerHandlers() {
    if (!this.client) {return;}

    // In testing or mock mode, we might register mock event handlers directly
    if (isTestEnv && typeof this.client.addEventHandler === 'function' && !this.dp) {
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
        message: null as unknown,
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
      this.client.sendMessage = async (peer: LegacyPeer, params: LegacySendMessageParams | string): Promise<Message> => {
        const opts: LegacySendMessageParams = typeof params === 'string' ? {} : (params ?? {});
        const text = typeof params === 'string' ? params : (opts.message ?? opts.text ?? '');
        // Gaya GramJS: sendMessage({ file }) mengirim media dengan caption.
        // Tanpa cabang ini, file-nya hilang diam-diam dan hanya teks terkirim.
        if (opts.file) {
          return await this.client.sendFile(peer, { ...opts, caption: text });
        }
        return await this.client.sendText(peer, text, {
          replyTo: opts.replyTo,
          parseMode: resolveParseMode(opts.parseMode),
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
            username: chat.username ?? undefined,
            // Chat mtcute hanya mengekspos nama ini untuk peer user.
            firstName: (chat as { firstName?: string }).firstName,
            lastName: (chat as { lastName?: string }).lastName,
            // Pemanggil legacy (mis. .info) membedakan user vs grup lewat
            // className gaya GramJS; tanpa ini field-nya selalu undefined.
            className: (chat as { type?: string }).type === 'user' ? 'User' : 'Chat',
          };
        } catch {
          return { id: peer };
        }
      };
    }

    if (!this.client.invoke) {
      this.client.invoke = async (call: unknown) => {
        // Objek TL mentah (punya `_`); mtcute mengeksposnya lewat call().
        const tlQuery = toTlParams(call);
        const result = await this.client.call(tlQuery as Parameters<CompatClient['call']>[0]);
        return toLegacyResult(result);
      };
    }

    // CATATAN: wrapper ini dipasang TANPA guard `if (!client.getMessages)`.
    // mtcute sudah punya getMessages(peer, ids), jadi guard seperti itu membuat
    // wrapper tidak pernah terpasang — dan setiap pemanggil gaya legacy yang
    // mengoper objek (`{ ids }` atau `{ limit }`) mengenai implementasi asli
    // yang hanya menerima array ID, lalu gagal.
    const nativeGetMessages = this.client.getMessages.bind(this.client);
    this.client.getMessages = async (peer: LegacyPeer, params?: unknown) => {
      if (Array.isArray(params) || typeof params === 'number') {
        return await nativeGetMessages(peer, params);
      }
      const opts = (params ?? {}) as { ids?: number[] } & Record<string, unknown>;
      if (opts.ids) {
        return await nativeGetMessages(peer, opts.ids);
      }
      // Tanpa `ids` maksudnya mengambil riwayat, bukan pesan tertentu.
      return await this.client.getHistory(peer, opts as Parameters<CompatClient['getHistory']>[1]);
    };

    if (!this.client.sendFile) {
      this.client.sendFile = async (chat: LegacyPeer, fileOrOptions: unknown, maybeOptions?: unknown) => {
        let options: LegacySendFileOptions;
        let rawFile: unknown;

        if (maybeOptions && typeof maybeOptions === 'object') {
          options = { ...(maybeOptions as LegacySendFileOptions) };
          rawFile = fileOrOptions;
        } else if (
          fileOrOptions &&
          typeof fileOrOptions === 'object' &&
          ('file' in (fileOrOptions as object) ||
            'caption' in (fileOrOptions as object) ||
            'message' in (fileOrOptions as object) ||
            'forceDocument' in (fileOrOptions as object))
        ) {
          options = fileOrOptions as LegacySendFileOptions;
          rawFile = options.file ?? options;
        } else {
          options = {};
          rawFile = fileOrOptions;
        }

        let fileName: string | undefined = (options.fileName || options.filename || options.name) as string | undefined;

        // Buka pembungkus objek file legacy (gaya GramJS: { source, filename }, { buffer }, atau Telegram MessageMedia)
        if (rawFile && typeof rawFile === 'object') {
          if ('inputMedia' in rawFile && (rawFile as { inputMedia?: unknown }).inputMedia) {
            rawFile = (rawFile as { inputMedia: unknown }).inputMedia;
          } else if (!(rawFile instanceof Uint8Array) && !(typeof Blob !== 'undefined' && rawFile instanceof Blob)) {
            const fileObj = rawFile as {
              source?: unknown;
              buffer?: unknown;
              path?: string;
              filename?: string;
              name?: string;
              fileName?: string;
            };
            fileName = fileObj.filename || fileObj.name || fileObj.fileName || fileName;
            if (fileObj.source !== undefined) {
              rawFile = fileObj.source;
            } else if (fileObj.buffer !== undefined) {
              rawFile = fileObj.buffer;
            } else if (typeof fileObj.path === 'string') {
              rawFile = fileObj.path;
            }
          }
        }

        // Format path file lokal: mtcute memerlukan prefix 'file:' agar tidak disalahartikan sebagai File ID Telegram
        if (typeof rawFile === 'string' && !rawFile.startsWith('file:') && !/^https?:\/\//i.test(rawFile)) {
          if (path.isAbsolute(rawFile) || fs.existsSync(rawFile)) {
            if (!fileName) {
              fileName = path.basename(rawFile);
            }
            rawFile = `file:${rawFile}`;
          }
        }

        const caption = options.caption ?? options.message ?? '';
        const parseMode = resolveParseMode(options.parseMode);
        let finalCaption: InputText | string = caption;
        if (caption) {
          const accountIsPremium = () => {
            const premium = getUserbotSession(this.telegramId)?.is_telegram_premium;
            return premium === true || Number(premium) === 1;
          };
          const rendered = accountIsPremium() ? animateEmojisWithRestrictedPack(caption) : stripTgEmojiTags(caption);
          if (parseMode === 'html') {
            try {
              finalCaption = thtml(rendered);
            } catch {
              finalCaption = rendered;
            }
          } else if (parseMode === 'markdown' || parseMode === 'md') {
            try {
              finalCaption = md(rendered);
            } catch {
              finalCaption = rendered;
            }
          } else {
            finalCaption = rendered;
          }
        }

        const params: Record<string, unknown> = {
          caption: finalCaption,
          replyTo: options.replyTo,
        };

        const mediaParams: Record<string, unknown> = {};
        if (fileName) {
          mediaParams.fileName = fileName;
        }
        if (options.mimeType || options.fileMime) {
          mediaParams.fileMime = options.mimeType || options.fileMime;
        }
        if (typeof options.fileSize === 'number') {
          mediaParams.fileSize = options.fileSize;
        }

        let mediaObj: unknown;
        if (options.forceDocument) {
          mediaObj = InputMedia.document(rawFile as Parameters<typeof InputMedia.document>[0], mediaParams);
        } else if (options.voiceNote) {
          mediaObj = InputMedia.voice(rawFile as Parameters<typeof InputMedia.voice>[0], mediaParams);
        } else if (
          options.attributes?.some(
            (a) => a?._ === 'documentAttributeAnimated' || a?.className === 'DocumentAttributeAnimated'
          )
        ) {
          mediaObj = InputMedia.animation(rawFile as Parameters<typeof InputMedia.animation>[0], mediaParams);
        } else if (isLikelyImage(rawFile, fileName)) {
          if (!mediaParams.fileName) {
            mediaParams.fileName = detectImageExtension(rawFile) || 'image.png';
          }
          mediaObj = InputMedia.photo(rawFile as Parameters<typeof InputMedia.photo>[0], mediaParams);
        } else {
          mediaObj = InputMedia.auto(rawFile as Parameters<typeof InputMedia.auto>[0], mediaParams);
        }

        return await this.client.sendMedia(chat, mediaObj as Parameters<CompatClient['sendMedia']>[1], params);
      };
    }

    const origDeleteMessages = this.client.deleteMessages?.bind(this.client);
    this.client.deleteMessages = async (chatOrMsgs: unknown, idsOrParams?: unknown, maybeParams?: unknown) => {
      if (Array.isArray(idsOrParams) && typeof idsOrParams[0] === 'number') {
        return await this.client.deleteMessagesById(chatOrMsgs as InputPeerLike, idsOrParams, maybeParams as Parameters<CompatClient['deleteMessagesById']>[2]);
      }
      if (Array.isArray(chatOrMsgs) && typeof chatOrMsgs[0] === 'object') {
        return await origDeleteMessages(chatOrMsgs, idsOrParams);
      }
      if (Array.isArray(idsOrParams)) {
        return await this.client.deleteMessagesById(chatOrMsgs as InputPeerLike, idsOrParams as number[], maybeParams as Parameters<CompatClient['deleteMessagesById']>[2]);
      }
      return await this.client.deleteMessagesById(chatOrMsgs as InputPeerLike, [idsOrParams as number], maybeParams as Parameters<CompatClient['deleteMessagesById']>[2]);
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

    if (!this.client.getInputEntity) {
      this.client.getInputEntity = async (peer: unknown) => {
        try {
          const resolved = await this.client.resolvePeer(toPeer(peer) as InputPeerLike);
          if (resolved._ === 'inputPeerChannel') {
            return {
              className: 'InputPeerChannel',
              channelId: resolved.channelId,
              accessHash: resolved.accessHash,
            };
          }
          if (resolved._ === 'inputPeerChat') {
            return {
              className: 'InputPeerChat',
              chatId: resolved.chatId,
            };
          }
          if (resolved._ === 'inputPeerUser') {
            return {
              className: 'InputPeerUser',
              userId: resolved.userId,
              accessHash: resolved.accessHash,
            };
          }
          return resolved;
        } catch {
          return peer;
        }
      };
    }

    if (!this.client.addEventHandler) {
      const eventHandlersMap = new Map<(event: unknown) => unknown, (updateInfo: { update: unknown }) => void>();
      this.client.addEventHandler = (handler: (event: unknown) => unknown) => {
        const rawListener = (updateInfo: { update: unknown }) => {
          const u = updateInfo.update as Record<string, unknown> | null | undefined;
          if (u && typeof u === 'object') {
            if (!u.className && typeof u._ === 'string') {
              // Convert mtcute camelCase TL name (e.g. updateGroupCallConnection) to PascalCase (UpdateGroupCallConnection)
              const parts = u._.split('.');
              const last = parts[parts.length - 1];
              u.className = last ? last.charAt(0).toUpperCase() + last.slice(1) : u._;
            }
            try {
              handler(u);
            } catch (err) {
              Logger.logSystem(`[EventHandler Error] ${err instanceof Error ? err.message : String(err)}`, 'WARN');
            }
          }
        };
        eventHandlersMap.set(handler, rawListener);
        this.client.onRawUpdate.add(rawListener);
      };

      this.client.removeEventHandler = (handler: (event: unknown) => unknown) => {
        const rawListener = eventHandlersMap.get(handler);
        if (rawListener) {
          this.client.onRawUpdate.remove(rawListener);
          eventHandlersMap.delete(handler);
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

    const formatPayloadText = (text: unknown, parseMode?: string | false) => {
      if (typeof text !== 'string') {
        return text;
      }
      const rendered = renderEmojiText(text);
      if (parseMode === false || parseMode === 'plain' || parseMode === 'raw') {
        return rendered;
      }
      const mode = (parseMode || 'html').toLowerCase();
      if (mode === 'html') {
        try {
          return thtml(rendered);
        } catch {
          return rendered;
        }
      }
      if (mode === 'markdown' || mode === 'md') {
        try {
          return md(rendered);
        } catch {
          return rendered;
        }
      }
      return rendered;
    };

    // Intercept sendText
    const origSendText = this.client.sendText?.bind(this.client);
    if (origSendText) {
      this.client.sendText = (chat: LegacyPeer, text: unknown, params?: { parseMode?: string | false; replyTo?: unknown } & Record<string, unknown>) => {
        const formatted = params && 'parseMode' in params
          ? formatPayloadText(text, params.parseMode)
          : (typeof text === 'string' ? renderEmojiText(text) : text);
        return origSendText(chat, formatted as InputText, params);
      };
    }

    // Intercept editMessage
    const origEditMessage = this.client.editMessage?.bind(this.client);
    if (origEditMessage) {
      this.client.editMessage = async (arg1: unknown, arg2?: unknown, arg3?: unknown) => {
        let chatId: unknown;
        let messageId: unknown;
        let opts: Record<string, unknown> = {};

        if (arg2 !== undefined) {
          if (typeof arg2 === 'number') {
            // Positional call: (chat, messageId, options)
            chatId = arg1;
            messageId = arg2;
            opts = (arg3 ?? {}) as Record<string, unknown>;
          } else if (typeof arg2 === 'object' && arg2 !== null) {
            // Positional call: (chat, options)
            chatId = arg1;
            opts = arg2 as Record<string, unknown>;
            messageId = opts.message ?? opts.id ?? opts.messageId;
          }
        } else if (typeof arg1 === 'object' && arg1 !== null) {
          opts = arg1 as Record<string, unknown>;
          if (opts.message && typeof opts.message === 'object') {
            // Native mtcute: { message: Message, ... }
            const rawText = opts.text ?? opts.messageText;
            const parseMode = (opts.parseMode !== undefined ? opts.parseMode : 'html') as string | false;
            const text = formatPayloadText(rawText, parseMode);
            const disableWebPreview = opts.disableWebPreview !== undefined
              ? Boolean(opts.disableWebPreview)
              : (opts.linkPreview !== undefined ? !opts.linkPreview : undefined);
            return origEditMessage({
              ...opts,
              text: text as InputText,
              ...(disableWebPreview !== undefined ? { disableWebPreview } : {}),
            });
          }
          chatId = opts.chatId ?? opts.chat ?? opts.peer ?? opts.peerId;
          messageId = opts.message ?? opts.id ?? opts.messageId;
        }

        const rawText = opts.text ?? opts.message;
        const parseMode = (opts.parseMode !== undefined ? opts.parseMode : 'html') as string | false;
        const text = formatPayloadText(rawText, parseMode);
        const disableWebPreview = opts.disableWebPreview !== undefined
          ? Boolean(opts.disableWebPreview)
          : (opts.linkPreview !== undefined ? !opts.linkPreview : undefined);

        const targetChat = chatId ? toPeer(chatId as EntityLike) : undefined;
        const targetMessageId = Number(messageId);

        return origEditMessage({
          ...opts,
          ...(targetChat !== undefined ? { chatId: targetChat } : {}),
          message: targetMessageId,
          text: text as InputText,
          ...(disableWebPreview !== undefined ? { disableWebPreview } : {}),
        });
      };
    }
  }
}
