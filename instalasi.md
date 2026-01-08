# 🚀 Panduan Instalasi Bot Canva Premium (Lengkap)

Panduan ini akan membimbing Anda dari nol hingga bot berjalan 100% (Vercel + GitHub Actions + Turso).

---

## 📋 Prasyarat (Wajib Punya)
1.  **Akun GitHub** (untuk simpan kode & jalankan Auto-Invite).
2.  **Akun Vercel** (untuk hosting bot Telegram).
3.  **Akun Turso** (Database SQLite gratis & cepat).
4.  **Bot Telegram Baru** (Dapat token dari @BotFather).
5.  **Akun Canva Pro / Edu** (yang bisa invite member).
6.  **Node.js & Git** (terinstall di Laptop/PC untuk setup awal).

---

## 🛠️ Tahap 1: Setup Database (Turso)
1.  Login ke [Turso.tech](https://turso.tech).
2.  Buat Database baru (misal: `bot-canva-db`).
3.  Klik tombol **Connect** -> Ambil:
    - **Database URL** (`libsql://...`)
    - **Auth Token** (Klik "Generate Token").
4.  Simpan kedua data ini, kita butuh nanti.

---

## 💻 Tahap 2: Setup Local (Di Laptop)

### 1. Download/Clone Script
Buka terminal/CMD, lalu jalankan:
```bash
git clone https://github.com/username/repo-anda.git
cd repo-anda
npm install
```

### 2. Atur Environment Variable (.env)
Buat file `.env` di folder root, isi dengan data Anda:
```env
BOT_TOKEN=123456:ABC-DEF... (Dari BotFather)
ADMIN_ID=123456789 (ID Telegram Anda, cek di @userinfobot)
TURSO_DATABASE_URL=libsql://nama-db-anda.turso.io
TURSO_AUTH_TOKEN=eyJh... (Token Panjang)
LOG_CHANNEL_ID=-100123456789 (ID Channel untuk Log Bot)
FORCE_SUB_CHANNELS="@channelwajib" (Optional, bisa diset nanti di bot)
```

### 3. Push Database Schema
Jalankan perintah ini untuk membuat tabel di Turso:
```bash
npx turso db shell <URL_TURSO> "auth <TOKEN_TURSO>; .read migrations/schema.sql"
```
*Atau jika pakai CLI Turso:*
```bash
turso db shell bot-canva-db < migrations/schema.sql
```

---

## ☁️ Tahap 3: Deploy Bot ke Vercel
1.  Push kode Anda ke GitHub (Repository Private disarankan).
2.  Buka **Vercel Dashboard** -> **Add New Project**.
3.  Import Repository GitHub tadi.
4.  Di bagian **Environment Variables**, masukkan semua data dari Tahap 2.2 (`BOT_TOKEN`, `TURSO...`, dll).
5.  Klik **Deploy**.
6.  Setelah sukses, masuk ke Dashboard Project -> **Settings** -> **Functions** -> Ubah Region ke `Singapore` (biar cepat) -> Save.
7.  **Set Webhook**:
    Buka browser, akses URL ini:
    `https://nama-project-anda.vercel.app/api/webhook`
    *(Jika muncul "Webhook set!", berarti Bot sudah online!)*

---

## 🤖 Tahap 4: Setup GitHub Actions (Auto-Invite)
Fitur "Auto-Invite" & "Auto-Kick" berjalan di GitHub Actions.

1.  Buka Repo GitHub Anda -> **Settings** -> **Secrets and variables** -> **Actions**.
2.  Klik **New Repository Secret**.
3.  Masukkan data berikut (sama seperti di .env):
    - `TURSO_DATABASE_URL`
    - `TURSO_AUTH_TOKEN`
    - `BOT_TOKEN`
    - `LOG_CHANNEL_ID`
    - `GH_PAT` (Personal Access Token - Lihat Tahap 5)

---

## 🔑 Tahap 5: Token GitHub (Penting!)
Agar bot bisa memicu invite otomatis (instant), butuh Token GitHub.

1.  Buka [GitHub Token Settings](https://github.com/settings/tokens).
2.  Generate New Token (Classic).
3.  Centang **`repo`** (Full control).
4.  Copy Token-nya (mulai dengan `ghp_...`).
5.  Masukkan ke Secrets GitHub (Tahap 4) dengan nama `GH_PAT`.
6.  Masukkan juga ke Vercel Env dengna nama `GITHUB_TOKEN`.
    - Tambahkan juga `GITHUB_USERNAME` dan `GITHUB_REPO` di Vercel Env.

---

## ⚙️ Tahap 6: Konfigurasi Bot (Final)
Sekarang bot sudah jalan, saatnya setting via Telegram.

1.  **Set Admin**: Pastikan `ADMIN_ID` di Env Vercel sudah benar.
2.  **Login Canva (Cookie)**:
    - Buka Canva.com (Login akun Pro/Edu) di PC.
    - Tekan `F12` -> `Network` -> Refresh.
    - Cari request apa saja (misal `bootstrap`), klik **Headers**.
    - Copy isi `Cookie: ...`.
    - Di Bot: Kirim `/set_cookie` lalu paste cookie-nya (atau upload file `.txt` isi cookie).
3.  **Set Channel Wajib (Force Sub)**:
    - Pastikan Bot sudah jadi **Admin** di channel target.
    - Ketik: `/set_channels @channel1, @channel2`.

---

## ✅ Selesai! Cara Pakai:
1.  **User**: Klik `/start` -> Pilih Paket -> `/aktivasi email`.
2.  **Sistem**:
    - Bot cek poin/paket.
    - Bot kirim request ke GitHub Actions.
    - GitHub Actions login Canva & kirim invite email.
    - User dapat notifikasi "Undangan Dikirim".

**Selamat! Bot Canva Premium Anda sudah siap menghasilkan cuan/poin!** 🚀💸
