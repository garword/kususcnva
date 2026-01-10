import { sql } from '../lib/db';

async function check() {
    const userId = 6242090623;
    console.log(`🔍 Checking Subscriptions for User ${userId}...`);

    const res = await sql(`SELECT id, user_id, product_id, start_date, end_date, status, canva_team_id FROM subscriptions WHERE user_id = ?`, [userId]);

    if (res.rows.length === 0) {
        console.log("❌ No subscriptions found for this user.");
    } else {
        console.log(`Found ${res.rows.length} rows for User ${userId}:`);
        console.table(res.rows);
    }
}

check();
