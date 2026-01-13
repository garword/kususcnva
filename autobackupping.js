/**
 * Cloudflare Worker: Auto Backup DB
 * Trigger: Cron Trigger (e.g. "0 * * * *") -> Hourly
 */

export default {
    async scheduled(event, env, ctx) {
        console.log("⏰ Backup Cron Triggered...");

        // Configuration from Worker Environment Variables
        // Set these in Cloudflare Dashboard -> Settings -> Variables
        const TARGET_URL = env.BACKUP_ENDPOINT; // e.g. https://your-bot.vercel.app/api/backup_cron
        const SECRET = env.CRON_SECRET;         // e.g. YourSecretKey

        if (!TARGET_URL || !SECRET) {
            console.error("❌ Missing Environment Variables: BACKUP_ENDPOINT or CRON_SECRET");
            return;
        }

        const url = `${TARGET_URL}?secret=${SECRET}`;

        try {
            const response = await fetch(url);
            const result = await response.json();

            console.log("✅ Backup Response:", result);

            if (response.status !== 200) {
                console.error("⚠️ Backup Endpoint Error:", result);
            }

        } catch (err) {
            console.error("❌ Fetch Error:", err.message);
        }
    },

    // Handle incoming HTTP requests
    async fetch(request, env, ctx) {
        return new Response('✅ <b>Backup Worker is Online!</b><br>This worker runs automatically via Cron Trigger.<br>Do not trigger manually usually.', {
            headers: { 'content-type': 'text/html' },
        });
    }
};
