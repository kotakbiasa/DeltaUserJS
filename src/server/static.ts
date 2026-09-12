import { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
};

/**
 * Static file server for Mini App frontend assets (dist/webapp)
 */
export function serveStaticFiles(
  req: IncomingMessage,
  res: ServerResponse,
  webappDistDir: string = path.join(process.cwd(), 'dist', 'webapp')
): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);

  // Jangan tangani route webhook atau api
  if (pathname.startsWith('/api') || pathname.startsWith('/webhook') || pathname.startsWith('/health')) {
    return false;
  }

  // Jika webapp build belum ada
  if (!fs.existsSync(webappDistDir)) {
    // Tampilkan placeholder informatif
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>DeltaUserJS Mini App Dashboard</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #1e293b; border-radius: 16px; padding: 32px; max-width: 480px; text-align: center; border: 1px solid #334155; }
            h1 { margin-top: 0; font-size: 24px; color: #38bdf8; }
            p { color: #94a3b8; line-height: 1.6; }
            .badge { display: inline-block; padding: 6px 14px; background: #0284c7; color: white; border-radius: 9999px; font-weight: bold; font-size: 13px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <span class="badge">🚀 DeltaUserJS WebApp</span>
            <h1>Dashboard Telegram Mini App</h1>
            <p>Aplikasi web frontend sedang dikompilasi atau dalam proses deployment.</p>
            <p>Silakan build modul frontend di <code>webapp/</code> dengan perintah <code>npm run build:webapp</code>.</p>
          </div>
        </body>
      </html>
    `);
    return true;
  }

  // Normalisasi path
  if (pathname === '/' || pathname === '/app' || pathname === '/webapp') {
    pathname = '/index.html';
  }

  let filePath = path.join(webappDistDir, pathname);

  // Mencegah directory traversal
  if (!filePath.startsWith(webappDistDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  // Cek apakah file ada
  let stat: fs.Stats | null = null;
  try {
    if (fs.existsSync(filePath)) {
      stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
        if (fs.existsSync(filePath)) {
          stat = fs.statSync(filePath);
        } else {
          stat = null;
        }
      }
    }
  } catch {
    stat = null;
  }

  // SPA Fallback: jika file spesifik tidak ditemukan dan bukan aset berekstensi, kirim index.html
  if (!stat) {
    const ext = path.extname(pathname);
    if (!ext || ext === '.html') {
      filePath = path.join(webappDistDir, 'index.html');
      if (fs.existsSync(filePath)) {
        stat = fs.statSync(filePath);
      }
    }
  }

  if (!stat) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  const headers: Record<string, string | number> = {
    'Content-Type': contentType,
    'Content-Length': stat.size,
  };

  // Cache assets berekstensi hash selama 1 tahun, index.html no-cache
  if (ext === '.html') {
    headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
  } else {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  }

  res.writeHead(200, headers);

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  return true;
}
