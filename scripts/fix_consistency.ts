import { sql } from '../lib/db';
import { TimeUtils } from '../src/lib/time';

async function fixConsistency() {
    console.log("🛠️ Starting Database Consistency Fix...");

    try {
        // 1. Fix Users with 'active' status but NO 'active' subscription
        console.log("   🔍 Checking for 'Active Ghost' users...");

        const ghostUsers = await sql(`
            SELECT u.id, u.email 
            FROM users u 
            LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
            WHERE u.status = 'active' AND s.id IS NULL
        `);

        if (ghostUsers.rows.length > 0) {
            console.log(`   ⚠️ Found ${ghostUsers.rows.length} active users without subscription. Fixing...`);

            for (const user of ghostUsers.rows) {
                const subId = `sub_fix_${Date.now()}_${user.id}`;
                const startStr = TimeUtils.getWIBISOString();
                // Default to 30 days from now
                const endObj = TimeUtils.addDaysWIB(30);
                const endStr = endObj.toISOString().replace('T', ' ').substring(0, 19);

                await sql(`
                    INSERT INTO subscriptions (id, user_id, product_id, start_date, end_date, status)
                    VALUES (?, ?, ?, ?, ?, 'active')
                `, [subId, user.id, 1, startStr, endStr]); // Product 1 = Default/Free

                console.log(`      + Injected Subscription for User ${user.email} (ID: ${user.id})`);
            }
        } else {
            console.log("   ✅ No Ghost Users found.");
        }

        // 2. Fix Subscriptions with 'active' status but PAST end_date
        console.log("   🔍 Checking for Expired Subscriptions still marked 'active'...");
        const expiredSubs = await sql(`
            SELECT id FROM subscriptions 
            WHERE status = 'active' AND end_date < datetime('now', '+7 hours')
        `);

        if (expiredSubs.rows.length > 0) {
            console.log(`   ⚠️ Found ${expiredSubs.rows.length} stale subscriptions. Expiring...`);
            await sql(`
                UPDATE subscriptions SET status = 'expired' 
                WHERE status = 'active' AND end_date < datetime('now', '+7 hours')
             `);
            console.log("      + Updated status to 'expired'.");
        } else {
            console.log("   ✅ No stale subscriptions found.");
        }

        // 3. Ensure Settings Table has defaults
        await sql(`
            INSERT INTO settings (key, value) VALUES 
            ('team_member_count', '0'),
            ('canva_user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
            ON CONFLICT(key) DO NOTHING
        `);
        console.log("   ✅ Settings defaults ensured.");

        // 4. Ensure Schema Columns Exist (Migration)
        // 4. Ensure Schema Columns Exist (Migration)
        console.log("   🔍 Checking for missing schema columns...");

        // Get existing columns
        const tableInfo = await sql("PRAGMA table_info('users')");
        const existingColumns = new Set(tableInfo.rows.map((row: any) => row.name));

        if (!existingColumns.has("last_message_id")) {
            try { await sql("ALTER TABLE users ADD COLUMN last_message_id TEXT"); console.log("      + Added last_message_id"); } catch (e) { }
        }

        if (!existingColumns.has("referral_points")) {
            try { await sql("ALTER TABLE users ADD COLUMN referral_points INTEGER DEFAULT 0"); console.log("      + Added referral_points"); } catch (e) { }
        }

        if (!existingColumns.has("selected_product_id")) {
            try { await sql("ALTER TABLE users ADD COLUMN selected_product_id INTEGER DEFAULT 1"); console.log("      + Added selected_product_id"); } catch (e) { }
        }

        console.log("   ✅ Schema columns ensured.");

        console.log("🎉 Database Consistency Check Complete!");

    } catch (e: any) {
        console.error("❌ Error fixing DB:", e.message);
    }
}

fixConsistency();
