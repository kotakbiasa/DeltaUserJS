/**
 * Rute API: Statistik fleet dan daftar user (owner).
 *
 * Dipecah dari src/server/api.ts — isi handler dipindahkan apa adanya,
 * hanya konteks request-nya yang sekarang diterima lewat parameter.
 */
import { type DigitalOrderStatus, updateDigitalOrder } from '../../services/DigitalStoreService.js';
import { getAllRegisteredUsers } from '../../services/UserbotService.js';
import { notifyUser } from '../../services/notifyService.js';
import userbotManager from '../../userbot/engine/manager.js';
import { loadedPlugins } from '../../userbot/engine/pluginRegistry.js';
import { escapeHtml } from '../../utils/richMessage.js';
import { RouteContext, decodePathSegment, readJsonBody, sendJson } from './context.js';

export async function handleAdminRoutes(ctx: RouteContext): Promise<boolean> {
  const { isOwner, pathname, req, res, user } = ctx;

    const orderMatch = pathname.match(/^\/api\/store\/orders\/([^/]+)$/);
    if (orderMatch && req.method === 'PATCH') {
      if (!isOwner) {
        sendJson(req, res, 403, { success: false, error: 'Hanya Owner yang dapat memperbarui pesanan.' });
        return true;
      }
      const orderId = decodePathSegment(orderMatch[1]);
      const body = await readJsonBody<{ status?: DigitalOrderStatus; ownerReply?: string }>(req);
      if (body.status === undefined && body.ownerReply === undefined) {
        sendJson(req, res, 400, { success: false, error: 'Status atau balasan owner wajib diisi.' });
        return true;
      }
      const order = await updateDigitalOrder(orderId, body);

      if (body.status !== undefined || body.ownerReply !== undefined) {
        const replyText = order.ownerReply ? `\n\n<b>Balasan owner:</b>\n<blockquote>${escapeHtml(order.ownerReply).replace(/\n/g, '<br>')}</blockquote>` : '';
        await notifyUser(
          order.userId,
          `<b>🛍️ Update pesanan ${escapeHtml(order.productName)}</b>\n\n` +
          `<b>Status:</b> ${escapeHtml(order.status.toUpperCase())}${replyText}`
        );
      }

      sendJson(req, res, 200, { success: true, message: 'Status pesanan diperbarui.', order });
      return true;
    }

    // ----------------------------------------------------
    // GET /api/admin/stats: Statistik Server & Fleet (Owner Sudo Only)
    // ----------------------------------------------------
    if (pathname === '/api/admin/stats' && req.method === 'GET') {
      if (!isOwner) {
        sendJson(req, res, 403, { success: false, error: 'Hanya Owner yang berhak mengakses data Admin.' });
        return true;
      }

      const allUsers = getAllRegisteredUsers();
      const activeCount = userbotManager.clients.size;
      const mem = process.memoryUsage();

      sendJson(req, res, 200, {
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
        sendJson(req, res, 403, { success: false, error: 'Hanya Owner yang berhak mengakses data Admin.' });
        return true;
      }

      const allUsers = getAllRegisteredUsers().map((u) => ({
        telegramId: u.telegram_id,
        phone: u.phone || '-',
        isActive: u.is_active === 1,
        isRunning: Boolean(userbotManager.clients.get(Number(u.telegram_id))?.isConnected()),
        expiredAt: u.expired_at || null,
      }));

      sendJson(req, res, 200, { success: true, users: allUsers });
      return true;
    }

  return false;
}
