import { UserbotClient } from './client.js';
import { getAllActiveUserbots, getUserbotSession, updateUserbotStatus } from '../../infrastructure/database.js';
import { dbCache } from '../../infrastructure/dbCore.js';
import { Logger } from '../../utils/logger.js';
import { stopAllLoops } from '../handlers/util/loop.js';
import { startInlineBotForUser, stopInlineBotForUser } from '../../bot/services/inlineBotService.js';
import { sleep } from '../../utils/async.js';

/**
 * Per-ID async lock — simple mutex untuk mencegah race condition di lifecycle userbot.
 * NON-reentrant: jika dipanggil nested, akan wait sampai outer lock released.
 * Ini intentional agar tidak ada concurrent access.
 */
const locks = new Map<number, Promise<void>>();

/**
 * Acquire lock for a specific userbot ID.
 * Returns a release function that MUST be called in finally block.
 */
async function acquireLock(id: number): Promise<() => void> {
  while (locks.has(id)) {
    await locks.get(id);
  }
  let releaseFn: () => void;
  const lock = new Promise<void>((resolve) => { releaseFn = resolve; });
  locks.set(id, lock);
  return () => {
    locks.delete(id);
    releaseFn();
  };
}

class UserbotManager {
  public clients: Map<number, UserbotClient>;
  public reconnecting: Set<number>;
  public watchdogInterval: NodeJS.Timeout | null;
  public watchdogRunning: boolean;
  constructor() {
    this.clients = new Map();
    this.reconnecting = new Set();
    this.watchdogInterval = null;
    this.watchdogRunning = false;
  }

  async startUserbot(telegramId: number, sessionString: string) {
    const id = Number(telegramId);
    const release = await acquireLock(id);
    try {
      if (!sessionString) {throw new Error(`session string kosong untuk ${id}`);}

      // Re-validate inside the lock: if the userbot was just deactivated (e.g.
      // by the expiration checker between the watchdog's decision and here),
      // do not resurrect it. Closes the watchdog-vs-expiration TOCTOU window.
      const cached = dbCache.get(id);
      if (cached && cached.is_active === 0) {
        Logger.logUser(id, `⚠️ Userbot [${id}] sudah dinonaktifkan, batal start.`, 'WARN');
        return false;
      }

      // Guard: pastikan tidak ada duplikasi client untuk telegram ID yang sama
      if (this.clients.has(id)) {
        const existing = this.clients.get(id);
        if (existing && existing.isConnected()) {
          Logger.logUser(id, `⚠️ Userbot [${id}] sudah berjalan, skip start.`, 'WARN');
          return true;
        }
        // Stop existing userbot (will be locked by stopUserbot)
        await this.stopUserbot(id);
      }

      return await this.#startLocked(id, sessionString);
    } finally {
      release();
    }
  }

  /**
   * Inti start tanpa lock — dipakai startUserbot() dan restartUserbot() supaya
   * keduanya tidak bisa lagi berbeda perilaku (temuan #8: restart dulu
   * meng-inline logika ini dan lupa menyalakan inline bot).
   * PENTING: pemanggil wajib sudah memegang lock untuk `id`.
   */
  async #startLocked(id: number, sessionString: string) {
    const userbot = new UserbotClient(id, sessionString);
    this.clients.set(id, userbot);

