# Fitur & Logika Bot Canva Premium

Dokumen ini menjelaskan seluruh fitur dan logika teknis dari bot Canva.

## 👥 Fitur User (Member)

### 1. Pendaftaran & Profil
- **Start Bot**: User mengetik `/start`.
  - **Sistem Register**: Bot mendeteksi apakah user **Baru** atau **Lama**.
  - **Auto-Generate**: User otomatis mendapatkan ID Database, Kode Referral, dan Tanggal Join.
- **Profil Saya**: Menampilkan:
  - Status langganan aktif & tanggal kedaluwarsa.
  - Jumlah **Poin Referral** yang dimiliki.
  - Link Referral unik (`t.me/bot?start=refID`).

### 2. Akses Bot (Force Subscribe)
- **Sistem Gratis**: Bot ini gratis sepenuhnya.
- **Syarat Akses**: User WAJIB subscribe/join ke channel/grup yang ditentukan (Maksimal 3 Link).
- **Validasi Otomatis**:
  1. User klik `/start` atau command lain.
  2. Bot mengecek status membership user ke **3 Channel Wajib**.
  3. Jika belum join, akses dikunci & bot menampilkan tombol link channel.
  4. Tombol "✅ Sudah Bergabung" melakukan cek ulang.

### 3. Sistem Varian Paket & Referral (Points)
Mendukung 2 varian paket akses:

#### a. Paket 1 Bulan (Free)
- **Harga**: 0 Poin (Gratis Langsung).
- **Syarat**: Hanya bisa memiliki **1 Akun Aktif** per ID Telegram.
  - Jika user masih punya akun aktif -> Bot menolak invite baru.
  - Harus tunggu expired untuk invite ulang.

#### b. Paket 6 Bulan (Premium)
- **Harga**: 6 Poin Referral per Invite.
- **Mekanisme Invite (Pay-as-you-go)**:
  - User memilih paket ini di Menu Paket (Set Preferensi).
  - Saat mengetik `/aktivasi [email]`, bot mengecek saldo poin.
  - **Poin Cukup (≥6)**: Bot memotong 6 poin **saat itu juga** & memproses invite.
  - **Poin Kurang**: Invite ditolak.
- **Keunggulan**: **Bisa Invite Banyak Akun (Multi-Invite)**.
  - Tidak ada limit akun aktif. Selama punya poin, user bisa invite email sebanyak-banyaknya.

#### c. Logika Poin Referral (Strict)
- **Aturan**: Poin hanya diberikan jika **User BARU** sukses terdaftar di database.
- **User Lama**: Jika user yang sudah pernah pakai bot mengklik link referral, poin **TIDAK** bertambah. Ini mencegah kecurangan/farming poin.

### 4. Aktivasi (Invite Canva)
- **Command**: `/aktivasi [email]`.
- **Logika**:
  1. Cek Preferensi Paket user (1 Bulan / 6 Bulan).
  2. **Jika 1 Bulan**: Cek apakah ada langganan aktif? Jika ada -> Tolak.
  3. **Jika 6 Bulan**: Cek apakah poin cukup (6)? Jika cukup -> Potong Poin -> Lanjut.
  4. Masukkan email antrian `pending_invite`.
  5. Trigger GitHub Action untuk eksekusi invite.

---

## 👨‍💻 Fitur Admin

### 1. Manajemen Force Subscribe
- **Set Channel**: `/set_channels @channel1, @channel2` (Untuk set channel wajib join).
- **Cek Channel**: `/channels` (Melihat list channel aktif).
- **Logika**: Config disimpan di Database `settings`, prioritas lebih tinggi dari Environment Variable.

### 2. Manajemen Cookie (Canva Akun)
- **Set Cookie**: `/set_cookie [text]` atau Upload File.
- **Support**:
  - Akun **Canva Pro** (Owner/Admin).
  - Akun **Canva Edu** (Teacher/Admin) -> Otomatis deteksi & support tombol "Add Student".
- **Validasi**: Bot otomatis cek validitas cookie & ambil Team ID.

### 3. Broadcast Pesan
- **Command**: `/broadcast [pesan]` atau Reply pesan dengan `/broadcast`.
- **Fungsi**: Mengirim pesan massal ke seluruh user.
- **Fitur**: Anti-Flood (delay 30ms), Laporan Sukses/Gagal/Blokir.

### 4. Test Invite
- **Command**: `/test_invite [email]`.
- **Fungsi**: Bypass semua syarat (poin/paket) untuk ngetes invite langsung.

---

## 🤖 Sistem Otomatisasi (Automation)

### 1. Auto-Invite Queue (Antrian)
- **Trigger**: Script `process_queue.ts` via GitHub Actions.
- **Logika**:
  - Login Canva pakai Puppeteer.
  - Deteksi tipe akun (Pro vs Edu) -> Sesuaikan tombol ("Invite people" vs "Add students").
  - Kirim invite -> Update DB -> Reset Product Selection ke Default (1 Bulan).
  - Buat Log Subscription di DB.

### 2. Auto-Kick (Expired Users)
- **Trigger**: Script `process_queue.ts` via GitHub Actions (Jalan 1 Jam Sekali).
- **Logika**:
  - Cek tabel `subscriptions` yang `end_date < sekarang`.
  - Hapus user dari Tim Canva (Remove User).
  - Ubah status jadi `kicked`.
  - Kirim notifikasi "Masa Aktif Habis".

---

## 🛠️ Struktur Database (Schema)

| Tabel | Fungsi | Kolom Baru / Penting |
|---|---|---|
| `users` | Data Profil | `referral_code`, `referred_by`, `referral_points`, `selected_product_id`, `joined_at` |
| `products` | Daftar Paket | `name` (1 Bulan / 6 Bulan), `duration_days` |
| `subscriptions` | Data Langganan | `start_date`, `end_date`, `status` |
| `settings` | Config Bot | `force_sub_channels`, `canva_cookie` |

---
*Dokumen ini diperbarui otomatis sesuai update terakhir: Strict Referral & Pay-as-you-go Logic.*
