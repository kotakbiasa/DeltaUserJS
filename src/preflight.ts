/**
 * Pemeriksaan yang harus lolos SEBELUM aplikasi boot.
 *
 * Diletakkan di modul terpisah dan di-import paling awal oleh src/index.ts,
 * supaya pengecekan berjalan sebelum efek samping modul lain (scheduler
 * backup, koneksi DB, dsb.) sempat jalan. Unit test tidak meng-import file
 * ini, jadi process.exit() di sini tidak mengganggu test.
 */
import { hasPersistentEncryptionKey } from './utils/crypto.js';

// ⛔ Tanpa ENCRYPTION_KEY, kunci enkripsi di-generate acak setiap start
// sehingga semua session string yang tersimpan tidak bisa didekripsi lagi dan
// seluruh userbot logout diam-diam setelah restart. Lebih baik menolak boot
// daripada kehilangan session satu per satu tanpa disadari.
if (!hasPersistentEncryptionKey) {
  console.error('⛔ FATAL: ENCRYPTION_KEY harus diset di file .env.');
  console.error('⛔ Tanpa itu, kunci dibuat acak tiap start dan SEMUA session userbot tersimpan menjadi tidak bisa dipakai setelah restart.');
  console.error('⛔ Buat satu kali lalu simpan permanen:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
