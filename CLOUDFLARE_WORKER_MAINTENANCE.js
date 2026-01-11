export default {
    async scheduled(event, env, ctx) {
        // --- 1. CONFIGURATION ---
        const GITHUB_OWNER = 'garword';
        const GITHUB_REPO = 'kususcnva';
        const GITHUB_TOKEN = env.GH_PAT; // WAJIB DISET DI CLOUDFLARE ENV!

        // Helper: Format Jam WIB
        const nowWIB = () => new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

        // --- 2. TRIGGER GITHUB ACTION ---
        console.log(`[${nowWIB()}] ⏰ Cron Triggered: Triggering GitHub Action (process_queue)...`);

        const ghUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`;
        const ghPayload = {
            event_type: "process_queue",
            client_payload: {
                timestamp: new Date().toISOString(),
                friendly_time: nowWIB(),
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
                if (res.ok) console.log(`[${nowWIB()}] ✅ GitHub Action Triggered Successfully!`);
                else console.error(`[${nowWIB()}] ❌ Failed to trigger GH: ${res.status} ${await res.text()}`);
            })
            .catch(e => console.error(`[${nowWIB()}] ❌ Error triggering GH:`, e));

        ctx.waitUntil(triggerGithub);
    },

    // Optional: Fetch handler just to say "I'm alive"
    async fetch(request, env, ctx) {
        return new Response("Maintenance Trigger Worker Active", { status: 200 });
    }
};
