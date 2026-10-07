/**
 * Pendaftaran command dan callback query dashboard ke instance grammY.
 *
 * Dipecah dari dashboard.ts (2.821 baris). Isi tiap fungsi dipindahkan apa
 * adanya; yang berubah hanya di file mana ia tinggal.
 */
import { deleteUserbot, getUserbotSession } from '../../../../infrastructure/database.js';
import userbotManager from '../../../../userbot/engine/manager.js';
import { Logger } from '../../../../utils/logger.js';
import { escapeHtml, replyRich } from '../../../../utils/richMessage.js';
import { animateBotApiPayload } from '../../../../utils/customEmoji.js';
import { approveUser, isApproved } from '../../../state/approvedUsers.js';
import { getSystemVarValue, isOwner } from './shared.js';
import { panelAccessDenied, panelHealth, panelSubscription, panelTermsOfService, panelUserbot } from './panels.js';
import { applyButtonStylesToPayload, keyboardAccessDenied, keyboardBack, keyboardSubscription, keyboardTermsOfService, keyboardUserbot, stripButtonCustomEmoji } from './keyboards.js';
import { handleNavigationRoutes } from './routes/navigation.js';
import { handlePluginsRoutes } from './routes/plugins.js';
import { handleSettingsRoutes } from './routes/settings.js';
import { handleAccountRoutes } from './routes/account.js';
import { handleInfoRoutes } from './routes/info.js';
import { handleAdminRoutes } from './routes/admin.js';
import { handleMiscRoutes } from './routes/misc.js';
import { NOT_HANDLED } from './routes/types.js';
import { mongoStatusLabel, openMain, sendRich } from './richRuntime.js';

// Helper runtime dipindah ke richRuntime.ts; di-re-export agar import
// lama (mis. dashboard.ts) tetap bekerja tanpa perubahan.
export {
  findPlugin,
  mongoStatusLabel,
  openMain,
  openPluginStudio,
  pluginNotice,
  sendAccessDeniedRich,
  sendRich,
} from './richRuntime.js';
import type { BotContext } from '../../../context.js';
import type { Bot } from 'grammy';

