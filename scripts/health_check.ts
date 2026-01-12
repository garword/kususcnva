
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
        const accounts = await sql("SELECT COUNT(*) as count FROM canva_accounts");
        const activeAccounts = await sql("SELECT COUNT(*) as count FROM canva_accounts WHERE is_active=1");

        console.log("📊 Table Status:");
        console.log(`   - Users: ${users.rows[0].count}`);
        console.log(`   - Subscriptions: ${subs.rows[0].count}`);
        console.log(`   - Settings: ${settings.rows[0].count}`);
        console.log(`   - Canva Accounts: ${accounts.rows[0].count} (Active: ${activeAccounts.rows[0].count})`);

        // 3. Check Account Details
        const totalSlotsRes = await sql("SELECT SUM(max_slots) as max, SUM(member_count) as used FROM canva_accounts WHERE is_active=1");
        const used = totalSlotsRes.rows[0].used || 0;
        const max = totalSlotsRes.rows[0].max || 0;

        console.log("⚙️ Account Stats:");
        console.log(`   - Global Capacity: ${used} / ${max}`);

        const lastSync = await sql("SELECT value FROM settings WHERE key='last_sync_at'");
        console.log(`   - Last Sync: ${lastSync.rows[0]?.value || 'Never'}`);

        console.log("✅ Health Check Passed!");
        process.exit(0);
    } catch (e: any) {
        console.error("❌ Health Check Failed:", e.message);
        process.exit(1);
    }
})();
