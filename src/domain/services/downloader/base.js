/**
 * Shared types and base interface for all media download services.
 */
// ──────────────────────────────────────────────────────────────────────────────
// Shared URL helpers
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Returns true if the string is a valid http/https URL.
 */
export function isValidUrl(urlString) {
    try {
        const url = new URL(urlString);
        return url.protocol === "http:" || url.protocol === "https:";
    }
    catch {
        return false;
    }
}
/**
 * Extracts the first URL found in a text message.
 */
export function extractUrl(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
}
/**
 * Escapes special HTML characters so the string can be safely sent to Telegram in HTML parse mode.
 */
export function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
//# sourceMappingURL=base.js.map