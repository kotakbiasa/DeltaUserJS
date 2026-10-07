import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSinglePlugin } from '../../engine/pluginLoader.js';
import { loadedPlugins, unregisterPlugin, normalizePluginName } from '../../engine/pluginRegistry.js';
import { escapeHtml } from '../../../utils/richMessage.js';
import { Logger } from '../../../utils/logger.js';
import { getCustomEmoji } from '../../../utils/customEmoji.js';
import type { UserbotMessageLike, UserbotSettings } from '../../types.js';
import type { CompatClient } from '../../engine/compatClient.js';
import config from '../../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Direktori modul terpasang dinamis: src/userbot/handlers/installed
const INSTALLED_DIR = path.resolve(__dirname, '../installed');
const CHANNEL_USERNAME = 'PluginList';
const BOT_TOKEN = config.botToken;

// Pastikan folder installed/ tersedia
if (!fs.existsSync(INSTALLED_DIR)) {
  fs.mkdirSync(INSTALLED_DIR, { recursive: true });
}

export default {
  name: 'pluginmanager',
  commands: ['install', 'uninstall', 'plugins'],
  help: {
    title: 'Manajer Modul (.install, .uninstall, .plugins)',
    description: 'Mengunduh, memasang, dan mencopot modul userbot secara instan.',
    usage: '• Balas file .ts dengan `.install`\n• Atau ketik `.install <nama_modul>` (ambil dari @PluginList)\n• `.uninstall <nama_modul>`\n• `.plugins`',
    detail: 'Modul yang diunduh langsung aktif di memori runtime tanpa memerlukan restart proses userbot.'
  },
  async execute(client: CompatClient, message: UserbotMessageLike, settings: UserbotSettings, telegramId: number) {
    if (!message.out || !message.message) return;

    const text = message.message.trim();
    const parts = text.split(/\s+/);
    const cmd = (parts[0] || '').toLowerCase();

    // ─────────────────────────────────────────────────────────────
    // 1. .plugins — Lihat daftar modul aktif
    // ─────────────────────────────────────────────────────────────
    if (cmd === '.plugins') {
      try {
        const checkEmoji = getCustomEmoji(settings, 'check');
        const coreEmoji = getCustomEmoji(settings, 'status');
        const isOwner = Number(telegramId) === Number(config.ownerId);

        const coreList: string[] = [];
        const installedList: string[] = [];

        for (const p of loadedPlugins) {
          if (p.ownerOnly && !isOwner) continue;
          const file = (p.file || '').replace(/\\/g, '/');
          if (file.startsWith('installed/')) {
            installedList.push(`<code>${escapeHtml(p.name)}</code>`);
          } else {
            coreList.push(`<code>${escapeHtml(p.name)}</code>`);
          }
        }

        const out =
          `🧩 <b>DAFTAR MODUL AKTIF</b>\n\n` +
          `<b>${coreEmoji} Modul Inti (Core):</b>\n` +
          `${coreList.join(', ') || '<i>Tidak ada</i>'}\n\n` +
          `<b>${checkEmoji} Modul Terpasang (Installed):</b>\n` +
          `${installedList.join(', ') || '<i>Belum ada modul tambahan yang terpasang</i>'}\n\n` +
          `<i>Total: ${coreList.length + installedList.length} modul aktif di userbot.</i>\n\n` +
          `<i>Ketik .install &lt;nama_modul&gt; untuk memasang plugin baru.</i>`;

        await message.edit({ text: out, parseMode: 'html' });
      } catch (err) {
        Logger.logUser(telegramId, `Error .plugins: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // 2. .install — Pasang modul dari reply file atau dari channel @PluginList
    // ─────────────────────────────────────────────────────────────
    if (cmd === '.install') {
      const loadingEmoji = getCustomEmoji(settings, 'loading');
      const successEmoji = getCustomEmoji(settings, 'check');
      const failEmoji = getCustomEmoji(settings, 'cross');

      const targetName = (parts[1] || '').trim().toLowerCase();

      try {
        await message.edit({
          text: `<blockquote>${loadingEmoji} Memproses pemasangan modul...</blockquote>`,
          parseMode: 'html',
        });

        let fileBuffer: Buffer | undefined;
        let fileName = '';

        // Kasus A: Reply ke file dokumen .ts
        const replied = await message.getReplyMessage?.();
        if (replied && typeof replied.downloadMedia === 'function') {
          const rawDoc = (replied as { raw?: { media?: { document?: { attributes?: Array<{ fileName?: string }> } } } }).raw;
          const attrFileName = rawDoc?.media?.document?.attributes?.find((a) => a.fileName)?.fileName;
          fileName = attrFileName || (targetName ? `${targetName}.ts` : 'custom_module.ts');

          if (!fileName.endsWith('.ts') && !fileName.endsWith('.js')) {
            await message.edit({
              text: `${failEmoji} <b>Gagal:</b> File yang dibalas harus berekstensi <code>.ts</code> atau <code>.js</code>!`,
              parseMode: 'html',
            });
            return;
          }

          const buf = await replied.downloadMedia();
          if (buf && Buffer.isBuffer(buf)) {
            fileBuffer = buf;
          }
        }

        // Kasus B: Menggunakan URL langsung (.install https://.../module.ts)
        if (!fileBuffer && (targetName.startsWith('http://') || targetName.startsWith('https://'))) {
          await message.edit({
            text: `<blockquote>${loadingEmoji} Mengunduh modul dari URL...</blockquote>`,
            parseMode: 'html',
          });
          try {
            const urlRes = await fetch(targetName);
            if (urlRes.ok) {
              const textData = await urlRes.text();
              const urlParts = targetName.split('?')[0].split('/');
              const rawName = urlParts[urlParts.length - 1] || 'custom_plugin.ts';
              fileName = rawName.endsWith('.ts') || rawName.endsWith('.js') ? rawName : `${rawName}.ts`;
              fileBuffer = Buffer.from(textData, 'utf-8');
            }
          } catch (_) {
            // ignore
          }
        }

        // Kasus C: Menggunakan nama modul (.install brat / .install wiki) -> Cek GitHub Repo kotakbiasa/DeltaUserJS-Plugins
        if (!fileBuffer && targetName) {
          await message.edit({
            text: `<blockquote>${loadingEmoji} Mengambil modul <code>${escapeHtml(targetName)}</code> dari repositori eksternal...</blockquote>`,
            parseMode: 'html',
          });

          // 1. Coba fetch dari GitHub repo kotakbiasa/DeltaUserJS-Plugins
          const ghCategories = ['tools', 'util', 'group', 'system'];
          for (const cat of ghCategories) {
            try {
              const ghUrl = `https://raw.githubusercontent.com/kotakbiasa/DeltaUserJS-Plugins/main/${cat}/${targetName}.ts`;
              const res = await fetch(ghUrl);
              if (res.ok) {
                const textData = await res.text();
                fileBuffer = Buffer.from(textData, 'utf-8');
                fileName = `${targetName}.ts`;
                break;
              }
            } catch (_) {
              // ignore
            }
          }

          // 2. Fallback lokal jika file aslinya masih ada di folder handlers/
          if (!fileBuffer) {
            const searchDirs = ['tools', 'util', 'group', 'system'];
            for (const sDir of searchDirs) {
              const localCandidate = path.resolve(__dirname, `../${sDir}/${targetName}.ts`);
              if (fs.existsSync(localCandidate)) {
                fileBuffer = fs.readFileSync(localCandidate);
                fileName = `${targetName}.ts`;
                break;
              }
            }
          }

          if (!fileBuffer) {
            await message.edit({
              text: `${failEmoji} <b>Modul tidak ditemukan:</b> <code>${escapeHtml(targetName)}</code>.\nPastikan nama modul valid di <a href="https://github.com/kotakbiasa/DeltaUserJS-Plugins">DeltaUserJS-Plugins</a> atau di channel @${CHANNEL_USERNAME}.`,
              parseMode: 'html',
            });
            return;
          }
        }

        if (!fileBuffer) {
          await message.edit({
            text: `${failEmoji} <b>Petunjuk Penggunaan:</b>\n• Balas (reply) file modul <code>.ts</code> dengan <code>.install</code>\n• Atau ketik <code>.install &lt;nama_modul&gt;</code> (contoh: <code>.install brat</code>)`,
            parseMode: 'html',
          });
          return;
        }

        // Simpan file ke direktori installed/
        const savePath = path.join(INSTALLED_DIR, fileName);
        fs.writeFileSync(savePath, fileBuffer);

        // Muat langsung ke dalam memory runtime
        const loaded = await loadSinglePlugin(savePath);
        if (!loaded) {
          fs.unlinkSync(savePath);
          await message.edit({
            text: `${failEmoji} <b>Gagal Memasang:</b> Format file modul tidak valid atau terjadi error saat parsing module.`,
            parseMode: 'html',
          });
          return;
        }

        const baseModName = path.basename(fileName, path.extname(fileName));
        await message.edit({
          text:
            `<b>${successEmoji} MODUL BERHASIL DIPASANG!</b>\n\n` +
            `🏷️ <b>Modul:</b> <code>${escapeHtml(baseModName)}</code>\n` +
            `📂 <b>Lokasi:</b> <code>installed/${escapeHtml(fileName)}</code>\n` +
            `⚡ <b>Status:</b> Aktif seketika (Ready to use)\n\n` +
            `<i>Gunakan <code>.plugins</code> untuk mengecek daftar modul aktif.</i>`,
          parseMode: 'html',
        });
      } catch (err) {
        Logger.logUser(telegramId, `Error .install: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        await message.edit({
          text: `${failEmoji} <b>Terjadi Kesalahan:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}`,
          parseMode: 'html',
        });
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // 3. .uninstall — Copot modul dari runtime dan hapus filenya
    // ─────────────────────────────────────────────────────────────
    if (cmd === '.uninstall') {
      const successEmoji = getCustomEmoji(settings, 'check');
      const failEmoji = getCustomEmoji(settings, 'cross');

      const target = normalizePluginName(parts[1]);
      if (!target) {
        await message.edit({
          text: `ℹ️ <b>Gunakan:</b> <code>.uninstall &lt;nama_modul&gt;</code>\nContoh: <code>.uninstall brat</code>`,
          parseMode: 'html',
        });
        return;
      }

      // Lindungi modul permanen / core
      const plugin = loadedPlugins.find((p) => p.name === target);
      if (plugin && plugin.file && !plugin.file.replace(/\\/g, '/').startsWith('installed/')) {
        await message.edit({
          text: `${failEmoji} <b>Ditolak:</b> Modul <code>${escapeHtml(target)}</code> merupakan modul inti (Core) dan tidak dapat dicopot.`,
          parseMode: 'html',
        });
        return;
      }

      try {
        const removedIndex = unregisterPlugin(target);
        const targetFile = path.join(INSTALLED_DIR, `${target}.ts`);
        const targetJsFile = path.join(INSTALLED_DIR, `${target}.js`);

        let deletedFile = false;
        if (fs.existsSync(targetFile)) {
          fs.unlinkSync(targetFile);
          deletedFile = true;
        }
        if (fs.existsSync(targetJsFile)) {
          fs.unlinkSync(targetJsFile);
          deletedFile = true;
        }

        if (removedIndex !== null || deletedFile) {
          await message.edit({
            text: `${successEmoji} <b>Modul Berhasil Dicopot:</b> <code>${escapeHtml(target)}</code> telah di-unload dari runtime userbot.`,
            parseMode: 'html',
          });
        } else {
          await message.edit({
            text: `${failEmoji} Modul <code>${escapeHtml(target)}</code> tidak ditemukan dalam daftar modul terpasang.`,
            parseMode: 'html',
          });
        }
      } catch (err) {
        Logger.logUser(telegramId, `Error .uninstall: ${err instanceof Error ? err.message : String(err)}`, 'ERROR');
        await message.edit({
          text: `${failEmoji} <b>Gagal mencopot modul:</b> ${escapeHtml(err instanceof Error ? err.message : String(err))}`,
          parseMode: 'html',
        });
      }
    }
  },
};
