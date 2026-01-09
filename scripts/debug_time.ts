import { sql } from '../lib/db';

async function checkTime() {
    console.log("🕒 Checking Timezone...");

    // Get DB time
    const dbTime = await sql("SELECT datetime('now') as utc, datetime('now', 'localtime') as local, date('now', '-1 hour') as minus_one");
    console.log("DB Time:", dbTime.rows[0]);

    // Get Users
    const users = await sql("SELECT email, joined_at, datetime(joined_at) as joined_utc FROM users LIMIT 5");
    console.log("\nUsers Sample:");
    console.table(users.rows);
}

checkTime();
