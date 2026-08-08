/**
 * Utility untuk memformat durasi/uptime dalam format human-readable.
 */

type UptimeStyle = 'compact' | 'full' | 'stats';

/** Suffix per style: compact → j/m/d, full → d/h/m/s, stats → h/j/m/d */
const SUFFIX: Record<UptimeStyle, { days: string; hours: string; minutes: string; seconds: string }> = {
  compact: { days: '', hours: 'j', minutes: 'm', seconds: 'd' }, // "3j 15m 42d"
  full: { days: 'd', hours: 'h', minutes: 'm', seconds: 's' },   // "3d 4h 15m 42s"
  stats: { days: 'h', hours: 'j', minutes: 'm', seconds: 'd' },  // "3h 4j 15m 42d"
};

/**
 * Format detik menjadi string human-readable dengan gaya tertentu.
 * @param totalSeconds - Total detik
 * @param style - compact: "3j 15m 42d" | full: "3d 4h 15m 42s" | stats: "3h 4j 15m 42d"
 */
export function formatUptimeStyled(totalSeconds: number, style: UptimeStyle = 'compact'): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {return '0d';}
  const s = SUFFIX[style];
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  let str = '';
  if (days > 0) {str += `${days}${s.days} `;}
  if (hours > 0) {str += `${hours}${s.hours} `;}
  if (minutes > 0) {str += `${minutes}${s.minutes} `;}
  str += `${seconds}${s.seconds}`;
  return str;
}

/**
 * Format detik menjadi string human-readable (gaya compact).
 * Suffix: j (jam), m (menit), d (detik). Contoh: "3j 15m 42d"
 */
export function formatUptime(totalSeconds: number): string {
  return formatUptimeStyled(totalSeconds, 'compact');
}

/**
 * Format detik menjadi string human-readable (gaya full).
 * Suffix: d (hari), h (jam), m (menit), s (detik). Contoh: "3d 4h 15m 42s"
 */
export function formatUptimeAlt(totalSeconds: number): string {
  return formatUptimeStyled(totalSeconds, 'full');
}

/**
 * Format detik menjadi string human-readable (gaya stats).
 * Suffix: h (hari), j (jam), m (menit), d (detik). Contoh: "3h 4j 15m 42d"
 */
export function formatUptimeStats(totalSeconds: number): string {
  return formatUptimeStyled(totalSeconds, 'stats');
}

/**
 * Format bytes menjadi string human-readable (B, KB, MB, GB, TB).
 * @param bytes - Ukuran dalam byte
 * @returns String seperti "1.25 GB"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) {return '0 B';}
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
