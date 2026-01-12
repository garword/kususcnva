import { sql } from '../lib/db';

async function findExpired() {
    console.log("🕵️ Searching for EXPIRED Users in Database...");

    // 1. Check Users table status
    const usersExpired = await sql("SELECT * FROM users WHERE status = 'expired'");
    if (usersExpired.rows.length > 0) {
        console.log("\n📋 Users with STATUS = 'expired':");
        console.table(usersExpired.rows);
    } else {
        console.log("\n✅ No users with STATUS = 'expired'.");
    }

    // 2. Check Subscriptions table status
    const subsExpired = await sql(`
        SELECT u.email, u.username, s.status as sub_status, s.end_date 
        FROM subscriptions s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.status = 'expired'
    `);

    if (subsExpired.rows.length > 0) {
        console.log("\n📋 Users with SUBSCRIPTION = 'expired':");
        console.table(subsExpired.rows);
    } else {
        console.log("\n✅ No users with SUBSCRIPTION = 'expired'.");
    }

    // 3. Check "Ghost Expired" (Active status but expired date) - Just in case
    const ghosts = await sql(`
        SELECT u.email, u.status, s.end_date 
        FROM subscriptions s 
        JOIN users u ON s.user_id = u.id 
        WHERE u.status = 'active' AND s.end_date < datetime('now')
    `);

    if (ghosts.rows.length > 0) {
        console.log("\n👻 Potential Ghost Expired (Active Status but Date Passed):");
        console.table(ghosts.rows);
    }
}

findExpired();
