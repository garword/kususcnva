/**
 * Cloudflare Worker: Auto-Trigger Session Rolling (GitHub Actions)
 * 
 * ⚙️ SETTING JADWAL (CRON TRIGGER):
 * Agar berjalan OTOMATIS setiap 1 Hari (Daily) jam 00:00 WIB:
 * Masukkan Cron ini di Cloudflare Dashboard > Triggers:
 * 
 *    0 17 * * *
 * 
 * (Penjelasan: 17:00 UTC = 00:00 WIB Hari Berikutnya)
 */

export default {
    async scheduled(event, env, ctx) {
        // Log to confirm Daily execution
        console.log("📅 Daily Trigger Executed (1 Hari Sekali)");

        // Log Current Time in WIB
        const wibTime = new Date().toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
            hour12: false
        }) + " WIB";

        console.log(`[${wibTime}] ⏰ Cron Trigger Fired: Refreshing Sessions...`);

        const GH_REPO = "garword/kususcnva"; // Your Username/Repo
        const GH_TOKEN = env.GH_PAT; // Set this in Cloudflare Secrets!

        // Call GitHub API to Dispatch Event
        const response = await fetch(`https://api.github.com/repos/${GH_REPO}/dispatches`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GH_TOKEN}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Cloudflare-Worker"
            },
            body: JSON.stringify({
                event_type: "refresh-sessions"
            })
        });

        if (response.ok) {
            console.log("✅ Successfully triggered GitHub Action.");
        } else {
            console.error(`❌ Failed to trigger: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(text);
        }
    },

    // Fallback for manual testing via URL
    async fetch(request, env, ctx) {
        await this.scheduled(null, env, ctx);
        return new Response("Manual Trigger Executed. Check Logs.");
    }
};
