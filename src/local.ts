import { bot } from "./bot";
import dotenv from "dotenv";

dotenv.config();

// Hapus webhook jika pernah diset (agar polling tidak bentrok)
bot.api.deleteWebhook({ drop_pending_updates: true })
    .then(() => {
        console.log("✅ Webhook dihapus. Memulai mode Polling...");
        console.log("🚀 Bot berjalan di komputer lokal!");
        return bot.start();
    })
    .catch((err) => {
        console.error("Gagal memulai bot:", err);
    });
