/**
 * Response utilities — memusatkan pola `message.edit()` yang berulang
 * di seluruh handler untuk mengurangi code duplication.
 */
/**
 * Format pesan loading/proses.
 * @param text - Teks status (misal "Mengumpulkan data...")
 */
export function formatLoadingText(text) {
    return `\u23F3 <b>${text}</b>`;
}
/**
 * Format pesan error dengan blockquote styling.
 * @param title - Judul error (misal "Gagal")
 * @param detail - Detail pesan error
 */
export function formatErrorText(title, detail) {
    return `<blockquote>❌ <b>${title}:</b> ${detail}</blockquote>`;
}
/**
 * Format pesan sukses.
 * @param message - Pesan sukses
 */
export function formatSuccessText(message) {
    return `✅ ${message}`;
}
/**
 * Edit pesan dengan loading indicator.
 * Memastikan parseMode: 'html' selalu diset.
 */
export async function sendLoading(message, text) {
    await message.edit({ text: formatLoadingText(text), parseMode: 'html' });
}
/**
 * Edit pesan dengan error message.
 * Memastikan parseMode: 'html' selalu diset.
 */
export async function sendError(message, title, detail) {
    await message.edit({ text: formatErrorText(title, detail), parseMode: 'html' });
}
/**
 * Edit pesan dengan sukses message.
 */
export async function sendSuccess(message, text) {
    await message.edit({ text: formatSuccessText(text), parseMode: 'html' });
}
