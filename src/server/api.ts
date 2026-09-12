import { IncomingMessage, ServerResponse } from 'http';
import config from '../config.js';
import { validateTelegramInitData, TelegramUser } from './auth.js';
import userbotManager from '../userbot/engine/manager.js';
import { Api } from 'teleproto';
import {
  getUserbotSession,
  getAllRegisteredUsers,
  updateUserbotStatus,
  updateUserbotFeature,
  enablePlugin,
  disablePlugin,
  getDisabledPlugins,
  getApprovedUsers,
  addApprovedUser,
  removeApprovedUser,
  getBroadcastBlacklist,
  addBroadcastBlacklist,
  removeBroadcastBlacklist,
  deleteUserbot,
} from '../services/UserbotService.js';
import {
  getAllUserVars,
  setUserVar,
  deleteUserVar,
  getAllSystemVars,
  setSystemVar,
  deleteSystemVar,
} from '../services/SystemVarService.js';
import {
  validateInlineBot,
  startInlineBotForUser,
  stopInlineBotForUser,
} from '../bot/services/inlineBotService.js';
import { loadedPlugins } from '../userbot/engine/pluginRegistry.js';
import { redeemVoucher } from '../services/VoucherService.js';
import { isApproved } from '../bot/state/approvedUsers.js';
import { dbCache } from '../infrastructure/dbCore.js';
import { Logger } from '../utils/logger.js';

interface AuthenticatedRequest extends IncomingMessage {
  user?: TelegramUser;
  isOwner?: boolean;
}

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(data));
}

async function readJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
  }
  if (!body.trim()) {return {} as T;}
  return JSON.parse(body) as T;
}

/**
 * Main API Request Router for DeltaUserJS Dashboard Mini App
 */
