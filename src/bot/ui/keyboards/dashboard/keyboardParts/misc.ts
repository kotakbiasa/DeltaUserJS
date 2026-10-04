/**
 * Keyboard loop user, tombol kembali, dan pewarnaan tombol payload.
 *
 * Dipecah dari dashboard/keyboards.ts (575 baris). Isi tiap fungsi
 * dipindahkan apa adanya; yang berubah hanya di file mana ia tinggal.
 */
import type { Context } from 'grammy';
import { getSchedules } from '../../../../../infrastructure/database.js';
import { LOOPS_PER_PAGE } from '.././shared.js';

type DashboardButton = {
  text: string;
  callback_data?: string;
  url?: string;
  style?: string;
};
type DashboardButtonRows = DashboardButton[][];

export function keyboardUserLoops(ctx: Context, page = 1) {
  const telegramId = ctx.from.id;
  const allSchedules = getSchedules(telegramId);
  const loops = allSchedules.filter((s: { type?: string }) => s.type === 'loop');
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

export function applyButtonStylesToPayload(payload: unknown) {
  const keyboard = (payload as { reply_markup?: { inline_keyboard?: unknown } } | undefined)
    ?.reply_markup?.inline_keyboard;
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
