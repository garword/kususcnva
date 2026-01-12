import { sql } from '../lib/db';

async function fixEmail() {
    console.log("🛠️ Fixing Email Typo...");

    const wrongEmail = 'nouckemail2@gmail.com';
    const correctEmail = 'nouckyemail2@gmail.com';

    try {
        const res = await sql("UPDATE users SET email = ? WHERE email = ?", [correctEmail, wrongEmail]);
        console.log(`✅ Update executed. Rows affected: ${res.rowsAffected || 'Unknown'}`);

        // Verify
        const check = await sql("SELECT * FROM users WHERE email = ?", [correctEmail]);
        if (check.rows.length > 0) {
            console.log("🎉 Verification Success! User found:", check.rows[0]);
        } else {
            console.error("❌ Verification Failed. User not found.");
        }

    } catch (e: any) {
        console.error("❌ Error updating DB:", e.message);
    }
}

fixEmail();
