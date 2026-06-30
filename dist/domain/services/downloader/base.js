/**
 * Shared types and base interface for all media download services.
 */
import fs from "fs";
// ──────────────────────────────────────────────────────────────────────────────
// Shared URL helpers
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Returns true if the string is a valid http/https URL.
 */
export function isValidUrl(urlString) {
    try {
        const url = new URL(urlString);
        return url.protocol === "http:" || url.protocol === "https:";
    }
    catch {
        return false;
    }
}
/**
 * Extracts the first URL found in a text message.
 */
export function extractUrl(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
}
/**
 * Escapes special HTML characters so the string can be safely sent to Telegram in HTML parse mode.
 */
export function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}
// ──────────────────────────────────────────────────────────────────────────────
// Shared filesystem / fetch helpers
// ──────────────────────────────────────────────────────────────────────────────
/**
 * Creates the directory (and any parents) if it does not already exist.
 */
export function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
/**
 * Streams a remote URL into a local file. Throws on non-2xx responses.
 * Uses Node's https module for better streaming + no memory buffering.
 * Follows HTTP 301/302 redirects automatically (up to 5 hops).
 */
export async function fetchToFile(url, dest, redirectCount = 0) {
    if (redirectCount > 5)
        throw new Error("Too many redirects");
    const https = await import("https");
    const http = await import("http");
    const protocol = url.startsWith("https:") ? https : http;
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        let opened = false;
        protocol.get(url, (res) => {
            const { statusCode, headers } = res;
            // Follow redirects
            if (statusCode === 301 || statusCode === 302) {
                file.close();
                if (fs.existsSync(dest))
                    fs.unlinkSync(dest);
                const location = headers.location;
                if (!location)
                    return reject(new Error(`Redirect without Location header: ${url}`));
                return resolve(fetchToFile(location, dest, redirectCount + 1));
            }
            if (statusCode !== 200) {
                file.close();
                if (fs.existsSync(dest))
                    fs.unlinkSync(dest);
                return reject(new Error(`Failed to download ${url}: HTTP ${statusCode}`));
            }
            opened = true;
            res.pipe(file);
            file.on("finish", () => {
                file.close();
                resolve();
            });
            file.on("error", (err) => {
                file.close();
                if (fs.existsSync(dest))
                    fs.unlinkSync(dest);
                reject(err);
            });
        }).on("error", (err) => {
            if (opened)
                file.close();
            if (fs.existsSync(dest))
                fs.unlinkSync(dest);
            reject(err);
        });
    });
}
/**
 * Downloads a list of media URLs into `<dir>/<id>_<i>.<ext>` files.
 * Individual failures are logged and skipped; the surviving paths are returned.
 */
export async function fetchAllToFiles(urls, dir, id, ext) {
    const paths = [];
    for (let i = 0; i < urls.length; i++) {
        const target = `${dir}/${id}_${i}.${ext}`;
        try {
            await fetchToFile(urls[i], target);
            paths.push(target);
        }
        catch (err) {
            console.warn(`Download part ${i} failed: ${err.message}`);
        }
    }
    return paths;
}
