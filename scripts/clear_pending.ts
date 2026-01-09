import { sql } from '../lib/db';

async function clearPending() {
    console.log("🧹 Clearing all 'pending_invite' users from database...");

    try {
        const result = await sql(`DELETE FROM users WHERE status = 'pending_invite'`);
        console.log(`✅ Cleared pending invites. Rows affected: ${result.rowsAffected}`);
    } catch (e) {
        console.error("❌ Failed to clear pending invites:", e);
    }
}

clearPending();
