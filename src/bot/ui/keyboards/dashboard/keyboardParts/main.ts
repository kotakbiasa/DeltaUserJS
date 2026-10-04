/**
 * Keyboard navigasi utama, menu, dan kontrol userbot.
 *
 * Dipecah dari dashboard/keyboards.ts (575 baris). Isi tiap fungsi
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import { getUserbotSession } from '../../../../../infrastructure/database.js';
import userbotManager from '../../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../../userbot/engine/pluginRegistry.js';
import { isPendingApproval } from '../../../../state/approvedUsers.js';
import { PROTECTED_PLUGINS, canRegister, isOwner, normalizedDisabled, pluginPageInfo } from '.././shared.js';
import type { BotContext } from '../../../../context.js';

type DashboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  style?: string;
};
type DashboardButtonRows = DashboardButton[][];

export function keyboardAccessDenied(ctx: BotContext) {
  const pending = isPendingApproval(ctx.from.id);
  const rows = [];
  if (pending) {
    rows.push([{ text: '🔄 Cek Status Approval', callback_data: 'rich:check_approval' }]);
  } else {
    rows.push([{ text: '📩 Minta Persetujuan Akses', callback_data: 'rich:claim_trial' }]);
  }
  rows.push([{ text: '🔙 Menu Utama', callback_data: 'rich:main' }]);
  return { inline_keyboard: rows };
}

export function keyboardMain(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  const rows: DashboardButtonRows = [];

  if (session) {
    // Pengguna Terdaftar: Portal Ringkas (fitur teknis dikelola di dalam Dashboard Userbot)
    rows.push([{ text: '🤖 Buka Dashboard Userbot', callback_data: 'rich:ubot' }]);
    rows.push([
      { text: '📊 Statistik', callback_data: 'rich:stats' },
      { text: '❓ Panduan & Bantuan', callback_data: 'rich:guide' },
    ]);
    rows.push([{ text: '📋 Semua Menu', callback_data: 'rich:panel_menu' }]);
    if (isOwner(ctx)) {
      rows.push([{ text: '👑 Panel Admin Command Center', callback_data: 'rich:admin' }]);
    }
    rows.push([{ text: '💰 Donasi', callback_data: 'rich:donate' }]);
  } else {
    // Pengguna Baru / Tamu ("Orang Lain")
    const approved = canRegister(ctx);
    const pending = isPendingApproval(ctx.from.id);

    if (approved) {
      rows.push([{ text: '🚀 Mulai Daftar Userbot', callback_data: 'rich:register' }]);
    } else if (pending) {
      rows.push([{ text: '🔄 Cek Status Approval', callback_data: 'rich:check_approval' }]);
    } else {
      rows.push([{ text: '📩 Minta Persetujuan (Request Approval)', callback_data: 'rich:claim_trial' }]);
    }

    rows.push([
      { text: '📊 Statistik', callback_data: 'rich:stats' },
      { text: '❓ Panduan & Bantuan', callback_data: 'rich:guide' },
    ]);
    rows.push([{ text: '📋 Semua Menu', callback_data: 'rich:panel_menu' }]);
    if (isOwner(ctx)) {
      rows.push([{ text: '👑 Panel Admin Command Center', callback_data: 'rich:admin' }]);
    }
    rows.push([{ text: '💰 Donasi', callback_data: 'rich:donate' }]);
  }

  return { inline_keyboard: rows };
}

export function keyboardPanelMenu(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  const rows: DashboardButtonRows = [];

  if (session) {
    rows.push([
      { text: '🤖 Dashboard Userbot', callback_data: 'rich:ubot' },
      { text: `🧩 Plugin Studio (${loadedPlugins.length})`, callback_data: 'rich:p_cat:all:1' },
    ]);
    rows.push([
      { text: '⚙️ Pengaturan', callback_data: 'rich:settings' },
      { text: '🩺 Diagnostik & Ping', callback_data: 'rich:ubot_diag' },
    ]);
    rows.push([
      { text: '📜 Cheatsheet Perintah', callback_data: 'rich:help_commands' },
      { text: '❓ Panduan & Bantuan', callback_data: 'rich:guide' },
    ]);
  } else if (canRegister(ctx)) {
    rows.push([
      { text: '🚀 Mulai Daftar Userbot', callback_data: 'rich:register' },
    ]);
  } else if (isPendingApproval(ctx.from.id)) {
    rows.push([{ text: '🔄 Cek Status Approval', callback_data: 'rich:check_approval' }]);
  } else {
    rows.push([{ text: '📩 Minta Persetujuan Akses', callback_data: 'rich:claim_trial' }]);
  }

  if (isOwner(ctx)) {
    rows.push([{ text: '👑 Panel Admin Command Center', callback_data: 'rich:admin' }]);
  }

  rows.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'rich:main' }]);
  return { inline_keyboard: rows };
}

export function keyboardUserbot(ctx: BotContext) {
  const session = getUserbotSession(ctx.from.id);
  if (!session) {
    const approved = canRegister(ctx);
    if (approved) {
      return {
        inline_keyboard: [
          [{ text: '🚀 Mulai Daftar Userbot', callback_data: 'rich:register' }],
          [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'rich:main' }],
        ]
      };
    }
    return {
      inline_keyboard: [
        [{ text: '🔙 Kembali ke Menu Utama', callback_data: 'rich:main' }],
      ]
    };
  }

  const isRunning = userbotManager.isRunning(ctx.from.id);
  const rows: DashboardButtonRows = [];

  // Baris Daya & Restart
  if (isRunning) {
    rows.push([
      { text: '🔌 Matikan Userbot', callback_data: 'rich:toggle_power' },
      { text: '🔄 Restart Userbot', callback_data: 'rich:user_restart_ubot' },
    ]);
  } else {
    rows.push([
      { text: '⚡ Hidupkan Userbot', callback_data: 'rich:toggle_power' },
    ]);
  }

  // Baris Modul & Pengaturan
  rows.push([
    { text: `🧩 Plugin Studio (${loadedPlugins.length})`, callback_data: 'rich:p_cat:all:1' },
    { text: '⚙️ Pengaturan Fitur', callback_data: 'rich:settings' },
  ]);

  // Baris Scheduler & Diagnostik
  rows.push([
    { text: '⏰ Auto-Loop Broadcast', callback_data: 'rich:user_loops:1' },
    { text: '🩺 Tes Diagnostik MTProto', callback_data: 'rich:ubot_diag' },
  ]);

  // Baris Cheatsheet
  rows.push([
    { text: '📜 Cheatsheet Lengkap', callback_data: 'rich:help_commands' },
  ]);

  // Baris Refresh & Kembali
  rows.push([
    { text: '🔄 Refresh Status', callback_data: 'rich:ubot' },
    { text: '🔙 Kembali ke Menu Utama', callback_data: 'rich:main' },
  ]);

  return { inline_keyboard: rows };
}

export function keyboardPluginStudio(ctx: BotContext, page = 1) {
  const disabled = normalizedDisabled(ctx.from.id);
  const disabledSet = new Set(disabled);
  const { plugins, page: currentPage, totalPages } = pluginPageInfo(page);
  const rows = plugins.map(plugin => {
    const name = String(plugin.name);
    const lower = name.toLowerCase();
    const isDisabled = disabledSet.has(lower);
    const protectedPlugin = PROTECTED_PLUGINS.includes(lower);
    const action = isDisabled ? '✅' : '❌';
    const label = protectedPlugin ? `🔒 ${name}` : `${action} ${name}`;
    return [{ text: label, callback_data: `rich:plugin_toggle:${encodeURIComponent(lower)}:${currentPage}` }];
  });

  const nav = [];
  if (currentPage > 1) {nav.push({ text: '⬅️', callback_data: `rich:plugin_page:${currentPage - 1}` });}
  nav.push({ text: `${currentPage}/${totalPages}`, callback_data: 'rich:noop' });
  if (currentPage < totalPages) {nav.push({ text: '➡️', callback_data: `rich:plugin_page:${currentPage + 1}` });}
  rows.push(nav);

  rows.push([{ text: '🔙 Dashboard Userbot', callback_data: 'rich:ubot' }]);
  return { inline_keyboard: rows };
}
