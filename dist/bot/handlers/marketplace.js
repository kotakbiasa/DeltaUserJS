import { InlineKeyboard } from 'grammy';
import config from '../../config.js';
import { Logger } from '../../utils/logger.js';
import { initPluginMarketplace, getRegistryPlugins, getInstalledPlugins, installPlugin, updatePlugin, removePlugin, searchRegistry, getMarketplaceInfo, validatePermissions, } from '../../userbot/engine/pluginMarketplace.js';
const OWNER_PERMISSIONS = [
    'fs.read', 'fs.write', 'net.http', 'eval', 'shell',
    'db.read', 'db.write', 'bot.send', 'bot.edit', 'user.info',
];
function formatPermissions(perms) {
    const emojiMap = {
        'fs.read': '📖', 'fs.write': '📝', 'net.http': '🌐', 'eval': '⚡', 'shell': '🐚',
        'db.read': '🗄️', 'db.write': '💾', 'bot.send': '📤', 'bot.edit': '✏️', 'user.info': '👤',
    };
    return perms.map(p => `${emojiMap[p] || '❓'} ${p}`).join(' ');
}
/**
 * Plugin Marketplace menu
 */
export async function showMarketplaceMenu(ctx) {
    const plugins = getRegistryPlugins();
    const installed = getInstalledPlugins();
    const installedNames = new Set(installed.map(p => p.manifest.name));
    let text = `<b>🏪 PLUGIN MARKETPLACE</b>\n\n`;
    text += `📦 Total: ${plugins.length} | 📥 Installed: ${installed.length}\n\n`;
    const keyboard = new InlineKeyboard();
    for (const plugin of plugins.slice(0, 10)) {
        const isInstalled = installedNames.has(plugin.name);
        const status = isInstalled ? '✅' : '⬜';
        const updateAvail = installed.find(i => i.manifest.name === plugin.name && i.manifest.version !== plugin.version) ? ' 🔄' : '';
        text += `${status} <b>${plugin.name}</b> v${plugin.version}${updateAvail}\n`;
        text += `   ${plugin.description.slice(0, 60)}...\n\n`;
        keyboard.text(`${isInstalled ? '🔄' : '📥'} ${plugin.name} v${plugin.version}`, `marketplace:install:${plugin.name}`).row();
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
export async function showInstalledPlugins(ctx) {
    const installed = getInstalledPlugins();
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
        text += `✅ <b>${plugin.manifest.name}</b> v${plugin.manifest.version}${updateText}\n`;
        text += `   ${plugin.manifest.description.slice(0, 60)}...\n`;
        text += `   Permission: ${plugin.manifest.permissions.length}\n\n`;
        keyboard.text(`🗑️ Hapus ${plugin.manifest.name}`, `marketplace:remove:${plugin.manifest.name}`).row();
        if (info?.updateAvailable) {
            keyboard.text(`🔄 Update ${plugin.manifest.name}`, `marketplace:update:${plugin.manifest.name}`).row();
        }
    }
    keyboard.text('🏪 Marketplace', 'marketplace:menu').row();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}
/**
 * Show plugin detail
 */
export async function showPluginDetail(ctx, name) {
    const info = getMarketplaceInfo(name);
    if (!info) {
        await ctx.reply('❌ Plugin tidak ditemukan di marketplace.');
        return;
    }
    const { manifest, installed, installedVersion, updateAvailable } = info;
    let text = `<b>📦 ${manifest.name}</b> v${manifest.version}\n\n`;
    text += `<blockquote>${manifest.description}</blockquote>\n\n`;
    text += `<b>👤 Author:</b> ${manifest.author}\n`;
    text += `<b>📂 Repo:</b> <a href="${manifest.repository}">${manifest.repository}</a>\n`;
    text += `<b>🏷️ Tags:</b> ${manifest.tags?.join(', ') || '—'}\n`;
    text += `<b>📄 License:</b> ${manifest.license || '—'}\n\n`;
    text += `<b>🔐 Permissions (${manifest.permissions.length}):</b>\n`;
    text += formatPermissions(manifest.permissions) + '\n\n';
    if (installed) {
        text += `✅ <b>Status:</b> Terinstall v${installedVersion}\n`;
        if (updateAvailable) {
            text += `🔄 <b>Update tersedia:</b> v${manifest.version}\n`;
        }
    }
    else {
        text += `⬜ <b>Status:</b> Belum terinstall\n`;
    }
    const keyboard = new InlineKeyboard();
    if (installed) {
        if (updateAvailable) {
            keyboard.text('🔄 Update', `marketplace:update:${manifest.name}`).row();
        }
        keyboard.text('🗑️ Hapus', `marketplace:remove:${manifest.name}`).row();
    }
    else {
        keyboard.text('📥 Install', `marketplace:install:${manifest.name}`).row();
    }
    keyboard.text('🏪 Kembali', 'marketplace:menu').row();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}
/**
 * Search plugins
 */
export async function searchPlugins(ctx, query) {
    const results = searchRegistry(query);
    if (results.length === 0) {
        await ctx.reply(`🔍 Tidak ditemukan plugin untuk: <b>${query}</b>`, { parse_mode: 'HTML' });
        return;
    }
    let text = `<b>🔍 HASIL PENCARIAN: "${query}"</b>\n\n`;
    const keyboard = new InlineKeyboard();
    for (const plugin of results.slice(0, 10)) {
        const isInstalled = getInstalledPlugins().some(p => p.manifest.name === plugin.name);
        text += `${isInstalled ? '✅' : '⬜'} <b>${plugin.name}</b> v${plugin.version}\n`;
        text += `   ${plugin.description.slice(0, 60)}...\n\n`;
        keyboard.text(`${isInstalled ? '🔄' : '📥'} ${plugin.name}`, `marketplace:detail:${plugin.name}`).row();
    }
    keyboard.text('🏪 Marketplace', 'marketplace:menu').row();
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
}
/**
 * Register marketplace handlers
 */
export function registerMarketplaceHandlers(bot) {
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
        await ctx.answerCallbackQuery('Menginstall...');
        const name = ctx.match[1];
        if (ctx.from?.id !== config.ownerId) {
            await ctx.reply('❌ Hanya owner yang bisa install plugin.');
            return;
        }
        try {
            await installPlugin(name);
            await ctx.reply(`✅ Plugin <b>${name}</b> berhasil diinstall!`, { parse_mode: 'HTML' });
            await showPluginDetail(ctx, name);
        }
        catch (err) {
            await ctx.reply(`❌ Gagal install: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // Update plugin
    bot.callbackQuery(/^marketplace:update:(.+)$/, async (ctx) => {
        await ctx.answerCallbackQuery('Mengupdate...');
        const name = ctx.match[1];
        if (ctx.from?.id !== config.ownerId) {
            await ctx.reply('❌ Hanya owner yang bisa update plugin.');
            return;
        }
        try {
            await updatePlugin(name);
            await ctx.reply(`✅ Plugin <b>${name}</b> berhasil diupdate!`, { parse_mode: 'HTML' });
            await showPluginDetail(ctx, name);
        }
        catch (err) {
            await ctx.reply(`❌ Gagal update: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // Remove plugin
    bot.callbackQuery(/^marketplace:remove:(.+)$/, async (ctx) => {
        await ctx.answerCallbackQuery('Menghapus...');
        const name = ctx.match[1];
        if (ctx.from?.id !== config.ownerId) {
            await ctx.reply('❌ Hanya owner yang bisa hapus plugin.');
            return;
        }
        try {
            await removePlugin(name);
            await ctx.reply(`✅ Plugin <b>${name}</b> berhasil dihapus!`, { parse_mode: 'HTML' });
            await showInstalledPlugins(ctx);
        }
        catch (err) {
            await ctx.reply(`❌ Gagal hapus: ${err instanceof Error ? err.message : String(err)}`);
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
        if (ctx.from?.id !== config.ownerId) {
            return;
        }
        // Expect: /madd name version description author repo entryPoint perm1,perm2,perm3
        const args = ctx.message?.text?.split(' ').slice(1) || [];
        if (args.length < 6) {
            await ctx.reply(`<b>Usage:</b> <code>/madd <name> <version> <description> <author> <repo> <entryPoint> <perms></code>\n\n` +
                `<b>Example:</b> <code>/madd myplugin 1.0.0 "Cool plugin" Me https://github.com/me/myplugin src/plugins/myplugin.ts fs.read,net.http</code>`, { parse_mode: 'HTML' });
            return;
        }
        try {
            const [name, version, description, author, repository, entryPoint, ...perms] = args;
            const permissions = perms.join(' ').split(',').map(p => p.trim());
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
            await ctx.reply(`✅ Plugin <b>${name}</b> v${version} ditambahkan ke registry!`, { parse_mode: 'HTML' });
        }
        catch (err) {
            await ctx.reply(`❌ Gagal: ${err instanceof Error ? err.message : String(err)}`);
        }
    });
    // Owner: Remove from registry
    bot.command('mremove', async (ctx) => {
        if (ctx.from?.id !== config.ownerId) {
            return;
        }
        const name = ctx.message?.text?.split(' ')[1];
        if (!name) {
            await ctx.reply('Usage: <code>/mremove <name></code>', { parse_mode: 'HTML' });
            return;
        }
        const { removePluginFromRegistry } = await import('../../userbot/engine/pluginMarketplace.js');
        await removePluginFromRegistry(name);
        await ctx.reply(`✅ Plugin <b>${name}</b> dihapus dari registry.`, { parse_mode: 'HTML' });
    });
    // Owner: List registry
    bot.command('mlist', async (ctx) => {
        if (ctx.from?.id !== config.ownerId) {
            return;
        }
        const plugins = getRegistryPlugins();
        let text = `<b>📋 REGISTRY (${plugins.length} plugins)</b>\n\n`;
        for (const p of plugins.slice(0, 20)) {
            text += `• <b>${p.name}</b> v${p.version} — ${p.description.slice(0, 50)}...\n`;
        }
        await ctx.reply(text, { parse_mode: 'HTML' });
    });
}
