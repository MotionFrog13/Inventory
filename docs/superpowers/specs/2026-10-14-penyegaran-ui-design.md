# Rancangan penyegaran seluruh antarmuka Inventory

Tanggal: 14 Oktober 2026
Status: Disetujui pengguna pada 15 Oktober 2026 melalui pesan “lanjutkan”; telah diterapkan.

## Tujuan

Merapikan seluruh tampilan agar konsisten, nyaman dibaca, dan mudah dipahami pengguna baru. Pengguna harus dapat mengenali halaman yang sedang dibuka, cakupan data yang tersedia, tindakan utama, dan langkah berikutnya.

## Pilihan pendekatan

1. **Dashboard terang dan terpandu — rekomendasi.** Konten Slate terang, kartu putih, aksen Indigo, sidebar Slate gelap, ikon garis seragam, serta penjelasan pendek pada alur penting. Sejalan dengan panduan CLAUDE.md dan paling cocok untuk penggunaan operasional sehari-hari.
2. **Tampilan padat untuk operator.** Tabel dan filter lebih rapat, ringkasan lebih kecil. Efisien untuk pengguna berpengalaman, tetapi kurang membantu pengguna baru.
3. **Tampilan visual dengan banyak warna.** Kartu besar, ilustrasi, dan penekanan grafis. Lebih ekspresif, tetapi mengurangi ruang untuk data inventaris dan berpotensi mengaburkan makna warna status.

## Sistem visual

- Gunakan Slate dan Indigo sesuai CLAUDE.md: latar #f8fafc, kartu putih, aksi utama #4f46e5, hover #4338ca.
- Gunakan Geist Sans untuk menyatukan tipografi judul dan isi. Pertahankan teks isi yang mudah dibaca, hierarki judul jelas, dan angka statistik yang menonjol.
- Samakan jarak antarseksi, padding kartu, radius, border, dan bayangan lembut. Kurangi dekorasi pada area tabel.
- Gunakan ikon SVG garis yang konsisten dengan label teks; ikon dekoratif tidak dibacakan pembaca layar.
- Warna status tetap mengikuti semantik yang sudah ada dan selalu disertai label, bukan bergantung pada warna saja.
- Batasi animasi pada transisi singkat dan hormati prefers-reduced-motion.

## Struktur dan navigasi

- Sidebar mengelompokkan Ringkasan, Operasional, dan Administrasi. Label Indonesia: Ringkasan, Aset, Insiden, Mutasi Aset, Cabang, Laporan, serta menu administrasi sesuai peran.
- Halaman aktif ditandai jelas. Sidebar yang diperkecil tetap memiliki nama aksesibel dan tooltip.
- Nama organisasi serta divisi dan outlet tetap terlihat. Gunakan data sesi dan helper label yang sudah ada.
- Header menampilkan konteks halaman dan akun. Halaman detail menyediakan jejak navigasi menuju daftar induknya.
- Menu ponsel mempertahankan drawer, Escape, pengembalian fokus, backdrop, dan inert yang sudah diterapkan; breakpoint tetap sama dengan MOBILE_MEDIA_QUERY.

## Cakupan seluruh halaman

| Area | Perubahan yang direncanakan |
| --- | --- |
| Login | Tata letak bersih dan responsif, penjelasan cara masuk dengan email atau kode organisasi, label input terhubung, opsi melihat password, galat terbaca tanpa animasi berkedip. Tetap mendukung saas dan self-hosted. |
| Ringkasan | Susun statistik berdasarkan kepentingan, bedakan jumlah item dan jumlah pcs, tampilkan tindakan cepat sesuai peran, serta petunjuk mulai dari daftar aset. Peringatan memiliki tautan tindak lanjut yang jelas. |
| Daftar aset | Judul dan tindakan utama konsisten, filter terkelompok dengan label, ringkasan hasil dan reset filter, tabel mudah dipindai, stok Aktif/Total jelas, kondisi kosong disertai langkah berikutnya. |
| Detail aset | Kelompokkan identitas, lokasi, stok, dan riwayat. Aksi lapor insiden, mutasi, dan BAP diberi penjelasan tujuan dan persyaratan. Stok reservasi BAP dibedakan dari stok yang dapat digunakan. |
| Tambah/edit aset | Informasi dasar, penempatan/stok, spesifikasi, tanggal/garansi, dan catatan terpisah jelas. Tampilkan wajib/opsional, contoh input, keterangan divisi/outlet terkunci, serta tombol simpan dan batal yang mudah ditemukan. |
| Insiden | Status proses terbaca dalam Bahasa Indonesia, filter dan tabel seragam, penjelasan pelaporan serta pengajuan penyelesaian, dialog dengan konteks aset dan jumlah pcs. |
| Mutasi aset | Jelaskan bahwa permintaan menunggu persetujuan admin outlet asal. Bedakan cabang asal, tujuan, dan status permintaan secara visual. |
| Cabang dan detail cabang | Kartu lokasi dan statistik lebih teratur, tautan detail jelas, daftar aset mengikuti pola tabel bersama. |
| Divisi/kategori | Hierarki divisi dan kategorinya jelas, tindakan tambah/edit/hapus konsisten, keterangan dependensi penghapusan mudah dipahami. |
| Pengguna | Form penugasan menjelaskan peran, divisi, dan outlet; bagian bersyarat tetap mengikuti peran final. Daftar, statistik, dan dialog mengikuti sistem visual yang sama. |
| Laporan | Tab responsif, KPI dan grafik memiliki label/satuan jelas, ekspor dan filter mudah ditemukan, kondisi loading/kosong/galat seragam. |
| Log aktivitas | Judul, pencarian, tabel, pagination, dan keadaan galat mengikuti pola bersama; khusus Super Admin. |
| Halaman sistem | Akses ditolak, halaman tidak ditemukan, galat global, dan loading memakai tampilan konsisten dengan tindakan pemulihan yang jelas. |

