export default {
    // 1. Jika diakses lewat Browser (Manual Trigger)
    async fetch(request, env, ctx) {
        // GANTI URL INI dengan domain Vercel Anda sendiri
        const targetUrl = 'https://bot-canva.vercel.app/api/ping';

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
        // GANTI URL INI
        const targetUrl = 'https://bot-canva.vercel.app/api/ping';

        console.log(`⏰ Cron Triggered: Pinging ${targetUrl}...`);
        try {
            const resp = await fetch(targetUrl);
            console.log(`✅ Ping Status: ${resp.status}`);
        } catch (e) {
            console.error(`❌ Ping Error: ${e.message}`);
        }
    }
};
