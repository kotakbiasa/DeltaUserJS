/**
 * Rute API: Profil & otorisasi pengguna.
 *
 * Dipecah dari src/server/api.ts — isi handler dipindahkan apa adanya,
 * hanya konteks request-nya yang sekarang diterima lewat parameter.
 */
import { isApproved } from '../../bot/state/approvedUsers.js';
import { getUserbotSession } from '../../services/UserbotService.js';
import { RouteContext, sendJson } from './context.js';

export async function handleAccountRoutes(ctx: RouteContext): Promise<boolean> {
  const { isOwner, pathname, req, res, user } = ctx;

    // ----------------------------------------------------
    // GET /api/me: Data profil & otorisasi pengguna
    // ----------------------------------------------------
    if (pathname === '/api/me' && req.method === 'GET') {
      const session = getUserbotSession(user.id);
      const isApprovedUser = isOwner || isApproved(user.id);

      sendJson(req, res, 200, {
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

  return false;
}