## Komponen dan batas implementasi

- Gunakan komponen presentasi bersama untuk ikon, judul halaman, kartu panduan, keadaan kosong, dan elemen permukaan bila membantu mengurangi duplikasi.
- Terapkan token global untuk fondasi desain, kemudian ubah markup setiap halaman secara terarah. Hindari aturan CSS global yang menyamarkan ketidakkonsistenan struktur halaman.
- Pertahankan Server Components untuk halaman yang membaca database; Client Components hanya untuk interaksi. Ikuti dokumentasi Next.js lokal yang terpasang.
- Semua akses database tetap melalui konteks request. Scope organisasi × divisi × outlet, guard halaman, RBAC, status BAP, stok, dan persetujuan mutasi wajib tetap berlaku.
- Jangan menambahkan MDM, route baru, migrasi, atau fitur bisnis baru dalam penyegaran tampilan ini.
- Working tree memiliki perubahan audit keamanan yang belum dikomit. Implementasi harus menjaga perubahan tersebut dan meninjau diff sebelum mengedit file yang bersinggungan, terutama Log Aktivitas.

## Aksesibilitas dan keadaan antarmuka

- Input memiliki label terhubung; fokus keyboard terlihat; navigasi aktif memakai aria-current.
- Tombol ikon memiliki nama aksesibel; menu dan dialog dapat dioperasikan dengan keyboard.
- Dialog panjang dapat digulir pada layar pendek. Tabel lebar menggulir di wadahnya, tanpa membuat seluruh halaman melebar.
- Loading menyampaikan bahwa data sedang dimuat. Galat menyampaikan penyebab yang tersedia dan tindakan mencoba kembali. Keadaan kosong membedakan belum ada data dari hasil filter kosong.
- Aksi mengirim data tetap dinonaktifkan saat proses berlangsung dan diberi label proses yang jelas.
- Panduan pengguna baru berupa teks singkat dan tautan menuju alur yang tersedia sesuai peran, tanpa tur yang memblokir pekerjaan.

## Kriteria selesai dan verifikasi

- Semua halaman pada tabel cakupan diperbarui, termasuk dialog dan halaman sistem.
- Tinjau visual desktop, tablet, dan ponsel: 1440 px, 768 px, dan 390 px. Tidak ada teks terpotong, tombol tertutup, atau overflow halaman.
- Verifikasi navigasi keyboard, fokus drawer/dialog, tab laporan, filter, dan form dengan label.
- Verifikasi Super Admin, Admin Divisi, dan Staf Divisi agar tindakan dan navigasi sesuai hak akses. Uji penjelasan reservasi BAP dan persetujuan mutasi outlet asal.
- Jalankan npm run typecheck, npm run lint, npm run build, npm run test:unit, dan npm run test:integration.
- Jalankan reseed dan npm run qa dengan APP_MODE=saas hanya pada database pengembangan yang terverifikasi; jika Docker digunakan, gunakan localhost:55432 sesuai AGENTS.md. Catat kendala lingkungan secara eksplisit.
- Setelah persetujuan, buat rencana implementasi terurut: fondasi visual dan shell, ringkasan/login, halaman operasional, administrasi/laporan, kemudian verifikasi.
