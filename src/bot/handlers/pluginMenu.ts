import { Bot, Context, InlineKeyboard } from 'grammy';
import config from '../../config.js';
import { Logger } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/richMessage.js';
import {
  getInstalledPlugins,
  togglePluginFromBot,
  uninstallPluginFromBot,
  installPluginFromBot,
  getRegistryPlugins,
  updateRegistry,
} from '../../userbot/engine/pluginMarketplace.js';
import { loadedPlugins } from '../../userbot/engine/pluginRegistry.js';
import { syncPluginRegistry, CATEGORY_META, type PluginCategory } from '../../userbot/engine/pluginSync.js';

function isOwner(ctx: Context): boolean {
  return Number(ctx.from?.id) === Number(config.ownerId);
}

function getPluginInfo(name: string) {
  const plugin = loadedPlugins.find(p => p.name === name);
  const installed = getInstalledPlugins().find(p => p.manifest.name === name);
  return { plugin, installed };
}

/**
 * Plugin Management Menu — Master Bot
 *
 * Flow: /plugins → pilih kategori → list plugin (✅/⬜) → klik → detail → install/uninstall
 */
export async function showPluginMenu(ctx: Context) {
  if (!isOwner(ctx)) {
    await ctx.reply('⛔ Hanya owner yang bisa mengakses plugin management.');
    return;
  }

  const installed = getInstalledPlugins();
  const registry = getRegistryPlugins();

  let text = `<b>🧩 PLUGIN MANAGEMENT</b>\n\n`;
  text += `📦 ${installed.length} terinstall | 📋 ${registry.length} tersedia\n\n`;
  text += `Pilih kategori untuk melihat daftar plugin:`;

  const keyboard = new InlineKeyboard();
  for (const cat of Object.keys(CATEGORY_META) as PluginCategory[]) {
    const count = registry.filter(p => p.category === cat).length;
    keyboard.text(`${CATEGORY_META[cat].emoji} ${CATEGORY_META[cat].label} (${count})`, `pmgmt:cat:${cat}`).row();
  }
  keyboard.text('📥 Installed', 'pmgmt:installed').row();
  keyboard.text('🔄 Sync', 'pmgmt:sync').row();

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

export async function showCategoryPlugins(ctx: Context, category: PluginCategory) {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: '⛔ Hanya owner.', show_alert: true });
    return;
  }

  const registry = getRegistryPlugins().filter(p => p.category === category);
  const installed = getInstalledPlugins();
  const installedNames = new Set(installed.map(p => p.manifest.name));

  const meta = CATEGORY_META[category];
  let text = `<b>${meta.emoji} ${meta.label.toUpperCase()} (${registry.length} plugins)</b>\n\n`;

  const keyboard = new InlineKeyboard();

  for (const plugin of registry) {
    const isInstalled = installedNames.has(plugin.name);
    const status = isInstalled ? '✅' : '⬜';
    text += `${status} <b>${escapeHtml(plugin.name)}</b> v${escapeHtml(plugin.version)}\n`;
    text += `   ${escapeHtml(plugin.description.slice(0, 60))}...\n\n`;

    const action = isInstalled ? `pmgmt:detail:${plugin.name}` : `pmgmt:install:${plugin.name}`;
    const actionLabel = isInstalled ? '📦' : '📥';
    keyboard.text(`${actionLabel} ${plugin.name} v${plugin.version}`, action).row();
  }

  keyboard.text('🔙 Kategori', 'pmgmt:menu').row();

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

export async function showPluginDetail(ctx: Context, name: string) {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: '⛔ Hanya owner.', show_alert: true });
    return;
  }

  const registry = getRegistryPlugins();
  const plugin = registry.find(p => p.name === name);
  if (!plugin) {
    await ctx.editMessageText('❌ Plugin tidak ditemukan.');
    return;
  }

  const { plugin: p, installed } = getPluginInfo(name);
  const isInstalled = installed !== undefined;
  const isEnabled = p !== undefined;
  const status = isInstalled ? (isEnabled ? '✅ Aktif' : '⏸️ Nonaktif') : '⬜ Belum terinstall';

  let text = `<b>📦 ${escapeHtml(plugin.name)}</b> v${escapeHtml(plugin.version)}\n\n`;
  text += `<i>${escapeHtml(plugin.description)}</i>\n\n`;
  text += `<b>👤 Author:</b> ${escapeHtml(plugin.author)}\n`;
  text += `<b>📂 Repo:</b> ${escapeHtml(plugin.repository)}\n`;
  text += `<b>🏷️ Tags:</b> ${escapeHtml(plugin.tags?.join(', ') || '—')}\n`;
  text += `<b>📄 License:</b> ${escapeHtml(plugin.license || '—')}\n\n`;
  text += `<b>Status:</b> ${status}\n`;

  const keyboard = new InlineKeyboard();
  if (isInstalled) {
    if (isEnabled) {
      keyboard.text('⏸️ Disable', `pmgmt:disable:${name}`).row();
    } else {
      keyboard.text('▶️ Enable', `pmgmt:enable:${name}`).row();
    }
    keyboard.text('🗑️ Uninstall', `pmgmt:uninstall:${name}`).row();
  } else {
    keyboard.text('📥 Install', `pmgmt:install:${name}`).row();
  }
  keyboard.text('🔙 Kembali', `pmgmt:cat:${plugin.category}`).row();

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

