/**
 * Rute API: Status, toggle, diagnostik, dan logout userbot.
 *
 * Dipecah dari src/server/api.ts — isi handler dipindahkan apa adanya,
 * hanya konteks request-nya yang sekarang diterima lewat parameter.
 */
import { isApproved } from '../../bot/state/approvedUsers.js';
import { deleteUserbot, getDisabledPlugins, getUserbotSession, updateUserbotStatus } from '../../services/UserbotService.js';
import userbotManager from '../../userbot/engine/manager.js';
import { loadedPlugins } from '../../userbot/engine/pluginRegistry.js';
import { Logger } from '../../utils/logger.js';
import { RouteContext, readJsonBody, sendJson } from './context.js';

export async function handleUserbotRoutes(ctx: RouteContext): Promise<boolean> {
  const { isOwner, pathname, req, res, user } = ctx;

    // ----------------------------------------------------
    // GET /api/userbot/status: Live connection & performance stats
    // ----------------------------------------------------
    if (pathname === '/api/userbot/status' && req.method === 'GET') {
      const session = getUserbotSession(user.id);
      const client = userbotManager.clients.get(Number(user.id));
      const isConnected = Boolean(client && client.isConnected());
      const floodStatus = userbotManager.getFloodStatus(user.id);

      sendJson(req, res, 200, {
        success: true,
        hasSession: Boolean(session?.session_string),
        isActive: session?.is_active === 1,
        connected: isConnected,
        phone: session?.phone || null,
        uptime: process.uptime(),
        floodGuard: {
          inCooldown: floodStatus.inCooldown,
          remainingSeconds: floodStatus.secondsLeft,
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
      const body = await readJsonBody<{ active?: boolean }>(req);
      const session = getUserbotSession(user.id);

      if (!session || !session.session_string) {
        sendJson(req, res, 400, { success: false, error: 'Akun userbot belum terdaftar atau session kosong.' });
        return true;
      }

      const client = userbotManager.clients.get(Number(user.id));
      const currentlyConnected = Boolean(client && client.isConnected());
      const targetState = typeof body.active === 'boolean' ? body.active : !currentlyConnected;

      if (targetState && !isOwner) {
        if (!isApproved(Number(user.id))) {
          sendJson(req, res, 403, { success: false, error: 'Akun Anda belum disetujui oleh Owner. Silakan minta persetujuan terlebih dahulu.' });
          return true;
        }
      }

      if (targetState) {
        // Start Userbot
        await updateUserbotStatus(user.id, true);
        const started = await userbotManager.startUserbot(user.id, session.session_string);
        if (!started) {await updateUserbotStatus(user.id, false);}
        sendJson(req, res, 200, {
          success: true,
          connected: started,
          message: started ? 'Userbot berhasil dijalankan!' : 'Gagal menyalakan userbot.',
        });
      } else {
        // Stop Userbot
        await userbotManager.stopUserbot(user.id);
        await updateUserbotStatus(user.id, false);
        sendJson(req, res, 200, {
          success: true,
          connected: false,
          message: 'Userbot berhasil dinonaktifkan.',
        });
      }
      return true;
    }

    // ----------------------------------------------------
    // GET /api/userbot/diagnostics: Diagnostik koneksi MTProto
    // ----------------------------------------------------
    if (pathname === '/api/userbot/diagnostics' && req.method === 'GET') {
      const client = userbotManager.clients.get(Number(user.id));
      const isConnected = Boolean(client && client.isConnected());
      let pingMs = -1;
      let dcId = '—';

      if (isConnected && client?.client) {
        // DC akun yang sebenarnya; sebelumnya selalu jatuh ke hardcode '4'.
        const primaryDc = await client.getDcId();
        if (primaryDc) {dcId = String(primaryDc);}
        try {
          const start = Date.now();
          if (typeof client.client.call === 'function') {
            const res = await client.client.call({ _: 'help.getNearestDc' });
            if (!primaryDc) {dcId = String(res?.thisDc ?? res?.nearestDc ?? '—');}
          } else if (typeof client.client.invoke === 'function') {
            await client.client.invoke({ _: 'help.getNearestDc' });
          }
          pingMs = Date.now() - start;
        } catch (_) {
          pingMs = -1;
        }
      }

      const disabledCount = (getDisabledPlugins(user.id) || []).length;
      const activeCount = Math.max(0, loadedPlugins.length - disabledCount);
      const flood = userbotManager.getFloodStatus(user.id);

      sendJson(req, res, 200, {
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
          if (typeof ubot.client.logOut === 'function') {
            await ubot.client.logOut();
          } else if (typeof ubot.client.call === 'function') {
            await ubot.client.call({ _: 'auth.logOut' });
          }
        }
      } catch (e) {
        Logger.logUser(telegramId, `Logout Telegram exception: ${e instanceof Error ? e.message : String(e)}`, 'WARN');
      }

      if (userbotManager.isRunning(telegramId)) {
        await userbotManager.stopUserbot(telegramId);
      }

      await deleteUserbot(telegramId);
      sendJson(req, res, 200, { success: true, message: 'Sesi userbot berhasil dihapus dan akun logout.' });
      return true;
    }

  return false;
}
