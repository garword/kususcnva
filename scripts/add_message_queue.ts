import { sql } from '../lib/db';

async function migrate() {
    console.log("🛠️ Adding message_queue table...");
    try {
        await sql(`
            CREATE TABLE IF NOT EXISTS message_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                message_id INTEGER NOT NULL,
                delete_at TEXT NOT NULL
            )
        `);
        console.log("✅ message_queue table created.");
    } catch (e) {
        console.error("❌ Error:", e);
    }
}

migrate();
