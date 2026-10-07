/**
 * Panel Plugin Studio dan detail plugin.
 *
 * Dipecah dari panelParts/core.ts (721 baris). Isi tiap fungsi dipindahkan
 * apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import { loadedPlugins } from '../../../../../../userbot/engine/pluginRegistry.js';
import { escapeHtml } from '../../../../../../utils/richMessage.js';
import { PLUGIN_CATEGORIES, PROTECTED_PLUGINS, formatModuleName, getPluginCategory, normalizedDisabled, pluginCategoryInfo, sortedPlugins } from '../../shared.js';
import type { BotContext } from '../../../../../context.js';

type DashboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  style?: string;
};

export function panelPlugins(ctx: BotContext, page = 1, category = 'all', notice = '') {
  const disabled = normalizedDisabled(ctx.from.id);
  const disabledSet = new Set(disabled);
  const { plugins, page: currentPage, totalPages, total, category: activeCat } = pluginCategoryInfo(category, page);
  const activeCount = sortedPlugins().filter(p => !disabledSet.has(String(p.name).toLowerCase())).length;

  const rows = plugins.map(plugin => {
    const name = String(plugin.name);
    const lower = name.toLowerCase();
    const isActive = !disabledSet.has(lower);
    const isProtected = PROTECTED_PLUGINS.includes(lower);

    const infoBtn = `<tg-button type="callback_data" data="rich:p_info:${encodeURIComponent(lower)}:${currentPage}:${activeCat}">ℹ️ Info</tg-button>`;
    const actionBtn = isProtected
      ? '🔒'
      : `<tg-button type="callback_data" data="rich:p_tog:${encodeURIComponent(lower)}:${currentPage}:${activeCat}">${isActive ? '✅ ON' : '❌ OFF'}</tg-button>`;
    return `<tr><td><b>${escapeHtml(name)}</b></td><td align="center">${infoBtn}</td><td align="center">${actionBtn}</td></tr>`;
  }).join('') || '<tr><td colspan="3" align="center">Tidak ada plugin di kategori ini</td></tr>';

  // Category filter keyboard (2 rows)
  const catRow1 = [
    { text: `${activeCat === 'group' ? '🔘' : '👥'} Grup`, callback_data: `rich:p_cat:group:1` },
    { text: `${activeCat === 'util' ? '🔘' : '🛠️'} Utility`, callback_data: `rich:p_cat:util:1` },
    { text: `${activeCat === 'tools' ? '🔘' : '🎨'} Tools`, callback_data: `rich:p_cat:tools:1` },
  ];
  const catRow2 = [
    { text: `${activeCat === 'admin' ? '🔘' : '🛡️'} Admin`, callback_data: `rich:p_cat:admin:1` },
    { text: `${activeCat === 'system' ? '🔘' : '⚙️'} Sistem`, callback_data: `rich:p_cat:system:1` },
    { text: `${activeCat === 'all' ? '🔘' : '📦'} Semua`, callback_data: `rich:p_cat:all:1` },
  ];

  // Pagination navigation
  const navRow: DashboardButton[] = [];
  if (currentPage > 1) {
    navRow.push({ text: '⬅️ Prev', callback_data: `rich:p_page:${currentPage - 1}:${activeCat}` });
  }
  navRow.push({ text: `📄 ${currentPage}/${totalPages}`, callback_data: 'rich:noop' });
  if (currentPage < totalPages) {
    navRow.push({ text: 'Next ➡️', callback_data: `rich:p_page:${currentPage + 1}:${activeCat}` });
  }

  const keyboard = {
    inline_keyboard: [
      catRow1,
      catRow2,
      navRow,
      [{ text: '🔙 Dashboard Userbot', callback_data: 'rich:ubot' }],
    ]
  };

  const catLabel = PLUGIN_CATEGORIES[activeCat]?.label || 'Semua';
  const catIcon = PLUGIN_CATEGORIES[activeCat]?.icon || '📦';

  return {
    rich:
      `<h1 align="center">🧩 Plugin Studio <sup>v1.0</sup></h1>` +
      (notice ? `<p>🔔 <b>${escapeHtml(notice)}</b></p>` : `<p>Kelola <b>${loadedPlugins.length}</b> modul perintah untuk userbot Telegram Anda.</p>`) +
      `<table bordered striped><caption>📊 Filter Kategori: ${catIcon} ${escapeHtml(catLabel)} (${total} plugin)</caption>` +
      `<tr><th>Total Kategori</th><th>Total Aktif</th><th>Total Off</th><th>Halaman</th></tr>` +
      `<tr><td align="center">${total}</td><td align="center">🟢 ${activeCount}</td><td align="center">🔴 ${Math.max(0, loadedPlugins.length - activeCount)}</td><td align="center">${currentPage}/${totalPages}</td></tr>` +
      `</table>` +
      `<table bordered striped><caption>📋 Modul ${escapeHtml(catLabel)} (Hal ${currentPage}/${totalPages})</caption>` +
      `<tr><th>Plugin</th><th align="center">Detail</th><th align="center">Status</th></tr>` +
      rows +
      `</table>` +
      `<hr/>` +
      `<h3>💡 Panduan Modul:</h3>` +
      `<ul>` +
      `<li>Ketuk tombol <b>ℹ️ Info</b> untuk melihat fungsi &amp; cheatsheet perintah.</li>` +
      `<li>Ketuk tombol status <b>ON/OFF</b> untuk mengaktifkan/mematikan plugin.</li>` +
      `<li>Simbol 🔒 menandakan modul inti sistem (protected).</li>` +
      `</ul>` +
      `<footer>Pilih kategori atau ketuk tombol modul di atas untuk konfigurasi.</footer>`,
    keyboard
  };
}

export function panelPluginDetail(ctx: BotContext, pluginName: string, page = 1, category = 'all') {
  const target = decodeURIComponent(String(pluginName || '')).trim().toLowerCase();
  const plugin = loadedPlugins.find(p => String(p.name).toLowerCase() === target);
  if (!plugin) {
    return {
      rich: `<h1 align="center">❌ Modul Tidak Ditemukan</h1><p>Plugin <code>${escapeHtml(pluginName)}</code> tidak ditemukan di pustaka.</p><footer>Gunakan tombol di bawah untuk kembali.</footer>`,
      keyboard: { inline_keyboard: [[{ text: '🔙 Kembali ke Plugin Studio', callback_data: `rich:p_cat:${category}:${page}` }]] }
    };
  }

  const disabled = normalizedDisabled(ctx.from.id);
  const isActive = !disabled.includes(target);
  const isProtected = PROTECTED_PLUGINS.includes(target);
  const cat = getPluginCategory(plugin);
  const catLabel = PLUGIN_CATEGORIES[cat]?.label || cat;
  const catIcon = PLUGIN_CATEGORIES[cat]?.icon || '📦';

  const title = plugin.help?.title || formatModuleName(plugin.name);
  const desc = plugin.help?.description || 'Modul perintah otomatis untuk userbot Telegram.';
  const usage = plugin.help?.usage || `.${plugin.name}`;
  const detail = plugin.help?.detail || 'Gunakan modul ini di chat pribadi atau grup.';

  const rich = `<h1 align="center">🧩 Modul: ${escapeHtml(title)}</h1>` +
    `<p>${escapeHtml(desc)}</p>` +
    `<table bordered striped>` +
    `<tr><th>Parameter</th><th>Keterangan</th></tr>` +
    `<tr><td>🏷️ Nama Modul</td><td><code>${escapeHtml(plugin.name)}</code></td></tr>` +
    `<tr><td>📂 Kategori</td><td>${catIcon} ${escapeHtml(catLabel)}</td></tr>` +
    `<tr><td>⚡ Status Modul</td><td align="center">${isProtected ? '🔒 Terkunci (Sistem)' : (isActive ? '🟢 Aktif' : '🔴 Nonaktif')}</td></tr>` +
    `<tr><td>💬 Sintaks / Usage</td><td><code>${escapeHtml(usage)}</code></td></tr>` +
    `</table>` +
    `<hr/>` +
    `<h3>💡 Petunjuk Penggunaan:</h3>` +
    `<p>${escapeHtml(detail)}</p>` +
    `<footer>Kelola status aktif modul ini menggunakan tombol di bawah.</footer>`;

  const relPath = String(plugin.file || '').replace(/\\/g, '/');
  const isInstalled = relPath.startsWith('installed/');

  const actionRows: DashboardButton[][] = [];
  if (!isProtected) {
    const toggleRow: DashboardButton[] = [
      {
        text: isActive ? '🔴 Nonaktifkan Modul' : '🟢 Aktifkan Modul',
        callback_data: `rich:p_tog_det:${encodeURIComponent(target)}:${page}:${category}`
      }
    ];

    // Hanya modul hasil unduhan/pemasangan (di folder installed/) yang bisa dicopot
    if (isInstalled) {
      toggleRow.push({
        text: '🗑️ Copot Modul',
        callback_data: `rich:p_uninstall:${encodeURIComponent(target)}:${page}:${category}`,
        style: 'danger'
      });
    }

    actionRows.push(toggleRow);
  }
  actionRows.push([
    { text: '🔙 Kembali ke Daftar Modul', callback_data: `rich:p_cat:${category}:${page}` },
    { text: '🤖 Dashboard Userbot', callback_data: 'rich:ubot' },
  ]);

  return { rich, keyboard: { inline_keyboard: actionRows } };
}
