import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "../config.js";
const TIKTOK_DOMAINS = [
    "tiktok.com",
    "www.tiktok.com",
    "vt.tiktok.com",
    "vm.tiktok.com",
];
export class TikTokService {
    name = "TikTok";
    supports(url) {
        try {
            const host = new URL(url).hostname;
            return TIKTOK_DOMAINS.some((d) => host.includes(d));
        }
        catch {
            return false;
        }
    }
    async getMetadata(url) {
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
                mediaUrls: item.images, // Used for rich messages
                // Attach the API payload internally so we can use it in download()
                _rawPlay: item.images,
            };
        }
        // Video
        return {
            id: item.id || crypto.randomBytes(4).toString("hex"),
            title: item.title || "TikTok Video",
            ext: "mp4",
            duration: item.duration,
            extractor: "TikTok",
            _rawPlay: item.play || item.hdplay,
        };
    }
    async download(url, id) {
        if (!fs.existsSync(config.DOWNLOADS_DIR)) {
            fs.mkdirSync(config.DOWNLOADS_DIR, { recursive: true });
        }
        // We can fetch metadata again, or ideally pass the URL we got.
        // For simplicity, we just fetch again.
        const meta = await this.getMetadata(url);
        if (Array.isArray(meta._rawPlay)) {
            // Slideshow: download all images
            const filePaths = [];
            let i = 0;
            for (const imgUrl of meta._rawPlay) {
                const filePath = path.join(config.DOWNLOADS_DIR, `${id}_${i}.jpg`);
                await this._downloadFile(imgUrl, filePath);
                filePaths.push(filePath);
                i++;
            }
            return filePaths;
        }
        else if (typeof meta._rawPlay === "string") {
            // Video
            const filePath = path.join(config.DOWNLOADS_DIR, `${id}.mp4`);
            await this._downloadFile(meta._rawPlay, filePath);
            return filePath;
        }
        throw new Error("Invalid TikTok media format");
    }
    async _downloadFile(url, dest) {
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`Failed to download file from ${url}`);
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(dest, Buffer.from(buffer));
    }
}
//# sourceMappingURL=tiktok.js.map