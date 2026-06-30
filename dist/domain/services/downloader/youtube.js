/**
 * YouTube service — uses api.deline.web.id to fetch DASH stream URLs,
 * then mux video+audio with `ffmpeg -c copy` (no re-encode).
 *
 * Target: 720p MP4 (itag 136, avc1) + m4a 131kb/s (AUDIO_QUALITY_MEDIUM, aac).
 * Both codecs are MP4-compatible, so muxing is a fast remux.
 *
 * Falls back to yt-dlp on any failure (API down, no 720p stream, ffmpeg error).
 */
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import config from "../../../config.js";
import { ensureDir, fetchToFile, } from "./base.js";
const YOUTUBE_HOSTS = [
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "youtu.be",
];
/** How long to keep a Deline API response cached in memory (ms). */
const CACHE_TTL_MS = 60_000;
/** Target video height in pixels. Service picks the closest <= this value. */
const TARGET_HEIGHT = 720;
export class YouTubeService {
    name = "YouTube";
    cache = new Map();
    supports(url) {
        try {
            const host = new URL(url).hostname;
            return YOUTUBE_HOSTS.includes(host);
        }
        catch {
            return false;
        }
    }
    async getMetadata(url) {
        try {
            const item = await this._fetchDeline(url);
            const meta = {
                id: item.id,
                title: item.title,
                ext: "mp4",
                extractor: "YouTube",
            };
            if (item.duration !== undefined)
                meta.duration = item.duration;
            return meta;
        }
        catch (err) {
            console.warn(`Deline metadata fetch failed, falling back to yt-dlp: ${err.message}`);
            return this._ytdlpMetadata(url);
        }
    }
    async download(url, id) {
        ensureDir(config.downloadsDir);
        try {
            const item = await this._fetchDeline(url);
            const videoPart = path.join(config.downloadsDir, `${id}.video.mp4`);
            const audioPart = path.join(config.downloadsDir, `${id}.audio.m4a`);
            const finalPath = path.join(config.downloadsDir, `${id}.mp4`);
            try {
                await Promise.all([
                    fetchToFile(item.videoUrl, videoPart),
                    fetchToFile(item.audioUrl, audioPart),
                ]);
                await this._mux(videoPart, audioPart, finalPath);
                return finalPath;
            }
            finally {
                // Best-effort cleanup of the intermediate parts.
                for (const p of [videoPart, audioPart]) {
                    if (fs.existsSync(p)) {
                        try {
                            fs.unlinkSync(p);
                        }
                        catch { /* ignore */ }
                    }
                }
            }
        }
        catch (err) {
            console.warn(`Deline download failed, falling back to yt-dlp: ${err.message}`);
            return this._ytdlpDownload(url, id);
        }
    }
    // ── private ──────────────────────────────────────────────────────────────
    /**
     * Hits the Deline API once per URL (within CACHE_TTL_MS), so getMetadata()
     * and download() share a single request.
     */
    async _fetchDeline(url) {
        const cached = this.cache.get(url);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.result;
        }
        const endpoint = `https://api.deline.web.id/downloader/youtube?url=${encodeURIComponent(url)}`;
        const res = await fetch(endpoint);
        if (!res.ok) {
            throw new Error(`Deline API error: ${res.statusText}`);
        }
        const json = await res.json();
        if (!json.status || !json.result || json.result.error) {
            throw new Error(json.result?.message || json.error || "Deline API returned no data");
        }
        const data = json.result;
        const medias = Array.isArray(data.medias) ? data.medias : [];
        const videoUrl = this._pickVideoStream(medias);
        if (!videoUrl)
            throw new Error("No suitable MP4 video stream available.");
        const audioUrl = this._pickAudioStream(medias);
        if (!audioUrl)
            throw new Error("No suitable M4A audio stream available.");
        const id = this._extractVideoId(url) ?? data.id ?? Date.now().toString(36);
        const result = {
            id,
            title: data.title || "YouTube Video",
            videoUrl,
            audioUrl,
        };
        if (typeof data.duration === "number")
            result.duration = data.duration;
        this.cache.set(url, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
    }
    /**
     * Picks the best MP4 video stream <= TARGET_HEIGHT (defaults to 720p).
     * Prefers DASH video-only (no is_audio flag) so we have full quality
     * control. Returns undefined if nothing usable is found.
     */
    _pickVideoStream(medias) {
        const candidates = medias
            .filter((m) => m.type === "video" && m.ext === "mp4" && m.url && m.height)
            .filter((m) => (m.height ?? 0) <= TARGET_HEIGHT)
            .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
        return candidates[0]?.url;
    }
    /**
     * Picks the best M4A (AAC) audio stream. AAC + AVC1 mux cleanly into MP4
     * without re-encoding. Falls back to any m4a if `audioQuality` is absent.
     */
    _pickAudioStream(medias) {
        const m4a = medias.filter((m) => m.type === "audio" && m.ext === "m4a" && m.url);
        const medium = m4a.find((m) => m.audioQuality === "AUDIO_QUALITY_MEDIUM");
        return medium?.url ?? m4a[0]?.url;
    }
    /** Mux video-only + audio-only into a single MP4 with no re-encoding. */
    _mux(videoPath, audioPath, outPath) {
        return new Promise((resolve, reject) => {
            const cmd = `ffmpeg -y -i "${videoPath}" -i "${audioPath}" -c copy -movflags +faststart "${outPath}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, _stdout, stderr) => {
                if (error)
                    return reject(new Error(`ffmpeg mux failed: ${stderr || error.message}`));
                resolve();
            });
        });
    }
    _extractVideoId(url) {
        try {
            const u = new URL(url);
            if (u.hostname === "youtu.be")
                return u.pathname.slice(1) || null;
            const v = u.searchParams.get("v");
            if (v)
                return v;
            // /shorts/<id>, /embed/<id>, /live/<id>
            const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/);
            return m && m[1] ? m[1] : null;
        }
        catch {
            return null;
        }
    }
    // ── yt-dlp fallback ───────────────────────────────────────────────────────
    _cookieArgs() {
        const cookiePath = path.join(process.cwd(), "cookies.txt");
        return fs.existsSync(cookiePath) ? `--cookies "${cookiePath}"` : "";
    }
    _ytdlpMetadata(url) {
        return new Promise((resolve, reject) => {
            const cmd = `python3 -m yt_dlp ${this._cookieArgs()} --dump-json --no-playlist "${url}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(`YouTube metadata fallback failed: ${stderr || error.message}`));
                }
                try {
                    const raw = JSON.parse(stdout);
                    resolve({
                        id: raw.id,
                        title: raw.title || "YouTube Video",
                        ext: raw.ext || "mp4",
                        duration: raw.duration != null ? raw.duration : undefined,
                        extractor: "YouTube",
                    });
                }
                catch {
                    reject(new Error("Failed to parse yt-dlp JSON output."));
                }
            });
        });
    }
    _ytdlpDownload(url, id) {
        return new Promise((resolve, reject) => {
            const outputPattern = path.join(config.downloadsDir, `${id}.%(ext)s`);
            const cmd = `python3 -m yt_dlp ${this._cookieArgs()} -f "bestvideo[height<=${TARGET_HEIGHT}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${TARGET_HEIGHT}][ext=mp4]/best" --merge-output-format mp4 --no-playlist -o "${outputPattern}" "${url}"`;
            exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, _stdout, stderr) => {
                if (error) {
                    return reject(new Error(`YouTube download fallback failed: ${stderr || error.message}`));
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
