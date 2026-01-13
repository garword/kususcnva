import { bot } from "../src/bot";

async function diagnose() {
    console.log("🏥 Starting Bot Diagnosis...");
    try {
        console.log("✅ Bot instance imported successfully.");

        const info = await bot.api.getMe();
        console.log(`✅ Bot Connected: @${info.username} (ID: ${info.id})`);

        console.log("✅ Diagnosis Complete. Bot is runnable.");
    } catch (error: any) {
        console.error("❌ Diagnosis Failed:", error);
        process.exit(1);
    }
}

diagnose();
