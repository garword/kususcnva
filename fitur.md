# Fitur & Logika Bot Canva Premium (V2.0)

Dokumen ini menjelaskan fungsionalitas teknis terbaru dari bot, termasuk sistem login prioritas email dan logika otomatisasi cerdas.

## 👥 Fitur User (Member)

### 1. Pendaftaran & Profil
- **Start Bot**: User mengetik `/start`.
  - **Sistem Register**: Deteksi user Baru/Lama, Auto-Generate Database ID.
- **Profil Saya**: Menampilkan status langganan, saldo Poin Referral, dan link referral unik.

### 2. Akses Bot (Force Subscribe)
- **Gatekeeper**: User wajib join channel sponsor sebelum bisa akses menu utama.
- **Auto-Check**: Bot otomatis memvalidasi status membership user setiap kali ada interaksi.

### 3. Sistem Pembayaran & Referral
- **Paket 1 Bulan (Gratis/Trial)**: 1 User = 1x Klaim.
- **Paket 6 Bulan (Premium)**: Sistem Pay-as-you-go menggunakan **Poin Referral** (6 Poin per invite).
- **Anti-Farming**: Poin referral hanya masuk jika user *benar-benar baru* di database.

### 4. Aktivasi (Invite Canva)
- **Command**: `/aktivasi [email]`
- **Proses**: Verifikasi eligibility -> Masuk Antrian Database -> Eksekusi via GitHub Actions.

---

## 🤖 Sistem Otomatisasi (Cerdas)

Sistem otomatisasi kini menggunakan kombinasi strategi untuk keandalan maksimal.

### 1. Smart Authentication (Login Hybrid)
Bot memiliki 3 lapisan strategi login:
1.  **Prioritas 1: Email & Password**  
    Bot login layaknya manusia menggunakan kredensial yang ada di Environment Variable (`CANVA_EMAIL`, `CANVA_PASSWORD`). Ini mengatasi isu cookie expired.
2.  **Prioritas 2: Cookie Session (Fallback)**  
    Jika login gagal (misal kena Captcha), bot otomatis switch menggunakan **Cookie** yang tersimpan di Database.
3.  **Visual Verification**: Setiap langkah login difoto (screenshot) dan dikirim ke log admin.

### 2. Smart Invite (Navigasi Akurat)
- **Navigasi**: Langsung menuju URL `/settings/people`.
- **Deteksi UI**:
  - Menggunakan **Aria Label** (`Enter email for person 1`) untuk mencari kolom input yang tepat.
  - Menangani **Popup** invite dengan menunggu animasi selesai.
  - Klik tombol "Send invitations" secara presisi.

### 3. Smart Kick (Penghapusan User Expired)
Logika penghapusan user yang sudah habis masa aktifnya:
1.  **Search**: Mencari email user di list anggota.
2.  **Select**: Mencentang **Checkbox** user target.
3.  **Action**: Klik ikon **Tong Sampah** (`.vxQy1w` / `aria-label="Remove"`).
4.  **Confirm**: Klik tombol konfirmasi merah ("Remove from team") di popup.

### 4. Team Quota Monitoring (Satpam Kuota)
- **Real-time Monitoring**: Setiap bot bekerja, ia membaca header "People (N)".
- **Database Recording**: Jumlah anggota tim disimpan ke database `settings`.
- **Warning System**: Jika anggota mencapai **500 (Max Slot)**, bot mengirim peringatan ke log sistem bahwa invite mungkin akan gagal.

---

## 👨‍💻 Fitur Admin & Tools

### 1. Inspector Tool (New)
- **Script**: `npx ts-node scripts/inspect_selector.ts`
- **Fungsi**: Membuka browser visual di mana admin bisa klik elemen web apa saja untuk mendapatkan selector CSS/XPath/AriaLabel yang akurat. Berguna untuk debugging jika Canva update tampilan.

### 2. Manajemen Force Subscribe
- `/set_channels`: Mengatur channel wajib join.
- `/channels`: Melihat list channel aktif.

### 3. Broadcast Masal
- Mengirim pesan ke seluruh user database dengan anti-flood protection.

### 4. Admin Log (Visual)
- Semua aktivitas bot (Login, Invite Sukses/Gagal, Kick, Error) disertai **FOTO BUKTI (Screenshot)** yang dikirim ke channel log admin.

---

## 🛠️ Struktur Database (Update)

Tabel `settings` kini menyimpan data dinamis penting:
- `canva_cookie`: Cadangan sesi login.
- `canva_team_members_count`: Jumlah anggota tim saat ini (untuk monitoring kuota).
- `force_sub_channels`: Konfigurasi channel wajib.

---
*Dokumen ini diperbarui untuk versi bot dengan Login Email/Pass & Smart Selectors.*
