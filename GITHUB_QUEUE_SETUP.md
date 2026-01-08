# Setup GitHub Actions Queue System (Auto Invite + Auto Kick)

Sistem ini memungkinkan bot Vercel (Serverless) untuk melakukan invite dan kick menggunakan Puppeteer yang dijalankan di GitHub Actions.

## 📋 Langkah 1: Push Code Terbaru
Push semua perubahan terbaru ke GitHub repo Anda:
```bash
git add .
git commit -m "Implement Queue System"
git push origin main
```

## 📋 Langkah 2: Setup GitHub Secrets
Buka repo GitHub Anda -> **Settings** -> **Secrets and variables** -> **Actions**.
Tambahkan secrets berikut (jika belum ada):

| Secret Name | Value | Description |
|---|---|---|
| `TURSO_DATABASE_URL` | `libsql://...` | URL Database Turso |
| `TURSO_AUTH_TOKEN` | `...` | Token Database Turso |
| `BOT_TOKEN` | `...` | Token Bot Telegram |
| `ADMIN_ID` | `...` | ID Telegram Admin |
| `LOG_CHANNEL_ID` | `-100xxxx` | ID Channel/Group Log (Opsional) |

## 📋 Langkah 3: Setup Environment Variables di Vercel
Agar bot bisa men-trigger GitHub Actions secara instan, tambahkan Environment Variables ini di Vercel:

| Variable Name | Value | Description |
|---|---|---|
| `GITHUB_USERNAME` | Username GitHub Anda | Contoh: `budi123` |
| `GITHUB_REPO` | Nama Repo | Contoh: `bot-canva` |
| `GITHUB_TOKEN` | **Personal Access Token** | Lihat langkah pembuatan di bawah |

### 🔑 Cara Membuat GitHub Personal Access Token (Classic)
1. Buka [GitHub Token Settings](https://github.com/settings/tokens).
2. Klik **Generate new token (classic)**.
3. Beri nama (misal: `bot-trigger`).
4. Centang scope **`repo`** (Full control of private repositories).
5. Generate dan copy tokennya.
6. Masukkan ke Vercel env var `GITHUB_TOKEN`.

## 🚀 Cara Kerja
1. User melakukan pembayaran / Admin ketik `/test_invite [email]`.
2. Bot menyimpan request ke database dengan status `pending_invite`.
3. Bot men-trigger GitHub Action `process_queue`.
4. GitHub Action jalan, membuka browser, login Canva, dan mengirim invite.
5. GitHub Action mengupdate status user jadi `active` dan kirim notifikasi Telegram.
6. Jika ada user expired, Action yang sama akan otomatis meng-kick mereka.

## 🧪 Test Manual
1. Pastikan bot Vercel sudah dideploy ulang dengan code baru.
2. Ketik `/test_invite emailmu@gmail.com`.
3. Cek tab **Actions** di GitHub repo, workflow "Process Queue" harusnya mulai berjalan.
4. Tunggu ~2 menit hingga invite masuk.
