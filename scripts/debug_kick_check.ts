import { sql } from '../lib/db';

async function checkUser(email: string) {
    console.log(`🔎 Checking User: "${email}"...`);

    // Flexible search
    const exactRes = await sql("SELECT * FROM users WHERE email = ?", [email]);
    if (exactRes.rows.length > 0) {
        console.log("✅ Exact Match Found:", exactRes.rows[0]);
    } else {
        console.log("❌ No Exact Match.");
        const similarRes = await sql("SELECT * FROM users WHERE email LIKE ?", [`%${email.split('@')[0]}%`]);
        if (similarRes.rows.length > 0) {
            console.log("⚠️ Found Similar Users:", similarRes.rows);
        }
    }

    // Check Whitelist Logic Simulation
    console.log("\n🧪 Simulating Whitelist Logic...");
    const whitelistRes = await sql(`
        SELECT email, status FROM users 
        WHERE status = 'active' OR status = 'pending_invite'
    `);

    const whitelistSet = new Set(whitelistRes.rows.map((r: any) => (r.email || "").trim().toLowerCase()));

    const isSafe = whitelistSet.has(email.toLowerCase());
    console.log(`🛡️ Is "${email.toLowerCase()}" in Whitelist? ${isSafe ? "YES (SAFE)" : "NO (KICKABLE)"}`);

    if (!isSafe) {
        console.log("   ⚠️ Reason: Email not found in 'active' or 'pending_invite' list.");
        console.log("   Current Whitelist Sample:", Array.from(whitelistSet).slice(0, 5));
    }
}

checkUser('nouckyemail2@gmail.com');
