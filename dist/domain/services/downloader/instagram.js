/**
 * Instagram service — scrapes the public /embed/ page to find media URLs,
 * then downloads them directly (no yt-dlp / cookies needed).
 */
import path from "path";
import config from "../../../config.js";
import { ensureDir, fetchToFile, fetchAllToFiles, } from "./base.js";
const INSTAGRAM_HOSTS = ["instagram.com", "www.instagram.com"];
export class InstagramService {
    name = "Instagram";
    supports(url) {
        try {
            const host = new URL(url).hostname;
            return INSTAGRAM_HOSTS.includes(host);
        }
        catch {
            return false;
        }
    }
    async getMetadata(url) {
        const scraped = await this._scrapeEmbed(url);
        if (!scraped)
            throw new Error("Failed to scrape Instagram metadata.");
        return {
            id: scraped.shortcode,
            title: scraped.caption,
            ext: scraped.isVideo ? "mp4" : "jpg",
            extractor: "Instagram",
            mediaUrls: scraped.mediaUrls,
        };
    }
    async download(url, id) {
        ensureDir(config.downloadsDir);
        const scraped = await this._scrapeEmbed(url);
        if (!scraped)
            throw new Error("Instagram download failed: could not scrape embed.");
        const ext = scraped.isVideo ? "mp4" : "jpg";
        if (scraped.mediaUrls.length > 1) {
            const paths = await fetchAllToFiles(scraped.mediaUrls, config.downloadsDir, id, ext);
            if (paths.length === 0)
                throw new Error("Instagram carousel download produced no files.");
            return paths;
        }
        const filePath = path.join(config.downloadsDir, `${id}.${ext}`);
        await fetchToFile(scraped.mediaUrls[0], filePath);
        return filePath;
    }
    // ── private ──────────────────────────────────────────────────────────────
    _extractShortcode(url) {
        try {
            const parsedUrl = new URL(url);
            const match = parsedUrl.pathname.match(/(?:reels|reel|p|tv)\/([A-Za-z0-9_-]+)/);
            return match && match[1] ? match[1] : null;
        }
        catch {
            return null;
        }
    }
    async _scrapeEmbed(url) {
        const shortcode = this._extractShortcode(url);
        if (!shortcode)
            return null;
        const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
        try {
            const res = await fetch(embedUrl);
            if (!res.ok)
                return null;
            const html = await res.text();
            const videoMatch = html.match(/video_url[^"]+"[^"]+"(https?[^"]+)"/i);
            let isVideo = true;
            let mediaUrls = [];
            if (videoMatch && videoMatch[1]) {
                mediaUrls.push(this._decodeUrl(videoMatch[1]));
            }
            else {
                isVideo = false;
                const matches = [...html.matchAll(/display_url[^"]+"[^"]+"(https?[^"]+)"/gi)];
                if (matches.length > 0) {
                    const urls = matches.map((m) => this._decodeUrl(m[1]));
                    mediaUrls = [...new Set(urls)];
                }
            }
            if (mediaUrls.length === 0)
                return null;
            let caption = "Instagram Media";
            const captionMatch = html.match(/edge_media_to_caption[\s\S]*?text[^"]+"[^"]+"([^"]+)"/i);
            if (captionMatch && captionMatch[1]) {
                caption = this._unescapeCaption(captionMatch[1]);
            }
            return { mediaUrls, isVideo, caption, shortcode };
        }
        catch (e) {
            console.warn("Failed to scrape Instagram embed:", e);
            return null;
        }
    }
    /** Strips trailing backslash, then JSON-decodes the URL string. */
    _decodeUrl(raw) {
        const cleaned = raw.endsWith("\\") ? raw.slice(0, -1) : raw;
        return JSON.parse('"' + cleaned + '"').replace(/\\/g, "");
    }
    _unescapeCaption(raw) {
        return raw
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\(.)/g, "$1");
    }
}
