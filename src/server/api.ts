/**
 * Router API untuk Mini App dashboard DeltaUserJS.
 *
 * File ini hanya mengurus hal yang berlaku untuk semua request — CORS,
 * autentikasi initData, dan penanganan error terpusat. Handler tiap grup rute
 * ada di ./routes/*.ts.
 */
import { ServerResponse } from 'http';
import config from '../config.js';
import { validateTelegramInitData } from './auth.js';
import { DigitalStoreError } from '../services/DigitalStoreService.js';
import { Logger } from '../utils/logger.js';

import {
  ApiRequestError,
  AuthenticatedRequest,
  RouteContext,
  RouteHandler,
  getCorsOrigin,
  sendJson,
} from './routes/context.js';
import { handleAccountRoutes } from './routes/account.js';
import { handleAdminRoutes } from './routes/admin.js';
import { handleBroadcastRoutes } from './routes/broadcast.js';
import { handlePluginsRoutes } from './routes/plugins.js';
import { handleSettingsRoutes } from './routes/settings.js';
import { handleStoreRoutes } from './routes/store.js';
import { handleSubscriptionRoutes } from './routes/subscription.js';
import { handleUserbotRoutes } from './routes/userbot.js';
import { handleVarsRoutes } from './routes/vars.js';

export type { AuthenticatedRequest } from './routes/context.js';

/**
 * Urutan di sini tidak menentukan hasil: setiap rute dicocokkan dengan
 * pathname + method yang eksak, jadi tidak ada dua grup yang bisa mengklaim
 * request yang sama. Urutannya dibuat sama dengan file lama agar diff-nya
 * mudah dibaca.
 */
const ROUTE_GROUPS: RouteHandler[] = [
  handleAccountRoutes,
  handleUserbotRoutes,
  handlePluginsRoutes,
  handleSubscriptionRoutes,
  handleBroadcastRoutes,
  handleStoreRoutes,
  handleAdminRoutes,
  handleSettingsRoutes,
  handleVarsRoutes,
];

/**
 * Main API Request Router for DeltaUserJS Dashboard Mini App
 */
export async function handleApiRequest(req: AuthenticatedRequest, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url || '/', 'http://localhost');
  const rawPath = url.pathname;
  const pathname = rawPath.replace(/^\/ubot(?=\/|$)/, '');

  // Only handle /api/* routes
  if (!pathname.startsWith('/api/')) {
    return false;
  }

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Vary': 'Origin',
    };
    const origin = getCorsOrigin(req);
    if (origin) {headers['Access-Control-Allow-Origin'] = origin;}
    res.writeHead(204, headers);
    res.end();
    return true;
  }

  // Auth only through a header. Raw initData in query strings can leak via
  // access logs and browser history, so the URL fallback is intentionally absent.
  const initDataHeader = typeof req.headers['x-telegram-init-data'] === 'string'
    ? req.headers['x-telegram-init-data']
    : '';
  const auth = validateTelegramInitData(
    initDataHeader,
    config.botToken || '',
    req.socket.remoteAddress
  );

  if (!auth.valid || !auth.data) {
    sendJson(req, res, 401, {
      success: false,
      error: auth.error || 'Autentikasi Telegram gagal. Silakan buka aplikasi dari bot Telegram resmi.',
    });
    return true;
  }

  const user = auth.data.user;
  const isOwner = Number(user.id) === Number(config.ownerId);
  req.user = user;
  req.isOwner = isOwner;

  const ctx: RouteContext = { req, res, url, pathname, user, isOwner };

  try {
    for (const handleGroup of ROUTE_GROUPS) {
      if (await handleGroup(ctx)) {return true;}
    }

    // Endpoint API tidak ditemukan
    sendJson(req, res, 404, { success: false, error: 'Endpoint API tidak ditemukan' });
    return true;
  } catch (err) {
    if (err instanceof DigitalStoreError) {
      sendJson(req, res, err.statusCode, { success: false, error: err.message });
      return true;
    }
    if (err instanceof ApiRequestError) {
      sendJson(req, res, err.statusCode, { success: false, error: err.message });
      return true;
    }
    Logger.logSystem(`Error di handleApiRequest: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
    sendJson(req, res, 500, { success: false, error: 'Terjadi kesalahan internal server' });
    return true;
  }
}
