import { sql } from '../lib/db';

async function verify() {
    try {
        const res = await sql("SELECT name FROM sqlite_master WHERE type='table' AND name='canva_accounts'");
        if (res.rows.length > 0) {
            console.log("✅ Table canva_accounts EXISTS!");
            // Check data
            const data = await sql("SELECT * FROM canva_accounts");
            console.log("📊 Data:", data.rows);
        } else {
            console.log("❌ Table canva_accounts MISSING.");
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
verify();
