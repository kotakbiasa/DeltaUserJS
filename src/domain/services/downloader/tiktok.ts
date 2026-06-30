import path from "path";
import crypto from "crypto";
import config from "../../../config.js";
import {
  ensureDir,
  fetchToFile,
  fetchAllToFiles,
  type MediaMetadata,
  type MediaService,
} from "./base.js";

const TIKTOK_DOMAINS = [
  "tiktok.com",
  "www.tiktok.com",
  "vt.tiktok.com",
  "vm.tiktok.com",
];

/** How long to keep a TikWM API response cached in memory (ms). */
const CACHE_TTL_MS = 60_000;

interface TikwmResult {
  id: string;
  title: string;
  duration?: number;
  /** Single video URL (mp4) or list of image URLs (slideshow). */
  play: string | string[];
}

interface CacheEntry {
  result: TikwmResult;
  expiresAt: number;
}

export class TikTokService implements MediaService {
  name = "TikTok";
  private cache = new Map<string, CacheEntry>();

  supports(url: string): boolean {
    try {
      const host = new URL(url).hostname;
      return TIKTOK_DOMAINS.some((d) => host.includes(d));
    } catch {
      return false;
    }
  }

  async getMetadata(url: string): Promise<MediaMetadata> {
    const item = await this._fetchTikwm(url);
    const isSlideshow = Array.isArray(item.play);
    const base: MediaMetadata = {
      id: item.id,
      title: item.title,
      ext: isSlideshow ? "jpg" : "mp4",
      extractor: "TikTok",
    };
    if (item.duration !== undefined) base.duration = item.duration;
    if (isSlideshow) base.mediaUrls = item.play as string[];
    return base;
  }

  async download(url: string, id: string): Promise<string | string[]> {
    ensureDir(config.downloadsDir);
    const item = await this._fetchTikwm(url);

    if (Array.isArray(item.play)) {
      const paths = await fetchAllToFiles(item.play, config.downloadsDir, id, "jpg");
      if (paths.length === 0) throw new Error("TikTok slideshow download produced no files.");
      return paths;
    }

    const filePath = path.join(config.downloadsDir, `${id}.mp4`);
    await fetchToFile(item.play, filePath);
    return filePath;
  }

  // ── private ──────────────────────────────────────────────────────────────

  /**
   * Hits the TikWM API once per URL (within CACHE_TTL_MS), so getMetadata()
   * and download() share a single request.
   */
  private async _fetchTikwm(url: string): Promise<TikwmResult> {
    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    const res = await fetch("https://www.tikwm.com/api/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: new URLSearchParams({ url, hd: "1" }).toString(),
    });

    if (!res.ok) {
      throw new Error(`TikTok API error: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.code !== 0 || !data.data) {
      throw new Error(data.msg || "Failed to fetch TikTok metadata");
    }

    const item = data.data;
    const id = item.id || crypto.randomBytes(4).toString("hex");
    const isSlideshow = Array.isArray(item.images) && item.images.length > 0;

    const result: TikwmResult = isSlideshow
      ? {
          id,
          title: item.title || "TikTok Slideshow",
          play: item.images as string[],
        }
      : {
          id,
          title: item.title || "TikTok Video",
          duration: item.duration,
          play: (item.hdplay || item.play) as string,
        };

    this.cache.set(url, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }
}
