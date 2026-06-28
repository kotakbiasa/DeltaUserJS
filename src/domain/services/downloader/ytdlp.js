/**
 * yt-dlp service — handles YouTube, TikTok, Facebook, Twitter/X,
 * SoundCloud, Vimeo, Dailymotion, and 1800+ other sites.
 */
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
// Domains/patterns that other dedicated services handle first.
// yt-dlp is the fallback for everything else.
const EXCLUDED_HOSTS = [
    "instagram.com",
    "www.instagram.com",
    "twitter.com",
    "www.twitter.com",
    "x.com",
    "www.x.com",
    "fixupx.com",
    "fxtwitter.com",
    "tiktok.com",
    "www.tiktok.com",
    "vt.tiktok.com",
    "vm.tiktok.com",
];
export class YtDlpService {
    name = "yt-dlp";
    supports(url) {
        try {
            const host = new URL(url).hostname;
            return !EXCLUDED_HOSTS.includes(host);
        }
        catch {
            return false;
        }
    }
    getMetadata(url) {
        return new Promise((resolve, reject) => {
            const cmd = `python3 -m yt_dlp --dump-json --no-playlist "${url}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Failed to extract metadata: ${stderr || error.message}`));
                }
                try {
                    const raw = JSON.parse(stdout);
                    resolve(this._parseMetadata(raw));
                }
                catch {
                    reject(new Error("Failed to parse yt-dlp JSON output."));
                }
            });
        });
    }
    download(url, id) {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(config.DOWNLOADS_DIR)) {
                fs.mkdirSync(config.DOWNLOADS_DIR, { recursive: true });
            }
            const outputPattern = path.join(config.DOWNLOADS_DIR, `${id}.%(ext)s`);
            const cmd = `python3 -m yt_dlp -f "best[ext=mp4]/best" --merge-output-format mp4 --no-playlist -o "${outputPattern}" "${url}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, _stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Download failed: ${stderr || error.message}`));
                }
                const files = fs.readdirSync(config.DOWNLOADS_DIR);
                const matchingFile = files.find((f) => f.startsWith(id));
                if (matchingFile) {
                    resolve(path.join(config.DOWNLOADS_DIR, matchingFile));
                }
                else {
                    reject(new Error("Downloaded file not found in directory."));
                }
            });
        });
    }
    // ── private ──────────────────────────────────────────────────────────────
    _parseMetadata(raw) {
        let title = raw.title || "Video";
        const extractor = raw.extractor_key || raw.extractor || "Unknown";
        const extractorLower = extractor.toLowerCase();
        // For Facebook: prefer description over the "Views | Page" style title
        if (extractorLower.includes("facebook")) {
            const desc = raw.description;
            if (desc && desc.trim().length > 0) {
                title = desc.trim();
            }
            else {
                const parts = title.split(" | ");
                if (parts.length >= 2)
                    title = parts[1] ?? title;
            }
        }
        return {
            id: raw.id,
            title,
            ext: raw.ext || "mp4",
            duration: raw.duration != null ? raw.duration : undefined,
            extractor,
        };
    }
}
//# sourceMappingURL=ytdlp.js.map