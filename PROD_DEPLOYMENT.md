# 🚀 Panduan Deployment ke Production (Vercel & GitHub Actions)

Ikuti langkah-langkah ini untuk memindahkan bot dari komputer lokal (dev) ke cloud production yang stabil 24/7.

## 0. Prasyarat Wajib
- [x] Database sudah di-migrasi ke **Turso** (`npm run migrate`).
- [x] Punya akun **Vercel** & **GitHub**.
- [x] Kode sudah di-push ke GitHub Repository.

---

## 1. Deploy Bot ke Vercel (Serverless)
Vercel akan menghandle logika bot Telegram (reply chat, command, admin panel).

1. Buka [Vercel Dashboard](https://vercel.com/) -> **Add New Project**.
2. Import repository GitHub bot ini.
3. Di bagian **Environment Variables**, masukkan data berikut (copy dari `.env` lokal Anda):
   - `BOT_TOKEN`: Token bot dari BotFather.
   - `TURSO_DATABASE_URL`: URL Database Turso (libsql://...).
   - `TURSO_AUTH_TOKEN`: Token Database Turso.
   - `ADMIN_ID`: ID Telegram Admin.
   - `ADMIN_CHANNEL_ID`: ID Channel Log (jika ada).
4. Klik **Deploy**.
5. Setelah sukses, Anda akan dapat domain (contoh: `https://bot-canva.vercel.app`).

### Set Webhook (Wajib!)
Agar bot merespon pesan, Anda harus mendaftarkan URL Vercel ke Telegram.
Buka browser dan akses (ganti `TOKEN` dan `DOMAIN`):
```
https://api.telegram.org/bot<TOKEN_BOT_ANDA>/setWebhook?url=https://<DOMAIN_VERCEL_ANDA>/api/webhook
```
*(Contoh: `https://api.telegram.org/bot123:ABC/setWebhook?url=https://bot-canva.vercel.app/api/webhook`)*

Jika responnya `Webhook was set`, maka bot sudah ONLINE di Vercel! 🎉

---

## 2. Setup Auto-Invite & Auto-Kick (GitHub Actions)
GitHub Actions akan menjalankan skrip Puppeteer (Chrome) setiap jam untuk memproses antrian invite dan mengecek user expired secara otomatis.

1. Buka Repository GitHub Anda -> **Settings** -> **Secrets and variables** -> **Actions**.
2. Klik **New repository secret**.
3. Tambahkan semua secret berikut (SAMA PERSIS dengan di Vercel, ditambah Akun Canva):
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `BOT_TOKEN`
   - `ADMIN_ID`
   - `LOG_CHANNEL_ID` (Sama dengan ADMIN_CHANNEL_ID)
   - **`CANVA_EMAIL`**: Email login akun Canva Pro/Edu Anda.
   - **`CANVA_PASSWORD`**: Password akun Canva Anda.

> ⚠️ **PENTING:** Tanpa `CANVA_EMAIL` & `CANVA_PASSWORD`, bot GitHub tidak bisa login untuk invite/kick user!

---

## 3. Testing Production
- **Bot Vercel**: Coba chat `/start` di Telegram. Bot harus merespon. Coba menu Admin.
- **GitHub Actions**: Masuk tab **Actions** di GitHub. Coba trigger manual workflow "Process Queue" atau "Auto Kick" untuk tes apakah Puppeteer jalan sukses.

**Catatan:** Tombol "Test Auto-Invite" / "Test Auto-Kick" di Admin Panel Bot (Vercel) TIDAK AKAN BERJALAN karena Vercel tidak mendukung Chrome Puppeteer. Anda harus mengandalkan jadwal Cron GitHub Actions atau trigger manual dari tab Actions di GitHub.
