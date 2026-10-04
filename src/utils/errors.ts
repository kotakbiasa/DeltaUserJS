/**
 * Helper kecil untuk menangani nilai `catch`.
 *
 * `catch (err)` di TypeScript bertipe `unknown` — itu benar, karena JavaScript
 * memperbolehkan melempar apa pun. Sebelumnya kode memakai `catch (err: unknown)`
 * lalu langsung membaca `err.message`, yang diam-diam menghasilkan
 * `"undefined"` bila yang dilempar bukan `Error`.
 */

/** Pesan error yang aman dibaca, apa pun bentuk nilai yang dilempar. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) {return err.message;}
  if (typeof err === 'string') {return err;}
  if (err && typeof err === 'object') {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') {return msg;}
  }
  return String(err);
}

/**
 * Teks error RPC Telegram. mtcute menaruh kode error di `.message`, sedangkan
 * klien lama memakai `.errorMessage`; keduanya diperiksa agar pencocokan
 * seperti `PHONE_CODE_EXPIRED` tetap bekerja.
 */
export function rpcErrorText(err: unknown): string {
  if (err && typeof err === 'object') {
    const legacy = (err as { errorMessage?: unknown }).errorMessage;
    if (typeof legacy === 'string') {return legacy;}
  }
  return errorMessage(err);
}

/** Nama konstruktor error, kosong bila tidak ada. */
export function errorName(err: unknown): string {
  if (err && typeof err === 'object') {
    const name = (err as { name?: unknown }).name;
    if (typeof name === 'string') {return name;}
  }
  return '';
}

/** Mencocokkan error RPC dengan kode tertentu, lewat `.is()` bila tersedia. */
export function isRpcError(err: unknown, code: string): boolean {
  if (err && typeof err === 'object') {
    const is = (err as { is?: (code: string) => boolean }).is;
    if (typeof is === 'function') {
      try {
        if (is.call(err, code)) {return true;}
      } catch { /* bentuk error tak terduga: jatuh ke pencocokan teks */ }
    }
  }
  return rpcErrorText(err).includes(code);
}
