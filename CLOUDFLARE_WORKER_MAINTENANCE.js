export default {
    async scheduled(event, env, ctx) {
        // --- 1. CONFIGURATION ---
        const GITHUB_OWNER = 'garword';
        const GITHUB_REPO = 'kususcnva';
        const GITHUB_TOKEN = env.GH_PAT; // WAJIB DISET DI CLOUDFLARE ENV!

        // --- 2. TRIGGER GITHUB ACTION ---
        console.log(`[Cron] Triggering GitHub Action: process_queue...`);

        const ghUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`;
        const ghPayload = {
            event_type: "process_queue",
            client_payload: {
                timestamp: new Date().toISOString(),
                source: "cloudflare_worker"
            }
        };

        const triggerGithub = fetch(ghUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'Cloudflare-Worker-Cron'
            },
            body: JSON.stringify(ghPayload)
        })
            .then(async res => {
                if (res.ok) console.log("[Cron] ✅ GitHub Action Triggered Successfully!");
                else console.error(`[Cron] ❌ Failed to trigger GH: ${res.status} ${await res.text()}`);
            })
            .catch(e => console.error("[Cron] ❌ Error triggering GH:", e));

        ctx.waitUntil(triggerGithub);
    },

    // Optional: Fetch handler just to say "I'm alive"
    async fetch(request, env, ctx) {
        return new Response("Maintenance Trigger Worker Active", { status: 200 });
    }
};
