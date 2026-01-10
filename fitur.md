# Fitur & Logika Bot Canva Premium (V2.2 - Latest)

Dokumen ini merangkum seluruh fitur teknis, logika bisnis, dan mekanisme otomatisasi yang ada di dalam Bot Canva.

---

## 👥 Fitur User (Member)

### 1. Pendaftaran & Autentikasi
*   **Auto-Register**: Saat user mengetik `/start`, bot otomatis mendaftarkan ID Telegram mereka ke database.
*   **Force Subscribe**:
    *   **Gatekeeper**: User wajib join channel sponsor sebelum mengakses menu utama.
    *   **Auto-Check**: Bot memvalidasi status join di setiap interaksi penting (Aktivasi, Klaim, Cek Profil).

### 2. Manajemen Paket & Poin
*   **Sistem Poin Referral**:
    *   User mendapatkan poin dengan mengundang teman (Link unik di Profil).
    *   Poin digunakan untuk membeli/memperpanjang paket Premium.
    *   **Anti-Farming**: Poin hanya masuk jika invitean adalah user *baru*.
*   **Pilihan Paket (Strict Selection)**:
    *   **1 Bulan (Trial)**: Gratis, 1x klaim per user.
    *   **6 Bulan (Premium)**: Bayar pakai Poin (6 Poin).
    *   **12 Bulan (Premium)**: Bayar pakai Poin (12 Poin).
    *   **Aturan Ketat**: User **WAJIB** memilih paket di "Menu Paket" sebelum melakukan aktivasi (`/aktivasi`). Pilihan akan **otomatis ter-reset** setelah sukses agar tidak terpakai ulang secara tidak sengaja.

### 3. Aktivasi & Perpanjangan (Logic V2)
*   **Command**: `/aktivasi [email]`
*   **Logika Smart Extension**:
    *   **Deteksi Otomatis**: Jika email sama dengan yang terdaftar, bot menganggap ini perpanjangan (Extension).
    *   **Product ID Update**: Mengupdate jenis paket di database (misal upgrade dari Free ke Premium).
    *   **Kalkulasi Durasi Real-time**: Menambahkan hari dari tanggal expired terakhir.
    *   **Batas Maksimal (Cap)**: Mencegah penumpukan durasi melebihi **12 Bulan (370 Hari)** dari hari ini. Jika hasil perpanjangan tembus 1 tahun, request ditolak.
*   **Logika User Baru**:
    *   Jika email baru dan belum punya langganan, masuk antrian invite.

### 4. Tampilan Profil & UI Dinamis
*   **Dynamic Profile**:
    *   Di menu `👤 Profil Saya`, label paket berubah sesuai sisa durasi.
    *   Contoh: Jika sisa 18 bulan, tertulis **"Premium (±18 Bulan)"**.
*   **Dynamic Account List**:
    *   Di menu `📋 Daftar Akun`, jika sisa durasi > 35 hari, label paket berubah menjadi **"User Premium"**.
*   **Loading State**: Indikator "⏳ Memproses..." saat loading data berat atau koneksi database.

---

## 👮 Fitur Admin (Super Panel)

### 1. Panel Kontrol Visual
*   Akses via command `/admin`.
*   **Menu Button**: Navigasi cepat untuk Export Data, Cek Cookie, Broadcast, dll.

### 2. Manajemen User
*   **Lihat Daftar Akun**: Admin bisa melihat detail semua akun user tertentu.
*   **Soft Reset (`/reset_email`)**: Menghapus langganan & melepas email user, tapi **MENJAGA** saldo poin & history. Cocok untuk ganti email.
*   **Hard Delete (`/delete_user`)**: Menghapus user 100% dari database.
*   **Force Expire**: Memaksa akun user jadi expired (untuk test auto-kick).

### 3. Manajemen Sistem
*   **Export Data (`/data`)**: Mengirim file `.txt` berisi laporan seluruh user, paket, dan expired date.
*   **Set Cookie & UA**: Update cookie Canva dan User-Agent langsung dari bot tanpa restart server.
*   **Broadcast**: Kirim pesan ke seluruh user bot.
*   **Team ID & Slots**: Monitoring slot tim Canva.

---

## 🤖 Sistem Otomatisasi & Backend (V2)

### 1. Database Resilience (Ketahanan)
*   **Auto-Retry**: Bot otomatis mencoba ulang (retry) query database hingga 3x jika terjadi `ConnectTimeoutError` atau gangguan koneksi ke server Turso (Jepang).
*   **Auto-Refund**: Jika perpanjangan gagal total setelah retry, poin user otomatis dikembalikan (Refund).

### 2. Smart Automation (Puppeteer)
*   **Login Hybrid**: Prioritas Login Email/Password -> Fallback ke Cookie Session.
*   **Smart Invite**: Navigasi DOM cerdas menggunakan `aria-label` untuk mengundang user.
*   **Auto-Kick**: Script otomatis menghapus member yang expired dari Tim Canva.
*   **Stale Invite Cleaner**: Otomatis mencabut invite yang "Pending" > 1 jam untuk menghemat slot.

### 3. Serverless Compatibility
*   Bot didesain untuk berjalan di **Vercel (Serverless)** menggunakan Webhook, namun tetap compatible dengan mode **Local Polling** untuk development.
