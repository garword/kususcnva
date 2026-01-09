import { bot } from "./bot";
import dotenv from "dotenv";
import http from "http";

dotenv.config();

// 1. DUMMY SERVER (Agar Render/Koyeb mendeteksi App aktif)
// Render butuh aplikasi bind ke port tertentu ($PORT).
const port = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end("Bot Canva is Running! (Polling Mode)");
});

server.listen(port, () => {
    console.log(`🌐 Server listening on port ${port}`);
});

// 2. START BOT (Polling Mode)
bot.api.deleteWebhook({ drop_pending_updates: true })
    .then(() => {
        console.log("✅ Webhook dihapus. Memulai mode Polling...");
        console.log("🚀 Bot berjalan di komputer lokal!");
        return bot.start();
    })
    .catch((err) => {
        console.error("Gagal memulai bot:", err);
    });
