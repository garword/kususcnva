import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

export const sql = async (query: string, args: any[] = []) => {
    try {
        const result = await db.execute({ sql: query, args });
        return result;
    } catch (error: any) {
        console.error("Database Error:", error.message);
        throw error;
    }
};

async function cleanupDuplicates() {
    console.log("🧹 Starting Duplicate Subscription Cleanup...");

    try {
        // 1. Find Users with Duplicate Active Subscriptions
        const duplicates = await sql(`
            SELECT user_id, product_id, COUNT(*) as count 
            FROM subscriptions 
            WHERE status = 'active' 
            GROUP BY user_id, product_id 
            HAVING count > 1
        `);

        if (duplicates.rows.length === 0) {
            console.log("✅ No duplicates found!");
            return;
        }

        console.log(`⚠️ Found ${duplicates.rows.length} users with duplicates.`);

        for (const row of duplicates.rows) {
            const userId = row.user_id;
            const prodId = row.product_id;

            // 2. Fetch all subs for this user & product
            const subs = await sql(`
                SELECT id, end_date 
                FROM subscriptions 
                WHERE user_id = ? AND product_id = ? AND status = 'active' 
                ORDER BY end_date DESC
            `, [userId, prodId]);

            // Keep the FIRST one (Latest End Date due to DESC sort)
            const toKeep = subs.rows[0];
            const toDelete = subs.rows.slice(1);

            console.log(`   👤 User ID ${userId}: Keeping ${toKeep.id} (Exp: ${toKeep.end_date})`);

            // 3. Delete the rest
            for (const sub of toDelete) {
                console.log(`      🗑️ Deleting duplicate ${sub.id} (Exp: ${sub.end_date})`);
                await sql("DELETE FROM subscriptions WHERE id = ?", [sub.id]);
            }
        }

        console.log("✅ Cleanup Complete!");

    } catch (error) {
        console.error("❌ Cleanup Failed:", error);
    }
}

cleanupDuplicates();
