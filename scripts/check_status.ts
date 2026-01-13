import { bot } from "../src/bot";
import axios from "axios";

async function checkStatus() {
    console.log("🔍 Checking System Status...");

    // 1. Check Webhook Info from Telegram
    try {
        const info = await bot.api.getWebhookInfo();
        console.log("📨 Webhook Info:", info);
    } catch (e: any) {
        console.error("❌ Failed to get Webhook Info:", e.message);
    }

    // 2. Ping Vercel Endpoint (Stealth Ping)
    try {
        // Assuming URL based on prior context or env.
        // If not known, we skip, but user mentioned kususcnva.vercel.app previously.
        const url = "https://kususcnva.vercel.app/api/webhook";
        console.log(`🌐 Pinging ${url}...`);
        const start = Date.now();
        const res = await axios.get(url, { timeout: 10000 });
        console.log(`✅ Endpoint Responded: ${res.status} ${res.statusText} (${Date.now() - start}ms)`);
        console.log("📄 Content Preview:", res.data.substring(0, 100)); // Should be HTML
    } catch (e: any) {
        console.error("❌ Endpoint Ping Failed:", e.message);
        if (e.response) {
            console.error("   Status:", e.response.status);
            console.error("   Data:", e.response.data);
        }
    }
}

checkStatus();
