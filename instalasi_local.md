# 🏠 Panduan Instalasi Lokal (Tanpa Vercel)

Jika Anda ingin menjalankan bot di server sendiri (VPS/RDP) atau PC lokal 24/7 tanpa menggunakan Vercel, ikuti panduan ini.

**Keunggulan Deploy Lokal:**
- **Respons Lebih Cepat**: Menggunakan metode Long Polling (bukan Webhook), bot merespon instan.
- **Kontrol Penuh**: Tidak kena limit serverless function (timeout 10s).
- **Automation Stabil**: Bisa invite langsung tanpa menunggu trigger GitHub Actions (opsional).

---

## 📋 Persiapan (Wajib)
1.  **Node.js LTS** (Versi 18+).
2.  **Git**.
3.  **Google Chrome** (Browser asli untuk Puppeteer).
4.  **Database URL** (Bisa pakai Turso online atau SQLite lokal).
5.  **PM2** (Process Manager agar bot jalan terus di background).
    - Install via terminal:
      ```bash
      npm install -g pm2
      ```

---

## 🛠️ Tahap 1: Setup & Config
1.  **Clone Repo**:
    ```bash
    git clone https://github.com/username/repo-anda.git
    cd repo-anda
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **File Environment (.env)**:
    Buat file `.env` dan isi:
    ```env
    BOT_TOKEN=123456:ABC-DEF...
    ADMIN_ID=123456789
    
    # Pilih Database (Salah Satu)
    # A. Pakai Turso (Disarankan agar data aman):
    TURSO_DATABASE_URL=libsql://...
    TURSO_AUTH_TOKEN=ey...
    
    # B. Pakai SQLite Lokal (File):
    # TURSO_DATABASE_URL=file:./local.db
    
    # Config Tambahan
    LOG_CHANNEL_ID=-100...
    FORCE_SUB_CHANNELS="@channel1, @channel2"
    
    # Path Chrome (Jika tidak terdeteksi otomatis)
    # CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    ```

4.  **Setup Database**:
    Jika pakai Turso:
    ```bash
    npx turso db shell <URL> "auth <TOKEN>; .read migrations/schema.sql"
    ```
    Jika pakai SQLite Lokal (belum ada file):
    *Anda perlu menjalankan script migrasi manual atau pakai tool SQLite database browser untuk execute isi `migrations/schema.sql`.*

---

## 🚀 Tahap 2: Menjalankan Bot (Via PM2)

Kita gunakan **PM2** agar bot otomatis restart jika crash atau server reboot.

1.  **Start Bot Utama**:
    Jalankan perintah ini di terminal folder project:
    ```bash
    pm2 start "npm run dev:local" --name "bot-canva"
    ```
    *(Bot sekarang sudah online! Cek di Telegram)*

2.  **Start Queue Processor (Auto-Invite)**:
    Kita perlu menjalankan script invite secara berkala (misal tiap 5 menit).
    PM2 punya fitur Cron built-in.
    
    Jalankan:
    ```bash
    pm2 start "npm run process-queue" --name "canva-queue" --cron "*/5 * * * *" --no-autorestart
    ```
    *Penjelasan: `--cron "*/5 * * * *"` artinya script akan dijalankan setiap 5 menit.*

3.  **Start Auto-Kick (User Expired)**:
    Jalankan script kick tiap 1 jam:
    ```bash
    pm2 start "npm run auto-kick" --name "canva-kick" --cron "0 * * * *" --no-autorestart
    ```

4.  **Simpan Config PM2**:
    Agar jalan otomatis setelah restart PC/VPS:
    ```bash
    pm2 save
    pm2 startup
    ```

---

## 📊 Monitoring & Maintenance

- **Cek Status**:
  ```bash
  pm2 status
  ```
- **Lihat Log (Error/Info)**:
  ```bash
  pm2 logs bot-canva
  pm2 logs canva-queue
  ```
- **Stop Bot**:
  ```bash
  pm2 stop all
  ```
- **Update Bot (Setelah edit koding)**:
  ```bash
  git pull
  pm2 restart all
  ```

---

## 💡 Troubleshooting
- **Error: Chrome not found**:
  Pastikan Google Chrome terinstall. Jika masih error, set variable `CHROME_PATH` di `.env` ke lokasi file `chrome.exe` atau `google-chrome-stable`.
- **Bot tidak respon**: Cek `pm2 logs bot-canva`. Kemungkinan token salah atau koneksi internet putus.
- **Database Locked**: Jika pakai SQLite lokal (`file:./local.db`), pastikan tidak ada proses lain yang mengunci file db secara bersamaan. Turso lebih disarankan untuk multi-process (Bot + Queue).

Selamat! Bot Anda kini berjalan mandiri di server lokal. 🖥️🔥