export function registerRichHandlers(bot: Bot<BotContext>) {
  bot.api.config.use(async (prev, method, payload, signal) => {
    const raw = payload as Record<string, unknown>;
    applyButtonStylesToPayload(raw);
    animateBotApiPayload(method, raw);
    if (Array.isArray(raw?.results)) {
      for (const result of raw.results) {applyButtonStylesToPayload(result);}
    }
    try {
      return await prev(method, payload, signal);
    } catch (err: unknown) {
      const errorMsg = String((err as { message?: string; description?: string })?.description || (err as Error)?.message || '');
      if (errorMsg.includes('BUTTON_ICON_CUSTOM_EMOJI_INVALID') || errorMsg.includes('BUTTON_STYLE_INVALID')) {
        stripButtonCustomEmoji(raw);
        if (Array.isArray(raw?.results)) {
          for (const result of raw.results) {stripButtonCustomEmoji(result);}
        }
        return await prev(method, payload, signal);
      }
      throw err;
    }
  });


  bot.command(['start', 'menu'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      await replyRich(ctx, `🤖 <b>${escapeHtml(ctx.me.first_name)} Aktif!</b>\n\n<p>Silakan kirim pesan secara privat (PM) untuk mengelola bot Anda.</p>`, {
        reply_markup: {
          inline_keyboard: [[{ text: '💬 Buka Private Chat', url: `https://t.me/${ctx.me.username}?start=true` }]]
        }
      });
      return;
    }

    const payload = typeof ctx.match === 'string' ? ctx.match.trim() : '';

    // Penanganan Deep Link Pemasangan Plugin (misal: /start install_wiki)
    if (payload.startsWith('install_')) {
      const pluginName = payload.slice(8).trim().toLowerCase();
      const session = getUserbotSession(ctx.from.id);

      // Jika pengguna belum memiliki sesi userbot aktif
      if (!session) {
        return sendRich(
          ctx,
          `<h1>⚠️ Sesi Userbot Belum Aktif</h1>` +
          `<blockquote>Halo <b>${escapeHtml(ctx.from.first_name)}</b>, Anda mencoba memasang modul <code>${escapeHtml(pluginName)}</code>.</blockquote>` +
          `<p>Untuk menggunakan modul ini, akun Telegram Anda harus terdaftar dan terhubung ke DeltaUserJS terlebih dahulu.</p>` +
          `<footer>Silakan hubungkan userbot Anda melalui tombol di bawah:</footer>`,
          {
            inline_keyboard: [
              [{ text: '🚀 Daftar / Login Userbot', callback_data: 'rich:register' }],
              [{ text: '🔙 Kembali ke Menu', callback_data: 'rich:main' }],
            ]
          }
        );
      }

      // Pastikan modul aktif / dicari di pustaka plugin
      const { loadedPlugins, loadSinglePlugin } = await import('../../../../userbot/engine/pluginLoader.js').then(async (m) => {
        const { loadedPlugins } = await import('../../../../userbot/engine/pluginRegistry.js');
        return { loadedPlugins, loadSinglePlugin: m.loadSinglePlugin };
      });

      let targetPlugin = loadedPlugins.find((p) => String(p.name).toLowerCase() === pluginName);

      // Jika belum termuat di runtime, cari file sumber di repo GitHub eksternal atau lokal dan muat ke installed/
      if (!targetPlugin) {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const baseDir = path.resolve('src/userbot/handlers');
        const installedDir = path.join(baseDir, 'installed');

        if (!fs.existsSync(installedDir)) {
          fs.mkdirSync(installedDir, { recursive: true });
        }

        const targetInstalledPath = path.join(installedDir, `${pluginName}.ts`);
        let installedSuccessfully = false;

        // 1. Coba unduh langsung dari GitHub Raw repo eksternal (kotakbiasa/DeltaUserJS-Plugins)
        const ghCategories = ['tools', 'util', 'group', 'system'];
        for (const cat of ghCategories) {
          try {
            const ghUrl = `https://raw.githubusercontent.com/kotakbiasa/DeltaUserJS-Plugins/main/${cat}/${pluginName}.ts`;
            const res = await fetch(ghUrl);
            if (res.ok) {
              const codeText = await res.text();
              fs.writeFileSync(targetInstalledPath, codeText, 'utf-8');
              installedSuccessfully = true;
              break;
            }
          } catch (_) {
            // ignore
          }
        }

        // 2. Fallback jika file sumber ada di lokal
        if (!installedSuccessfully) {
          const searchDirs = ['tools', 'util', 'group', 'system'];
          let sourcePath: string | null = null;
          for (const dir of searchDirs) {
            const candidateTs = path.join(baseDir, dir, `${pluginName}.ts`);
            const candidateJs = path.join(baseDir, dir, `${pluginName}.js`);
            if (fs.existsSync(candidateTs)) {
              sourcePath = candidateTs;
              break;
            }
            if (fs.existsSync(candidateJs)) {
              sourcePath = candidateJs;
              break;
            }
          }

          if (sourcePath && sourcePath !== targetInstalledPath) {
            fs.copyFileSync(sourcePath, targetInstalledPath);
            installedSuccessfully = true;
          }
        }

        if (installedSuccessfully) {
          await loadSinglePlugin(targetInstalledPath);
          targetPlugin = loadedPlugins.find((p) => String(p.name).toLowerCase() === pluginName);
        }
      }

      // Jika modul ditemukan dan siap
      if (targetPlugin) {
        // Pastikan plugin diaktifkan untuk user
        const { enablePlugin } = await import('../../../../infrastructure/database.js');
        await enablePlugin(ctx.from.id, targetPlugin.name);

        const currentPrefix = session?.vars?.PREFIX || '.';
        const title = targetPlugin.help?.title || targetPlugin.name.toUpperCase();
        const desc = targetPlugin.help?.description || 'Modul perintah userbot Telegram.';
        const usage = targetPlugin.help?.usage || `${currentPrefix}${targetPlugin.name}`;
        const cmdList = targetPlugin.commands && targetPlugin.commands.length > 0
          ? targetPlugin.commands.map((c) => `<code>${escapeHtml(currentPrefix)}${escapeHtml(c)}</code>`).join(', ')
          : `<code>${escapeHtml(currentPrefix)}${escapeHtml(targetPlugin.name)}</code>`;

        return sendRich(
          ctx,
          `<h1>✅ Modul Berhasil Dipasang!</h1>` +
          `<blockquote>Modul <b>${escapeHtml(title)}</b> siap digunakan di akun userbot Anda.</blockquote>` +
          `<table bordered striped>` +
          `<tr><th>Parameter</th><th>Keterangan</th></tr>` +
          `<tr><td>🏷️ Nama Modul</td><td><code>${escapeHtml(targetPlugin.name)}</code></td></tr>` +
          `<tr><td>⚡ Status</td><td align="center">🟢 Aktif &amp; Siap Pakai</td></tr>` +
          `<tr><td>💬 Perintah</td><td>${cmdList}</td></tr>` +
          `<tr><td>📖 Contoh Penggunaan</td><td><code>${escapeHtml(usage)}</code></td></tr>` +
          `</table>` +
          `<p>💡 <b>Keterangan:</b> ${escapeHtml(desc)}</p>` +
          `<footer>Ketik perintah di atas di chat mana pun melalui akun userbot Anda.</footer>`,
          {
            inline_keyboard: [
              [
                { text: '🧩 Buka Plugin Studio', callback_data: `rich:p_info:${encodeURIComponent(targetPlugin.name)}:1:all` },
                { text: '🤖 Dashboard Userbot', callback_data: 'rich:ubot' },
              ],
              [
                { text: '📖 Repositori Modul', url: 'https://t.me/PluginList' },
                { text: '🔙 Menu Utama', callback_data: 'rich:main' },
              ],
            ]
          }
        );
      }

      // Modul tidak ditemukan
      return sendRich(
        ctx,
        `<h1>❌ Modul Tidak Ditemukan</h1>` +
        `<p>Modul <code>${escapeHtml(pluginName)}</code> tidak ditemukan dalam repositori atau katalog server.</p>` +
        `<footer>Silakan cek daftar modul resmi yang tersedia di channel repositori.</footer>`,
        {
          inline_keyboard: [
            [{ text: '📖 Buka Channel Modul', url: 'https://t.me/PluginList' }],
            [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
          ]
        }
      );
    }

    await openMain(ctx);
  });



  bot.command(['paket', 'vip', 'langganan', 'subscribe', 'pricing'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      return replyRich(ctx, `<p>Silakan buka status akses di Private Chat bot.</p>`);
    }
    return sendRich(ctx, panelSubscription(ctx), keyboardSubscription(ctx));
  });

  bot.command(['daftar', 'login', 'register'], async (ctx) => {
    if (ctx.chat.type !== 'private') {
      return replyRich(ctx, `<p>Silakan kirim pesan secara privat (PM) untuk mendaftar userbot.</p>`);
    }
    const session = getUserbotSession(ctx.from.id);
    if (session) {
      return sendRich(ctx, panelUserbot(ctx), keyboardUserbot(ctx));
    }
    const autoApprove = getSystemVarValue('AUTO_APPROVE', '0') === '1';
    if (!isOwner(ctx) && !isApproved(ctx.from.id) && !autoApprove) {
      return sendRich(ctx, panelAccessDenied(ctx), keyboardAccessDenied(ctx));
    }
    if (autoApprove && !isApproved(ctx.from.id)) {
      approveUser(ctx.from.id, { name: ctx.from.first_name, username: ctx.from.username });
    }
    return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: false });
  });

  bot.command(['tos', 'rules', 'syarat', 'ketentuan'], async (ctx) => {
    if (ctx.chat.type !== 'private') {return;}
    return sendRich(ctx, panelTermsOfService(ctx), keyboardTermsOfService(), { edit: false });
  });

  bot.command('cancel', async (ctx) => {
    const userId = ctx.from.id;
    try {
      const { abortActiveQr, activeRegClients } = await import('../../../conversations/registration.js');
      await abortActiveQr(userId, ctx.api);
      const client = activeRegClients.get(userId);
      if (client) {
        try { await client.disconnect(); } catch (_) { /* empty */ }
        activeRegClients.delete(userId);
      }
    } catch (_) { /* empty */ }
    await ctx.conversation.exitAll();
    await replyRich(ctx, `<p><b>❌ Aksi dibatalkan.</b><br>Ketik /menu untuk membuka Menu Utama.</p>`);
  });

  bot.command('health', async (ctx) => {
    if (!isOwner(ctx)) {return;}
    await sendRich(ctx, panelHealth(await mongoStatusLabel()), keyboardBack('admin'));
  });

  bot.command('revoke', async (ctx) => {
    const telegramId = ctx.from.id;
    const session = getUserbotSession(telegramId);
    if (!session) {
      return ctx.replyWithRichMessage({ html: `<p>❌ Anda belum memiliki sesi bot yang aktif.</p>` });
    }

    await ctx.replyWithRichMessage({ html: `<p>⏳ Menghapus sesi dan logout...</p>` });

    try {
      const ubot = userbotManager.clients.get(telegramId);
      if (ubot && ubot.client) {
        await (ubot.client as unknown as { call: (opts: Record<string, unknown>) => Promise<unknown> }).call({ _: 'auth.logOut' });
      }
    } catch (e) {
      Logger.logUser(telegramId, `Failed to logout remotely: ${e.message}`, 'WARN');
    }

    await userbotManager.stopUserbot(telegramId);
    await deleteUserbot(telegramId);

    await ctx.replyWithRichMessage({ html: `<p><b>✅ Berhasil</b><br>Sesi dihapus sepenuhnya. Ketik /menu untuk mendaftar ulang.</p>` });
  });

  bot.callbackQuery(/^rich:(.+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (_) { /* empty */ }
    if ((await handleNavigationRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handlePluginsRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleSettingsRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleAccountRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleInfoRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleAdminRoutes(ctx)) !== NOT_HANDLED) {return;}
    if ((await handleMiscRoutes(ctx)) !== NOT_HANDLED) {return;}
  });
}
