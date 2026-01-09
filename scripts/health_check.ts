
import { sql } from '../lib/db';

(async () => {
    console.log("🏥 Starting Health Check...");

    try {
        // 1. Check Connection
        const timeRes = await sql("SELECT datetime('now') as now");
        console.log(`✅ Database Connected! Server Time: ${timeRes.rows[0].now}`);

        // 2. Check Tables
        const users = await sql("SELECT COUNT(*) as count FROM users");
        const subs = await sql("SELECT COUNT(*) as count FROM subscriptions");
        const settings = await sql("SELECT COUNT(*) as count FROM settings");

        console.log("📊 Table Status:");
        console.log(`   - Users: ${users.rows[0].count}`);
        console.log(`   - Subscriptions: ${subs.rows[0].count}`);
        console.log(`   - Settings: ${settings.rows[0].count}`);

        // 3. Check Settings Keys
        const teamCount = await sql("SELECT value FROM settings WHERE key='team_member_count'");
        const lastSync = await sql("SELECT value FROM settings WHERE key='last_sync_at'");

        console.log("⚙️ Key Settings:");
        console.log(`   - Team Count: ${teamCount.rows[0]?.value || 'Not Set'}`);
        console.log(`   - Last Sync: ${lastSync.rows[0]?.value || 'Never'}`);

        console.log("✅ Health Check Passed!");
        process.exit(0);
    } catch (e: any) {
        console.error("❌ Health Check Failed:", e.message);
        process.exit(1);
    }
})();
