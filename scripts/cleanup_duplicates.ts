import { sql } from '../lib/db';

async function cleanup() {
    console.log("🧹 Starting Duplicate Cleanup...");

    try {
        // 1. Get all active subscriptions ordered by ID DESC (keep latest)
        // We select ALL active subscriptions
        const res = await sql("SELECT * FROM subscriptions WHERE status = 'active' ORDER BY user_id, id DESC");
        const subs = res.rows;

        const seen = new Set();
        let deletedCount = 0;

        console.log(`🔍 Checking ${subs.length} active subscriptions...`);

        for (const sub of subs) {
            // Identifier for "Duplicate": Same User, Same Product, Same End Date (Day Level)
            // If the bug caused them, they likely have very similar end dates.
            // We use substring(0, 10) to match YYYY-MM-DD

            const endDateStr = String(sub.end_date).substring(0, 10);
            const key = `${sub.user_id}_${sub.product_id}_${endDateStr}`;

            if (seen.has(key)) {
                console.log(`🗑️ Deleting duplicate sub ${sub.id} (User: ${sub.user_id}, End: ${sub.end_date})`);
                await sql("DELETE FROM subscriptions WHERE id = ?", [sub.id]);
                deletedCount++;
            } else {
                seen.add(key);
            }
        }

        console.log(`✅ Cleanup Done. Deleted ${deletedCount} duplicates.`);
    } catch (e: any) {
        console.error("❌ Cleanup Failed:", e.message);
    }
}

cleanup();