    try {
      await userbot.start();
      // Jika user punya INLINE_BOT_TOKEN — start polling inline bot untuk menu help tombol
      const session = dbCache.get(id);
      const inlineToken = session?.inline_bot_token || '';
      if (inlineToken) {
        startInlineBotForUser(id, inlineToken).catch((_e) => {});
      }
      return true;
    } catch (err) {
      this.clients.delete(id);
      throw err;
    }
  }

  /**
   * Inti stop tanpa lock — pasangan dari #startLocked().
   * PENTING: pemanggil wajib sudah memegang lock untuk `id`.
   */
  async #stopLocked(id: number, reason: 'stop' | 'restart') {
    const userbot = this.clients.get(id);
    if (!userbot) {return false;}

    await userbot.stop();
    // Stop polling inline bot user ini
    stopInlineBotForUser(id).catch((_e) => {});
    const cleared = stopAllLoops(id);
    if (cleared > 0) {Logger.logUser(id, `🧹 Cleared ${cleared} orphaned loop(s) on ${reason}.`, 'INFO');}
    this.clients.delete(id);

    return true;
  }

  async stopUserbot(telegramId: number) {
    const id = Number(telegramId);
    const release = await acquireLock(id);
    try {
      return await this.#stopLocked(id, 'stop');
    } finally {
      release();
    }
  }

  async restartUserbot(telegramId: number) {
    const id = Number(telegramId);
    const session = getUserbotSession(telegramId);
    if (!session?.session_string) {throw new Error(`session tidak ditemukan untuk ${id}`);}
    const release = await acquireLock(id);
    try {
      // Pakai helper tanpa-lock, bukan menyalin logikanya: menyalin itu yang
      // membuat restart melewatkan stop/start inline bot (temuan #8).
      await this.#stopLocked(id, 'restart');
      return await this.#startLocked(id, session.session_string);
    } finally {
      release();
    }
  }

  async restartAllActive() {
    Logger.logSystem('🚀 Starting active DeltaUserJS userbots...', 'INFO');
    const activeBots = getAllActiveUserbots();
    Logger.logSystem(`found ${activeBots.length} active userbots to start.`, 'INFO');

    for (const bot of activeBots) {
      try {
        // Stagger starts — use index-based delay instead of random to avoid thundering herd
        const delayMs = Math.min(5000, 1000 + activeBots.indexOf(bot) * 500);
        Logger.logUser(bot.telegram_id, `⏳ Waiting ${delayMs}ms before starting userbot [${bot.telegram_id}]...`, 'INFO');
        await sleep(delayMs);
        await this.startUserbot(bot.telegram_id, bot.session_string);
      } catch (err) {
        Logger.logSystem(`Failed to start userbot [${bot.telegram_id}]: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      }
    }
  }

  startWatchdog(intervalMs = 120000) {
    if (this.watchdogInterval) {return;}
    Logger.logSystem(`🛡️ Userbot Watchdog started (${intervalMs}ms interval).`, 'INFO');
    this.watchdogInterval = setInterval(() => {
      // Cegah siklus tumpang-tindih bila pengecekan sebelumnya belum selesai
      if (this.watchdogRunning) {return;}
      this.watchdogRunning = true;
      this.checkAndReconnect()
        .catch(err => Logger.logSystem(`Watchdog error: ${err instanceof Error ? err.message : String(err)}`, 'ERROR'))
        .finally(() => { this.watchdogRunning = false; });
    }, intervalMs);
  }

  stopWatchdog() {
    if (!this.watchdogInterval) {return;}
    clearInterval(this.watchdogInterval);
    this.watchdogInterval = null;
    Logger.logSystem('🛡️ Userbot Watchdog stopped.', 'INFO');
  }

  async checkAndReconnect() {
    // Snapshot aktif bots agar tidak terpengaruh perubahan saat iterasi
    const activeBots = getAllActiveUserbots().map(bot => ({ ...bot }));

    for (const bot of activeBots) {
      const id = Number(bot.telegram_id);

      // Double-check: apakah userbot masih aktif setelah snapshot diambil?
      const fresh = dbCache.get(id);
      if (!fresh || fresh.is_active !== 1) {continue;}

      // Cek lagi apakah sudah terhubung (mungkin sudah di-reconnect oleh eksekusi sebelumnya)
      if (this.clients.has(id)) {
        const existing = this.clients.get(id);
        if (existing?.isConnected()) {continue;}
        if (existing?.isFloodWaiting()) {
          Logger.logUser(id, `🛡️ Watchdog skipping reconnect for [${id}]: FloodWait active (${existing.getFloodWaitSecondsLeft()}s remaining).`, 'INFO');
          continue;
        }
      }

      if (this.reconnecting.has(id)) {continue;}

      this.reconnecting.add(id);
      try {
        Logger.logUser(id, `🛡️ Watchdog reconnecting userbot [${id}]...`, 'INFO');
        await this.startUserbot(id, bot.session_string);
        Logger.logUser(id, `✓ Watchdog reconnected userbot [${id}].`, 'SUCCESS');
        await sleep(1500);
      } catch (err) {
        Logger.logSystem(`Watchdog failed for [${id}]: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        const errMsg = err instanceof Error ? err.message : '';
        if (errMsg && (errMsg.includes('Not a valid string') || errMsg.includes('session string'))) {
          Logger.logSystem(`Sesi untuk [${id}] tidak valid/rusak. Menonaktifkan userbot secara otomatis agar tidak loop.`, 'ERROR');
          Logger.logUser(id, 'Sesi Telegram Anda tidak valid atau telah dicabut. Userbot telah dinonaktifkan secara otomatis. Silakan daftar ulang.', 'ERROR');
          await updateUserbotStatus(id, false);
        }
      } finally {
        this.reconnecting.delete(id);
      }
    }
  }

  getFloodStatus(telegramId: number | string): { inCooldown: boolean; secondsLeft: number; floodUntil: number | null } {
    const id = Number(telegramId);
    const client = this.clients.get(id);
    if (!client) {
      return { inCooldown: false, secondsLeft: 0, floodUntil: null };
    }
    const inCooldown = client.isFloodWaiting();
    const secondsLeft = client.getFloodWaitSecondsLeft();
    return {
      inCooldown,
      secondsLeft,
      floodUntil: client.floodWaitUntil,
    };
  }

  isRunning(telegramId: number) {
    return Boolean(this.clients.get(Number(telegramId))?.isConnected());
  }

  status() {
    return {
      running: this.clients.size,
      ids: [...this.clients.keys()]
    };
  }
}

const userbotManager = new UserbotManager();
export default userbotManager;