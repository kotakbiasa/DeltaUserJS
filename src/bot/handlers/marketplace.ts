import { Bot, Context, InlineKeyboard,} from 'grammy';
import config from '../../config.js';
import { Logger } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/richMessage.js';
import {
  initPluginMarketplace,
  getRegistryPlugins,
  getInstalledPlugins,
  installPlugin,
  updatePlugin,
  removePlugin,
  searchRegistry,
  getMarketplaceInfo,
  validatePermissions,
  PluginPermission,
} from '../../userbot/engine/pluginMarketplace.js';
import type { BotContext } from '../context.js';

const OWNER_PERMISSIONS: PluginPermission[] = [
  'fs.read', 'fs.write', 'net.http', 'eval', 'shell',
  'db.read', 'db.write', 'bot.send', 'bot.edit', 'user.info',
];

function safeRepositoryHref(repository: string): string | null {
  try {
    const url = new URL(repository);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return null;
    }
    return escapeHtml(url.toString());
  } catch {
    return null;
  }
}

function parseCommandArgs(text: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of text.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '\\' && quote) {
      escaped = true;
    } else if (quote) {
      if (char === quote) {quote = null;} else {current += char;}
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) {args.push(current); current = '';}
    } else {
      current += char;
    }
  }
  if (escaped) {current += '\\';}
  if (current) {args.push(current);}
  return args;
}

function formatPermissions(perms: PluginPermission[]): string {
  const emojiMap: Record<PluginPermission, string> = {
    'fs.read': '📖', 'fs.write': '📝', 'net.http': '🌐', 'eval': '⚡', 'shell': '🐚',
    'db.read': '🗄️', 'db.write': '💾', 'bot.send': '📤', 'bot.edit': '✏️', 'user.info': '👤',
  };
  return perms.map(p => `${emojiMap[p] || '❓'} ${escapeHtml(String(p))}`).join(' ');
}

/**
 * Plugin Marketplace menu
 */
