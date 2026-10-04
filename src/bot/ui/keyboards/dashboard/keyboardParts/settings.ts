/**
 * Keyboard pengaturan, prefix, inline helper, dan diagnostik.
 *
 * Dipecah dari dashboard/keyboards.ts (575 baris). Isi tiap fungsi
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import config from '../../../../../config.js';
import { getUserbotSession } from '../../../../../infrastructure/database.js';
import userbotManager from '../../../../../userbot/engine/manager.js';
import type { BotContext } from '../../../../context.js';

export function keyboardSettings(ctx: BotContext) {
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

export function keyboardUserbotDiag(ctx: BotContext) {
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
