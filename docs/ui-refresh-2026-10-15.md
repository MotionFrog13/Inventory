# Penyegaran antarmuka Inventory — 15 Oktober 2026

## Hasil

- Fondasi Slate/Indigo dengan font Geist, ikon garis SVG, kartu dan tabel seragam, serta tata letak responsif.
- Sidebar dan header lebih jelas, penanda halaman aktif, cakupan organisasi/divisi/outlet, dan menu akun yang dapat ditutup dengan Escape.
- Ringkasan memiliki pintasan sesuai peran. Staf tidak mendapat pintasan tambah aset.
- Login memiliki petunjuk email/username dan organisasi, label aksesibel, serta tombol tampil/sembunyikan password.
- Seluruh halaman aset, tambah/edit/detail aset, insiden, mutasi, cabang/detail cabang, divisi/kategori, pengguna, laporan, dan log aktivitas mengikuti pola yang sama.
- Panduan singkat menjelaskan langkah berikutnya dan alur insiden, mutasi, dan BAP.
- Dialog memakai modal native dengan fokus terjaga, latar inert, Escape, dan pengembalian fokus ke tombol pembuka.
- Form dan filter memiliki nama aksesibel; tombol hapus insiden menyebut aset terkait.
- Laporan menampilkan galat koneksi dan tombol coba lagi, serta membatalkan permintaan saat pengguna berpindah tab.

## Verifikasi

- `npm run typecheck`: lulus.
- `npm run lint`: lulus tanpa peringatan.
- `npm run build`: lulus.
- `npm run test:unit`: 33/33 lulus.
- Integration tenant database: 13/13 lulus, memakai database lokal khusus pengujian.
- Reseed dan QA dengan `APP_MODE=saas`: 62/62 lulus, termasuk stok, BAP parsial, mutasi, lintas organisasi/divisi/outlet, serta kasus keamanan.
- Browser: desktop 1440 px, tablet 768 px, dan ponsel 390 px. Pemeriksaan halaman operasional dan administrasi tidak menemukan overflow horizontal pada halaman; tabel lebar menggulir di wadahnya.
- Browser: login Super Admin, Admin IT, dan Staf IT; menu/tindakan sesuai peran; staf tidak melihat tambah aset dan filter divisi, admin divisi tidak melihat edit/tambah cabang.
- Browser: tab laporan bulanan/garansi, drawer ponsel, Escape, visibilitas password, serta pengembalian fokus dialog diperiksa.
- Review kode menemukan dua masalah aksesibilitas; keduanya diperbaiki dan diverifikasi ulang. Review lanjutan tidak menemukan masalah penting.

## Lingkungan pengujian

Database uji: `inventory_ui_qa_20261015` pada PostgreSQL lokal port 5432. Database asli `hachi_asset` dan konfigurasi `.env` tidak diubah. Database uji di-seed ulang setelah QA untuk mengembalikan data demo.

QA menggunakan `BASE_URL=http://127.0.0.1:3000`; `localhost:3000` pada perangkat ini mengarah ke layanan IPv6 berbeda dan mengembalikan 404 untuk API autentikasi. Tidak ada perubahan pada layanan tersebut.

Perubahan audit keamanan yang sudah ada sebelum pekerjaan ini tetap dipertahankan. Tidak ada perubahan skema, migrasi, atau aturan bisnis dalam penyegaran UI.

## Bukti tampilan

- `docs/screenshots/ui-refresh-desktop.jpg`
- `docs/screenshots/ui-refresh-mobile.jpg`
- `docs/screenshots/ui-refresh-login.jpg`
