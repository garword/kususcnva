# 🎨 Bot Canva Premium (Serverless V2.3)

![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=flat-square&logo=vercel)
![Cloudflare Workers](https://img.shields.io/badge/Trigger-Cloudflare_Workers-orange?style=flat-square&logo=cloudflare)
![Database](https://img.shields.io/badge/Database-Turso_(LibSQL)-teal?style=flat-square&logo=sqlite)
![Timezone](https://img.shields.io/badge/Timezone-WIB_(UTC%2B7)-green?style=flat-square)

Bot Telegram canggih untuk otomatisasi undangan tim Canva Pro/Edu, dibangun dengan arsitektur **Serverless** yang hemat biaya dan performa tinggi.

---

## ✨ Fitur Unggulan

*   **⚡ Otomatisasi Penuh**: Dari pendaftaran, pembayaran (poin), hingga invite Canva.
*   **🌍 WIB Synchronized**: Seluruh sistem berjalan konsisten di zona waktu Indonesia Barat (UTC+7).
*   **🛡️ Anti-Banned System**: Login hybrid (Password + Cookie) & navigasi cerdas.
*   **📡 Serverless Architecture**:
    *   **Bot**: Hosting via Vercel (Webhook).
    *   **Cron**: Dipicu oleh Cloudflare Worker (Presisi Tinggi).
    *   **Eksekutor**: GitHub Actions (Puppeteer).

---

## 🛠️ Prasyarat

Sebelum memulai, pastikan Anda memiliki:

1.  **Akun Vercel**: Untuk hosting bot Telegram.
2.  **Akun Turso**: Database SQLite serverless (Gratis).
3.  **Akun Cloudflare**: Untuk memicu cron job (Worker).
4.  **Akun GitHub**: Menyimpan kode & menjalankan action.
5.  **Bot Token**: Dari [@BotFather](https://t.me/BotFather).

---

## 🚀 Instalasi Cepat

### 1. Setup Database (Turso)
Buat database di Turso, lalu jalankan migrasi tabel:
```bash
npm install
npm run migrate
```
*(Pastikan `.env` sudah terisi `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN`)*

### 2. Deploy ke Vercel
```bash
vercel login
vercel link
vercel env pull .env.production
vercel deploy --prod
```
Jangan lupa set Webhook setelah deploy:
```bash
npm run set-webhook
```

### 3. Setup Cloudflare Worker (PENTING!)
Cloudflare Worker bertugas sebagai "jantung" yang memicu pengecekan expired setiap menit.
1.  Buat Worker baru di Cloudflare.
2.  Copy kode dari file `CLOUDFLARE_WORKER.js`.
3.  Set Environment Variable `GH_PAT` di Cloudflare.
4.  Set Trigger Cron (misal: `* * * * *` untuk tiap menit).

---

## 👮 Perintah Admin (Commands)

| Command | Deskripsi |
| :--- | :--- |
| `/admin` | Membuka Panel Admin visual (Menu Button). |
| `/set_cookie` | Update cookie akun Canva (tanpa restart bot). |
| `/set_channel` | Mengatur channel untuk notifikasi log & force sub. |
| `/tesexp` | **[NEW]** Simulasi user expired (Debug Mode).<br>Format: `/tesexp email@user.com` atau `/tesexp 5` (5 menit). |
| `/data` | Download backup data user dalam format `.txt`. |
| `/broadcast` | Kirim pesan massal ke seluruh user bot. |

---

## 📂 Struktur Project

```
├── api/
│   ├── webhook.ts       # Titik masuk (Entry Point) dari Telegram
│   └── ping.ts          # Endpoint Health Check
├── src/
│   └── bot.ts           # Logika Utama Bot (Handlers, Menus)
├── scripts/
│   ├── process_queue.ts # Script Utama (Invite/Kick) via GitHub Actions
│   └── auto_kick.ts     # Script Pembersihan Member Expired
├── CLOUDFLARE_WORKER.js # Script Pemicu Cron (Deploy ke CF)
└── vercel.json          # Konfigurasi Deployment
```

---

## 💡 Troubleshooting

*   **Bot tidak merespon?** Cek apakah Webhook sudah diset (`npm run set-webhook`).
*   **Auto-Kick tidak jalan?** Pastikan Cloudflare Worker aktif dan `GH_PAT` valid.
*   **Timezone ngaco?** Sistem V2.3 sudah memaksa `Asia/Jakarta` di semua lini. Tidak perlu setup manual.

---

Made with ❤️ by **Garword**