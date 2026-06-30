/**
 * Twitter/X service — downloads media via FxTwitter API,
 * with yt-dlp as a fallback.
 */
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import config from "../../../config.js";
import { ensureDir, fetchToFile, } from "./base.js";
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
            const tweet = await this._fetchTweet(info.screenName, info.id);
            if (tweet) {
                const items = tweet.media?.all ?? [];
                const isVideo = items.some((it) => it.type === "video" || it.type === "gif");
                return {
                    id: tweet.id,
                    title: tweet.text || "Twitter Post",
                    ext: isVideo ? "mp4" : "jpg",
                    extractor: "Twitter",
                    mediaUrls: items.map((it) => it.url),
                };
            }
        }
        catch (err) {
            console.warn(`FxTwitter metadata fetch failed, falling back to yt-dlp: ${err.message}`);
        }
        return this._ytdlpMetadata(url);
    }
    async download(url, id) {
        ensureDir(config.downloadsDir);
        const info = this._extractInfo(url);
        if (info) {
            try {
                const tweet = await this._fetchTweet(info.screenName, info.id);
                const items = tweet?.media?.all ?? [];
                if (items.length > 1) {
                    // Each item can have a different extension — split per-type then download.
                    const paths = [];
                    for (let i = 0; i < items.length; i++) {
                        const it = items[i];
                        const ext = it.type === "video" || it.type === "gif" ? "mp4" : "jpg";
                        const target = path.join(config.downloadsDir, `${id}_${i}.${ext}`);
                        try {
                            await fetchToFile(it.url, target);
                            paths.push(target);
                        }
                        catch (err) {
                            console.warn(`FxTwitter download part ${i} failed: ${err.message}`);
                        }
                    }
                    if (paths.length > 0)
                        return paths;
                }
                else if (items.length === 1) {
                    const it = items[0];
                    const ext = it.type === "video" || it.type === "gif" ? "mp4" : "jpg";
                    const filePath = path.join(config.downloadsDir, `${id}.${ext}`);
                    try {
                        await fetchToFile(it.url, filePath);
                        return filePath;
                    }
                    catch (err) {
                        console.warn(`FxTwitter download failed, falling back to yt-dlp: ${err.message}`);
                    }
                }
            }
            catch (err) {
                console.warn(`FxTwitter download process failed, falling back to yt-dlp: ${err.message}`);
            }
        }
        return this._ytdlpDownload(url, id);
    }
    // ── private ──────────────────────────────────────────────────────────────
    _extractInfo(url) {
        try {
            const parsedUrl = new URL(url);
            const parts = parsedUrl.pathname.split("/").filter(Boolean);
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
    async _fetchTweet(screenName, id) {
        const response = await fetch(`https://api.fxtwitter.com/${screenName}/status/${id}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DownBot/1.0",
            },
        });
        if (!response.ok) {
            throw new Error(`FxTwitter API responded with status: ${response.status}`);
        }
        const json = (await response.json());
        return json.tweet ?? null;
    }
    /** Returns --cookies flag if the cookie file exists, otherwise empty string */
    _cookieArgs() {
        const cookiePath = process.env.TWITTER_COOKIES_PATH;
        if (cookiePath && fs.existsSync(cookiePath)) {
            return `--cookies "${cookiePath}"`;
        }
        return "";
    }
    _ytdlpMetadata(url) {
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
    _ytdlpDownload(url, id) {
        return new Promise((resolve, reject) => {
            const cookieArgs = this._cookieArgs();
            const outputPattern = path.join(config.downloadsDir, `${id}.%(ext)s`);
            const cmd = `python3 -m yt_dlp -f "best[ext=mp4]/best" --merge-output-format mp4 --no-playlist ${cookieArgs} -o "${outputPattern}" "${url}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, _stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Twitter download fallback failed: ${stderr || error.message}`));
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
}
