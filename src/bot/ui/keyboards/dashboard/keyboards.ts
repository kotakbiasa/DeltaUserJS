/**
 * Pembangun inline keyboard (keyboard*) untuk dashboard bot.
 *
 * Dipecah dari dashboard.ts (2.821 baris). Isi tiap fungsi dipindahkan apa
 * adanya; yang berubah hanya di file mana ia tinggal.
 */
import type { Context } from 'grammy';
import config from '../../../../config.js';
import { getSchedules, getUserbotSession } from '../../../../infrastructure/database.js';
import userbotManager from '../../../../userbot/engine/manager.js';
import { loadedPlugins } from '../../../../userbot/engine/pluginRegistry.js';
import { getPendingApprovals, isApproved, isPendingApproval } from '../../../state/approvedUsers.js';
import {
  ADMIN_USERS_PER_PAGE,
  LOOPS_PER_PAGE,
  PROTECTED_PLUGINS,
  canRegister,
  getCombinedAdminUsers,
  isAutoApproveEnabled,
  isOwner,
  normalizedDisabled,
  pluginPageInfo,
} from './shared.js';

type DashboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  style?: string;
};
type DashboardButtonRows = DashboardButton[][];

export function keyboardAccessDenied(ctx) {
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

export function keyboardMain(ctx) {
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

export function keyboardPanelMenu(ctx) {
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

export function keyboardUserbot(ctx) {
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

export function keyboardPluginStudio(ctx, page = 1) {
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

export function keyboardSettings(ctx) {
  const session = getUserbotSession(ctx.from.id);
  const isAntiPm = session?.anti_pm === 1;
  const isAfk = session?.auto_reply === 1;

  return { inline_keyboard: [
    [
      { text: isAntiPm ? '🚫 Anti-PM: 🟢 ON' : '🚫 Anti-PM: 🔴 OFF', callback_data: 'rich:toggle_anti_pm' },
      { text: isAfk ? '🤖 AFK: 🟢 ON' : '🤖 AFK: 🔴 OFF', callback_data: 'rich:toggle_afk' },
    ],
    [
      { text: '🏷️ Ganti Nama Bot', callback_data: 'rich:edit_name' },
      { text: '💬 Ganti Prefix Cepat', callback_data: 'rich:pick_prefix' },
    ],
    [
      { text: '📝 Ubah Pesan AFK', callback_data: 'rich:edit_afk' },
      { text: '🤖 Setup Inline Helper', callback_data: 'rich:setup_helper' },
    ],
    [
      { text: '⚙️ Custom Vars', callback_data: 'rich:edit_vars' },
      { text: '🗑️ Hapus Sesi Akun', callback_data: 'rich:danger_delete_session' },
    ],
    [
      { text: '🔙 Dashboard Userbot', callback_data: 'rich:ubot' },
      { text: '🏠 Menu Utama', callback_data: 'rich:main' },
    ],
  ] };
}

export function keyboardPrefixPicker() {
  return { inline_keyboard: [
    [
      { text: '🔹 . (Titik)', callback_data: 'rich:set_prefix:.' },
      { text: '🔹 ! (Seru)', callback_data: 'rich:set_prefix:!' },
      { text: '🔹 , (Koma)', callback_data: 'rich:set_prefix:,' },
    ],
    [
      { text: '🔹 # (Pagar)', callback_data: 'rich:set_prefix:#' },
      { text: '🔹 ? (Tanya)', callback_data: 'rich:set_prefix:?' },
      { text: '🔹 ~ (Tilde)', callback_data: 'rich:set_prefix:~' },
    ],
    [{ text: '🔙 Pengaturan', callback_data: 'rich:settings' }],
  ] };
}

export function keyboardInlineHelper() {
  return { inline_keyboard: [
    [{ text: '🔑 Masukkan Token Bot', callback_data: 'rich:edit_vars' }],
    [{ text: '🔙 Pengaturan', callback_data: 'rich:settings' }],
  ] };
}

export function keyboardUserbotDiag(ctx) {
  const isRunning = userbotManager.isRunning(ctx.from.id);
  return { inline_keyboard: [
    [
      { text: '🔄 Uji Ulang Diagnostik', callback_data: 'rich:ubot_diag' },
      { text: isRunning ? '🔌 Matikan Userbot' : '⚡ Hidupkan Userbot', callback_data: 'rich:toggle_power' },
    ],
    [{ text: '🔙 Dashboard Userbot', callback_data: 'rich:ubot' }],
  ] };
}

export function keyboardHelpCenter() {
  return { inline_keyboard: [
    [
      { text: '🚀 Panduan Mulai Cepat', callback_data: 'rich:help_quickstart' },
      { text: '📜 Cheatsheet Perintah', callback_data: 'rich:help_commands' },
    ],
    [
      { text: '❓ FAQ & Troubleshooting', callback_data: 'rich:help_faq' },
      { text: '💬 Hubungi Owner', url: `tg://user?id=${config.ownerId}` },
    ],
    [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardHelpBack() {
  return { inline_keyboard: [
    [{ text: '🔙 Pusat Bantuan', callback_data: 'rich:guide' }],
    [{ text: '🏠 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardDangerDelete() {
  return { inline_keyboard: [] };
}

export function keyboardTermsOfService() {
  return { inline_keyboard: [
    [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardTermsDeclined() {
  return { inline_keyboard: [
    [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardRegister() {
  return { inline_keyboard: [
    [{ text: '📱 Login via OTP', callback_data: 'rich:otp' }, { text: '🔍 Scan QR Code', callback_data: 'rich:qr' }],
    [{ text: '📜 Syarat & Ketentuan', callback_data: 'rich:tos_view' }, { text: '🛡️ Status Akses', callback_data: 'rich:subscription' }],
    [{ text: '🔙 Menu Utama', callback_data: 'rich:main' }],
  ] };
}

export function keyboardBuySubscription(ctx?: Context) {
  return keyboardSubscription(ctx);
}

export function keyboardSubscription(ctx?: Context) {
  const userId = ctx?.from?.id;
  const owner = isOwner(ctx);
  const session = userId ? getUserbotSession(userId) : null;
  const approved = userId ? (owner || isApproved(userId) || isAutoApproveEnabled()) : false;
  const pending = userId ? isPendingApproval(userId) : false;
  const rows: DashboardButtonRows = [];

  if (owner) {
    if (session) {
      rows.push([
        { text: '🤖 Buka Dashboard Userbot', callback_data: 'rich:ubot' },
        { text: '👑 Panel Admin', callback_data: 'rich:admin' },
      ]);
    } else {
      rows.push([
        { text: '🚀 Hubungkan Sesi', callback_data: 'rich:register', style: 'success' },
        { text: '👑 Panel Admin', callback_data: 'rich:admin' },
      ]);
    }
    rows.push([{ text: '🔙 Menu Utama', callback_data: 'rich:main' }]);
    return { inline_keyboard: rows };
  }

  if (session) {
    rows.push([
      { text: '🤖 Buka Dashboard Userbot', callback_data: 'rich:ubot' },
      { text: '🔙 Menu Utama', callback_data: 'rich:main' },
    ]);
    return { inline_keyboard: rows };
  }

  if (approved) {
    rows.push([{ text: '🚀 Hubungkan Sesi Userbot', callback_data: 'rich:register', style: 'success' }]);
  } else if (pending) {
    rows.push([{ text: '⏳ Cek Status Approval', callback_data: 'rich:check_approval', style: 'primary' }]);
  } else {
    rows.push([{ text: '📩 Minta Persetujuan Akses', callback_data: 'rich:claim_trial', style: 'success' }]);
  }

  rows.push([{ text: '🔙 Menu Utama', callback_data: 'rich:main' }]);
  return { inline_keyboard: rows };
}

export function keyboardAdmin(pendingCount = 0) {
  const pendingLabel = pendingCount > 0 ? `⏳ Approval (${pendingCount})` : '⏳ Antrean Approval';
  return { inline_keyboard: [
    [
      { text: pendingLabel, callback_data: 'rich:admin_pending' },
      { text: '👥 Daftar Pengguna', callback_data: 'rich:admin_users:1' },
    ],
    [
      { text: '⚡ Fleet & Userbot', callback_data: 'rich:admin_fleet' },
      { text: '📢 Broadcast Masal', callback_data: 'rich:admin_broadcast' },
    ],
    [
      { text: '⚙️ Pengaturan Cepat', callback_data: 'rich:admin_settings' },
      { text: '💾 Backup & Audit', callback_data: 'rich:admin_backup' },
    ],
    [
      { text: '🩺 Server Health', callback_data: 'rich:health' },
      { text: '🔙 Menu Utama', callback_data: 'rich:main' },
    ],
  ] };
}

export function keyboardAdminPending() {
  const pendingList = getPendingApprovals();
  const rows: DashboardButtonRows = [];

  if (pendingList.length > 1) {
    rows.push([
      { text: `✅ Setujui Semua (${pendingList.length} User)`, callback_data: 'rich:admin_approve_all' }
    ]);
  }

  rows.push([
    { text: '🔄 Muat Ulang', callback_data: 'rich:admin_pending' },
    { text: '🔙 Admin Hub', callback_data: 'rich:admin' },
  ]);

  return { inline_keyboard: rows };
}

export function keyboardAdminUsers(page = 1) {
  const allUsers = getCombinedAdminUsers();
  const totalPages = Math.max(1, Math.ceil(allUsers.length / ADMIN_USERS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  const start = (currentPage - 1) * ADMIN_USERS_PER_PAGE;
  const currentUsers = allUsers.slice(start, start + ADMIN_USERS_PER_PAGE);

  const rows: DashboardButtonRows = [];

  for (let i = 0; i < currentUsers.length; i += 2) {
    const row: DashboardButton[] = [];
    const u1 = currentUsers[i];
    const icon1 = u1.is_awaiting_reg ? '🔵' : (userbotManager.isRunning(u1.telegram_id) ? '🟢' : '🔴');
    const label1 = `${icon1} ${(u1.custom_name || String(u1.telegram_id)).slice(0, 12)}`;
    row.push({ text: label1, callback_data: `rich:admin_user:${u1.telegram_id}` });

    if (i + 1 < currentUsers.length) {
      const u2 = currentUsers[i + 1];
      const icon2 = u2.is_awaiting_reg ? '🔵' : (userbotManager.isRunning(u2.telegram_id) ? '🟢' : '🔴');
      const label2 = `${icon2} ${(u2.custom_name || String(u2.telegram_id)).slice(0, 12)}`;
      row.push({ text: label2, callback_data: `rich:admin_user:${u2.telegram_id}` });
    }
    rows.push(row);
  }

  if (totalPages > 1) {
    const nav: DashboardButton[] = [];
    if (currentPage > 1) {
      nav.push({ text: '◀️ Prev', callback_data: `rich:admin_users:${currentPage - 1}` });
    }
    nav.push({ text: `📄 ${currentPage}/${totalPages}`, callback_data: `rich:admin_users:${currentPage}` });
    if (currentPage < totalPages) {
      nav.push({ text: 'Next ▶️', callback_data: `rich:admin_users:${currentPage + 1}` });
    }
    rows.push(nav);
  }

  rows.push([
    { text: '🔙 Admin Hub', callback_data: 'rich:admin' }
  ]);

  return { inline_keyboard: rows };
}

export function keyboardAdminUserDetail(targetId: number) {
  const session = getUserbotSession(targetId);
  if (!session) {
    if (isApproved(targetId)) {
      return { inline_keyboard: [
        [{ text: '🚫 Cabut Izin Approval', callback_data: `rich:admin_revoke_user_confirm:${targetId}` }],
        [
          { text: '🔙 Daftar User', callback_data: 'rich:admin_users:1' },
          { text: '👑 Admin Hub', callback_data: 'rich:admin' },
        ]
      ] };
    }
    return { inline_keyboard: [
      [{ text: '🔙 Daftar User', callback_data: 'rich:admin_users:1' }],
      [{ text: '👑 Admin Hub', callback_data: 'rich:admin' }],
    ] };
  }

  const isRunning = userbotManager.isRunning(targetId);
  return { inline_keyboard: [
    [
      { text: isRunning ? '⏹️ Matikan Userbot' : '▶️ Jalankan Userbot', callback_data: `rich:admin_power_user:${targetId}` }
    ],
    [
      { text: '🚫 Cabut Izin', callback_data: `rich:admin_revoke_user_confirm:${targetId}` },
      { text: '🗑️ Hapus Akun', callback_data: `rich:admin_delete_user_confirm:${targetId}` },
    ],
    [
      { text: '🔙 Daftar User', callback_data: 'rich:admin_users:1' },
      { text: '👑 Admin Hub', callback_data: 'rich:admin' },
    ]
  ] };
}

export function keyboardAdminBroadcast() {
  return { inline_keyboard: [
    [{ text: '📢 Tulis Pesan Broadcast', callback_data: 'rich:admin_start_broadcast' }],
    [{ text: '🔙 Admin Hub', callback_data: 'rich:admin' }],
  ] };
}

export function keyboardAdminFleet() {
  return { inline_keyboard: [
    [
      { text: '🔄 Restart Semua Userbot', callback_data: 'rich:admin_fleet_restart' },
      { text: '🛑 Matikan Semua Userbot', callback_data: 'rich:admin_fleet_stop_confirm' },
    ],
    [
      { text: '🚀 Jalankan Semua Userbot', callback_data: 'rich:admin_fleet_start' },
      { text: '🔄 Restart Master Bot', callback_data: 'rich:admin_restart_bot_confirm' },
    ],
    [{ text: '🔙 Admin Hub', callback_data: 'rich:admin' }],
  ] };
}

export function keyboardAdminBackup() {
  return { inline_keyboard: [
    [
      { text: '📥 Download Backup (.json)', callback_data: 'rich:admin_download_backup' },
    ],
    [{ text: '🔙 Admin Hub', callback_data: 'rich:admin' }],
  ] };
}

export function keyboardAdminSettings() {
  const autoApprove = isAutoApproveEnabled();
  return { inline_keyboard: [
    [
      { text: `🛡️ Mode: ${autoApprove ? '🌐 Buka Bebas' : '🔒 Approval Owner'}`, callback_data: 'rich:admin_toggle_auto_approve' }
    ],
    [
      { text: '⚙️ Kelola System Vars', callback_data: 'rich:edit_system_vars' }
    ],
    [{ text: '🔙 Admin Hub', callback_data: 'rich:admin' }],
  ] };
}

export function keyboardUserLoops(ctx: Context, page = 1) {
  const telegramId = ctx.from.id;
  const allSchedules = getSchedules(telegramId);
  const loops = allSchedules.filter(s => s.type === 'loop');
  const totalPages = Math.max(1, Math.ceil(loops.length / LOOPS_PER_PAGE));
  const currentPage = Math.min(Math.max(Number(page) || 1, 1), totalPages);

  const rows: DashboardButtonRows = [];
  rows.push([
    { text: '➕ Tambah Jadwal Loop', callback_data: 'rich:add_loop' },
  ]);

  if (totalPages > 1) {
    const nav: DashboardButton[] = [];
    if (currentPage > 1) {
      nav.push({ text: '⬅️ Prev', callback_data: `rich:user_loops:${currentPage - 1}` });
    }
    nav.push({ text: `${currentPage}/${totalPages}`, callback_data: 'rich:noop' });
    if (currentPage < totalPages) {
      nav.push({ text: 'Next ➡️', callback_data: `rich:user_loops:${currentPage + 1}` });
    }
    rows.push(nav);
  }

  rows.push([
    { text: '🔄 Refresh', callback_data: `rich:user_loops:${currentPage}` },
    { text: '🤖 Dashboard Userbot', callback_data: 'rich:ubot' },
  ]);

  return { inline_keyboard: rows };
}

export function keyboardBack(target = 'main') {
  return { inline_keyboard: [[{ text: '🔙 Kembali', callback_data: `rich:${target}` }]] };
}

// ==========================================================================
// SECTION 3 — DASHBOARD HANDLERS
// ==========================================================================

export function applyButtonStylesToPayload(payload) {
  const keyboard = payload?.reply_markup?.inline_keyboard;
  if (!Array.isArray(keyboard)) {return;}
  for (const row of keyboard) {
    if (!Array.isArray(row)) {continue;}
    for (const button of row) {
      if (button && 'style' in button) {
        delete button.style;
      }
    }
  }
}
