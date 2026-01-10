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
        // GANTI URL INI
        const targetUrl = 'https://kususcnva.vercel.app/api/ping';
        const cronUrl = 'https://kususcnva.vercel.app/api/cron';

        // 0. Trigger Cron Check (Async) - Cek Expired & Kick
        ctx.waitUntil(fetch(cronUrl).catch(e => console.error("Cron failed:", e)));

        // Cloudflare Cron minimal 1 menit. 
        // Agar interval terasa seperti ~5 detik, kita lakukan "Burst Ping" (Looping) di sini.
        // Note: Worker Free Tier dibatasi durasi ~30 detik. Kita set 5-6x ping.

        const loopCount = 6;
        const delayMs = 5000; // 5 detik

        console.log(`⏰ Cron Triggered: Starting Burst Ping (${loopCount}x per min)...`);

        // Gunakan ctx.waitUntil agar worker tidak dimatikan paksa saat sleep
        ctx.waitUntil((async () => {
            for (let i = 1; i <= loopCount; i++) {
                try {
                    const resp = await fetch(targetUrl);
                    console.log(`   📡 Ping #${i}: Status ${resp.status}`);
                } catch (e) {
                    console.error(`   ❌ Ping #${i} Error: ${e.message}`);
                }

                // Delay 5 detik (kecuali running terakhir)
                if (i < loopCount) {
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }
            console.log("✅ Burst Ping Finished.");
        })());
    }
};
