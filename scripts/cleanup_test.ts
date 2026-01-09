
import { sql } from '../lib/db';

(async () => {
    console.log("🧹 Cleaning up test data...");

    // Delete dummy subscription
    await sql("DELETE FROM subscriptions WHERE id = 'test_full'");
    console.log("✅ Deleted dummy subscription.");

    // Delete dummy user
    await sql("DELETE FROM users WHERE id = 99999");
    console.log("✅ Deleted dummy user.");
})();
