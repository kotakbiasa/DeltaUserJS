/**
 * Instagram service — downloads via yt-dlp with cookies support.
 *
 * Cookie file path: INSTAGRAM_COOKIES_PATH in .env (optional).
 * If the cookie file doesn't exist, falls back to yt-dlp without cookies
 * (may fail for some posts due to Instagram rate-limits).
 */
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
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
        if (scraped) {
            return {
                id: scraped.shortcode,
                title: scraped.caption,
                ext: scraped.isVideo ? "mp4" : "jpg",
                extractor: "Instagram",
                mediaUrls: scraped.mediaUrls,
            };
        }
        return new Promise((resolve, reject) => {
            const cookieArgs = this._cookieArgs();
            const cmd = `python3 -m yt_dlp --dump-json --no-playlist ${cookieArgs} "${url}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Instagram metadata failed: ${stderr || error.message}`));
                }
                try {
                    const raw = JSON.parse(stdout);
                    resolve(this._parseMetadata(raw));
                }
                catch {
                    reject(new Error("Failed to parse Instagram metadata."));
                }
            });
        });
    }
    async download(url, id) {
        if (!fs.existsSync(config.DOWNLOADS_DIR)) {
            fs.mkdirSync(config.DOWNLOADS_DIR, { recursive: true });
        }
        const scraped = await this._scrapeEmbed(url);
        if (scraped) {
            const ext = scraped.isVideo ? "mp4" : "jpg";
            if (scraped.mediaUrls.length > 1) {
                const filePaths = [];
                for (let i = 0; i < scraped.mediaUrls.length; i++) {
                    const mediaUrl = scraped.mediaUrls[i];
                    const filePath = path.join(config.DOWNLOADS_DIR, `${id}_${i}.${ext}`);
                    try {
                        const response = await fetch(mediaUrl);
                        if (!response.ok) {
                            throw new Error(`Failed to stream media part ${i}: ${response.statusText}`);
                        }
                        const buffer = Buffer.from(await response.arrayBuffer());
                        fs.writeFileSync(filePath, buffer);
                        filePaths.push(filePath);
                    }
                    catch (err) {
                        console.warn(`Scraped embed download part ${i} failed: ${err.message}`);
                    }
                }
                if (filePaths.length > 0)
                    return filePaths;
            }
            else if (scraped.mediaUrls.length === 1) {
                const filePath = path.join(config.DOWNLOADS_DIR, `${id}.${ext}`);
                try {
                    const response = await fetch(scraped.mediaUrls[0]);
                    if (!response.ok) {
                        throw new Error(`Failed to stream media: ${response.statusText}`);
                    }
                    const buffer = Buffer.from(await response.arrayBuffer());
                    fs.writeFileSync(filePath, buffer);
                    return filePath;
                }
                catch (err) {
                    console.warn(`Scraped embed download failed, falling back to yt-dlp: ${err.message}`);
                }
            }
        }
        return new Promise((resolve, reject) => {
            const cookieArgs = this._cookieArgs();
            const outputPattern = path.join(config.DOWNLOADS_DIR, `${id}.%(ext)s`);
            const cmd = `python3 -m yt_dlp -f "best[ext=mp4]/best" --merge-output-format mp4 --no-playlist ${cookieArgs} -o "${outputPattern}" "${url}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, _stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Instagram download failed: ${stderr || error.message}`));
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
    _extractShortcode(url) {
        try {
            const parsedUrl = new URL(url);
            const match = parsedUrl.pathname.match(/(?:reels|reel|p|tv)\/([A-Za-z0-9_-]+)/);
            return (match && match[1]) ? match[1] : null;
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
                let rawUrl = videoMatch[1];
                if (rawUrl && rawUrl.endsWith("\\")) {
                    rawUrl = rawUrl.slice(0, -1);
                }
                mediaUrls.push(JSON.parse('"' + rawUrl + '"').replace(/\\/g, ""));
            }
            else {
                isVideo = false;
                const matches = [...html.matchAll(/display_url[^"]+"[^"]+"(https?[^"]+)"/gi)];
                if (matches.length > 0) {
                    const urls = matches.map(m => {
                        let rawUrl = m[1];
                        if (rawUrl && rawUrl.endsWith("\\")) {
                            rawUrl = rawUrl.slice(0, -1);
                        }
                        return JSON.parse('"' + rawUrl + '"').replace(/\\/g, "");
                    });
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
    _unescapeCaption(raw) {
        return raw
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)))
            .replace(/\\n/g, "\n")
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\(.)/g, "$1");
    }
    /** Returns --cookies flag if the cookie file exists, otherwise empty string */
    _cookieArgs() {
        const cookiePath = process.env.INSTAGRAM_COOKIES_PATH;
        if (cookiePath && fs.existsSync(cookiePath)) {
            return `--cookies "${cookiePath}"`;
        }
        return "";
    }
    _parseMetadata(raw) {
        // Prefer description (caption) over the generic title for Instagram
        let title = raw.description?.trim()
            || raw.title
            || "Instagram Post";
        return {
            id: raw.id,
            title,
            ext: raw.ext || "mp4",
            duration: raw.duration != null ? raw.duration : undefined,
            extractor: "Instagram",
        };
    }
}
//# sourceMappingURL=instagram.js.map