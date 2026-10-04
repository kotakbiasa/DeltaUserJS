/**
 * Plugin Studio: paginasi, kategori, detail, toggle.
 *
 * Dipecah dari dashboard/handlers.ts (1.081 baris). Isi tiap cabang
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 *
 * Mengembalikan NOT_HANDLED bila `action` bukan milik grup ini, supaya
 * router di handlers.ts lanjut ke grup berikutnya (urutan dipertahankan).
 */
import { PROTECTED_PLUGINS, normalizedDisabled } from '../shared.js';
import { disablePlugin, enablePlugin, getDisabledPlugins } from '../../../../../infrastructure/database.js';
import { findPlugin, openPluginStudio, pluginNotice, sendRich } from '../richRuntime.js';
import { panelPluginDetail } from '../panels.js';
import { NOT_HANDLED } from './types.js';

export async function handlePluginsRoutes(ctx) {
  const action = ctx.match[1];

  if (action.startsWith('plugin_page:')) {
    const page = Number(action.split(':')[1] || 1);
    return openPluginStudio(ctx, page, 'all');
  }

  if (action.startsWith('p_cat:')) {
    const parts = action.split(':');
    const category = parts[1] || 'all';
    const page = Number(parts[2]) || 1;
    await ctx.answerCallbackQuery();
    return openPluginStudio(ctx, page, category);
  }

  if (action.startsWith('p_page:')) {
    const parts = action.split(':');
    const page = Number(parts[1]) || 1;
    const category = parts[2] || 'all';
    await ctx.answerCallbackQuery();
    return openPluginStudio(ctx, page, category);
  }

  if (action.startsWith('p_info:')) {
    const parts = action.split(':');
    const pluginName = decodeURIComponent(parts[1] || '');
    const page = Number(parts[2]) || 1;
    const category = parts[3] || 'all';
    await ctx.answerCallbackQuery();
    const detail = panelPluginDetail(ctx, pluginName, page, category);
    return sendRich(ctx, detail.rich, detail.keyboard, { edit: true });
  }

  if (action.startsWith('p_tog:')) {
    const parts = action.split(':');
    const pluginName = decodeURIComponent(parts[1] || '');
    const page = Number(parts[2]) || 1;
    const category = parts[3] || 'all';
    const lower = pluginName.toLowerCase();

    if (PROTECTED_PLUGINS.includes(lower)) {
      return ctx.answerCallbackQuery('Plugin ini dilindungi sistem.');
    }

    const isDisabled = normalizedDisabled(ctx.from.id).includes(lower);
    if (isDisabled) {
      await enablePlugin(ctx.from.id, pluginName);
      await ctx.answerCallbackQuery(`✅ Plugin ${pluginName} diaktifkan`);
      return openPluginStudio(ctx, page, category, pluginNotice(pluginName, true));
    }

    await disablePlugin(ctx.from.id, pluginName);
    await ctx.answerCallbackQuery(`❌ Plugin ${pluginName} dinonaktifkan`);
    return openPluginStudio(ctx, page, category, pluginNotice(pluginName, false));
  }

  if (action.startsWith('p_tog_det:')) {
    const parts = action.split(':');
    const pluginName = decodeURIComponent(parts[1] || '');
    const page = Number(parts[2]) || 1;
    const category = parts[3] || 'all';
    const lower = pluginName.toLowerCase();

    if (PROTECTED_PLUGINS.includes(lower)) {
      return ctx.answerCallbackQuery('Plugin ini dilindungi sistem.');
    }

    const isDisabled = normalizedDisabled(ctx.from.id).includes(lower);
    if (isDisabled) {
      await enablePlugin(ctx.from.id, pluginName);
      await ctx.answerCallbackQuery(`✅ Plugin ${pluginName} diaktifkan`);
    } else {
      await disablePlugin(ctx.from.id, pluginName);
      await ctx.answerCallbackQuery(`❌ Plugin ${pluginName} dinonaktifkan`);
    }
    const detail = panelPluginDetail(ctx, pluginName, page, category);
    return sendRich(ctx, detail.rich, detail.keyboard, { edit: true });
  }

  if (action.startsWith('plugin_toggle:')) {
    const [, rawName, rawPage] = action.split(':');
    const page = Number(rawPage || 1);
    const plugin = findPlugin(rawName);
    if (!plugin) {
      return openPluginStudio(ctx, page, 'all', 'Plugin tidak ditemukan.');
    }
    const pluginName = String(plugin.name);
    const lower = pluginName.toLowerCase();
    const protectedPlugins = ['admin', 'pluginmanager'];
    const disabled = getDisabledPlugins(ctx.from.id).map(name => String(name).toLowerCase());
    const isDisabled = disabled.includes(lower);

    if (!isDisabled && protectedPlugins.includes(lower)) {
      return openPluginStudio(ctx, page, 'all', `Plugin protected: ${pluginName}`);
    }

    if (isDisabled) {
      await enablePlugin(ctx.from.id, pluginName);
      return openPluginStudio(ctx, page, 'all', pluginNotice(pluginName, true));
    }

    await disablePlugin(ctx.from.id, pluginName);
    return openPluginStudio(ctx, page, 'all', pluginNotice(pluginName, false));
  }

  if (action === 'toggle_stream') {
    return ctx.answerCallbackQuery('Fitur ini telah dinonaktifkan.');
  }

  return NOT_HANDLED;
}
