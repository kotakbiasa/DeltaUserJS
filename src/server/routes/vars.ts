/**
 * Rute API: Variabel user dan sistem.
 *
 * Dipecah dari src/server/api.ts — isi handler dipindahkan apa adanya,
 * hanya konteks request-nya yang sekarang diterima lewat parameter.
 */
import { startInlineBotForUser, stopInlineBotForUser, validateInlineBot } from '../../bot/services/inlineBotService.js';
import { deleteSystemVar, deleteUserVar, getAllSystemVars, getAllUserVars, setSystemVar, setUserVar } from '../../services/SystemVarService.js';
import { updateUserbotFeature } from '../../services/UserbotService.js';
import { RouteContext, readJsonBody, sendJson } from './context.js';

export async function handleVarsRoutes(ctx: RouteContext): Promise<boolean> {
  const { isOwner, pathname, req, res, user } = ctx;

    // ----------------------------------------------------
    // GET /api/vars: Ambil semua variabel pengguna & sistem
    // ----------------------------------------------------
    if (pathname === '/api/vars' && req.method === 'GET') {
      const userVars = getAllUserVars(user.id);
      const systemVars = isOwner ? getAllSystemVars() : undefined;

      sendJson(req, res, 200, {
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
        sendJson(req, res, 400, { success: false, error: 'Key dan value wajib diisi.' });
        return true;
      }

      const key = body.key.toUpperCase().replace(/[^A-Z0-9_]/g, '');
      if (!key) {
        sendJson(req, res, 400, { success: false, error: 'Nama key variabel tidak valid.' });
        return true;
      }

      if (body.isSystem) {
        if (!isOwner) {
          sendJson(req, res, 403, { success: false, error: 'Hanya Owner yang dapat mengubah System Vars.' });
          return true;
        }
        await setSystemVar(key, body.value);
        sendJson(req, res, 200, {
          success: true,
          message: `System Var ${key} berhasil disimpan.`,
          systemVars: getAllSystemVars(),
        });
        return true;
      }

      // Cegah penulisan variabel reserved
      const RESTRICTED_VARS = ['BOT_TOKEN', 'API_ID', 'API_HASH', 'MONGO_URI', 'ENCRYPTION_KEY', 'OWNER_ID'];
      if (RESTRICTED_VARS.includes(key)) {
        sendJson(req, res, 400, { success: false, error: `Variabel ${key} adalah reserved sistem dan tidak boleh diubah.` });
        return true;
      }

      if (key === 'INLINE_BOT_TOKEN') {
        const username = await validateInlineBot(body.value);
        if (!username) {
          sendJson(req, res, 400, { success: false, error: 'Token Bot tidak valid atau gagal menghubungi Bot API!' });
          return true;
        }
        await updateUserbotFeature(user.id, 'inline_bot_token', body.value);
        await updateUserbotFeature(user.id, 'inline_bot_username', username);
        await startInlineBotForUser(Number(user.id), body.value);
      }

      await setUserVar(user.id, key, body.value);
      sendJson(req, res, 200, {
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
        sendJson(req, res, 400, { success: false, error: 'Key variabel wajib diisi.' });
        return true;
      }

      const key = body.key.toUpperCase();

      if (body.isSystem) {
        if (!isOwner) {
          sendJson(req, res, 403, { success: false, error: 'Hanya Owner yang dapat menghapus System Vars.' });
          return true;
        }
        await deleteSystemVar(key);
        sendJson(req, res, 200, {
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

      sendJson(req, res, 200, {
        success: true,
        message: `Variabel ${key} berhasil dihapus.`,
        userVars: getAllUserVars(user.id),
      });
      return true;
    }

  return false;
}
