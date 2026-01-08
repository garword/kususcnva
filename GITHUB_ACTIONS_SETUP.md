# Setup GitHub Actions Auto-Kick

## 📋 Langkah Setup (5 Menit)

### 1. Push Code ke GitHub
```bash
git add .
git commit -m "Add GitHub Actions auto-kick"
git push origin main
```

### 2. Setup GitHub Secrets
Buka: `https://github.com/[username]/[repo]/settings/secrets/actions`

Tambahkan secrets berikut:
- `TURSO_DATABASE_URL` → URL database Turso Anda
- `TURSO_AUTH_TOKEN` → Auth token Turso
- `BOT_TOKEN` → Token Telegram bot
- `ADMIN_ID` → ID Telegram admin Anda

### 3. Test Manual Run
1. Buka tab **Actions** di GitHub repo
2. Pilih workflow "Auto Kick Expired Users"
3. Klik **Run workflow** → **Run workflow**
4. Tunggu ~2-3 menit, cek hasilnya

### 4. Otomatis Jalan Setiap Jam
- Workflow akan otomatis jalan setiap jam (menit ke-0)
- Anda akan dapat notifikasi Telegram setelah selesai

## 🧪 Test Lokal (Opsional)
```bash
npm run auto-kick
```

## 📊 Monitoring
- Cek log di tab **Actions**
- Notifikasi dikirim ke Telegram admin
- Database `users` table diupdate (status: kicked)

## ⚙️ Kustomisasi Schedule
Edit file `.github/workflows/auto-kick.yml`:
```yaml
on:
  schedule:
    - cron: '0 */6 * * *'  # Setiap 6 jam
    # atau
    - cron: '0 0 * * *'    # Setiap hari jam 00:00
```

## 🔧 Troubleshooting
- Jika gagal, cek **Actions logs** untuk detail error
- Pastikan semua secrets sudah diisi dengan benar
- Test lokal dulu dengan `npm run auto-kick`
