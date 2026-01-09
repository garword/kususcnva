import { bot } from "../src/bot";
import dotenv from "dotenv";

dotenv.config();

const url = process.argv[2];

if (!url) {
    console.error("❌ Mohon masukkan URL Vercel sebagai argumen!");
    console.error("Contoh: npm run set-webhook https://bot-anda.vercel.app/api/webhook");
    process.exit(1);
}

// Pastikan URL valid
if (!url.startsWith("https://")) {
    console.error("❌ URL harus dimulai dengan https://");
    process.exit(1);
}

console.log(`⏳ Sedang mengatur Webhook ke: ${url}`);

bot.api.setWebhook(url)
    .then(() => {
        console.log("✅ SUKSES! Webhook telah diaktifkan.");
        console.log("Bot sekarang berjalan dalam Mode Production (Vercel).");
        console.log("Untuk kembali ke mode local, cukup jalankan 'npm run dev:local' lagi.");
        process.exit(0);
    })
    .catch((err) => {
        console.error("❌ Gagal set webhook:", err.message);
        process.exit(1);
    });
