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
  icon_custom_emoji_id?: string;
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
    rows.push([{ text: 'Buka Dashboard Userbot', callback_data: 'rich:ubot', icon_custom_emoji_id: '5372981976804366741' }]);
    rows.push([
      { text: 'Statistik', callback_data: 'rich:stats', icon_custom_emoji_id: '5431577498364158238' },
      { text: 'Panduan & Bantuan', callback_data: 'rich:guide', icon_custom_emoji_id: '5467666648263564704' },
    ]);
    if (isOwner(ctx)) {
      rows.push([
        { text: 'Panel Admin', callback_data: 'rich:admin', icon_custom_emoji_id: '5467406098367521267' },
        { text: 'Donasi', callback_data: 'rich:donate', icon_custom_emoji_id: '5375296873982604963' },
      ]);
    } else {
      rows.push([{ text: 'Donasi', callback_data: 'rich:donate', icon_custom_emoji_id: '5375296873982604963' }]);
    }
  } else {
    // Pengguna Baru / Tamu ("Orang Lain")
    const approved = canRegister(ctx);
    const pending = isPendingApproval(ctx.from.id);

    if (approved) {
      rows.push([{ text: 'Mulai Daftar Userbot', callback_data: 'rich:register', icon_custom_emoji_id: '5445284980978621387' }]);
    } else if (pending) {
      rows.push([{ text: 'Cek Status Approval', callback_data: 'rich:check_approval', icon_custom_emoji_id: '5264727218734524899' }]);
    } else {
      rows.push([{ text: 'Minta Persetujuan (Request Approval)', callback_data: 'rich:claim_trial', icon_custom_emoji_id: '5897517150024766102' }]);
    }

    rows.push([
      { text: 'Statistik', callback_data: 'rich:stats', icon_custom_emoji_id: '5431577498364158238' },
      { text: 'Panduan & Bantuan', callback_data: 'rich:guide', icon_custom_emoji_id: '5467666648263564704' },
    ]);
    if (isOwner(ctx)) {
      rows.push([
        { text: 'Panel Admin', callback_data: 'rich:admin', icon_custom_emoji_id: '5467406098367521267' },
        { text: 'Donasi', callback_data: 'rich:donate', icon_custom_emoji_id: '5375296873982604963' },
      ]);
    } else {
      rows.push([{ text: 'Donasi', callback_data: 'rich:donate', icon_custom_emoji_id: '5375296873982604963' }]);
    }
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
      { text: 'Matikan', callback_data: 'rich:toggle_power', style: 'danger', icon_custom_emoji_id: '6206110936789423908' },
      { text: 'Restart', callback_data: 'rich:user_restart_ubot', icon_custom_emoji_id: '5264727218734524899' },
    ]);
  } else {
    rows.push([
      { text: 'Hidupkan Userbot', callback_data: 'rich:toggle_power', style: 'success', icon_custom_emoji_id: '5789716881099199246' },
    ]);
  }

  // Baris Modul & Pengaturan
  rows.push([
    { text: `Plugin Studio (${loadedPlugins.length})`, callback_data: 'rich:p_cat:all:1', icon_custom_emoji_id: '5449428597922079323' },
    { text: 'Pengaturan', callback_data: 'rich:settings', icon_custom_emoji_id: '5875033614705495771' },
  ]);

  // Baris Scheduler & Diagnostik
  rows.push([
    { text: 'Auto-Loop', callback_data: 'rich:user_loops:1', icon_custom_emoji_id: '5413704112220949842' },
    { text: 'Diagnostik', callback_data: 'rich:ubot_diag', icon_custom_emoji_id: '5359299744302639114' },
  ]);

  // Baris Cheatsheet & Refresh
  rows.push([
    { text: 'Cheatsheet', callback_data: 'rich:help_commands', icon_custom_emoji_id: '5458790252237823529' },
    { text: 'Refresh Status', callback_data: 'rich:ubot', style: 'primary', icon_custom_emoji_id: '5264727218734524899' },
  ]);

  // Baris Navigasi Utama
  rows.push([
    { text: 'Menu Utama', callback_data: 'rich:main', icon_custom_emoji_id: '6206505206197261313' },
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
