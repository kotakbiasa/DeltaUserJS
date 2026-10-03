# Scripts

Script di folder ini bukan bagian dari production runtime.

## Diagnostics dashboard

Tool inspeksi manual berada di `scripts/diagnostics/` dan tersedia melalui npm:

```bash
npm run diagnostics:panels  # render/check semua panel dan keyboard
npm run diagnostics:menus   # cetak isi panel dan keyboard lengkap
npm run diagnostics:tags    # cari tag HTML panel settings yang tidak seimbang
```

Semua tool menggunakan data fixture lokal dan tidak membutuhkan token atau koneksi
Telegram. Jika menambah script baru, kelompokkan berdasarkan tujuan dan daftarkan
perintahnya di `package.json` agar tidak menjadi file tanpa pemilik.