export async function handleApiRequest(req: AuthenticatedRequest, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const rawPath = url.pathname;
  const pathname = rawPath.replace(/^\/ubot/, '');

  // Only handle /api/* routes
  if (!pathname.startsWith('/api/')) {
    return false;
  }

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return true;
  }

  // Public/Mock Auth verification
  const initDataHeader = (req.headers['x-telegram-init-data'] as string) || url.searchParams.get('initData') || '';
  const auth = validateTelegramInitData(initDataHeader, config.botToken || '');

  if (!auth.valid || !auth.data) {
    sendJson(res, 401, {
      success: false,
      error: auth.error || 'Autentikasi Telegram gagal. Silakan buka aplikasi dari bot Telegram resmi.',
    });
    return true;
  }

  const user = auth.data.user;
  const isOwner = Number(user.id) === Number(config.ownerId);
  req.user = user;
  req.isOwner = isOwner;

  try {
    // ----------------------------------------------------
    // GET /api/me: Data profil & otorisasi pengguna
    // ----------------------------------------------------
    if (pathname === '/api/me' && req.method === 'GET') {
      const session = getUserbotSession(user.id);
      const isApprovedUser = isOwner || isApproved(user.id);

      sendJson(res, 200, {
        success: true,
        user: {
          id: user.id,
          firstName: user.first_name || '',
          lastName: user.last_name || '',
          username: user.username || '',
          isPremium: Boolean(user.is_premium),
          isOwner,
          isApproved: isApprovedUser,
        },
        hasUserbot: Boolean(session?.session_string),
        isActive: session?.is_active === 1,
      });
      return true;
    }

    // ----------------------------------------------------
    // GET /api/userbot/status: Live connection & performance stats
    // ----------------------------------------------------
    if (pathname === '/api/userbot/status' && req.method === 'GET') {
      const session = getUserbotSession(user.id);
      const client = userbotManager.clients.get(Number(user.id));
      const isConnected = Boolean(client && client.isConnected());
      const floodStatus = client && typeof (client as any).getFloodStatus === 'function'
        ? (client as any).getFloodStatus()
        : { isWaiting: false, remainingSeconds: 0 };

      sendJson(res, 200, {
        success: true,
        hasSession: Boolean(session?.session_string),
        isActive: session?.is_active === 1,
        connected: isConnected,
        phone: session?.phone || null,
        uptime: process.uptime(),
        floodGuard: {
          inCooldown: floodStatus.isWaiting,
          remainingSeconds: floodStatus.remainingSeconds,
        },
        stats: {
          activeUserbotsCount: userbotManager.clients.size,
          pluginsCount: loadedPlugins.length,
          memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
      });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/userbot/toggle: Start atau Stop Userbot
    // ----------------------------------------------------
    if (pathname === '/api/userbot/toggle' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const session = getUserbotSession(user.id);

      if (!session || !session.session_string) {
        sendJson(res, 400, { success: false, error: 'Akun userbot belum terdaftar atau session kosong.' });
        return true;
      }

      const client = userbotManager.clients.get(Number(user.id));
      const currentlyConnected = Boolean(client && client.isConnected());
      const targetState = typeof body.active === 'boolean' ? body.active : !currentlyConnected;

      if (targetState) {
        // Start Userbot
        await updateUserbotStatus(user.id, true);
        const started = await userbotManager.startUserbot(user.id, session.session_string);
        sendJson(res, 200, {
          success: true,
          connected: started,
          message: started ? 'Userbot berhasil dijalankan!' : 'Gagal menyalakan userbot.',
        });
      } else {
        // Stop Userbot
        await userbotManager.stopUserbot(user.id);
        await updateUserbotStatus(user.id, false);
        sendJson(res, 200, {
          success: true,
          connected: false,
          message: 'Userbot berhasil dinonaktifkan.',
        });
      }
      return true;
    }

    // ----------------------------------------------------
    // GET /api/plugins: Daftar semua 58+ plugin & status ON/OFF
    // ----------------------------------------------------
    if (pathname === '/api/plugins' && req.method === 'GET') {
      const disabledList = getDisabledPlugins(user.id) || [];

      const plugins = loadedPlugins.map((p) => {
        // Tentukan kategori dari path file (admin, group, system, tools, util)
        let category = 'util';
        if (p.file) {
          const parts = p.file.split(/[\\/]/);
          if (parts.length > 1) {
            category = parts[0];
          }
        }

        const isEnabled = !disabledList.includes(p.name.toLowerCase());

        return {
          name: p.name,
          category,
          title: p.help?.title || p.name.toUpperCase(),
          description: p.help?.description || 'Tidak ada deskripsi tersedia.',
          usage: p.help?.usage || `.${p.name}`,
          detail: p.help?.detail || null,
          enabled: isEnabled,
        };
      });

      sendJson(res, 200, {
        success: true,
        total: plugins.length,
        disabledCount: disabledList.length,
        plugins,
      });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/plugins/toggle: Mengaktifkan/menonaktifkan plugin
    // ----------------------------------------------------
    if (pathname === '/api/plugins/toggle' && req.method === 'POST') {
      const body = await readJsonBody<{ pluginName: string; enabled: boolean }>(req);
      if (!body.pluginName) {
        sendJson(res, 400, { success: false, error: 'Parameter pluginName wajib diisi.' });
        return true;
      }

      const pluginName = String(body.pluginName).toLowerCase();

      if (body.enabled) {
        await enablePlugin(user.id, pluginName);
      } else {
        await disablePlugin(user.id, pluginName);
      }

      sendJson(res, 200, {
        success: true,
        pluginName,
        enabled: body.enabled,
        message: `Plugin ${pluginName} berhasil di-${body.enabled ? 'aktifkan' : 'nonaktifkan'}.`,
      });
      return true;
    }

    // ----------------------------------------------------
    // GET /api/subscription: Masa aktif, paket, info langganan
    // ----------------------------------------------------
    if (pathname === '/api/subscription' && req.method === 'GET') {
      const session = getUserbotSession(user.id);
      const now = Date.now();
      let daysLeft = 0;
      let isExpired = false;

      if (isOwner) {
        daysLeft = 99999;
      } else if (session?.expired_at) {
        const exp = new Date(session.expired_at).getTime();
        daysLeft = Math.max(0, Math.ceil((exp - now) / (1000 * 60 * 60 * 24)));
        isExpired = exp <= now;
      }

      sendJson(res, 200, {
        success: true,
        isOwner,
        isActive: session?.is_active === 1 && !isExpired,
        expiredAt: isOwner ? null : (session?.expired_at || null),
        daysLeft,
        isExpired,
        planName: isOwner ? '👑 Founder / Unlimited Owner' : (daysLeft > 0 ? '⚡ VIP Userbot Pro' : '⚪ Free / Expired'),
      });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/subscription/redeem: Redeem kode voucher
    // ----------------------------------------------------
    if (pathname === '/api/subscription/redeem' && req.method === 'POST') {
      const body = await readJsonBody<{ code: string }>(req);
      if (!body.code) {
        sendJson(res, 400, { success: false, error: 'Kode voucher tidak boleh kosong.' });
        return true;
      }

      const result = await redeemVoucher(body.code, user.id, {
        name: [user.first_name, user.last_name].filter(Boolean).join(' '),
        username: user.username,
      });

      sendJson(res, result.success ? 200 : 400, result);
      return true;
    }

    // ----------------------------------------------------
    // GET /api/chats: Daftar dialog / chat untuk broadcast
    // ----------------------------------------------------
    if (pathname === '/api/chats' && req.method === 'GET') {
      const client = userbotManager.clients.get(Number(user.id));
      if (!client || !client.isConnected()) {
        sendJson(res, 200, { success: true, chats: [], note: 'Userbot offline, dialogs tidak dapat dimuat.' });
        return true;
      }

      try {
        const dialogs = await (client.client as any).getDialogs({ limit: 50 });
        const chats = dialogs.map((d: any) => ({
          id: String(d.id),
          title: d.title || d.name || 'Chat ' + d.id,
          isGroup: Boolean(d.isGroup),
          isChannel: Boolean(d.isChannel),
          isUser: Boolean(d.isUser),
        }));

        sendJson(res, 200, { success: true, chats });
      } catch (err) {
        sendJson(res, 200, { success: true, chats: [], error: 'Gagal memuat dialogs: ' + String(err) });
      }
      return true;
    }

    // ----------------------------------------------------
    // POST /api/broadcast/send: Kirim siaran ke chat terpilih
    // ----------------------------------------------------
    if (pathname === '/api/broadcast/send' && req.method === 'POST') {
      const body = await readJsonBody<{ chatIds: string[]; message: string }>(req);
      if (!body.message || !body.chatIds || !Array.isArray(body.chatIds) || body.chatIds.length === 0) {
        sendJson(res, 400, { success: false, error: 'Pesan dan target chatIds wajib diisi.' });
        return true;
      }

      const client = userbotManager.clients.get(Number(user.id));
      if (!client || !client.isConnected()) {
        sendJson(res, 400, { success: false, error: 'Userbot Anda sedang offline. Nyalakan userbot terlebih dahulu.' });
        return true;
      }

      // Jalankan broadcast di background agar response instan
      let sentCount = 0;
      let failedCount = 0;

      (async () => {
        for (const chatId of body.chatIds) {
          try {
            await (client.client as any).sendMessage(chatId, { message: body.message });
            sentCount++;
          } catch (err) {
            failedCount++;
            Logger.logUser(user.id, `Broadcast gagal ke ${chatId}: ${err instanceof Error ? err.message : String(err)}`, 'WARN');
          }
          // Jeda aman anti-flood (1.2 detik)
          await new Promise((r) => setTimeout(r, 1200));
        }
        Logger.logUser(user.id, `Broadcast selesai: ${sentCount} sukses, ${failedCount} gagal.`, 'INFO');
      })().catch(() => {});

      sendJson(res, 200, {
        success: true,
        message: `Siaran sedang dikirim ke ${body.chatIds.length} tujuan di background.`,
      });
      return true;
    }

    // ----------------------------------------------------
    // GET /api/admin/stats: Statistik Server & Fleet (Owner Sudo Only)
    // ----------------------------------------------------
    if (pathname === '/api/admin/stats' && req.method === 'GET') {
      if (!isOwner) {
        sendJson(res, 403, { success: false, error: 'Hanya Owner yang berhak mengakses data Admin.' });
        return true;
      }

      const allUsers = getAllRegisteredUsers();
      const activeCount = userbotManager.clients.size;
      const mem = process.memoryUsage();

      sendJson(res, 200, {
        success: true,
        stats: {
          totalRegisteredUsers: allUsers.length,
          activeRunningClients: activeCount,
          systemUptimeSeconds: process.uptime(),
          nodeVersion: process.version,
          memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
          memoryRssMb: Math.round(mem.rss / 1024 / 1024),
          pluginsLoaded: loadedPlugins.length,
        },
      });
      return true;
    }

    // ----------------------------------------------------
    // GET /api/admin/users: Daftar semua user (Owner Sudo Only)
    // ----------------------------------------------------
    if (pathname === '/api/admin/users' && req.method === 'GET') {
      if (!isOwner) {
        sendJson(res, 403, { success: false, error: 'Hanya Owner yang berhak mengakses data Admin.' });
        return true;
      }

      const allUsers = getAllRegisteredUsers().map((u) => ({
        telegramId: u.telegram_id,
        phone: u.phone || '-',
        isActive: u.is_active === 1,
        isRunning: Boolean(userbotManager.clients.get(Number(u.telegram_id))?.isConnected()),
        expiredAt: u.expired_at || null,
      }));

      sendJson(res, 200, { success: true, users: allUsers });
      return true;
    }

    // ----------------------------------------------------
    // GET /api/settings: Ambil seluruh konfigurasi akun userbot
    // ----------------------------------------------------
    if (pathname === '/api/settings' && req.method === 'GET') {
      const session = getUserbotSession(user.id);
      const userVars = getAllUserVars(user.id);
      const approvedUsers = getApprovedUsers(user.id);
      const broadcastBlacklist = getBroadcastBlacklist(user.id);

      sendJson(res, 200, {
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
        sendJson(res, 400, { success: false, error: 'Sesi akun userbot belum ditemukan.' });
        return true;
      }

      if (typeof body.prefix === 'string' && body.prefix.trim()) {
        const p = body.prefix.trim();
        if (p.length > 5) {
          sendJson(res, 400, { success: false, error: 'Prefix maksimal 5 karakter.' });
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
            sendJson(res, 400, { success: false, error: 'Token Bot tidak valid atau gagal terhubung ke Telegram Bot API.' });
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

      sendJson(res, 200, { success: true, message: 'Setelan berhasil diperbarui!' });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/settings/approved-users: Tambah whitelist user
    // ----------------------------------------------------
    if (pathname === '/api/settings/approved-users' && req.method === 'POST') {
      const body = await readJsonBody<{ targetUserId: number | string }>(req);
      const targetId = Number(body.targetUserId);
      if (!targetId || isNaN(targetId)) {
        sendJson(res, 400, { success: false, error: 'Target Telegram User ID tidak valid.' });
        return true;
      }
      await addApprovedUser(user.id, targetId);
      sendJson(res, 200, { success: true, approvedUsers: getApprovedUsers(user.id) });
      return true;
    }

    // ----------------------------------------------------
    // DELETE /api/settings/approved-users: Hapus whitelist user
    // ----------------------------------------------------
    if (pathname === '/api/settings/approved-users' && req.method === 'DELETE') {
      const body = await readJsonBody<{ targetUserId: number | string }>(req);
      const targetId = Number(body.targetUserId);
      if (!targetId || isNaN(targetId)) {
        sendJson(res, 400, { success: false, error: 'Target Telegram User ID tidak valid.' });
        return true;
      }
      await removeApprovedUser(user.id, targetId);
      sendJson(res, 200, { success: true, approvedUsers: getApprovedUsers(user.id) });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/settings/broadcast-blacklist: Tambah blacklist chat
    // ----------------------------------------------------
    if (pathname === '/api/settings/broadcast-blacklist' && req.method === 'POST') {
      const body = await readJsonBody<{ chatId: string }>(req);
      if (!body.chatId || !body.chatId.trim()) {
        sendJson(res, 400, { success: false, error: 'Chat ID tidak valid.' });
        return true;
      }
      await addBroadcastBlacklist(user.id, body.chatId.trim());
      sendJson(res, 200, { success: true, broadcastBlacklist: getBroadcastBlacklist(user.id) });
      return true;
    }

    // ----------------------------------------------------
    // DELETE /api/settings/broadcast-blacklist: Hapus blacklist chat
    // ----------------------------------------------------
    if (pathname === '/api/settings/broadcast-blacklist' && req.method === 'DELETE') {
      const body = await readJsonBody<{ chatId: string }>(req);
      if (!body.chatId || !body.chatId.trim()) {
        sendJson(res, 400, { success: false, error: 'Chat ID tidak valid.' });
        return true;
      }
      await removeBroadcastBlacklist(user.id, body.chatId.trim());
      sendJson(res, 200, { success: true, broadcastBlacklist: getBroadcastBlacklist(user.id) });
      return true;
    }

    // ----------------------------------------------------
    // GET /api/vars: Ambil semua variabel pengguna & sistem
    // ----------------------------------------------------
    if (pathname === '/api/vars' && req.method === 'GET') {
      const userVars = getAllUserVars(user.id);
      const systemVars = isOwner ? getAllSystemVars() : undefined;

      sendJson(res, 200, {
        success: true,
        userVars,
        systemVars,
      });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/vars: Tambah atau edit variabel (User/System)
    // ----------------------------------------------------
    if (pathname === '/api/vars' && req.method === 'POST') {
      const body = await readJsonBody<{ key: string; value: string; isSystem?: boolean }>(req);
      if (!body.key || typeof body.value !== 'string') {
        sendJson(res, 400, { success: false, error: 'Key dan value wajib diisi.' });
        return true;
      }

      const key = body.key.toUpperCase().replace(/[^A-Z0-9_]/g, '');
      if (!key) {
        sendJson(res, 400, { success: false, error: 'Nama key variabel tidak valid.' });
        return true;
      }

      if (body.isSystem) {
        if (!isOwner) {
          sendJson(res, 403, { success: false, error: 'Hanya Owner yang dapat mengubah System Vars.' });
          return true;
        }
        await setSystemVar(key, body.value);
        sendJson(res, 200, {
          success: true,
          message: `System Var ${key} berhasil disimpan.`,
          systemVars: getAllSystemVars(),
        });
        return true;
      }

      // Cegah penulisan variabel reserved
      const RESTRICTED_VARS = ['BOT_TOKEN', 'API_ID', 'API_HASH', 'MONGO_URI', 'ENCRYPTION_KEY', 'OWNER_ID'];
      if (RESTRICTED_VARS.includes(key)) {
        sendJson(res, 400, { success: false, error: `Variabel ${key} adalah reserved sistem dan tidak boleh diubah.` });
        return true;
      }

      if (key === 'INLINE_BOT_TOKEN') {
        const username = await validateInlineBot(body.value);
        if (!username) {
          sendJson(res, 400, { success: false, error: 'Token Bot tidak valid atau gagal menghubungi Bot API!' });
          return true;
        }
        await updateUserbotFeature(user.id, 'inline_bot_token', body.value);
        await updateUserbotFeature(user.id, 'inline_bot_username', username);
        await startInlineBotForUser(Number(user.id), body.value);
      }

      await setUserVar(user.id, key, body.value);
      sendJson(res, 200, {
        success: true,
        message: `Variabel ${key} berhasil disimpan.`,
        userVars: getAllUserVars(user.id),
      });
      return true;
    }

    // ----------------------------------------------------
    // DELETE /api/vars: Hapus variabel (User/System)
    // ----------------------------------------------------
    if (pathname === '/api/vars' && req.method === 'DELETE') {
      const body = await readJsonBody<{ key: string; isSystem?: boolean }>(req);
      if (!body.key) {
        sendJson(res, 400, { success: false, error: 'Key variabel wajib diisi.' });
        return true;
      }

      const key = body.key.toUpperCase();

      if (body.isSystem) {
        if (!isOwner) {
          sendJson(res, 403, { success: false, error: 'Hanya Owner yang dapat menghapus System Vars.' });
          return true;
        }
        await deleteSystemVar(key);
        sendJson(res, 200, {
          success: true,
          message: `System Var ${key} berhasil dihapus.`,
          systemVars: getAllSystemVars(),
        });
        return true;
      }

      await deleteUserVar(user.id, key);
      if (key === 'INLINE_BOT_TOKEN') {
        await updateUserbotFeature(user.id, 'inline_bot_token', null);
        await updateUserbotFeature(user.id, 'inline_bot_username', null);
        await stopInlineBotForUser(Number(user.id));
      }

      sendJson(res, 200, {
        success: true,
        message: `Variabel ${key} berhasil dihapus.`,
        userVars: getAllUserVars(user.id),
      });
      return true;
    }

    // ----------------------------------------------------
    // GET /api/userbot/diagnostics: Diagnostik koneksi MTProto
    // ----------------------------------------------------
    if (pathname === '/api/userbot/diagnostics' && req.method === 'GET') {
      const client = userbotManager.clients.get(Number(user.id));
      const isConnected = Boolean(client && client.isConnected());
      let pingMs = -1;
      let dcId = '4';

      if (isConnected && client?.client) {
        dcId = String((client.client.session as any)?.dcId || '4');
        try {
          const start = Date.now();
          await client.client.invoke(new Api.help.GetNearestDc());
          pingMs = Date.now() - start;
        } catch (_) {
          pingMs = -1;
        }
      }

      const disabledCount = (getDisabledPlugins(user.id) || []).length;
      const activeCount = Math.max(0, loadedPlugins.length - disabledCount);
      const flood = userbotManager.getFloodStatus(user.id);

      sendJson(res, 200, {
        success: true,
        connected: isConnected,
        pingMs,
        dcId,
        uptime: process.uptime(),
        activePlugins: activeCount,
        disabledPlugins: disabledCount,
        floodGuard: flood,
      });
      return true;
    }

    // ----------------------------------------------------
    // POST /api/userbot/logout: Hapus sesi userbot dari server
    // ----------------------------------------------------
    if (pathname === '/api/userbot/logout' && req.method === 'POST') {
      const telegramId = Number(user.id);
      try {
        const ubot = userbotManager.clients.get(telegramId);
        if (ubot && ubot.client) {
          await ubot.client.invoke(new Api.auth.LogOut());
        }
      } catch (e) {
        Logger.logUser(telegramId, `Logout Telegram exception: ${e instanceof Error ? e.message : String(e)}`, 'WARN');
      }

      if (userbotManager.isRunning(telegramId)) {
        await userbotManager.stopUserbot(telegramId);
      }

      await deleteUserbot(telegramId);
      sendJson(res, 200, { success: true, message: 'Sesi userbot berhasil dihapus dan akun logout.' });
      return true;
    }

    // Endpoint API tidak ditemukan
    sendJson(res, 404, { success: false, error: 'Endpoint API tidak ditemukan' });
    return true;
  } catch (err) {
    Logger.logSystem(`Error di handleApiRequest: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    sendJson(res, 500, { success: false, error: 'Terjadi kesalahan internal server' });
    return true;
  }
}
