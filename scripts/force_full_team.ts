
import { sql } from '../lib/db';

(async () => {
    console.log("🛠️ FORCING TEAM FULL STATE...");
    await sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('team_member_count', '500')");
    console.log("✅ Set team_member_count = 500");

    // Add a dummy active sub expiring tomorrow for "Next Slot" calculation
    await sql("INSERT OR IGNORE INTO users (id, username, first_name) VALUES (99999, 'TestUser', 'Test')");
    await sql("INSERT OR IGNORE INTO products (id, name, price, duration_days) VALUES (1, 'Test Plan', 0, 30)");
    await sql("INSERT OR REPLACE INTO subscriptions (id, user_id, product_id, start_date, end_date, status) VALUES ('test_full', 99999, 1, datetime('now'), datetime('now', '+1 day'), 'active')");
    console.log("✅ Added dummy active subscription expiring in 1 day.");
})();
