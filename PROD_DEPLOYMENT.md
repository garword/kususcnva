# 🚀 Panduan Deployment Lengkap ke Vercel (Production)

Panduan ini akan membantu Anda mengupload bot ke **Vercel** dari nol sampai jalan 100%.

---

## 📋 1. Persiapan Awal

Pastikan Anda sudah memiliki:
1.  **Akun Vercel**: Daftar di [vercel.com](https://vercel.com).
2.  **Akun GitHub**: Kode bot sudah di-upload ke repository GitHub.
3.  **Database Turso**: Database sudah ready dan termigrasi (`npm run migrate`).
4.  **Vercel CLI**: Install tool Vercel di terminal laptop Anda.

**Cara Install Vercel CLI:**
```bash
npm install -g vercel
```
*Cek instalasi dengan ketik `vercel --version`*

---

## ⚙️ 2. Hubungkan Project ke Vercel

1.  Buka terminal di folder project bot (`E:\hasilkuuy\bot canva`).
2.  Login ke Vercel:
    ```bash
    vercel login
    ```
    *(Pilih login via GitHub/Email, lalu authorize di browser)*

3.  Link Project:
    ```bash
    vercel link
    ```
    - **Set up?**: `Y`
    - **Scope**: (Pilih akun Anda)
    - **Existing Project?**: `N` (Buat baru)
    - **Project Name**: `bot-canva` (atau nama lain)
    - **Root Directory**: `./` (Enter saja)

---

## 🔑 3. Setup Environment Variables (Rahasia Bot)

Sama seperti `.env` di lokal, Vercel butuh data rahasia ini agar bot bisa jalan.

### Cara Cepat (Lewat Terminal):
Copy-paste perintah ini satu per satu (ganti nilainya dengan data asli Anda):

```bash
vercel env add BOT_TOKEN production
# Masukkan token bot Anda

vercel env add TURSO_DATABASE_URL production
# Masukkan URL Turso (libsql://...)

vercel env add TURSO_AUTH_TOKEN production
# Masukkan Token Turso

vercel env add ADMIN_ID production
# Masukkan ID Telegram Admin

vercel env add ADMIN_CHANNEL_ID production
# Masukkan ID Channel Log (contoh: -100xxxx)
```

*(Opsional: Bisa juga setting manual di Dashboard Vercel > Settings > Environment Variables)*

---

## 🚀 4. Upload / Deploy ke Production

Sekarang saatnya meng-online-kan bot!

1.  Jalankan perintah deploy:
    ```bash
    vercel deploy --prod
    ```
2.  Tunggu proses build selesai (sekitar 1-2 menit).
3.  Jika sukses, Anda akan dapat link **Production**, contoh: 
    `https://bot-canva.vercel.app`

**Simpan link tersebut!** Domain ini adalah alamat rumah bot Anda di internet.

---

## 🔗 5. Pasang Webhook (WAJIB!)

Agar bot bisa membalas chat, kita harus menyambungkan Telegram ke Vercel.

**PENTING:** 
Kita sudah punya script praktis untuk ini. Tidak perlu buka browser manual.

1.  Pastikan Anda masih di folder project.
2.  Jalankan perintah ini:
    ```bash
    npm run set-webhook
    ```
    
    *Script akan meminta input:*
    - **Bot Token**: (isi token bot)
    - **Vercel Domain**: (isi domain dari langkah 4, misal `https://bot-canva.vercel.app`) - **Tanpa /api/webhook, cuma domain depan saja!**

3.  Jika muncul pesan **"Webhook set successfully"**, berarti bot SUDAH AKTIF! 🎉

---

## ✅ 6. Test Bot

1.  Buka Telegram.
2.  Chat ke bot Anda: `/start`.
3.  Cek menu Admin: `/admin`.
4.  Coba command baru: `/data` (Harusnya bot kirim file laporan).

---

## 🔄 7. Jika Ada Update (Cara Update)

Setiap kali Anda mengubah kode (misal tambah fitur baru):
1.  **Commit & Push** ke GitHub (untuk backup).
2.  **Deploy Ulang** ke Vercel:
    ```bash
    vercel deploy --prod
    ```
Bot akan otomatis ter-update dalam 1-2 menit tanpa perlu set webhook lagi.

---

## 🛠️ Troubleshooting (Jika Error)

-   **Bot tidak merespon?** 
    - Cek status webhook: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`
    - Cek log error Vercel: `vercel logs`
-   **Database Error?**
    - Pastikan `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` benar di Vercel Env.
-   **Cookie Mati?**
    - Gunakan command `/set_cookie` di Telegram untuk update, tidak perlu redeploy Vercel.
