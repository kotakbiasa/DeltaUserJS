import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';
import { loadAllPlugins } from '../userbot/engine/pluginLoader.js';
import { loadedPlugins } from '../userbot/engine/pluginRegistry.js';
import { Logger } from './logger.js';

const CHANNEL_ID = -1004449247006;
const BOT_TOKEN = config.botToken;

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const CATEGORY_META: Record<string, { label: string; icon: string; desc: string }> = {
  group: { label: 'GROUP MANAGEMENT', icon: '👥', desc: 'Kumpulan modul manajemen dan otomasi grup Telegram.' },
  system: { label: 'SYSTEM & DIAGNOSTICS', icon: '⚙️', desc: 'Utilitas pemantau performa, kesehatan sistem, dan diagnostik.' },
  tools: { label: 'CREATIVE & MEDIA TOOLS', icon: '🎨', desc: 'Modul pengolah grafis, konversi media, text-to-speech, dan kreasi visual.' },
  util: { label: 'DAILY UTILITIES', icon: '🛠️', desc: 'Kumpulan modul utilitas praktis, produktivitas, dan informasi publik.' },
  other: { label: 'OTHER MODULES', icon: '📦', desc: 'Modul utilitas tambahan lainnya.' },
};

async function safeApiCall(url: string, init: RequestInit, retries = 5): Promise<{ ok: boolean; result?: any; description?: string }> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, init);
      const data = (await res.json()) as { ok: boolean; result?: any; description?: string; parameters?: { retry_after?: number } };
      if (data.ok) return data;

      const desc = data.description || '';
      const retryMatch = desc.match(/retry after (\d+)/i);
      const waitSeconds = data.parameters?.retry_after || (retryMatch ? parseInt(retryMatch[1], 10) : 0);

      if (waitSeconds > 0) {
        Logger.logSystem(`Rate limited: menunggu ${waitSeconds + 2}s sebelum retry...`, 'WARN');
        await new Promise((r) => setTimeout(r, (waitSeconds + 2) * 1000));
        continue;
      }

      return data;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return { ok: false, description: 'Max retries exceeded' };
}

