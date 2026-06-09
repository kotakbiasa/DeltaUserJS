import { InlineKeyboard } from 'grammy';
import { getUserbotSession } from '../database/db.js';
import config from '../config.js';

/**
 * Creates the unified main menu keyboard with dynamic status on registration button
 * Admins/Owners will see an additional "👑 Panel Admin" button.
 * @param {number} telegramId 
 */
export function createMainMenuKeyboard(telegramId) {
  const dbSession = getUserbotSession(telegramId);
  const ubotButtonText = dbSession 
    ? '🟢 Kontrol Ubot Anda' 
    : '📝 Daftar DeltaUbot';
  const ubotCallback = dbSession 
    ? 'ubot_control_panel' 
    : 'ubot_register_menu';

  const keyboard = new InlineKeyboard()
    .text(ubotButtonText, ubotCallback)
    .row()
    .text('📦 List Modul', 'show_modules')
    .text('📊 Statistik', 'show_stats')
    .row()
    .text('💰 Donasi', 'show_donate')
    .text('❓ Bantuan', 'help')
    .row();

  // Jika yang membuka adalah OWNER, tambahkan tombol khusus Panel Admin
  if (Number(telegramId) === Number(config.ownerId)) {
    keyboard.text('👑 Panel Admin (Owner)', 'admin_panel').row();
  }

  return keyboard;
}

/**
 * Keyboard for Owner Admin Panel
 */
export const adminPanelKeyboard = new InlineKeyboard()
  .text('👥 List Pengguna', 'admin_user_list')
  .row()
  .text('📢 Broadcast Pesan', 'admin_broadcast')
  .row()
  .text('🔄 Restart Semua Ubot', 'admin_restart_all')
  .row()
  .text('🔙 Kembali ke Menu Utama', 'back_to_main');

/**
 * Dynamic keyboard to list all registered users inside Admin Panel
 * @param {Array<object>} users 
 */
export function createAdminUserListKeyboard(users) {
  const keyboard = new InlineKeyboard();

  if (users.length === 0) {
    keyboard.text('📭 Belum Ada Pengguna', 'no_users_found').row();
  } else {
    for (const user of users) {
      const label = `👤 ID: ${user.telegram_id}${user.phone ? ' (' + user.phone + ')' : ''}`;
      keyboard.text(label, `admin_view_user_${user.telegram_id}`).row();
    }
  }

  keyboard.text('🔙 Kembali ke Panel Admin', 'admin_panel').row();
  return keyboard;
}

/**
 * Keyboard for remote controlling a specific userbot account (Owner Only)
 * @param {number} userId 
 * @param {boolean} isRunning 
 */
export function createAdminUserControlKeyboard(userId, isRunning) {
  const toggleLabel = isRunning ? '🔌 Matikan Ubot User' : '⚡ Hidupkan Ubot User';
  const toggleCallback = isRunning ? `admin_stop_user_${userId}` : `admin_start_user_${userId}`;

  return new InlineKeyboard()
    .text(toggleLabel, toggleCallback)
    .row()
    .text('📅 +30 Hari Masa Aktif', `admin_extend_user_${userId}`)
    .row()
    .text('❌ Hapus Akun User', `admin_delete_user_${userId}`)
    .row()
    .text('🔙 Kembali ke List Pengguna', 'admin_user_list')
    .row()
    .text('🔙 Kembali ke Panel Admin', 'admin_panel');
}

/**
 * Keyboard for choosing registration method (OTP vs QR)
 */
export const registrationMethodsKeyboard = new InlineKeyboard()
  .text('📱 Login via OTP', 'reg_otp')
  .text('🔍 Login via Scan QR', 'reg_qr')
  .row()
  .text('🔙 Kembali ke Menu Utama', 'back_to_main');

/**
 * Keyboard for users who ARE registered and their userbot is RUNNING
 */
export const activeUserbotKeyboard = new InlineKeyboard()
  .text('🔌 Matikan Userbot', 'stop_bot')
  .text('⚙️ Settings', 'manage_features')
  .row()
  .text('🔄 Cek Status', 'ubot_control_panel')
  .text('❌ Hapus Sesi', 'delete_session')
  .row()
  .text('🔙 Kembali ke Menu Utama', 'back_to_main');

/**
 * Keyboard for users who ARE registered but their userbot is STOPPED
 */
export const inactiveUserbotKeyboard = new InlineKeyboard()
  .text('⚡ Hidupkan Userbot', 'start_bot')
  .text('⚙️ Settings', 'manage_features')
  .row()
  .text('🔄 Cek Status', 'ubot_control_panel')
  .text('❌ Hapus Sesi', 'delete_session')
  .row()
  .text('🔙 Kembali ke Menu Utama', 'back_to_main');

/**
 * Dynamic keyboard for managing userbot features (Auto-Read, Auto-Reply, etc.)
 */
export function createFeaturesKeyboard(isAutoReadOn, isAutoReplyOn, isAntiPmOn) {
  const antiPmLabel = isAntiPmOn ? '🚫 Anti-PM: 🟢 ON' : '🚫 Anti-PM: 🔴 OFF';
  
  return new InlineKeyboard()
    .text(antiPmLabel, 'toggle_anti_pm')
    .text('🏷️ Set Nama Ubot', 'set_custom_name')
    .row()
    .text('🤖 Set Token Bot', 'set_custom_inline_bot')
    .row()
    .text('🔙 Kembali', 'ubot_control_panel');
}

/**
 * Keyboard to cancel a conversation/pendaftaran
 */
export const cancelKeyboard = new InlineKeyboard()
  .text('❌ Batalkan Pendaftaran', 'cancel_reg');

/**
 * Back to main menu keyboard (generic)
 */
export const backToMainKeyboard = new InlineKeyboard()
  .text('🔙 Kembali ke Menu Utama', 'back_to_main');
