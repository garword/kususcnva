import { sql } from '../lib/db';

async function check() {
    const userId = 6242090623;
    console.log(`🔍 Checking Subscriptions for User ${userId}...`);

    const res = await sql(`SELECT * FROM subscriptions WHERE user_id = ?`, [userId]);

    if (res.rows.length === 0) {
        console.log("❌ No subscriptions found for this user.");
    } else {
        console.table(res.rows);
    }
}

check();