export async function installPlugin(ctx: Context, name: string) {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: '⛔ Hanya owner.', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery('Menginstall...');

  try {
    await installPluginFromBot(name);
    await ctx.reply(`✅ Plugin <b>${escapeHtml(name)}</b> berhasil diinstall!`, { parse_mode: 'HTML' });
    await showPluginDetail(ctx, name);
  } catch (err) {
    await ctx.reply(`❌ Gagal install: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
  }
}

export async function togglePlugin(ctx: Context, name: string, enabled: boolean) {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: '⛔ Hanya owner.', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery('Memproses...');

  try {
    togglePluginFromBot(name, enabled);
    await ctx.reply(`✅ Plugin <b>${escapeHtml(name)}</b> berhasil di-${enabled ? 'aktifkan' : 'nonaktifkan'}.`, { parse_mode: 'HTML' });
    await showPluginDetail(ctx, name);
  } catch (err) {
    await ctx.reply(`❌ Gagal: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
  }
}

export async function uninstallPlugin(ctx: Context, name: string) {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: '⛔ Hanya owner.', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery('Menghapus...');

  try {
    await uninstallPluginFromBot(name);
    await ctx.reply(`✅ Plugin <b>${escapeHtml(name)}</b> berhasil dihapus!`, { parse_mode: 'HTML' });
    await showPluginMenu(ctx);
  } catch (err) {
    await ctx.reply(`❌ Gagal hapus: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
  }
}

export async function showInstalledPlugins(ctx: Context) {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: '⛔ Hanya owner.', show_alert: true });
    return;
  }

  const installed = getInstalledPlugins();

  if (installed.length === 0) {
    await ctx.editMessageText('📭 Belum ada plugin terinstall.', {
      reply_markup: new InlineKeyboard().text('🏪 Marketplace', 'pmgmt:menu').row(),
    });
    return;
  }

  let text = `<b>📥 PLUGIN TERINSTALL (${installed.length})</b>\n\n`;
  const keyboard = new InlineKeyboard();

  for (const plugin of installed) {
    const { plugin: p } = getPluginInfo(plugin.manifest.name);
    const isEnabled = p !== undefined;
    const status = isEnabled ? '✅' : '⏸️';
    text += `${status} <b>${escapeHtml(plugin.manifest.name)}</b> v${escapeHtml(plugin.manifest.version)}\n`;
    text += `   ${escapeHtml(plugin.manifest.description.slice(0, 60))}...\n\n`;
    keyboard.text(`${status} ${plugin.manifest.name}`, `pmgmt:detail:${plugin.manifest.name}`).row();
  }

  keyboard.text('🏪 Marketplace', 'pmgmt:menu').row();

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

export async function syncPlugins(ctx: Context) {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: '⛔ Hanya owner.', show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery('Syncing...');

  try {
    const manifests = await syncPluginRegistry();
    updateRegistry(manifests);
    await ctx.reply(`✅ Plugin registry berhasil di-sync dari GitHub! (${manifests.length} plugins)`, { parse_mode: 'HTML' });
    await showPluginMenu(ctx);
  } catch (err) {
    await ctx.reply(`❌ Gagal sync: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
  }
}

export function registerPluginMenuHandlers(bot: Bot<Context>) {
  // Command /plugins
  bot.command('plugins', async (ctx) => {
    await showPluginMenu(ctx);
  });

  // Callback: menu utama
  bot.callbackQuery('pmgmt:menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPluginMenu(ctx);
  });

  // Callback: kategori
  bot.callbackQuery(/^pmgmt:cat:(.+)$/, async (ctx) => {
    const category = ctx.match[1] as PluginCategory;
    await ctx.answerCallbackQuery();
    await showCategoryPlugins(ctx, category);
  });

  // Callback: detail plugin
  bot.callbackQuery(/^pmgmt:detail:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    await ctx.answerCallbackQuery();
    await showPluginDetail(ctx, name);
  });

  // Callback: install plugin
  bot.callbackQuery(/^pmgmt:install:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    await installPlugin(ctx, name);
  });

  // Callback: disable plugin
  bot.callbackQuery(/^pmgmt:disable:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    await togglePlugin(ctx, name, false);
  });

  // Callback: enable plugin
  bot.callbackQuery(/^pmgmt:enable:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    await togglePlugin(ctx, name, true);
  });

  // Callback: uninstall plugin
  bot.callbackQuery(/^pmgmt:uninstall:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    await uninstallPlugin(ctx, name);
  });

  // Callback: installed list
  bot.callbackQuery('pmgmt:installed', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showInstalledPlugins(ctx);
  });

  // Callback: sync
  bot.callbackQuery('pmgmt:sync', async (ctx) => {
    await syncPlugins(ctx);
  });
}
