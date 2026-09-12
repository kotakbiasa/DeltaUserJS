import { IncomingMessage, ServerResponse } from 'http';
import config from '../config.js';
import { validateTelegramInitData, TelegramUser } from './auth.js';
import userbotManager from '../userbot/engine/manager.js';
import {
  getUserbotSession,
  getAllRegisteredUsers,
  updateUserbotStatus,
  enablePlugin,
  disablePlugin,
  getDisabledPlugins,
} from '../services/UserbotService.js';
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

    // Endpoint API tidak ditemukan
    sendJson(res, 404, { success: false, error: 'Endpoint API tidak ditemukan' });
    return true;
  } catch (err) {
    Logger.logSystem(`Error di handleApiRequest: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    sendJson(res, 500, { success: false, error: 'Terjadi kesalahan internal server' });
    return true;
  }
}
