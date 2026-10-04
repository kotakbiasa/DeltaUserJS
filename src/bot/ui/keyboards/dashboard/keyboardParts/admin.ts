/**
 * Keyboard panel admin: approval, user, fleet, broadcast, backup.
 *
 * Dipecah dari dashboard/keyboards.ts (575 baris). Isi tiap fungsi
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import { getUserbotSession } from '../../../../../infrastructure/database.js';
import userbotManager from '../../../../../userbot/engine/manager.js';
import { getPendingApprovals, isApproved } from '../../../../state/approvedUsers.js';
import { ADMIN_USERS_PER_PAGE, getCombinedAdminUsers, isAutoApproveEnabled } from '.././shared.js';

type DashboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  style?: string;
};
type DashboardButtonRows = DashboardButton[][];

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
