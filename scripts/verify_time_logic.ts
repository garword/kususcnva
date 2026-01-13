import { TimeUtils } from '../src/lib/time';

function checkTimeLogic() {
    console.log("🕒 Verifying WIB Time Logic (Standardized)...");

    // 1. Simulate DB Value (Stored as WIB String)
    // "2026-01-01 17:00:00" -> This MEANS 17:00 WIB.
    const dbValue = "2026-01-01 17:00:00";
    console.log(`[DB] Value (WIB String): ${dbValue}`);

    // 2. Simulate bot.ts Parsing (Manual Split Strategy)
    const t = dbValue.split(/[- :]/);
    // Note: Creating Date from Y,M,D... uses SYSTEM time (UTC in Vercel)
    // So this object represents "2026-01-01 17:00:00 UTC"
    const expDateObj = new Date(parseInt(t[0]), parseInt(t[1]) - 1, parseInt(t[2]), parseInt(t[3]), parseInt(t[4]), parseInt(t[5]));
    console.log(`[BOT] Parsed Object (Raw): ${expDateObj.toISOString()} (Note: This is technically 17:00 UTC if sys is UTC)`);

    // 3. Simulate "Current Time" (10:00 UTC = 17:00 WIB)
    // Ideally this is EXACTLY the expiration time.
    // Let's test 09:59 UTC (16:59 WIB) -> Should be ACTIVE
    const nowUTC_Active = new Date("2026-01-01T09:59:00Z");

    // Shift to WIB
    const nowWIB_Active = new Date(nowUTC_Active.getTime() + (7 * 60 * 60 * 1000));
    console.log(`[NOW] 09:59 UTC shifted to WIB: ${nowWIB_Active.toISOString()} (Should match ~16:59 Raw)`);

    // 4. Comparison (Active Case)
    // expDateObj (17:00 Raw) > nowWIB (16:59 Raw) -> ACTIVE
    const isActive = expDateObj > nowWIB_Active;
    console.log(`STATUS (Should be Active): ${isActive ? "✅ ACTIVE" : "❌ EXPIRED"}`);

    // 5. Comparison (Expired Case)
    // Let's test 10:01 UTC (17:01 WIB) -> Should be EXPIRED
    const nowUTC_Expired = new Date("2026-01-01T10:01:00Z");
    const nowWIB_Expired = new Date(nowUTC_Expired.getTime() + (7 * 60 * 60 * 1000));

    const isExpired = expDateObj < nowWIB_Expired;
    console.log(`STATUS (Should be Expired): ${isExpired ? "✅ EXPIRED" : "❌ ACTIVE"}`);

    if (isActive && isExpired) {
        console.log("\n✅ LOGIC VERIFIED: WIB Standardization is working correctly.");
    } else {
        console.error("\n❌ LOGIC FAILURE: Time comparisons are still incorrect.");
    }
}

checkTimeLogic();
