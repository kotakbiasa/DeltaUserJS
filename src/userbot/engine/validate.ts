/**
 * Lapisan validasi argumen perintah userbot.
 *
 * Handler mem-parse string mentah dari `message.message`, jadi validasinya dulu
 * ditulis ulang di tiap file dengan aturan yang berbeda-beda: sebagian memakai
 * `parseInt()` yang menerima `"5abc"`, sebagian `Number()` yang mengubah `""`
 * jadi `0`, dan hampir semuanya tanpa batas atas. Modul ini menyatukan aturan
 * itu agar perilakunya seragam dan bisa diuji.
 *
 * Catatan penting soal batas atas: `setTimeout`/`setInterval` Node memakai
 * penghitung 32-bit bertanda. Delay di atas 2.147.483.647 ms (~24,8 hari)
 * TIDAK melempar — Node diam-diam memakai 1 ms, sehingga timer langsung
 * meledak. Karena itu durasi apa pun yang berakhir di sebuah timer wajib
 * melewati `MAX_TIMER_MS`.
 */

/** Delay maksimum yang aman untuk setTimeout/setInterval (~24,8 hari). */
export const MAX_TIMER_MS = 2_147_483_647;

/**
 * Hasil validasi. Sengaja BUKAN discriminated union: `tsconfig` memakai
 * `strict: false` (`strictNullChecks` mati), dan tanpa itu TypeScript tidak
 * mempersempit union lewat `if (!result.ok)` — pemanggil jadi tidak bisa
 * membaca `.error`.
 */
export type ValidationResult<T> = {
  ok: boolean;
  /** Terisi bila `ok` true. */
  value?: T;
  /** Terisi bila `ok` false. */
  error?: string;
};

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function fail(error: string): ValidationResult<never> {
  return { ok: false, error };
}

/**
 * Bilangan bulat ketat: hanya digit (boleh diawali `-`), tanpa desimal, tanpa
 * ekor huruf. `parseInt('5abc')` yang dipakai sebelumnya lolos sebagai 5.
 */
export function parseIntArg(
  raw: unknown,
  options: { min?: number; max?: number; label?: string } = {},
): ValidationResult<number> {
  const { min, max, label = 'Angka' } = options;
  const clean = String(raw ?? '').trim();
  if (!clean) {return fail(`${label} wajib diisi.`);}
  if (!/^-?\d+$/.test(clean)) {return fail(`${label} harus berupa angka bulat, bukan "${clean}".`);}

  const value = Number(clean);
  if (!Number.isSafeInteger(value)) {return fail(`${label} terlalu besar.`);}
  if (min !== undefined && value < min) {return fail(`${label} minimal ${min}.`);}
  if (max !== undefined && value > max) {return fail(`${label} maksimal ${max}.`);}
  return { ok: true, value };
}

/**
 * ID pengguna/chat Telegram. ID positif (user/bot) maupun negatif (grup,
 * `-100...` untuk supergroup/channel) sama-sama diterima.
 */
export function parseTelegramIdArg(
  raw: unknown,
  options: { label?: string } = {},
): ValidationResult<number> {
  const { label = 'User ID' } = options;
  const clean = String(raw ?? '').trim();
  if (!clean) {return fail(`${label} wajib diisi.`);}
  if (!/^-?\d+$/.test(clean)) {return fail(`${label} harus berupa angka.`);}
  const value = Number(clean);
  if (!Number.isSafeInteger(value) || value === 0) {return fail(`${label} tidak valid.`);}
  return { ok: true, value };
}

/**
 * Durasi gabungan seperti `45s`, `90m`, `1h30m`, `2d12h`.
 *
 * `maxMs` default `MAX_TIMER_MS` karena semua pemanggil menaruh hasilnya di
 * sebuah timer.
 */
export function parseDurationMsArg(
  raw: unknown,
  options: { maxMs?: number; label?: string } = {},
): ValidationResult<number> {
  const { maxMs = MAX_TIMER_MS, label = 'Durasi' } = options;
  const clean = String(raw ?? '').toLowerCase().replace(/\s+/g, '');
  if (!clean) {return fail(`${label} wajib diisi.`);}
  if (!/^(\d+[smhd])+$/.test(clean)) {
    return fail(`${label} tidak valid. Gunakan format seperti <code>30m</code>, <code>2h</code>, atau <code>1h30m</code>.`);
  }

  let totalMs = 0;
  for (const m of clean.matchAll(/(\d+)([smhd])/g)) {
    totalMs += Number(m[1]) * UNIT_MS[m[2]];
    if (!Number.isFinite(totalMs)) {return fail(`${label} terlalu besar.`);}
  }
  if (totalMs <= 0) {return fail(`${label} harus lebih dari 0.`);}
  if (totalMs > maxMs) {
    return fail(`${label} maksimal ${formatDurationHuman(maxMs)}.`);
  }
  return { ok: true, value: totalMs };
}

/** Durasi manusiawi ringkas untuk pesan error, mis. "24 hari 20 jam". */
export function formatDurationHuman(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const parts: string[] = [];
  if (d) {parts.push(`${d} hari`);}
  if (h) {parts.push(`${h} jam`);}
  if (m && !d) {parts.push(`${m} menit`);}
  return parts.length ? parts.join(' ') : `${Math.max(1, Math.floor(totalSec))} detik`;
}

/** Salah satu dari daftar pilihan (case-insensitive). */
export function parseChoiceArg<T extends string>(
  raw: unknown,
  choices: readonly T[],
  options: { label?: string } = {},
): ValidationResult<T> {
  const { label = 'Pilihan' } = options;
  const clean = String(raw ?? '').trim().toLowerCase();
  if (!clean) {return fail(`${label} wajib diisi.`);}
  const match = choices.find(c => c.toLowerCase() === clean);
  if (!match) {
    return fail(`${label} harus salah satu dari: ${choices.map(c => `<code>${c}</code>`).join(', ')}.`);
  }
  return { ok: true, value: match };
}

/** Teks wajib yang tidak boleh kosong setelah di-trim. */
export function parseTextArg(
  raw: unknown,
  options: { label?: string; maxLength?: number } = {},
): ValidationResult<string> {
  const { label = 'Teks', maxLength } = options;
  const clean = String(raw ?? '').trim();
  if (!clean) {return fail(`${label} wajib diisi.`);}
  if (maxLength !== undefined && clean.length > maxLength) {
    return fail(`${label} maksimal ${maxLength} karakter.`);
  }
  return { ok: true, value: clean };
}

/** Pesan error validasi dengan format seragam di seluruh perintah. */
export function validationErrorText(error: string, usage?: string): string {
  const usageLine = usage ? `\n<b>Penggunaan:</b> <code>${usage}</code>` : '';
  return `<blockquote>❌ <b>Input Tidak Valid:</b> ${error}${usageLine}</blockquote>`;
}
