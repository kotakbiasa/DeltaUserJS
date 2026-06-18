import { TelegramClient, MemoryStorage } from '@mtcute/node';
import { Dispatcher, filters } from '@mtcute/dispatcher';
import { convertFromGramjsSession } from '@mtcute/convert';

import config from '../config.js';
import { disablePlugin, getUserbotSession } from '../database/db.js';
import { loadAllPlugins } from './pluginLoader.js';
import { loadedPlugins, normalizePluginName } from './pluginRegistry.js';

let pluginsReady = false;

async function ensurePluginsLoaded() {
  if (pluginsReady) return loadedPlugins;
  await loadAllPlugins();
  pluginsReady = true;
  return loadedPlugins;
}

function disabledSet(settings) {
  return new Set((settings?.disabled_plugins || []).map(normalizePluginName));
}

function floodWaitSeconds(err) {
  if (Number.isFinite(err?.seconds)) return Number(err.seconds);
  const text = `${err?.errorMessage || ''} ${err?.message || ''}`;
  const match = text.match(/FLOOD_WAIT_?(\d+)?/i) || text.match(/(\d+)/);
  return match?.[1] ? Number(match[1]) : 0;
}

export class UserbotClient {
  constructor(telegramId, sessionString) {
    this.telegramId = Number(telegramId);
    this.sessionString = sessionString;
    this.client = null;
    this.dispatcher = null;
    this.isActive = false;
    this.errorWindows = new Map();
  }

  async start() {
    await ensurePluginsLoaded();

    let mtcuteSession = this.sessionString;
    try {
      if (this.sessionString.startsWith('1')) {
        mtcuteSession = convertFromGramjsSession(this.sessionString);
      }
    } catch (e) {}

    this.client = new TelegramClient({
      apiId: config.apiId,
      apiHash: config.apiHash,
      storage: new MemoryStorage(),
      initConnectionOptions: {
        deviceModel: 'DeltaUserJS',
        systemVersion: 'Android 14',
        appVersion: '3.0',
        systemLangCode: 'id-ID',
        langCode: 'id',
      }
    });

    if (mtcuteSession) {
      await this.client.importSession(mtcuteSession);
    }

    this.dispatcher = new Dispatcher(this.client);

    // Polyfill for plugins
    this.client.invoke = (req) => this.client.call(req);
    this.client.getEntity = (id) => this.client.resolvePeer(id);
    this.client.getInputEntity = (id) => this.client.resolvePeer(id);

    try {
      await this.client.connect(); // mtcute's connect() just establishes connection if authorized
      this.isActive = true;
      this.registerHandlers();
      await this.runPluginStartHooks();
      console.log(`🤖 DeltaUserJS userbot [${this.telegramId}] connected.`);
    } catch (err) {
      this.isActive = false;
      console.error(`Failed to start userbot [${this.telegramId}]:`, err.message || err);
      throw err;
    }
  }

  isConnected() {
    return Boolean(this.isActive);
  }

  async stop() {
    this.isActive = false;
    if (!this.client) return;
    try {
      await this.client.destroy(); // mtcute uses destroy() instead of close()
      console.log(`🔌 DeltaUserJS userbot [${this.telegramId}] disconnected.`);
    } catch (err) {
      console.error(`Error while disconnecting userbot [${this.telegramId}]:`, err.message || err);
    }
  }

  currentSettings() {
    return getUserbotSession(this.telegramId);
  }

  async restartSchedules() {
    await this.runPluginStartHooks();
  }

  async runPluginStartHooks() {
    const settings = this.currentSettings();
    const disabled = disabledSet(settings);

    for (const plugin of loadedPlugins) {
      if (disabled.has(normalizePluginName(plugin.name))) continue;
      if (typeof plugin.onStart !== 'function') continue;

      try {
        await plugin.onStart(this.client, this.telegramId, settings);
      } catch (err) {
        console.error(`Plugin ${plugin.name} onStart failed for [${this.telegramId}]:`, err.message || err);
      }
    }
  }

  registerHandlers() {
    if (!this.dispatcher) return;

    this.dispatcher.onNewMessage(filters.and(filters.outgoing, filters.text('ㅤ')), async (msg) => {
      try { await msg.delete(); } catch (_) {}
    });

    this.dispatcher.onNewMessage(filters.any, (msg) => this.handleMessage(msg).catch(err => {
      console.error(`Message handler failed for [${this.telegramId}]:`, err.message || err);
    }));

    this.dispatcher.onCallbackQuery(filters.any, (query) => this.handleCallback(query).catch(err => {
      console.error(`Callback handler failed for [${this.telegramId}]:`, err.message || err);
    }));
  }

  async handleMessage(msg) {
    const settings = this.currentSettings();
    if (!settings) return;

    const disabled = disabledSet(settings);
    for (const plugin of loadedPlugins) {
      const name = normalizePluginName(plugin.name);
      if (disabled.has(name)) continue;

      try {
        await plugin.execute(this.client, msg, settings, this.telegramId);
      } catch (err) {
        await this.handlePluginError(plugin, err);
      }
    }
  }

  async handleCallback(query) {
    const settings = this.currentSettings();
    const disabled = disabledSet(settings);
    
    // Polyfill callback event for plugins
    const callbackEvent = {
      update: query,
      data: Buffer.isBuffer(query.data) ? query.data : Buffer.from(query.dataStr || ''),
      getMessage: async () => query.message,
      answer: async (options = {}) => {
        try {
          await query.answer({
            text: options.message || '',
            showAlert: Boolean(options.alert),
          });
        } catch (_) {}
      },
    };

    for (const plugin of loadedPlugins) {
      const name = normalizePluginName(plugin.name);
      if (disabled.has(name)) continue;
      if (typeof plugin.onCallbackQuery !== 'function') continue;

      try {
        const handled = await plugin.onCallbackQuery(this.client, callbackEvent, settings, this.telegramId);
        if (handled) break;
      } catch (err) {
        await this.handlePluginError(plugin, err, { callback: true });
      }
    }
  }

  async handlePluginError(plugin, err) {
    const waitSeconds = floodWaitSeconds(err);
    if (waitSeconds > 0) {
      if (waitSeconds <= 60) {
        console.log(`⏳ [${this.telegramId}] FLOOD_WAIT ${waitSeconds}s in ${plugin.name}`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
      } else {
        console.warn(`FLOOD_WAIT too long (${waitSeconds}s) in ${plugin.name}; skipped.`);
      }
      return;
    }

    console.error(`Plugin ${plugin.name} failed for [${this.telegramId}]:`, err.message || err);

    const now = Date.now();
    const name = normalizePluginName(plugin.name);
    const window = (this.errorWindows.get(name) || []).filter(ts => now - ts <= 10 * 60 * 1000);
    window.push(now);
    this.errorWindows.set(name, window);

    if (window.length < 5) return;

    console.error(`Auto-disabling plugin ${name} for [${this.telegramId}] after 5 errors in 10 minutes.`);
    await disablePlugin(this.telegramId, name);
    this.errorWindows.set(name, []);

    if (!config.logGroupId) return;
    try {
      await this.client.sendText(config.logGroupId, `<b>Plugin error quarantine</b>\n\nPlugin <code>${name}</code> otomatis dinonaktifkan untuk <code>${this.telegramId}</code>.`, {
        parseMode: 'html',
        replyTo: config.logTopicId || undefined,
      });
    } catch (_) {}
  }
}
