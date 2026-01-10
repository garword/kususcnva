# 🤖 KONTEKS & ARAHAN UNTUK AI AGENT (DEVELOPER)

File ini dibuat untuk membantu **AI Agent berikutnya** memahami konteks, aturan main, dan logika vital dari project Bot Canva ini. 
**BACA INI SEBELUM MEMBUAT PERUBAHAN CODE!**

---

## 🏗️ Tech Stack & Konteks
*   **Platform**: Telegram Bot (Grammy.js).
*   **Language**: TypeScript (Strict Mode).
*   **Database**: Turso (LibSQL) - Remote Database (Region: Japan).
*   **Automation**: Puppeteer (Chromium) untuk login & invite Canva.
*   **Deployment**: Vercel (Serverless Function) & GitHub Actions (Cron Jobs).

---

## 🧠 Logika Inti V2 (JANGAN DIHAPUS/DIUBAH SEMBARANGAN)

### 1. Strict Package Selection (Wajib Pilih Paket)
*   User **WAJIB** memilih paket (1 Bulan/6 Bulan) di "Menu Paket" sebelum `/aktivasi`.
*   **Mekanisme**: Saat tombol paket diklik, `selected_product_id` diupdate di DB.
*   **RESET**: Setelah sukses aktivasi/masuk queue, `selected_product_id` **WAJIB DIRESET KE NULL**. (Lihat `handleActivation`).
*   **Tujuan**: Mencegah user mengaktifkan ulang paket lama secara tidak sengaja.

### 2. Validasi Durasi Ketat (Cap 12 Bulan)
*   Sistem menghitung **Predicted End Date** (Hari Ini + Sisa Durasi + Paket Baru).
*   Jika hasil > **370 Hari** (1 Tahun + Buffer), request **DITOLAK**.
*   **Variable**: Pastikan tidak ada duplikasi deklarasi variable `extendDays`.

### 3. Dynamic UI
*   **Profil Saya**: Label paket berubah jadi "Premium (±X Bulan)" jika sisa durasi > 35 hari.
*   **Daftar Akun**: Label paket berubah jadi "User Premium" jika sisa durasi > 35 hari.
*   **Kode**: Ada casting tipe `(sub.plan_name as string)` di `bot.ts` line ~1150 untuk menghindari error TS `null is not assignable to string`.

### 4. Database Resilience (Retry Logic)
*   Koneksi ke Turso kadang timeout (`ConnectTimeoutError`).
*   **Solusi**: Fungsi `sql()` di `lib/db.ts` memiliki loop **Retry 3x** dengan jeda 1.5 detik.
*   **Jangan hapus handling ini**, atau bot akan sering crash saat network unstable.

---

## 🚫 Critical Rules (Aturan Pantangan)

1.  **Jangan Hapus `(v2)` Marker**: Pesan sukses/gagal di `bot.ts` menggunakan marker `(v2)`. Ini vital untuk debugging user (tahu kode sudah terupdate atau belum).
2.  **Hati-hati dengan Date Object**:
    *   Gunakan `new Date()` JavaScript daripada `datetime('now')` SQL untuk kalkulasi presisi.
    *   Timezone bot default adalah `Asia/Jakarta`.
3.  **Jangan Hardcode ID Produk sembarangan**:
    *   ID 1 = Free (1 Bulan)
    *   ID 3 = Premium (6 Bulan)
    *   ID 4 = Premium (12 Bulan / Stacking)
4.  **Mode Serverless vs Local**:
    *   File `src/local.ts` hanya untuk dev local (Polling).
    *   File `api/webhook.ts` entry point Vercel.
    *   Fitur berat (Puppeteer) berjalan di **GitHub Actions**, bukan di Vercel (Timeout Limit).

---

## ⚠️ Common Issues & Troubleshooting

*   **Error `fetch failed` / `ConnectTimeoutError`**:
    *   Biasanya masalah jaringan bot -> Turso. Sistem retry sudah menangani ini tapi jika persisten, cek status Turso.
*   **Error TypeScript `Type 'Value' is not assignable...`**:
    *   Hasil query LibSQL seringkali bertipe `Value` (bisa string/number/null).
    *   **Solusi**: Selalu lakukan casting eksplisit, misal: `row.column as string` atau `String(row.column)`.
*   **Gagal Deploy Vercel**:
    *   Pastikan tidak ada error TS (`npm run build`).

---

## 📝 To-Do / Pengembangan Kedepan

*   Jika diminta menambah fitur baru, pastikan integrasikan dengan **Sistem Retry DB** dan **Strict Selection Flow**.
*   Selalu update `fitur.md` jika ada perubahan logika yang visible ke user.

---
*Dibuat oleh Agent Pendahulu (Antigravity) - Jan 2026*
