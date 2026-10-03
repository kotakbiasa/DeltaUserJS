# Dokumentasi DeltaUserJS

## Panduan aktif

- [Arsitektur saat ini](./architecture.md) — struktur source, alur startup, dan
  aturan plugin dinamis.
- [Security & correctness review](./security.md) — verifikasi keamanan/kualitas
  terbaru dan status tindak lanjut.
- [Testing infrastructure](./testing/TEST_INFRA.md) — cara menjalankan dan
  memahami test harness.
- [Development cheatsheet](./development_cheatsheet.md) — catatan pengembangan.
- [Teleproto examples](./teleproto/README.md) — contoh penggunaan teleproto.

## Arsip

Review, roadmap, dan catatan refactor lama berada di
[`audits/archive/`](./audits/archive/). Arsip dipertahankan untuk sejarah proyek,
namun path dan status di dalamnya bisa tidak lagi sesuai dengan source sekarang.
Jadikan dokumentasi aktif di atas sebagai acuan.

## Tools manual

Pemeriksa panel dashboard berada di [`../scripts/diagnostics/`](../scripts/diagnostics/)
dan dapat dijalankan lewat script npm `diagnostics:*`. Tool ini bukan bagian dari
startup, build production, atau deployment.
