/**
 * yt-dlp service — fallback for YouTube, Facebook, and 1800+ other sites.
 *
 * This is the LAST service in the registry: it claims any URL the dedicated
 * services (Twitter, TikTok, Instagram, …) didn't already match. That means
 * we don't need an "excluded hosts" list here — registry order handles it.
 */
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import config from "../../../config.js";
import { ensureDir } from "./base.js";
const COOKIES_PATH = path.join(process.cwd(), "cookies.txt");
export class YtDlpService {
    name = "yt-dlp";
    supports(url) {
        try {
            new URL(url);
            return true;
        }
        catch {
            return false;
        }
    }
    getMetadata(url) {
        const cmd = `python3 -m yt_dlp ${this._cookieArgs()} --dump-json --no-playlist "${url}"`;
        return new Promise((resolve, reject) => {
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Failed to extract metadata: ${stderr || error.message}`));
                }
                try {
                    resolve(this._parseMetadata(JSON.parse(stdout)));
                }
                catch {
                    reject(new Error("Failed to parse yt-dlp JSON output."));
                }
            });
        });
    }
    download(url, id) {
        ensureDir(config.downloadsDir);
        const outputPattern = path.join(config.downloadsDir, `${id}.%(ext)s`);
        const cmd = `python3 -m yt_dlp ${this._cookieArgs()} -f "best[ext=mp4]/best" --merge-output-format mp4 --no-playlist -o "${outputPattern}" "${url}"`;
        return new Promise((resolve, reject) => {
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, _stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Download failed: ${stderr || error.message}`));
                }
                const files = fs.readdirSync(config.downloadsDir);
                const matchingFile = files.find((f) => f.startsWith(id));
                if (matchingFile) {
                    resolve(path.join(config.downloadsDir, matchingFile));
                }
                else {
                    reject(new Error("Downloaded file not found in directory."));
                }
            });
        });
    }
    // ── private ──────────────────────────────────────────────────────────────
    /** Returns --cookies flag if cookies.txt exists in cwd, otherwise empty string */
    _cookieArgs() {
        return fs.existsSync(COOKIES_PATH) ? `--cookies "${COOKIES_PATH}"` : "";
    }
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
