/**
 * HTTP helper — memusatkan pola `fetch` + timeout.
 *
 * `fetch` bawaan Node tidak punya batas waktu. Tanpa `AbortSignal`, handler
 * yang memanggil API pihak ketiga (wiki, weather, shortlink, dsb.) bisa
 * menggantung selamanya kalau server lawan diam, dan pesan "⏳ Memproses..."
 * tidak pernah berubah.
 *
 * Sebelumnya helper timeout ini ditulis ulang di tiga tempat
 * (handlers/tools/webshot.ts, handlers/util/webtools.ts, utils/speedtest.ts).
 */

/** Batas waktu default untuk permintaan API teks/JSON. */
export const DEFAULT_TIMEOUT_MS = 15_000;

export interface TimeoutHandle {
  signal: AbortSignal;
  /** Wajib dipanggil setelah permintaan selesai agar timer tidak menahan event loop. */
  done: () => void;
}

/**
 * Buat `AbortSignal` yang otomatis membatalkan setelah `ms` milidetik.
 * Dipakai saat pemanggil perlu memegang sendiri siklus hidup timer-nya.
 */
export function withTimeout(ms: number): TimeoutHandle {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

/**
 * `fetch` dengan batas waktu.
 *
 * Perilaku `fetch` dipertahankan apa adanya — status HTTP non-2xx tetap
 * dikembalikan sebagai `Response` (tidak melempar), supaya pemanggil yang
 * sudah memeriksa `res.ok` / `res.status` tidak perlu diubah.
 *
 * Jika pemanggil sudah menyediakan `init.signal` sendiri, sinyal itu yang
 * dipakai dan timeout di sini tidak diaktifkan.
 *
 * @throws Error dengan pesan ramah saat batas waktu terlampaui
 *         (bukan `AbortError` mentah).
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  if (init.signal) {
    return fetch(url, init);
  }

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (timedOut) {
      throw new Error(`Permintaan melebihi batas waktu ${Math.round(timeoutMs / 1000)} detik`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `fetchWithTimeout` + `res.json()`, melempar bila status HTTP bukan 2xx.
 * Pakai ini hanya kalau pemanggil tidak perlu memeriksa status secara khusus.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} dari ${new URL(url).host}`);
  }
  return (await res.json()) as T;
}

/**
 * `fetchWithTimeout` + `res.text()`, melempar bila status HTTP bukan 2xx.
 */
export async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} dari ${new URL(url).host}`);
  }
  return await res.text();
}
