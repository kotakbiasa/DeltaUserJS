/**
 * Rute API: Katalog, produk, dan pesanan toko digital.
 *
 * Dipecah dari src/server/api.ts — isi handler dipindahkan apa adanya,
 * hanya konteks request-nya yang sekarang diterima lewat parameter.
 */
import config from '../../config.js';
import {
  createDigitalOrder,
  createDigitalProduct,
  deleteDigitalProduct,
  listDigitalOrders,
  listDigitalProducts,
  updateDigitalProduct,
} from '../../services/DigitalStoreService.js';
import { notifyOwner, notifyUser } from '../../services/notifyService.js';
import { escapeHtml } from '../../utils/richMessage.js';
import { RouteContext, decodePathSegment, readJsonBody, sendJson } from './context.js';

export async function handleStoreRoutes(ctx: RouteContext): Promise<boolean> {
  const { isOwner, pathname, req, res, url, user } = ctx;

    // ----------------------------------------------------
    // Digital plugin store — katalog, pesanan, dan fulfilment owner
    // ----------------------------------------------------
    if (pathname === '/api/store/products' && req.method === 'GET') {
      const includeInactive = isOwner && url.searchParams.get('includeInactive') === 'true';
      const products = await listDigitalProducts(includeInactive);
      sendJson(req, res, 200, {
        success: true,
        paymentMode: 'manual',
        ownerId: isOwner ? undefined : config.ownerId,
        products,
      });
      return true;
    }

    if (pathname === '/api/store/products' && req.method === 'POST') {
      if (!isOwner) {
        sendJson(req, res, 403, { success: false, error: 'Hanya Owner yang dapat menambah produk toko.' });
        return true;
      }
      const body = await readJsonBody<{
        name?: string;
        pluginName?: string;
        version?: string;
        description?: string;
        price?: number;
        category?: string;
        tags?: string[] | string;
        deliveryNote?: string;
        featured?: boolean;
      }>(req);
      if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0) {
        sendJson(req, res, 400, { success: false, error: 'Harga plugin wajib berupa angka non-negatif.' });
        return true;
      }
      const product = await createDigitalProduct({
        name: body.name || '',
        pluginName: body.pluginName || '',
        version: body.version || '',
        description: body.description || '',
        price: body.price ?? 0,
        category: body.category,
        tags: body.tags,
        deliveryNote: body.deliveryNote,
        featured: body.featured,
      });
      sendJson(req, res, 201, { success: true, message: 'Plugin digital berhasil ditambahkan.', product });
      return true;
    }

    const productMatch = pathname.match(/^\/api\/store\/products\/([^/]+)$/);
    if (productMatch && (req.method === 'PATCH' || req.method === 'DELETE')) {
      if (!isOwner) {
        sendJson(req, res, 403, { success: false, error: 'Hanya Owner yang dapat mengelola produk toko.' });
        return true;
      }
      const productId = decodePathSegment(productMatch[1]);
      if (req.method === 'DELETE') {
        const product = await deleteDigitalProduct(productId);
        sendJson(req, res, 200, { success: true, message: 'Produk dinonaktifkan.', product });
        return true;
      }
      const body = await readJsonBody<{
        name?: string;
        pluginName?: string;
        version?: string;
        description?: string;
        price?: number;
        category?: string;
        tags?: string[] | string;
        deliveryNote?: string;
        active?: boolean;
        featured?: boolean;
      }>(req);
      const product = await updateDigitalProduct(productId, body);
      sendJson(req, res, 200, { success: true, message: 'Produk toko diperbarui.', product });
      return true;
    }

    if (pathname === '/api/store/orders' && req.method === 'GET') {
      const wantsAll = isOwner && url.searchParams.get('scope') === 'all';
      const limit = Number(url.searchParams.get('limit') || 50);
      const orders = await listDigitalOrders(wantsAll ? undefined : user.id, limit);
      sendJson(req, res, 200, { success: true, orders });
      return true;
    }

    if (pathname === '/api/store/orders' && req.method === 'POST') {
      const body = await readJsonBody<{ productId?: string; note?: string }>(req);
      if (!body.productId) {
        sendJson(req, res, 400, { success: false, error: 'Produk yang dipesan wajib dipilih.' });
        return true;
      }
      const order = await createDigitalOrder({
        userId: user.id,
        username: user.username,
        productId: body.productId,
        note: body.note,
      });

      const productText = escapeHtml(order.productName);
      const userText = user.username ? `@${escapeHtml(user.username)}` : `ID ${user.id}`;
      await Promise.allSettled([
        notifyOwner(
          `<b>🛍️ Pesanan plugin digital baru</b>\n\n` +
          `<b>Produk:</b> ${productText} v${escapeHtml(order.version)}\n` +
          `<b>Pembeli:</b> ${userText}\n` +
          `<b>Harga:</b> Rp ${order.amount.toLocaleString('id-ID')}\n` +
          `<b>Order ID:</b> <code>${escapeHtml(order.id)}</code>\n\n` +
          `Buka <code>/app</code> → Toko → Kelola untuk memproses pesanan.`
        ),
        notifyUser(
          user.id,
          `<b>✅ Pesanan diterima</b>\n\n` +
          `<b>Plugin:</b> ${productText} v${escapeHtml(order.version)}\n` +
          `<b>Order ID:</b> <code>${escapeHtml(order.id)}</code>\n\n` +
          `Pesanan dikonfirmasi manual. Owner akan menghubungi kamu melalui Telegram.`
        ),
      ]);

      sendJson(req, res, 201, {
        success: true,
        message: 'Pesanan dibuat. Owner akan menghubungi kamu untuk konfirmasi.',
        order,
      });
      return true;
    }

  return false;
}
