export default {
    async scheduled(event, env, ctx) {
        // GANTI URL INI dengan domain Vercel Anda (Direct Bot Endpoint)
        const targetUrl = 'https://kususcnva.vercel.app/api/webhook';

        console.log(`[KeepAlive] Pinging ${targetUrl}...`);

        try {
            const start = Date.now();
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
                }
            });
            const duration = Date.now() - start;

            if (response.ok) {
                console.log(`[KeepAlive] ✅ Success! Status: ${response.status} (${duration}ms)`);
            } else {
                console.error(`[KeepAlive] ❌ Failed! Status: ${response.status}`);
            }
        } catch (err) {
            console.error(`[KeepAlive] ❌ Network Error: ${err.message}`);
        }
    },

    // Allow manual trigger via Browser too
    async fetch(request, env, ctx) {
        await this.scheduled(null, env, ctx);
        return new Response("✅ Keep-Alive Ping Sent! Check Logs.");
    }
};
