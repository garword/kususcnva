
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
dotenv.config();

async function checkUserStatus(email: string) {
    console.log(`Checking status for: ${email}`);
    try {
        const userRes = await sql("SELECT id, email, first_name FROM users WHERE email = ?", [email]);
        if (userRes.rows.length === 0) {
            console.log("❌ User not found.");
            return;
        }
        const user = userRes.rows[0];
        console.log("User:", user);

        const subRes = await sql("SELECT * FROM subscriptions WHERE user_id = ?", [user.id]);
        if (subRes.rows.length === 0) {
            console.log("❌ No subscriptions found.");
        } else {
            console.log("Subscriptions:");
            console.table(subRes.rows);
        }

        // Compare with Current Time (WIB)
        const nowRes = await sql("SELECT datetime('now', '+7 hours') as now_wib");
        console.log("Current DB Time (WIB):", nowRes.rows[0]);

    } catch (e) {
        console.error(e);
    }
}

checkUserStatus('andrianxinn@gmail.com');
