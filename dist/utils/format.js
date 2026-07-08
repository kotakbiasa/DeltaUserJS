/**
 * Utility untuk memformat uptime dalam format human-readable.
 * Contoh: "3j 15m 42d" (jam, menit, detik).
 */
/**
 * Format detik menjadi string human-readable.
 * Suffix: j (jam), m (menit), d (detik).
 * @param totalSeconds - Total detik
 * @returns String seperti "3j 15m 42d"
 */
export function formatUptime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    let str = '';
    if (hours > 0)
        str += `${hours}j `;
    if (minutes > 0)
        str += `${minutes}m `;
    str += `${seconds}d`;
    return str;
}
/**
 * Format detik menjadi string human-readable (format alternatif).
 * Suffix: d (hari), h (jam), m (menit), s (detik).
 * @param totalSeconds - Total detik
 * @returns String seperti "3h 15m 42s"
 */
export function formatUptimeAlt(totalSeconds) {
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    let str = '';
    if (d > 0)
        str += `${d}d `;
    if (h > 0)
        str += `${h}h `;
    if (m > 0)
        str += `${m}m `;
    str += `${s}s`;
    return str;
}
/**
 * Format detik menjadi string human-readable (format stats).
 * Suffix: h (hari), j (jam), m (menit), d (detik).
 * @param totalSeconds - Total detik
 * @returns String seperti "3h 15j 42m 5d"
 */
export function formatUptimeStats(totalSeconds) {
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    let str = '';
    if (days > 0)
        str += `${days}h `;
    if (hours > 0)
        str += `${hours}j `;
    if (minutes > 0)
        str += `${minutes}m `;
    str += `${seconds}d`;
    return str;
}
/**
 * Format bytes menjadi string human-readable (B, KB, MB, GB, TB).
 * @param bytes - Ukuran dalam byte
 * @returns String seperti "1.25 GB"
 */
export function formatBytes(bytes) {
    if (bytes === 0)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
