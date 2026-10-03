/**
 * Rute API: Pengaturan, approved users, blacklist broadcast.
 *
 * Dipecah dari src/server/api.ts — isi handler dipindahkan apa adanya,
 * hanya konteks request-nya yang sekarang diterima lewat parameter.
 */
import { startInlineBotForUser, stopInlineBotForUser, validateInlineBot } from '../../bot/services/inlineBotService.js';
import { deleteUserVar, getAllUserVars, setUserVar } from '../../services/SystemVarService.js';
import {
  addApprovedUser,
  addBroadcastBlacklist,
  getApprovedUsers,
  getBroadcastBlacklist,
  getUserbotSession,
  removeApprovedUser,
  removeBroadcastBlacklist,
  updateUserbotFeature,
} from '../../services/UserbotService.js';
import { RouteContext, readJsonBody, sendJson } from './context.js';

export async function handleSettingsRoutes(ctx: RouteContext): Promise<boolean> {
  const { pathname, req, res, user } = ctx;

    // ----------------------------------------------------
    // GET /api/settings: Ambil seluruh konfigurasi akun userbot
    // ----------------------------------------------------
    if (pathname === '/api/settings' && req.method === 'GET') {
      const session = getUserbotSession(user.id);
      const userVars = getAllUserVars(user.id);
      const approvedUsers = getApprovedUsers(user.id);
      const broadcastBlacklist = getBroadcastBlacklist(user.id);

      sendJson(req, res, 200, {
        success: true,
        settings: {
          prefix: userVars.PREFIX || '.',
          antiPm: session?.anti_pm === 1,
          autoReply: session?.auto_reply === 1,
          afkReason: session?.afk_reason || 'Sedang AFK, silakan tinggalkan pesan.',
          customName: session?.custom_name || '',
          logChatId: userVars.LOG_CHAT_ID || '',
          inlineBotToken: session?.inline_bot_token || '',
          inlineBotUsername: session?.inline_bot_username || '',
          approvedUsers: approvedUsers || [],
          broadcastBlacklist: broadcastBlacklist || [],
        },
      });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/settings: Simpan preferensi akun userbot
    // ----------------------------------------------------
    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = await readJsonBody<{
        prefix?: string;
        antiPm?: boolean;
        autoReply?: boolean;
        afkReason?: string;
        customName?: string;
        logChatId?: string;
        inlineBotToken?: string;
      }>(req);

      const session = getUserbotSession(user.id);
      if (!session) {
        sendJson(req, res, 400, { success: false, error: 'Sesi akun userbot belum ditemukan.' });
        return true;
      }

      if (typeof body.prefix === 'string' && body.prefix.trim()) {
        const p = body.prefix.trim();
        if (p.length > 5) {
          sendJson(req, res, 400, { success: false, error: 'Prefix maksimal 5 karakter.' });
          return true;
        }
        await setUserVar(user.id, 'PREFIX', p);
      }

      if (typeof body.antiPm === 'boolean') {
        await updateUserbotFeature(user.id, 'anti_pm', body.antiPm ? 1 : 0);
      }

      if (typeof body.autoReply === 'boolean') {
        await updateUserbotFeature(user.id, 'auto_reply', body.autoReply ? 1 : 0);
      }

      if (typeof body.afkReason === 'string') {
        const reason = body.afkReason.slice(0, 200);
        await updateUserbotFeature(user.id, 'afk_reason', reason);
      }

      if (typeof body.customName === 'string') {
        const name = body.customName.slice(0, 50);
        await updateUserbotFeature(user.id, 'custom_name', name);
      }

      if (typeof body.logChatId === 'string') {
        const logId = body.logChatId.trim();
        if (logId) {
          await setUserVar(user.id, 'LOG_CHAT_ID', logId);
        } else {
          await deleteUserVar(user.id, 'LOG_CHAT_ID');
        }
      }

      if (typeof body.inlineBotToken === 'string') {
        const token = body.inlineBotToken.trim();
        if (token) {
          const username = await validateInlineBot(token);
          if (!username) {
            sendJson(req, res, 400, { success: false, error: 'Token Bot tidak valid atau gagal terhubung ke Telegram Bot API.' });
            return true;
          }
          await setUserVar(user.id, 'INLINE_BOT_TOKEN', token);
          await updateUserbotFeature(user.id, 'inline_bot_token', token);
          await updateUserbotFeature(user.id, 'inline_bot_username', username);
          await startInlineBotForUser(Number(user.id), token);
        } else {
          await deleteUserVar(user.id, 'INLINE_BOT_TOKEN');
          await updateUserbotFeature(user.id, 'inline_bot_token', null);
          await updateUserbotFeature(user.id, 'inline_bot_username', null);
          await stopInlineBotForUser(Number(user.id));
        }
      }

      sendJson(req, res, 200, { success: true, message: 'Setelan berhasil diperbarui!' });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/settings/approved-users: Tambah whitelist user
    // ----------------------------------------------------
    if (pathname === '/api/settings/approved-users' && req.method === 'POST') {
      const body = await readJsonBody<{ targetUserId: number | string }>(req);
      const targetId = Number(body.targetUserId);
      if (!targetId || isNaN(targetId)) {
        sendJson(req, res, 400, { success: false, error: 'Target Telegram User ID tidak valid.' });
        return true;
      }
      await addApprovedUser(user.id, targetId);
      sendJson(req, res, 200, { success: true, approvedUsers: getApprovedUsers(user.id) });
      return true;
    }

    // ----------------------------------------------------
    // DELETE /api/settings/approved-users: Hapus whitelist user
    // ----------------------------------------------------
    if (pathname === '/api/settings/approved-users' && req.method === 'DELETE') {
      const body = await readJsonBody<{ targetUserId: number | string }>(req);
      const targetId = Number(body.targetUserId);
      if (!targetId || isNaN(targetId)) {
        sendJson(req, res, 400, { success: false, error: 'Target Telegram User ID tidak valid.' });
        return true;
      }
      await removeApprovedUser(user.id, targetId);
      sendJson(req, res, 200, { success: true, approvedUsers: getApprovedUsers(user.id) });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/settings/broadcast-blacklist: Tambah blacklist chat
    // ----------------------------------------------------
    if (pathname === '/api/settings/broadcast-blacklist' && req.method === 'POST') {
      const body = await readJsonBody<{ chatId: string }>(req);
      if (!body.chatId || !body.chatId.trim()) {
        sendJson(req, res, 400, { success: false, error: 'Chat ID tidak valid.' });
        return true;
      }
      await addBroadcastBlacklist(user.id, body.chatId.trim());
      sendJson(req, res, 200, { success: true, broadcastBlacklist: getBroadcastBlacklist(user.id) });
      return true;
    }

    // ----------------------------------------------------
    // DELETE /api/settings/broadcast-blacklist: Hapus blacklist chat
    // ----------------------------------------------------
    if (pathname === '/api/settings/broadcast-blacklist' && req.method === 'DELETE') {
      const body = await readJsonBody<{ chatId: string }>(req);
      if (!body.chatId || !body.chatId.trim()) {
        sendJson(req, res, 400, { success: false, error: 'Chat ID tidak valid.' });
        return true;
      }
      await removeBroadcastBlacklist(user.id, body.chatId.trim());
      sendJson(req, res, 200, { success: true, broadcastBlacklist: getBroadcastBlacklist(user.id) });
      return true;
    }

  return false;
}
