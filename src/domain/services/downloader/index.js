/**
 * Service registry — auto-detects the right service for a given URL.
 *
 * Services are tried in priority order (most specific first).
 * yt-dlp is the last-resort fallback for everything else.
 *
 * To add a new service:
 *   1. Create src/services/<name>.ts implementing MediaService
 *   2. Import and add it to the SERVICES array below (before ytdlp)
 */
import { InstagramService } from "./instagram.js";
import { TwitterService } from "./twitter.js";
import { TikTokService } from "./tiktok.js";
import { YtDlpService } from "./ytdlp.js";
// ── Registry ─────────────────────────────────────────────────────────────────
const SERVICES = [
    new InstagramService(), // Instagram — must come before yt-dlp fallback
    new TwitterService(), // Twitter/X — must come before yt-dlp fallback
    new TikTokService(), // TikTok — uses TikWM API instead of yt-dlp
    new YtDlpService(), // Fallback: YouTube, Facebook, etc.
];
// ── Public helpers ────────────────────────────────────────────────────────────
/**
 * Returns the first service that claims to support the URL,
 * or undefined if none match.
 */
export function getService(url) {
    return SERVICES.find((s) => s.supports(url));
}
/**
 * Resolves metadata using the appropriate service.
 * Throws if no service supports the URL.
 */
export async function getMetadata(url) {
    const service = getService(url);
    if (!service)
        throw new Error("No service found for this URL.");
    return service.getMetadata(url);
}
/**
 * Downloads media using the appropriate service.
 * Returns the local file path and metadata.
 * Throws if no service supports the URL.
 */
export async function downloadMedia(url, id) {
    const service = getService(url);
    if (!service)
        throw new Error("No service found for this URL.");
    const [filePath, metadata] = await Promise.all([
        service.download(url, id),
        service.getMetadata(url),
    ]);
    return { filePath, metadata };
}
export { isValidUrl, extractUrl, escapeHtml } from "./base.js";
//# sourceMappingURL=index.js.map