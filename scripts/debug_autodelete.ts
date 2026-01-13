import { sql } from '../lib/db';
import { TimeUtils } from '../src/lib/time';

async function checkLogic() {
    console.log("🕒 Debugging Auto-Delete Logic...");

    // 1. JS Side (Write Logic)
    const nowReal = new Date();
    const nowWIB_JS = TimeUtils.nowWIB();
    const deleteTime = new Date(nowWIB_JS);
    deleteTime.setMinutes(deleteTime.getMinutes() + 2);
    const deleteAtStr = deleteTime.toISOString().replace('T', ' ').substring(0, 19);

    console.log(`[JS] System Time (UTC?): ${nowReal.toISOString()}`);
    console.log(`[JS] Calculated WIB Time: ${nowWIB_JS.toISOString()}`);
    console.log(`[JS] Target Delete Time (+2m): ${deleteAtStr}`);

    // 2. DB Side (Read Logic)
    // We expect this to correspond to WIB "Now"
    const dbNowRes = await sql(`SELECT datetime('now', '+7 hours') as now_wib, datetime('now') as now_utc`);
    const dbNowWIB = dbNowRes.rows[0].now_wib;
    const dbNowUTC = dbNowRes.rows[0].now_utc;

    console.log(`[DB] DB Time (UTC): ${dbNowUTC}`);
    console.log(`[DB] DB Time (WIB): ${dbNowWIB}`);

    // 3. Comparison
    console.log("\n--- Comparison ---");
    console.log(`Target Delete (String): ${deleteAtStr}`);
    console.log(`Current Threshold (DB): ${dbNowWIB}`);

    if (deleteAtStr < (dbNowWIB as string)) {
        console.error("❌ ISSUE: Delete Time is SMALLER than Current DB Time.");
        console.error("   Result: Message will be deleted IMMEDIATELY.");
    } else {
        console.log("✅ CHECK PASSED: Delete Time is LARGER than Current DB Time.");
        console.log("   Result: Message will wait 2 minutes.");
    }

}

checkLogic();
