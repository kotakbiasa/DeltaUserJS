/**
 * Helper async kecil yang dipakai lintas modul.
 */

/**
 * Jeda eksekusi selama `ms` milidetik.
 *
 * Sebelumnya fungsi ini didefinisikan ulang di empat tempat
 * (engine/manager.ts, handlers/admin/clearnotif.ts, handlers/util/purge.ts,
 * dan utils/streamRich.ts) dengan implementasi yang persis sama.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
