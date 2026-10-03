/**
 * Response utilities — memusatkan pola `message.edit()` yang berulang
 * di seluruh handler untuk mengurangi code duplication.
 * Mendukung custom emoji (Telegram Premium <tg-emoji>).
 */
import { escapeHtmlPreservingTgEmoji } from './customEmoji.js';

/**
 * Format pesan loading/proses.
 * @param text - Teks status (misal "Mengumpulkan data...")
 * @param emoji - Emoji yang digunakan (default: ⏳)
 */
export function formatLoadingText(text: string, emoji = '⏳'): string {
  return `${emoji} <b>${escapeHtmlPreservingTgEmoji(text)}</b>`;
}

/**
 * Format pesan error dengan blockquote styling.
 * @param title - Judul error (misal "Gagal")
 * @param detail - Detail pesan error
 * @param emoji - Emoji error yang digunakan (default: ❌)
 */
export function formatErrorText(title: string, detail: string, emoji = '❌'): string {
  return `<blockquote>${emoji} <b>${escapeHtmlPreservingTgEmoji(title)}:</b> ${escapeHtmlPreservingTgEmoji(detail)}</blockquote>`;
}

/**
 * Format pesan sukses.
 * @param message - Pesan sukses
 * @param emoji - Emoji sukses yang digunakan (default: ✅)
 */
export function formatSuccessText(message: string, emoji = '✅'): string {
  return `${emoji} ${escapeHtmlPreservingTgEmoji(message)}`;
}

/**
 * Edit pesan dengan loading indicator.
 * Memastikan parseMode: 'html' selalu diset.
 */
export async function sendLoading(
  message: { edit: (opts: { text: string; parseMode: string }) => Promise<unknown> },
  text: string,
  emoji = '⏳'
): Promise<void> {
  await message.edit({ text: formatLoadingText(text, emoji), parseMode: 'html' });
}

/**
 * Edit pesan dengan error message.
 * Memastikan parseMode: 'html' selalu diset.
 */
export async function sendError(
  message: { edit: (opts: { text: string; parseMode: string }) => Promise<unknown> },
  title: string,
  detail: string,
  emoji = '❌'
): Promise<void> {
  await message.edit({ text: formatErrorText(title, detail, emoji), parseMode: 'html' });
}

/**
 * Edit pesan dengan sukses message.
 */
export async function sendSuccess(
  message: { edit: (opts: { text: string; parseMode: string }) => Promise<unknown> },
  text: string,
  emoji = '✅'
): Promise<void> {
  await message.edit({ text: formatSuccessText(text, emoji), parseMode: 'html' });
}
