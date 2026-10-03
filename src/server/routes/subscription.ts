/**
 * Rute API: Paket dan status langganan.
 *
 * Dipecah dari src/server/api.ts — isi handler dipindahkan apa adanya,
 * hanya konteks request-nya yang sekarang diterima lewat parameter.
 */
import { isApproved } from '../../bot/state/approvedUsers.js';
import config from '../../config.js';
import { getUserbotSession } from '../../services/UserbotService.js';
import { RouteContext, sendJson } from './context.js';

export async function handleSubscriptionRoutes(ctx: RouteContext): Promise<boolean> {
  const { isOwner, pathname, req, res, user } = ctx;

    // ----------------------------------------------------
    // GET /api/subscription/plans: Paket aktif dari konfigurasi server
    // ----------------------------------------------------
    if (pathname === '/api/subscription/plans' && req.method === 'GET') {
      sendJson(req, res, 200, {
        success: true,
        plans: [],
        availableGateways: [],
        ownerId: config.ownerId,
      });
      return true;
    }

    // ----------------------------------------------------
    // GET /api/subscription: Masa aktif, paket, info langganan
    // ----------------------------------------------------
    if (pathname === '/api/subscription' && req.method === 'GET') {
      const session = getUserbotSession(user.id);
      const isApprovedUser = isOwner || isApproved(user.id);

      sendJson(req, res, 200, {
        success: true,
        isOwner,
        isActive: isOwner ? true : session?.is_active === 1,
        status: isOwner ? 'owner' : (isApprovedUser ? 'approved' : 'pending'),
        expiredAt: null,
        graceEndDate: null,
        startDate: null,
        autoRenew: false,
        daysLeft: 99999,
        graceDaysLeft: 0,
        isExpired: false,
        isLifetime: true,
        isApproved: isApprovedUser,
        planId: isOwner ? 'owner' : 'unlimited',
        planName: isOwner ? 'Founder / Unlimited Owner' : (isApprovedUser ? 'Akses Penuh (Approved)' : 'Menunggu Approval'),
      });
      return true;
    }

  return false;
}