export async function showMarketplaceMenu(ctx: Context) {
  const plugins = getRegistryPlugins();
  const installed = getInstalledPlugins();
  const installedNames = new Set(installed.map(p => p.manifest.name));

  let text = `<b>🏪 PLUGIN MARKETPLACE</b>\n\n`;
  text += `📦 Total: ${plugins.length} | 📥 Installed: ${installed.length}\n\n`;

  const keyboard = new InlineKeyboard();
  const owner = Number(ctx.from?.id) === Number(config.ownerId);

  for (const plugin of plugins.slice(0, 10)) {
    const isInstalled = installedNames.has(plugin.name);
    const status = isInstalled ? '✅' : '⬜';
    const updateAvail = installed.find(i => i.manifest.name === plugin.name && i.manifest.version !== plugin.version) ? ' 🔄' : '';

    text += `${status} <b>${escapeHtml(plugin.name)}</b> v${escapeHtml(plugin.version)}${updateAvail}\n`;
    text += `   ${escapeHtml(plugin.description.slice(0, 60))}...\n\n`;

    const action = !isInstalled
      ? `marketplace:detail:${plugin.name}`
      : (updateAvail && owner ? `marketplace:update:${plugin.name}` : `marketplace:detail:${plugin.name}`);
    const actionLabel = !isInstalled ? '📦' : (updateAvail && owner ? '🔄' : '✅');
    keyboard.text(`${actionLabel} ${plugin.name} v${plugin.version}`, action).row();
  }

  if (plugins.length > 10) {
    text += `<i>... dan ${plugins.length - 10} plugin lainnya. Gunakan search.</i>\n`;
  }

  keyboard.text('🔍 Search', 'marketplace:search').row();
  keyboard.text('📥 Installed', 'marketplace:installed').row();
  keyboard.text('🔄 Refresh', 'marketplace:refresh').row();

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * Show installed plugins
 */
export async function showInstalledPlugins(ctx: Context) {
  const installed = getInstalledPlugins();
  const owner = Number(ctx.from?.id) === Number(config.ownerId);

  if (installed.length === 0) {
    await ctx.reply('📭 Belum ada plugin terinstall.', {
      reply_markup: new InlineKeyboard().text('🏪 Buka Marketplace', 'marketplace:menu').row(),
    });
    return;
  }

  let text = `<b>📥 PLUGIN TERINSTALL</b>\n\n`;
  const keyboard = new InlineKeyboard();

  for (const plugin of installed) {
    const info = getMarketplaceInfo(plugin.manifest.name);
    const updateText = info?.updateAvailable ? ' 🔄 Update available' : '';

    text += `✅ <b>${escapeHtml(plugin.manifest.name)}</b> v${escapeHtml(plugin.manifest.version)}${updateText}\n`;
    text += `   ${escapeHtml(plugin.manifest.description.slice(0, 60))}...\n`;
    text += `   Permission: ${plugin.manifest.permissions.length}\n\n`;

    if (owner) {
      keyboard.text(`🗑️ Hapus ${plugin.manifest.name}`, `marketplace:remove:${plugin.manifest.name}`).row();
      if (info?.updateAvailable) {
        keyboard.text(`🔄 Update ${plugin.manifest.name}`, `marketplace:update:${plugin.manifest.name}`).row();
      }
    }
  }

  keyboard.text('🏪 Marketplace', 'marketplace:menu').row();

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * Show plugin detail
 */
export async function showPluginDetail(ctx: Context, name: string) {
  const info = getMarketplaceInfo(name);
  if (!info) {
    await ctx.reply('❌ Plugin tidak ditemukan di marketplace.');
    return;
  }

  const { manifest, installed, installedVersion, updateAvailable } = info;
  const owner = Number(ctx.from?.id) === Number(config.ownerId);
  const repositoryHref = safeRepositoryHref(manifest.repository);
  const repositoryText = escapeHtml(manifest.repository);

  let text = `<b>📦 ${escapeHtml(manifest.name)}</b> v${escapeHtml(manifest.version)}\n\n`;
  text += `<i>${escapeHtml(manifest.description)}</i>\n\n`;
  text += `<b>👤 Author:</b> ${escapeHtml(manifest.author)}\n`;
  text += `<b>📂 Repo:</b> ${repositoryHref ? `<a href="${repositoryHref}">${repositoryText}</a>` : repositoryText}\n`;
  text += `<b>🏷️ Tags:</b> ${escapeHtml(manifest.tags?.join(', ') || '—')}\n`;
  text += `<b>📄 License:</b> ${escapeHtml(manifest.license || '—')}\n\n`;

  text += `<b>🔐 Permissions (${manifest.permissions.length}):</b>\n`;
  text += formatPermissions(manifest.permissions) + '\n\n';

  if (installed) {
    text += `✅ <b>Status:</b> Terinstall v${escapeHtml(String(installedVersion ?? 'unknown'))}\n`;
    if (updateAvailable) {
      text += `🔄 <b>Update tersedia:</b> v${escapeHtml(manifest.version)}\n`;
    }
  } else {
    text += `⬜ <b>Status:</b> Belum terinstall\n`;
  }

  const keyboard = new InlineKeyboard();
  if (owner && installed) {
    if (updateAvailable) {
      keyboard.text('🔄 Update', `marketplace:update:${manifest.name}`).row();
    }
    keyboard.text('🗑️ Hapus', `marketplace:remove:${manifest.name}`).row();
  } else if (owner) {
    keyboard.text('📥 Install', `marketplace:install:${manifest.name}`).row();
  }
  keyboard.text('🏪 Kembali', 'marketplace:menu').row();

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * Search plugins
 */
export async function searchPlugins(ctx: Context, query: string) {
  const results = searchRegistry(query);

  if (results.length === 0) {
    await ctx.reply(`🔍 Tidak ditemukan plugin untuk: <b>${escapeHtml(query)}</b>`, { parse_mode: 'HTML' });
    return;
  }

  let text = `<b>🔍 HASIL PENCARIAN: "${escapeHtml(query)}"</b>\n\n`;
  const keyboard = new InlineKeyboard();

  for (const plugin of results.slice(0, 10)) {
    const isInstalled = getInstalledPlugins().some(p => p.manifest.name === plugin.name);
    text += `${isInstalled ? '✅' : '⬜'} <b>${escapeHtml(plugin.name)}</b> v${escapeHtml(plugin.version)}\n`;
    text += `   ${escapeHtml(plugin.description.slice(0, 60))}...\n\n`;

    keyboard.text(`${isInstalled ? '🔄' : '📥'} ${plugin.name}`, `marketplace:detail:${plugin.name}`).row();
  }

  keyboard.text('🏪 Marketplace', 'marketplace:menu').row();

  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}

/**
 * Register marketplace handlers
 */
export function registerMarketplaceHandlers(bot: Bot<BotContext>) {
  // Initialize marketplace on startup
  initPluginMarketplace().catch(err => Logger.logSystem(`Marketplace init failed: ${err}`, 'WARN'));

  // Marketplace menu
  bot.callbackQuery('marketplace:menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showMarketplaceMenu(ctx);
  });

  bot.callbackQuery('marketplace:installed', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showInstalledPlugins(ctx);
  });

  bot.callbackQuery('marketplace:refresh', async (ctx) => {
    await ctx.answerCallbackQuery('Merefresh...');
    await showMarketplaceMenu(ctx);
  });

  // Plugin detail
  bot.callbackQuery(/^marketplace:detail:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await showPluginDetail(ctx, ctx.match[1]);
  });

  // Install plugin
  bot.callbackQuery(/^marketplace:install:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    if (ctx.from?.id !== config.ownerId) {
      await ctx.answerCallbackQuery({ text: '⛔ Hanya owner yang bisa install plugin.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery('Menginstall...');

    try {
      await installPlugin(name);
      await ctx.reply(`✅ Plugin <b>${escapeHtml(name)}</b> berhasil diinstall!`, { parse_mode: 'HTML' });
      await showPluginDetail(ctx, name);
    } catch (err) {
      await ctx.reply(`❌ Gagal install: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
    }
  });

  // Update plugin
  bot.callbackQuery(/^marketplace:update:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    if (ctx.from?.id !== config.ownerId) {
      await ctx.answerCallbackQuery({ text: '⛔ Hanya owner yang bisa update plugin.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery('Mengupdate...');

    try {
      await updatePlugin(name);
      await ctx.reply(`✅ Plugin <b>${escapeHtml(name)}</b> berhasil diupdate!`, { parse_mode: 'HTML' });
      await showPluginDetail(ctx, name);
    } catch (err) {
      await ctx.reply(`❌ Gagal update: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
    }
  });

  // Remove plugin
  bot.callbackQuery(/^marketplace:remove:(.+)$/, async (ctx) => {
    const name = ctx.match[1];
    if (ctx.from?.id !== config.ownerId) {
      await ctx.answerCallbackQuery({ text: '⛔ Hanya owner yang bisa hapus plugin.', show_alert: true });
      return;
    }
    await ctx.answerCallbackQuery('Menghapus...');

    try {
      await removePlugin(name);
      await ctx.reply(`✅ Plugin <b>${escapeHtml(name)}</b> berhasil dihapus!`, { parse_mode: 'HTML' });
      await showInstalledPlugins(ctx);
    } catch (err) {
      await ctx.reply(`❌ Gagal hapus: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
    }
  });

  // Search
  bot.callbackQuery('marketplace:search', async (ctx) => {
    await ctx.answerCallbackQuery('Masukkan kata kunci...');
    await ctx.reply('🔍 Kirim kata kunci pencarian (contoh: "carbon")');
  });

  // Search command
  bot.command('msearch', async (ctx) => {
    const query = ctx.message?.text?.split(' ').slice(1).join(' ');
    if (!query) {
      await ctx.reply('🔍 Usage: <code>/msearch <kata kunci></code>', { parse_mode: 'HTML' });
      return;
    }
    await searchPlugins(ctx, query);
  });

  // Marketplace menu command
  bot.command('marketplace', async (ctx) => {
    await showMarketplaceMenu(ctx);
  });

  bot.command('minstalled', async (ctx) => {
    await showInstalledPlugins(ctx);
  });

  // Owner: Add plugin to registry
  bot.command('madd', async (ctx) => {
    if (ctx.from?.id !== config.ownerId) {return;}

    // Expect: /madd name version description author repo entryPoint perm1,perm2,perm3
    const args = parseCommandArgs(ctx.message?.text || '').slice(1);
    if (args.length < 6) {
      await ctx.reply(
        `<b>Usage:</b> <code>/madd <name> <version> <description> <author> <repo> <entryPoint> <perms></code>\n\n` +
        `<b>Example:</b> <code>/madd myplugin 1.0.0 "Cool plugin" Me https://github.com/me/myplugin src/plugins/myplugin.ts fs.read,net.http</code>`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    try {
      const [name, version, description, author, repository, entryPoint, ...perms] = args;
      const permissions = perms.join(' ').split(',').map(p => p.trim()) as PluginPermission[];

      const { valid, invalid } = validatePermissions(permissions, OWNER_PERMISSIONS);
      if (!valid) {
        await ctx.reply(`❌ Invalid permissions: ${invalid.join(', ')}`);
        return;
      }

      const { addPluginToRegistry } = await import('../../userbot/engine/pluginMarketplace.js');
      await addPluginToRegistry({
        name,
        version,
        description,
        author,
        repository,
        entryPoint,
        permissions,
      });

      await ctx.reply(`✅ Plugin <b>${escapeHtml(name)}</b> v${escapeHtml(version)} ditambahkan ke registry!`, { parse_mode: 'HTML' });
    } catch (err) {
      await ctx.reply(`❌ Gagal: ${escapeHtml(err instanceof Error ? err.message : String(err))}`);
    }
  });

  // Owner: Remove from registry
  bot.command('mremove', async (ctx) => {
    if (ctx.from?.id !== config.ownerId) {return;}

    const name = ctx.message?.text?.split(' ')[1];
    if (!name) {
      await ctx.reply('Usage: <code>/mremove <name></code>', { parse_mode: 'HTML' });
      return;
    }

    const { removePluginFromRegistry } = await import('../../userbot/engine/pluginMarketplace.js');
    await removePluginFromRegistry(name);
    await ctx.reply(`✅ Plugin <b>${escapeHtml(name)}</b> dihapus dari registry.`, { parse_mode: 'HTML' });
  });

  // Owner: List registry
  bot.command('mlist', async (ctx) => {
    if (ctx.from?.id !== config.ownerId) {return;}

    const plugins = getRegistryPlugins();
    let text = `<b>📋 REGISTRY (${plugins.length} plugins)</b>\n\n`;
    for (const p of plugins.slice(0, 20)) {
      text += `• <b>${escapeHtml(p.name)}</b> v${escapeHtml(p.version)} — ${escapeHtml(p.description.slice(0, 50))}...\n`;
    }
    await ctx.reply(text, { parse_mode: 'HTML' });
  });
}