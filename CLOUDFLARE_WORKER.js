export default {
    // 1. Jika diakses lewat Browser (Manual Trigger)
    async fetch(request, env, ctx) {
        // GANTI URL INI dengan domain Vercel Anda sendiri
        const targetUrl = 'https://kususcnva.vercel.app/api/ping';

        try {
            const response = await fetch(targetUrl);
            const text = await response.text();
            return new Response(`✅ Ping Berhasil!\nStatus: ${response.status}\nResponse: ${text}`, {
                status: 200,
                headers: { "content-type": "text/plain" }
            });
        } catch (err) {
            return new Response(`❌ Ping Gagal: ${err.message}`, { status: 500 });
        }
    },

    // 2. Jika dijalankan otomatis oleh Cron Cloudflare (Scheduled)
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

        // --- 3. PING VERCEL (KEEP ALIVE) ---
        // Optional: Tetap jalankan ping ke Vercel agar "panas"
        const targetUrl = 'https://kususcnva.vercel.app/api/ping';

        // Burst Ping (Simulate traffic)
        const loopCount = 4; // Dikurangi agar tidak overload worker time
        const delayMs = 5000;

        ctx.waitUntil((async () => {
            for (let i = 1; i <= loopCount; i++) {
                try {
                    await fetch(targetUrl);
                    console.log(`[Ping] #${i} Sent.`);
                } catch (e) {
                    console.error(`[Ping] Error: ${e.message}`);
                }
                if (i < loopCount) await new Promise(r => setTimeout(r, delayMs));
            }
        })());
    }
};
