import { sql } from '../lib/db';

async function forceCleanup() {
    console.log("🧹 Starting FORCE Duplicate Cleanup...");

    try {
        // 1. Get all active subscriptions
        const res = await sql("SELECT * FROM subscriptions WHERE status = 'active' ORDER BY user_id");
        const subs = res.rows;

        // 2. Group by User + Product
        const groups: { [key: string]: any[] } = {};

        for (const sub of subs) {
            const key = `${sub.user_id}_${sub.product_id}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(sub);
        }

        let deletedCount = 0;

        // 3. Process Each Group
        for (const key in groups) {
            const group = groups[key];
            if (group.length > 1) {
                console.log(`🔍 Found ${group.length} duplicates for ${key}...`);

                // SORT: Keep the one with the LATEST end_date (Max Benefit)
                // If dates equal, keep the one with latest ID (created last)
                group.sort((a, b) => {
                    const dateA = new Date(a.end_date as string).getTime();
                    const dateB = new Date(b.end_date as string).getTime();
                    if (dateB !== dateA) return dateB - dateA; // Descending Date
                    return String(b.id).localeCompare(String(a.id)); // Descending ID
                });

                // The first one [0] is the Keeper
                const keeper = group[0];
                const toDelete = group.slice(1);

                console.log(`   ✅ KEEP: ${keeper.id} (Exp: ${keeper.end_date})`);

                for (const d of toDelete) {
                    console.log(`   🗑️ DELETE: ${d.id} (Exp: ${d.end_date})`);
                    await sql("DELETE FROM subscriptions WHERE id = ?", [d.id]);
                    deletedCount++;
                }
            }
        }

        console.log(`✅ Force Cleanup Done. Deleted ${deletedCount} records.`);

    } catch (e: any) {
        console.error("❌ Cleanup Failed:", e.message);
    }
}

forceCleanup();
