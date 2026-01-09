# 🚀 Panduan Deployment ke Render.com (Gratis)

Render adalah alternatif terbaik untuk Vercel karena mendukung **Polling Mode** (lebih stabil).

## 1. Persiapan
Pastikan kode terbaru sudah di-push ke GitHub (saya sudah tambahkan dukungan Server khusus Render).

## 2. Setup di Render.com
1.  Klik **New +** > Pilih **Web Service**.
2.  Pilih **Build and deploy from a Git repository**.
3.  Connect akun **GitHub** Anda -> Pilih repo `kususcnva`.
4.  isi form berikut:
    - **Name**: `bot-canva` (bebas)
    - **Region**: Singapore (biar cepat)
    - **Branch**: `main`
    - **Runtime**: `Node`
    - **Build Command**: `npm install`
    - **Start Command**: `npm start`
    - **Instance Type**: `Free`

## 3. Environment Variables (PENTING!)
Scroll ke bawah, cari bagian **Environment Variables**, klik **Add Environment Variable**. Tambahkan satu per satu:

| Key | Value (Isi sesuai data Anda) |
| :--- | :--- |
| `BOT_TOKEN` | Token BotBotFather |
| `TURSO_DATABASE_URL` | URL Database Turso |
| `TURSO_AUTH_TOKEN` | Token Database Turso |
| `ADMIN_ID` | ID Telegram Admin |
| `ADMIN_CHANNEL_ID` | ID Channel Log |

*(Note: CANVA_EMAIL & CANVA_PASSWORD **TIDAK PERLU** di Render, karena yang invite otomatis adalah GitHub Actions)*

## 4. Deploy
Klik **Create Web Service**.
- Render akan mulai build & deploy. Tunggu 2-3 menit.
- Jika sukses, status akan menjadi **Available**.

## 5. Cegah Bot "Tidur" (Keep-Alive)
Render Free Tier akan "menidurkan" bot jika tidak ada yang akses selama 15 menit.
Solusinya pakai **Cloudflare Worker** yang tadi:

1.  Buka Script Cloudflare Worker Anda (`CLOUDFLARE_WORKER.js`).
2.  Ganti URL targetnya dengan URL Render Anda (Contoh: `https://bot-canva.onrender.com`).
3.  Deploy Worker.

Selesai! Bot Anda sekarang 24/7 Gratis di Render.
