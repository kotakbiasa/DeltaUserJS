import { Bot, Context, InlineKeyboard } from 'grammy';
import config from '../../config.js';
import { Logger } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/richMessage.js';
import {
  getInstalledPlugins,
  togglePluginFromBot,
  uninstallPluginFromBot,
} from '../../userbot/engine/pluginMarketplace.js';
import { loadedPlugins } from '../../userbot/engine/pluginRegistry.js';

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
 * Hanya untuk plugin yang sudah terinstall.
 * Aksi: lihat detail, disable/enable, uninstall.
 */
export async function showPluginMenu(ctx: Context) {
  if (!isOwner(ctx)) {
    await ctx.reply('⛔ Hanya owner yang bisa mengakses plugin management.');
    return;
  }

  const installed = getInstalledPlugins();

  if (installed.length === 0) {
    await ctx.reply('📭 Belum ada plugin terinstall.', {
      reply_markup: new InlineKeyboard().text('🔄 Refresh', 'pmgmt:refresh').row(),
    });
    return;
  }

  let text = `<b>🧩 PLUGIN MANAGEMENT</b>\n\n`;
  text += `📦 ${installed.length} modul terinstall\n\n`;

  const keyboard = new InlineKeyboard();

  for (const plugin of installed) {
    const { plugin: p } = getPluginInfo(plugin.manifest.name);
    const isEnabled = p !== undefined;
    const status = isEnabled ? '✅' : '⏸️';
    text += `${status} <b>${escapeHtml(plugin.manifest.name)}</b> v${escapeHtml(plugin.manifest.version)}\n`;
    keyboard.text(`${status} ${plugin.manifest.name} v${plugin.manifest.version}`, `pmgmt:detail:${plugin.manifest.name}`).row();
  }

  keyboard.text('🔄 Refresh', 'pmgmt:refresh').row();

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

export async function showPluginDetail(ctx: Context, name: string) {
  if (!isOwner(ctx)) {
    await ctx.answerCallbackQuery({ text: '⛔ Hanya owner.', show_alert: true });
    return;
  }

  const { plugin, installed } = getPluginInfo(name);
  if (!installed) {
    await ctx.editMessageText('❌ Plugin tidak ditemukan.');
    return;
  }

  const isEnabled = plugin !== undefined;
  const status = isEnabled ? '✅ Aktif' : '⏸️ Nonaktif';

  let text = `<b>📦 ${escapeHtml(installed.manifest.name)}</b> v${escapeHtml(installed.manifest.version)}\n\n`;
  text += `<i>${escapeHtml(installed.manifest.description)}</i>\n\n`;
  text += `<b>👤 Author:</b> ${escapeHtml(installed.manifest.author)}\n`;
  text += `<b>📂 Repo:</b> ${escapeHtml(installed.manifest.repository)}\n`;
  text += `<b>🏷️ Tags:</b> ${escapeHtml(installed.manifest.tags?.join(', ') || '—')}\n`;
  text += `<b>📄 License:</b> ${escapeHtml(installed.manifest.license || '—')}\n\n`;
  text += `<b>Status:</b> ${status}\n`;

  const keyboard = new InlineKeyboard();
  if (isEnabled) {
    keyboard.text('⏸️ Disable', `pmgmt:disable:${name}`).row();
  } else {
    keyboard.text('▶️ Enable', `pmgmt:enable:${name}`).row();
  }
  keyboard.text('🗑️ Uninstall', `pmgmt:uninstall:${name}`).row();
  keyboard.text('🔙 Kembali', 'pmgmt:menu').row();

  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard });
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

  // Callback: detail plugin
  bot.callbackQuery(/^pmgmt:detail:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    await ctx.answerCallbackQuery();
    await showPluginDetail(ctx, name);
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

  // Callback: refresh
  bot.callbackQuery('pmgmt:refresh', async (ctx) => {
    await ctx.answerCallbackQuery('Refreshing...');
    await showPluginMenu(ctx);
  });
}
