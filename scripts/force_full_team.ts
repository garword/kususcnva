
import { sql } from '../lib/db';

(async () => {
    console.log("🛠️ FORCING TEAM FULL STATE...");
    // await sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('team_member_count', '500')");
    // Multi-Account Update: Fill the first account
    const res = await sql("SELECT id FROM canva_accounts WHERE is_active = 1 LIMIT 1");
    if (res.rows.length > 0) {
        await sql("UPDATE canva_accounts SET member_count = 500 WHERE id = ?", [res.rows[0].id]);
        console.log(`✅ Set Account #${res.rows[0].id} member_count = 500`);
    } else {
        console.log("❌ No active account found to fill.");
    }

    // Add a dummy active sub expiring tomorrow for "Next Slot" calculation
    await sql("INSERT OR IGNORE INTO users (id, username, first_name) VALUES (99999, 'TestUser', 'Test')");
    await sql("INSERT OR IGNORE INTO products (id, name, price, duration_days) VALUES (1, 'Test Plan', 0, 30)");
    await sql("INSERT OR REPLACE INTO subscriptions (id, user_id, product_id, start_date, end_date, status) VALUES ('test_full', 99999, 1, datetime('now'), datetime('now', '+1 day'), 'active')");
    console.log("✅ Added dummy active subscription expiring in 1 day.");
})();
