/**
 * Konteks dan helper bersama untuk seluruh modul rute API.
 *
 * Sebelumnya semua ini hidup sebagai closure di dalam satu fungsi
 * handleApiRequest() sepanjang 900 baris. Dipindah ke sini supaya tiap grup
 * rute bisa tinggal di filenya sendiri tanpa mengubah perilaku handler.
 */
import { IncomingMessage, ServerResponse } from 'http';
import config from '../../config.js';
import { TelegramUser } from '../auth.js';

export interface AuthenticatedRequest extends IncomingMessage {
  user?: TelegramUser;
  isOwner?: boolean;
}

/** Semua yang dulu tersedia sebagai variabel closure di handleApiRequest(). */
export interface RouteContext {
  req: AuthenticatedRequest;
  res: ServerResponse;
  url: URL;
  /** Pathname sudah dibuang prefix `/ubot`-nya. */
  pathname: string;
  user: TelegramUser;
  isOwner: boolean;
}

/** Handler satu grup rute: true bila request sudah ditangani. */
export type RouteHandler = (ctx: RouteContext) => Promise<boolean>;

export class ApiRequestError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new ApiRequestError('Path parameter tidak valid.', 400);
  }
}

export function getCorsOrigin(req: IncomingMessage): string | null {
  const configured = config.appUrl;
  if (!configured) {return null;}
  try {
    const allowed = new URL(configured).origin;
    const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    return !requestOrigin || requestOrigin === allowed ? allowed : null;
  } catch {
    return null;
  }
}

export function sendJson(req: IncomingMessage, res: ServerResponse, statusCode: number, data: unknown) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const origin = getCorsOrigin(req);
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Telegram-Init-Data';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS';
    headers['Vary'] = 'Origin';
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

export async function readJsonBody<T = unknown>(req: IncomingMessage, maxBytes = 64 * 1024): Promise<T> {
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiRequestError('Permintaan terlalu besar.', 413);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new ApiRequestError('Permintaan terlalu besar.', 413);
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString('utf8');
  if (!body.trim()) {return {} as T;}
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new ApiRequestError('Format JSON tidak valid.', 400);
  }
}
