/**
 * Keyboard ToS, registrasi, dan langganan.
 *
 * Dipecah dari dashboard/keyboards.ts (575 baris). Isi tiap fungsi
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import { getUserbotSession } from '../../../../../infrastructure/database.js';
import { isApproved, isPendingApproval } from '../../../../state/approvedUsers.js';
import { isAutoApproveEnabled, isOwner } from '.././shared.js';
import type { BotContext } from '../../../../context.js';

type DashboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  style?: string;
};
type DashboardButtonRows = DashboardButton[][];

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

export function keyboardBuySubscription(ctx?: BotContext) {
  return keyboardSubscription(ctx);
}

export function keyboardSubscription(ctx?: BotContext) {
  const userId = ctx?.from?.id;
  const owner = ctx ? isOwner(ctx) : false;
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
