import { saveSchedule, deleteSchedule } from '../infrastructure/database.js';
import { Logger } from '../utils/logger.js';
import type { CompatClient, LegacyPeer } from '../userbot/engine/compatClient.js';

type FloodAwareClient = {
  isFloodWaiting?: () => boolean;
  handlePossibleFloodError?: (error: unknown) => void;
};

export interface LoopData {
  intervalId: NodeJS.Timeout;
  message: string;
  minutes: number;
  startedAt: Date;
}

// Struktur: telegramId -> Map<chatId, LoopData>
export const loopStore = new Map<number, Map<string, LoopData>>();

/**
 * Memulai loop pesan untuk chatId tertentu.
 */
export function startLoop(
  client: CompatClient,
  telegramId: number,
  chatId: LegacyPeer,
  minutes: number,
  loopMessage: string,
  saveToDb = false
) {
  const idNum = Number(telegramId);
  if (!loopStore.has(idNum)) {
    loopStore.set(idNum, new Map());
  }
  const myLoops = loopStore.get(idNum)!;
  const chatKey = String(chatId);

  // Hentikan loop lama jika ada di chat ini
  const existing = myLoops.get(chatKey);
  if (existing) {
    clearInterval(existing.intervalId);
  }

  // Kirim pesan pertama kali secara langsung agar instan
  client.sendMessage(chatId, { message: loopMessage }).catch((err) => {
    Logger.logUser(
      idNum,
      `Failed to send initial loop message: ${err instanceof Error ? err.message : String(err)}`,
      'ERROR'
    );
  });

  // Mulai interval baru
  const ms = minutes * 60 * 1000;
  const intervalId = setInterval(async () => {
    try {
      const floodAwareClient = client as FloodAwareClient;
      if (typeof floodAwareClient.isFloodWaiting === 'function' && floodAwareClient.isFloodWaiting()) {
        Logger.logUser(idNum, `[Loop:${chatKey}] Dilewati sementara karena akun sedang dalam proteksi FloodWait.`, 'WARN');
        return;
      }
      await client.sendMessage(chatId, {
        message: loopMessage,
      });
    } catch (err) {
      const floodAwareClient = client as FloodAwareClient;
      if (typeof floodAwareClient.handlePossibleFloodError === 'function') {
        floodAwareClient.handlePossibleFloodError(err);
      }
      Logger.logUser(idNum, `Loop Error [${chatKey}]: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    }
  }, ms);

  myLoops.set(chatKey, {
    intervalId,
    message: loopMessage,
    minutes: minutes,
    startedAt: new Date(),
  });

  if (saveToDb) {
    saveSchedule(idNum, chatKey, 'loop', minutes, loopMessage).catch((err) => {
      Logger.logUser(idNum, `Failed to save schedule to DB: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    });
  }
}

/**
 * Menghentikan loop pesan untuk chatId tertentu.
 */
export function stopLoop(telegramId: number, chatId: LegacyPeer, deleteFromDb = false): boolean {
  const idNum = Number(telegramId);
  const myLoops = loopStore.get(idNum);
  if (!myLoops) return false;
  const chatKey = String(chatId);

  const existing = myLoops.get(chatKey);
  if (existing) {
    clearInterval(existing.intervalId);
    myLoops.delete(chatKey);

    if (deleteFromDb) {
      deleteSchedule(idNum, chatKey, 'loop').catch((err) => {
        Logger.logUser(idNum, `Failed to delete schedule from DB: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      });
    }
    return true;
  }
  return false;
}

/**
 * Menghentikan semua loop untuk akun tertentu. Dipanggil saat userbot
 * disconnect/stop/crash agar tidak ada interval yang bocor.
 */
export function stopAllLoops(telegramId: number): number {
  const idNum = Number(telegramId);
  const myLoops = loopStore.get(idNum);
  if (!myLoops) return 0;
  let count = 0;
  for (const [chatKey, data] of myLoops.entries()) {
    clearInterval(data.intervalId);
    myLoops.delete(chatKey);
    count++;
  }
  loopStore.delete(idNum);
  return count;
}
