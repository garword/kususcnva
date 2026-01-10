
import { sql } from '../lib/db';

async function migrate() {
    try {
        console.log("Adding last_message_id column to users table...");
        await sql("ALTER TABLE users ADD COLUMN last_message_id TEXT");
        console.log("✅ Column added successfully.");
    } catch (e: any) {
        if (e.message.includes("duplicate column")) {
            console.log("ℹ️ Column already exists.");
        } else {
            console.error("❌ Migration failed:", e);
        }
    }
}

migrate();
