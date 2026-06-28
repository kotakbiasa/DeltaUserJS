import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const TIKTOK_DOMAINS = [
  "tiktok.com",
  "www.tiktok.com",
  "vt.tiktok.com",
  "vm.tiktok.com",
];

export class TiktokService {
  static supports(url) {
    try {
      const host = new URL(url).hostname;
      return TIKTOK_DOMAINS.some((d) => host.includes(d));
    } catch {
      return false;
    }
  }

  static async getMetadata(url) {
    const res = await fetch("https://www.tikwm.com/api/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
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
    
    // Check if it's an image slideshow
    if (item.images && Array.isArray(item.images) && item.images.length > 0) {
      return {
        id: item.id || crypto.randomBytes(4).toString("hex"),
        title: item.title || "TikTok Slideshow",
        ext: "jpg",
        extractor: "TikTok",
        mediaUrls: item.images,
        isSlideshow: true
      };
    }

    // Video
    return {
      id: item.id || crypto.randomBytes(4).toString("hex"),
      title: item.title || "TikTok Video",
      ext: "mp4",
      duration: item.duration,
      extractor: "TikTok",
      videoUrl: item.play || item.hdplay,
      isSlideshow: false
    };
  }
}
