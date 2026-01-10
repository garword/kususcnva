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

### 5. Command User
- **Start/Restart**: `/start`
- **Aktivasi**: `/aktivasi [email]`
- **Cek Slot**: `/check_slot` (atau via tombol)

### 👮 Command Admin
- **Panel Admin**: `/admin` (Tersedia tombol "📂 Export Data")
- **Data Report**: `/data` (Export txt data user & langganan)
- **Set Cookie**: `/set_cookie` (Upload file JSON / Reply text. Update otomatis ke GitHub Action)
- **Broadcast**: `/broadcast [pesan]`
- **Hapus User**: `/delete_user [email/id]` (Hard Delete dari DB)
- **Force Expire**: `/forceexpire [email]`
- **Set Channel**: `/set_channels`

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
3.  **Action**: Klik tombol **Remove users** (`aria-label="Remove users"`).
4.  **Confirm**: Klik tombol konfirmasi merah ("Remove from team") di popup.

### 4. Auto-Revoke Stale Invites (Pembersih Invite Lama)
- **Problem**: Invite yang "Pending" lebih dari 1 jam mengambil kuota tim.
- **Solution**: Script otomatis (`scripts/revoke_stale.ts`) mendeteksi invite yang statusnya masih "Invited" dan usianya > 1 jam, lalu mencabut invite tersebut.

### 5. Team Quota Monitoring & Slot Prediction
- **Real-time Sync**: Script (`scripts/sync_member_count.ts`) melakukan scan full-page untuk mendapatkan jumlah member yang akurat (Active + Pending).
- **Slot Limit**: Jika anggota >= 500, bot **MEMBLOKIR** permintaan `/aktivasi` baru.
- **Prediksi Waktu**: Jika penuh, bot memberi info "Slot Berikutnya Tersedia: [Tanggal Expired User Terdekat]".

### 6. Logic Berlangganan Cerdas (Smart Subscription)
- **Paket Free (1 Bulan)**:
    - **Strict Limit**: Hanya boleh punya 1 akun aktif. User harus menunggu expired baru bisa klaim lagi.
    - **Tujuan**: Mencegah abuse akun gratisan.
- **Paket Premium (6 Bulan)**:
    - **Stacking (Tumpuk)**: User bisa beli paket baru meski masih aktif.
    - **Instant Extension**: Jika user aktif membeli lagi, bot otomatis memperpanjang masa aktif (+180 hari) tanpa perlu invite ulang.
    - **Max Cap**: Batas maksimal penumpukan adalah **400 Hari** (mencegah penimbunan berlebihan).

### 7. "Via Code" Fallback (Anti-RRS)
- **Exclusive Strategy**: Bot diprioritaskan untuk menggunakan metode "Via Code" (Generate Link) daripada kirim email, untuk menghindari blokir "Security Reason" dari Canva.

### 8. Privilese Admin
- **Unlimited Points**: Admin tidak dikenakan biaya poin saat melakukan aktivasi paket Premium (Free of Charge).
- **Bypass Limit**: Admin bisa melakukan generate invite tanpa perlu memikirkan saldo poin.

---

## 👨‍💻 Fitur Admin & Tools

### 1. Inspector Tool (New)
- **Script**: `npx ts-node scripts/inspect_selector.ts`
- **Fungsi**: Membuka browser visual untuk inspeksi elemen web secara langsung.

### 2. Cek Slot (Member Feature)
- Tombol `📊 Cek Slot` di menu utama user untuk memeriksa ketersediaan slot secara real-time.

### 3. Manajemen Force Subscribe & Broadcast
- Full control untuk mengatur channel wajib join dan broadcast pesan masal.

### 4. Admin Log (Visual)
- Semua aktivitas kritis disertai Screenshot yang dikirim ke channel log.

### 5. Manajemen User (Advanced)
- **/delete_user [email/id]** - **Hard Delete**: Menghapus user secara permanen dari database (termasuk history, poin, dan data referral).
- **/reset_email [email]** - **Soft Reset**: Hanya menghapus status langganan aktif dan mereset email menjadi null, tetapi **MENJAGA** akumulasi Poin Referral dan History user. Berguna jika user ingin ganti email tapi tidak ingin kehilangan level poin.

---

## 🛠️ Struktur Database (Update)

Tabel `settings` kini menyimpan data dinamis penting:
- `team_member_count`: Jumlah anggota tim saat ini.
- `team_pending_count`: Jumlah invite yang masih pending.
- `last_sync_at`: Terakhir kali bot melakukan sinkronisasi data tim.
- `canva_cookie`: Cadangan sesi login.

---
*Dokumen ini diperbarui untuk versi bot v2.1 dengan fitur Slot Management & Stale Invite Cleaner.*
