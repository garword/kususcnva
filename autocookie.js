/**
 * Cloudflare Worker: Auto-Trigger Session Rolling (GitHub Actions)
 * Trigger: Every 1 Day (e.g. 00:00 UTC)
 */

export default {
    async scheduled(event, env, ctx) {
        console.log("⏰ Cron Trigger Fired: Refreshing Sessions...");

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
