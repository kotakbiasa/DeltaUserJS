/**
 * Service registry — auto-detects the right service for a given URL.
 *
 * Services are tried in priority order (most specific first).
 * yt-dlp is the last-resort fallback for everything else.
 *
 * To add a new service:
 *   1. Create src/domain/services/downloader/<name>.ts implementing MediaService
 *   2. Import and add it to the SERVICES array below (before ytdlp)
 */
import { TwitterService } from "./twitter.js";
import { TikTokService } from "./tiktok.js";
import { InstagramService } from "./instagram.js";
import { YouTubeService } from "./youtube.js";
import { YtDlpService } from "./ytdlp.js";
// ── Registry ─────────────────────────────────────────────────────────────────
// Order matters: dedicated services first, yt-dlp as the catch-all fallback.
const SERVICES = [
    new TwitterService(), // Twitter/X
    new TikTokService(), // TikTok — uses TikWM API
    new InstagramService(), // Instagram — scrapes /p/<shortcode>/embed/
    new YouTubeService(), // YouTube — uses deline.web.id API + ffmpeg merge
    new YtDlpService(), // Fallback: YouTube (yt-dlp), Facebook, etc.
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
 * Convenience: fetch metadata for a URL without downloading.
 * Throws if no service supports the URL.
 */
export async function getMetadata(url) {
    const service = getService(url);
    if (!service)
        throw new Error("No service found for this URL.");
    return service.getMetadata(url);
}
/**
 * Download media from a URL and return both the file path(s) and metadata.
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