export async function uploadAllOptionalModulesToChannel() {
  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN tidak ditemukan di konfigurasi!');
  }

  await loadAllPlugins({ reload: true });

  const baseDir = path.resolve('src/userbot/handlers');
  const targetModules: Array<{
    name: string;
    filePath: string;
    fileName: string;
    category: string;
    title: string;
    description: string;
    usage: string;
    detail: string;
    commands: string[];
  }> = [];

  for (const plugin of loadedPlugins) {
    const relFile = String(plugin.file || '').replace(/\\/g, '/');
    const cat = relFile.split('/')[0]?.toLowerCase() || 'other';

    // Kategori ADMIN dikecualikan (tetap berada di bot inti)
    if (cat === 'admin') continue;

    const baseName = path.basename(relFile, path.extname(relFile));
    let srcFile = path.join(baseDir, cat, `${baseName}.ts`);
    if (!fs.existsSync(srcFile)) {
      srcFile = path.join(baseDir, cat, `${baseName}.js`);
    }

    if (!fs.existsSync(srcFile)) {
      Logger.logSystem(`File sumber tidak ditemukan untuk plugin ${plugin.name} (${srcFile})`, 'WARN');
      continue;
    }

    const pluginDesc = (plugin as { description?: string }).description;
    targetModules.push({
      name: plugin.name,
      filePath: srcFile,
      fileName: path.basename(srcFile),
      category: cat,
      title: plugin.help?.title || plugin.name.toUpperCase(),
      description: plugin.help?.description || pluginDesc || 'Modul perintah otomatis untuk userbot Telegram.',
      usage: plugin.help?.usage || (plugin.commands?.length ? `.${plugin.commands.join(', .')}` : ''),
      detail: plugin.help?.detail || '',
      commands: plugin.commands || [],
    });
  }

  Logger.logSystem(`Menyiapkan upload Rich Message ${targetModules.length} modul ke channel ${CHANNEL_ID}...`, 'INFO');

  // Urutkan per kategori lalu nama modul
  targetModules.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  let currentCategory = '';
  let uploadedCount = 0;

  for (const mod of targetModules) {
    // Jika berganti kategori, kirim Rich Message Category Header Banner
    if (mod.category !== currentCategory) {
      currentCategory = mod.category;
      const catMeta = CATEGORY_META[currentCategory] || { label: currentCategory.toUpperCase(), icon: '📦', desc: '' };

      const catHeaderHtml =
        `<h1>${catMeta.icon} KATALOG: ${escapeHtml(catMeta.label)}</h1>` +
        `<p><blockquote expandable>${escapeHtml(catMeta.desc)} Di bawah ini merupakan modul resmi yang siap dipasang secara instan.</blockquote></p>` +
        `<table bordered striped>` +
        `<tr><th>Fitur</th><th>Keterangan</th></tr>` +
        `<tr><td>📁 Kategori</td><td>${catMeta.icon} <b>${escapeHtml(catMeta.label)}</b></td></tr>` +
        `<tr><td>⚡ Mode Pasang</td><td>Balas file (reply) <code>.install</code> atau tap tombol</td></tr>` +
        `<tr><td>🛡️ Keamanan</td><td>Terverifikasi &amp; Aman (Strict TypeSafe)</td></tr>` +
        `</table>` +
        `<footer>DeltaUserJS Official Repository • Pilih modul di bawah</footer>`;

      const catMarkup = {
        inline_keyboard: [
          [
            { text: '📖 Panduan Pemasangan', url: 'https://t.me/PluginList', style: 'primary' },
            { text: '🤖 Buka Master Bot', url: 'https://t.me/PanelDeltaUbot', style: 'success' },
          ],
        ],
      };

      await safeApiCall(`https://api.telegram.org/bot${BOT_TOKEN}/sendRichMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHANNEL_ID,
          rich_message: { html: catHeaderHtml },
          reply_markup: catMarkup,
        }),
      });

      await new Promise((r) => setTimeout(r, 2000));
    }

    // 1. Post File Dokumen Sumber (.ts) dengan Caption Rapi & Rich Styled Buttons (1 Pesan Saja)
    const catMeta = CATEGORY_META[mod.category] || { label: mod.category.toUpperCase(), icon: '📦', desc: '' };
    const cleanUsage = mod.usage.replace(/<[^>]*>/g, '').replace(/`/g, '').trim();
    const cmdList = mod.commands.length > 0 ? `.${mod.commands.join(', .')}` : 'Otomatis / Listener';
    const detailText = mod.detail ? `\n\n💡 <b>Petunjuk:</b> ${escapeHtml(mod.detail.replace(/`/g, ''))}` : '';
    
    // Siapkan ringkasan deskripsi (di dalam expandable blockquote agar rapi & hemat ruang)
    const descContent = `${escapeHtml(mod.description)}${detailText}`;
    const truncatedDesc = descContent.length > 550 ? `${descContent.slice(0, 547)}...` : descContent;

    const docCaption =
      `📦 <b>MODUL: ${escapeHtml(mod.title)}</b>\n\n` +
      `<blockquote expandable>${truncatedDesc}</blockquote>\n\n` +
      `📁 <b>Kategori:</b> <code>${catMeta.icon} ${escapeHtml(catMeta.label)}</code>\n` +
      `🏷️ <b>ID Plugin:</b> <code>${escapeHtml(mod.name)}</code>\n` +
      `⚡ <b>Perintah:</b> <code>${escapeHtml(cmdList)}</code>\n` +
      (cleanUsage ? `💬 <b>Contoh:</b> <code>${escapeHtml(cleanUsage.split('\n')[0] || '')}</code>\n\n` : '\n') +
      `📥 <i>Balas file ini dengan <code>.install</code> untuk memasang modul ke userbot.</i>`;

    const fileBuffer = fs.readFileSync(mod.filePath);
    const blob = new Blob([fileBuffer]);
    const formData = new FormData();
    formData.append('chat_id', String(CHANNEL_ID));
    formData.append('document', blob, mod.fileName);
    formData.append('caption', docCaption);
    formData.append('parse_mode', 'HTML');
    formData.append(
      'reply_markup',
      JSON.stringify({
        inline_keyboard: [
          [
            { text: '📥 Pasang ke Userbot', url: `https://t.me/PanelDeltaUbot?start=install_${mod.name}`, style: 'success' },
          ],
          [
            { text: '📖 Repositori Modul', url: 'https://t.me/PluginList', style: 'primary' },
            { text: '🤖 Panel Dashboard', url: 'https://t.me/PanelDeltaUbot' },
          ],
        ],
      })
    );

    const docRes = await safeApiCall(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    if (!docRes.ok) {
      Logger.logSystem(`Gagal kirim dokumen modul ${mod.name}: ${docRes.description}`, 'WARN');
    } else {
      uploadedCount++;
      Logger.logSystem(`[${uploadedCount}/${targetModules.length}] Sukses upload Modul: ${mod.name}`, 'SUCCESS');
    }

    // Delay 2 detik antar modul agar aman dari rate limit
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 3. Post Pinned Summary Showcase
  const finalSummaryHtml =
    `<h1>💎 KATALOG RESMI PLUGIN DELTA USERBOT</h1>` +
    `<p><blockquote expandable>Selamat datang di Repositori Modul Resmi DeltaUserJS! Di sini Anda dapat menemukan seluruh modul opsional yang dapat dipasang ke userbot Anda secara dinamis tanpa restart sistem.</blockquote></p>` +
    `<table bordered striped>` +
    `<tr><th>Kategori Modul</th><th>Jumlah</th></tr>` +
    `<tr><td>👥 Group Management</td><td>10 Modul</td></tr>` +
    `<tr><td>⚙️ System &amp; Diagnostics</td><td>8 Modul</td></tr>` +
    `<tr><td>🎨 Creative &amp; Media Tools</td><td>11 Modul</td></tr>` +
    `<tr><td>🛠️ Daily Utilities</td><td>25 Modul</td></tr>` +
    `<tr><td><b>📦 Total Modul Tersedia</b></td><td><b>54 Modul</b></td></tr>` +
    `</table>` +
    `<p><b>💡 Cara Memasang Modul:</b></p>` +
    `<ol>` +
    `<li>Cari modul yang Anda inginkan di channel ini.</li>` +
    `<li>Balas (reply) file <code>.ts</code> modul tersebut dengan perintah <code>.install</code> di chat mana pun.</li>` +
    `<li>Atau cukup tekan tombol <b>📥 Pasang Modul</b> di bawah kartu modul.</li>` +
    `</ol>` +
    `<footer>DeltaUserJS • Repositori Terverifikasi &amp; Aman</footer>`;

  const finalData = await safeApiCall(`https://api.telegram.org/bot${BOT_TOKEN}/sendRichMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHANNEL_ID,
      rich_message: { html: finalSummaryHtml },
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🤖 Akses Dashboard Userbot', url: 'https://t.me/PanelDeltaUbot', style: 'success' },
            { text: '📖 Panduan Lengkap', url: 'https://t.me/PluginList', style: 'primary' },
          ],
        ],
      },
    }),
  });

  if (finalData.ok && finalData.result?.message_id) {
    await safeApiCall(`https://api.telegram.org/bot${BOT_TOKEN}/pinChatMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHANNEL_ID,
        message_id: finalData.result.message_id,
      }),
    });
  }

  Logger.logSystem(`Selesai! Berhasil mengunggah ${uploadedCount} kartu Rich Message ke channel.`, 'SUCCESS');
  return uploadedCount;
}
