/**
 * Rute API: Daftar chat dan pengiriman siaran.
 *
 * Dipecah dari src/server/api.ts — isi handler dipindahkan apa adanya,
 * hanya konteks request-nya yang sekarang diterima lewat parameter.
 */
import { getBroadcastBlacklist } from '../../services/UserbotService.js';
import userbotManager from '../../userbot/engine/manager.js';
import { Logger } from '../../utils/logger.js';
import { RouteContext, readJsonBody, sendJson } from './context.js';

/** Batas target per siaran Mini App — disamakan dengan MAX_GCAST_TARGETS di `.gcast`. */
const MAX_BROADCAST_TARGETS = 50;
/** Batas panjang pesan siaran (batas teks Telegram). */
const MAX_BROADCAST_MESSAGE_LENGTH = 4096;
/** User yang siarannya sedang berjalan — mencegah broadcast tumpang-tindih. */
const broadcastInProgress = new Set<number>();

type DialogLike = {
  id?: string | number | bigint;
  title?: string;
  name?: string;
  isGroup?: boolean;
  isChannel?: boolean;
  isUser?: boolean;
};

type BroadcastClient = {
  getDialogs: (options: { limit: number }) => Promise<DialogLike[]>;
  sendMessage: (entity: string, params: { message: string }) => Promise<unknown>;
};

export async function handleBroadcastRoutes(ctx: RouteContext): Promise<boolean> {
  const { pathname, req, res, user } = ctx;

    // ----------------------------------------------------
    // GET /api/chats: Daftar dialog / chat untuk broadcast
    // ----------------------------------------------------
    if (pathname === '/api/chats' && req.method === 'GET') {
      const client = userbotManager.clients.get(Number(user.id));
      if (!client || !client.isConnected()) {
        sendJson(req, res, 200, { success: true, chats: [], note: 'Userbot offline, dialogs tidak dapat dimuat.' });
        return true;
      }

      try {
        const telegramClient = client.client as unknown as BroadcastClient;
        const dialogs = await telegramClient.getDialogs({ limit: 50 });
        const chats = dialogs.map((d) => ({
          id: String(d.id),
          title: d.title || d.name || 'Chat ' + d.id,
          isGroup: Boolean(d.isGroup),
          isChannel: Boolean(d.isChannel),
          isUser: Boolean(d.isUser),
        }));

        sendJson(req, res, 200, { success: true, chats });
      } catch (err) {
        sendJson(req, res, 200, { success: true, chats: [], error: 'Gagal memuat dialogs: ' + String(err) });
      }
      return true;
    }

    // ----------------------------------------------------
    // POST /api/broadcast/send: Kirim siaran ke chat terpilih
    // ----------------------------------------------------
    if (pathname === '/api/broadcast/send' && req.method === 'POST') {
      const body = await readJsonBody<{ chatIds: string[]; message: string }>(req);
      if (!body.message || !body.chatIds || !Array.isArray(body.chatIds) || body.chatIds.length === 0) {
        sendJson(req, res, 400, { success: false, error: 'Pesan dan target chatIds wajib diisi.' });
        return true;
      }

      if (body.message.length > MAX_BROADCAST_MESSAGE_LENGTH) {
        sendJson(req, res, 400, {
          success: false,
          error: `Pesan terlalu panjang (${body.message.length} karakter, maks ${MAX_BROADCAST_MESSAGE_LENGTH}).`,
        });
        return true;
      }

      // Satu broadcast per user. Tanpa ini beberapa request paralel saling
      // menumpuk dan jeda anti-flood 1,2 detik jadi tidak berarti.
      if (broadcastInProgress.has(Number(user.id))) {
        sendJson(req, res, 409, {
          success: false,
          error: 'Masih ada siaran yang sedang berjalan. Tunggu sampai selesai.',
        });
        return true;
      }

      const client = userbotManager.clients.get(Number(user.id));
      if (!client || !client.isConnected()) {
        sendJson(req, res, 400, { success: false, error: 'Userbot Anda sedang offline. Nyalakan userbot terlebih dahulu.' });
        return true;
      }

      // Hormati blacklist broadcast, sama seperti .gcast. Sebelumnya endpoint
      // ini melewatinya sama sekali, jadi Mini App bisa menembus chat yang
      // sudah sengaja dikecualikan user.
      const blacklist = getBroadcastBlacklist(user.id);
      const requestedCount = body.chatIds.length;
      const allowedTargets = body.chatIds
        .map((chatId) => String(chatId))
        .filter((chatId) => !blacklist.includes(chatId));
      const skippedCount = requestedCount - allowedTargets.length;

      // Batasi jumlah target, konsisten dengan MAX_GCAST_TARGETS di .gcast.
      const targets = allowedTargets.slice(0, MAX_BROADCAST_TARGETS);
      const cappedCount = allowedTargets.length - targets.length;

      if (targets.length === 0) {
        sendJson(req, res, 400, {
          success: false,
          error: skippedCount > 0
            ? 'Semua tujuan yang dipilih ada di blacklist broadcast.'
            : 'Tidak ada tujuan yang valid.',
        });
        return true;
      }

      // Jalankan broadcast di background agar response instan
      let sentCount = 0;
      let failedCount = 0;

      broadcastInProgress.add(Number(user.id));
      (async () => {
        for (const chatId of targets) {
          try {
            await (client.client as unknown as BroadcastClient).sendMessage(chatId, { message: body.message });
            sentCount++;
          } catch (err) {
            failedCount++;
            Logger.logUser(user.id, `Broadcast gagal ke ${chatId}: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
          }
          // Jeda aman anti-flood (1.2 detik)
          await new Promise((r) => setTimeout(r, 1200));
        }
        Logger.logUser(user.id, `Broadcast selesai: ${sentCount} sukses, ${failedCount} gagal, ${skippedCount} dilewati (blacklist).`, 'INFO');
      })()
        .catch(() => {})
        .finally(() => { broadcastInProgress.delete(Number(user.id)); });

      const notes: string[] = [];
      if (skippedCount > 0) {notes.push(`${skippedCount} dilewati (blacklist)`);}
      if (cappedCount > 0) {notes.push(`${cappedCount} tidak dikirim (melebihi batas ${MAX_BROADCAST_TARGETS})`);}

      sendJson(req, res, 200, {
        success: true,
        message: `Siaran sedang dikirim ke ${targets.length} tujuan di background.`
          + (notes.length > 0 ? ` ${notes.join(', ')}.` : ''),
        targetCount: targets.length,
        skippedCount,
        cappedCount,
      });
      return true;
    }

  return false;
}
