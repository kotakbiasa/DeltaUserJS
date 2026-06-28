/**
 * Twitter/X service — downloads media via FxTwitter API,
 * with yt-dlp as a fallback.
 */
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
const TWITTER_HOSTS = ["twitter.com", "www.twitter.com", "x.com", "www.x.com", "fixupx.com", "fxtwitter.com"];
export class TwitterService {
    name = "Twitter";
    supports(url) {
        try {
            const host = new URL(url).hostname;
            return TWITTER_HOSTS.includes(host);
        }
        catch {
            return false;
        }
    }
    async getMetadata(url) {
        const info = this._extractInfo(url);
        if (!info)
            throw new Error("Invalid Twitter/X URL.");
        try {
            const fxData = await this._fetchFxTwitter(info.screenName, info.id);
            if (fxData && fxData.tweet) {
                const tweet = fxData.tweet;
                const mediaItems = tweet.media?.all || [];
                const isVideo = mediaItems.some((item) => item.type === "video" || item.type === "gif");
                return {
                    id: tweet.id,
                    title: tweet.text || "Twitter Post",
                    ext: isVideo ? "mp4" : "jpg",
                    extractor: "Twitter",
                    mediaUrls: mediaItems.map((item) => item.url),
                };
            }
        }
        catch (err) {
            console.warn(`FxTwitter metadata fetch failed, falling back to yt-dlp: ${err.message}`);
        }
        // Fallback: yt-dlp
        return new Promise((resolve, reject) => {
            const cookieArgs = this._cookieArgs();
            const cmd = `python3 -m yt_dlp --dump-json --no-playlist ${cookieArgs} "${url}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Twitter metadata fallback failed: ${stderr || error.message}`));
                }
                try {
                    const raw = JSON.parse(stdout);
                    resolve({
                        id: raw.id,
                        title: raw.title || raw.description || "Twitter Post",
                        ext: raw.ext || "mp4",
                        extractor: "Twitter",
                    });
                }
                catch {
                    reject(new Error("Failed to parse Twitter metadata."));
                }
            });
        });
    }
    async download(url, id) {
        if (!fs.existsSync(config.DOWNLOADS_DIR)) {
            fs.mkdirSync(config.DOWNLOADS_DIR, { recursive: true });
        }
        const info = this._extractInfo(url);
        if (info) {
            try {
                const fxData = await this._fetchFxTwitter(info.screenName, info.id);
                if (fxData && fxData.tweet) {
                    const tweet = fxData.tweet;
                    const mediaItems = tweet.media?.all || [];
                    if (mediaItems.length > 1) {
                        const filePaths = [];
                        for (let i = 0; i < mediaItems.length; i++) {
                            const item = mediaItems[i];
                            const isVideo = item.type === "video" || item.type === "gif";
                            const ext = isVideo ? "mp4" : "jpg";
                            const filePath = path.join(config.DOWNLOADS_DIR, `${id}_${i}.${ext}`);
                            try {
                                const response = await fetch(item.url);
                                if (!response.ok) {
                                    throw new Error(`Failed to stream media part ${i}: ${response.statusText}`);
                                }
                                const buffer = Buffer.from(await response.arrayBuffer());
                                fs.writeFileSync(filePath, buffer);
                                filePaths.push(filePath);
                            }
                            catch (err) {
                                console.warn(`FxTwitter download part ${i} failed: ${err.message}`);
                            }
                        }
                        if (filePaths.length > 0)
                            return filePaths;
                    }
                    else if (mediaItems.length === 1) {
                        const item = mediaItems[0];
                        const isVideo = item.type === "video" || item.type === "gif";
                        const ext = isVideo ? "mp4" : "jpg";
                        const filePath = path.join(config.DOWNLOADS_DIR, `${id}.${ext}`);
                        try {
                            const response = await fetch(item.url);
                            if (!response.ok) {
                                throw new Error(`Failed to stream media: ${response.statusText}`);
                            }
                            const buffer = Buffer.from(await response.arrayBuffer());
                            fs.writeFileSync(filePath, buffer);
                            return filePath;
                        }
                        catch (err) {
                            console.warn(`FxTwitter download failed, falling back to yt-dlp: ${err.message}`);
                        }
                    }
                }
            }
            catch (err) {
                console.warn(`FxTwitter download process failed, falling back to yt-dlp: ${err.message}`);
            }
        }
        // Fallback: yt-dlp
        return new Promise((resolve, reject) => {
            const cookieArgs = this._cookieArgs();
            const outputPattern = path.join(config.DOWNLOADS_DIR, `${id}.%(ext)s`);
            const cmd = `python3 -m yt_dlp -f "best[ext=mp4]/best" --merge-output-format mp4 --no-playlist ${cookieArgs} -o "${outputPattern}" "${url}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, _stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Twitter download fallback failed: ${stderr || error.message}`));
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
    _extractInfo(url) {
        try {
            const parsedUrl = new URL(url);
            const parts = parsedUrl.pathname.split("/").filter(Boolean);
            // Expected pathname: /:screen_name/status/:id
            const statusIndex = parts.indexOf("status");
            if (statusIndex !== -1 && parts[statusIndex + 1]) {
                return {
                    screenName: parts[statusIndex - 1] || "i",
                    id: parts[statusIndex + 1],
                };
            }
            return null;
        }
        catch {
            return null;
        }
    }
    async _fetchFxTwitter(screenName, id) {
        const response = await fetch(`https://api.fxtwitter.com/${screenName}/status/${id}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DownBot/1.0",
            }
        });
        if (!response.ok) {
            throw new Error(`FxTwitter API responded with status: ${response.status}`);
        }
        return response.json();
    }
    /** Returns --cookies flag if the cookie file exists, otherwise empty string */
    _cookieArgs() {
        const cookiePath = process.env.TWITTER_COOKIES_PATH;
        if (cookiePath && fs.existsSync(cookiePath)) {
            return `--cookies "${cookiePath}"`;
        }
        return "";
    }
}
//# sourceMappingURL=twitter.js.map