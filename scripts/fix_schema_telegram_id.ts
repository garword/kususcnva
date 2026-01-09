import { sql } from '../lib/db';

async function fixSchema() {
    console.log("🔧 Fixing database schema (adding telegram_id column)...");
    try {
        await sql(`ALTER TABLE users ADD COLUMN telegram_id INTEGER`);
        console.log("✅ Added 'telegram_id' column to users table.");
    } catch (e: any) {
        if (e.message.includes("duplicate column name")) {
            console.log("ℹ️ Column 'telegram_id' already exists.");
        } else {
            console.error("❌ Failed to alter table:", e.message);
        }
    }
}

fixSchema();
