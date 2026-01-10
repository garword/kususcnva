import { sql } from '../lib/db';

async function check() {
    console.log("🔍 Checking Expired Subscriptions...");

    const res = await sql(`
        SELECT id, user_id, end_date, status, 
               datetime('now') as db_now_utc,
               datetime('now', '+7 hours') as db_now_wib
        FROM subscriptions 
        WHERE status = 'active'
    `);

    console.log(`Found ${res.rows.length} active subscriptions.`);

    for (const sub of res.rows) {
        // Safe accessors
        const endDateStr = sub.end_date as string | null;
        const dbNowUtcStr = sub.db_now_utc as string | null;
        const dbNowWibStr = sub.db_now_wib as string | null;

        if (!endDateStr || !dbNowUtcStr) {
            console.log(`Skipping Sub ID ${sub.id}: Missing date data`);
            continue;
        }

        const endDate = new Date(endDateStr).getTime();
        const dbNow = new Date(dbNowUtcStr).getTime();

        console.log(`------------------------------------------------`);
        console.log(`UserID: ${sub.user_id}`);
        console.log(`End Date (DB): ${endDateStr}`);
        console.log(`DB Now (UTC):  ${dbNowUtcStr}`);
        console.log(`DB Now (WIB):  ${dbNowWibStr}`);

        // Comparison using STRINGS (ISO Format) is safe if same timezone
        // But here we suspect DB Date might be WIB-in-UTC-Format
        if (endDateStr < dbNowUtcStr) {
            console.log(`⚠️ EXPIRED (UTC Check) - Should be kicked!`);
        } else {
            console.log(`✅ Active (Not Expired in UTC Eyes)`);
        }
    }
}

check();
