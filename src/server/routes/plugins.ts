/**
 * Rute API: Daftar dan toggle plugin.
 *
 * Dipecah dari src/server/api.ts — isi handler dipindahkan apa adanya,
 * hanya konteks request-nya yang sekarang diterima lewat parameter.
 */
import { disablePlugin, enablePlugin, getDisabledPlugins } from '../../services/UserbotService.js';
import { loadedPlugins } from '../../userbot/engine/pluginRegistry.js';
import { RouteContext, readJsonBody, sendJson } from './context.js';

export async function handlePluginsRoutes(ctx: RouteContext): Promise<boolean> {
  const { pathname, req, res, user } = ctx;

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

      sendJson(req, res, 200, {
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
        sendJson(req, res, 400, { success: false, error: 'Parameter pluginName wajib diisi.' });
        return true;
      }

      const pluginName = String(body.pluginName).toLowerCase();

      if (body.enabled) {
        await enablePlugin(user.id, pluginName);
      } else {
        await disablePlugin(user.id, pluginName);
      }

      sendJson(req, res, 200, {
        success: true,
        pluginName,
        enabled: body.enabled,
        message: `Plugin ${pluginName} berhasil di-${body.enabled ? 'aktifkan' : 'nonaktifkan'}.`,
      });
      return true;
    }

  return false;
}
