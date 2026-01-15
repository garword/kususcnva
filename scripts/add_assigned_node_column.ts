// Migration: Add assigned_node_id column to users table
// Purpose: Track which Canva node each user is assigned to, preventing cross-node duplicates
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';

dotenv.config();

async function migrate() {
    console.log("🔧 Migration: Adding assigned_node_id column to users table...");

    try {
        // Add column if not exists (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
        // We try-catch to handle case where column already exists
        await sql(`ALTER TABLE users ADD COLUMN assigned_node_id INTEGER`);
        console.log("✅ Column 'assigned_node_id' added successfully!");
    } catch (e: any) {
        if (e.message.includes("duplicate column name")) {
            console.log("⚠️ Column 'assigned_node_id' already exists. Skipping.");
        } else {
            throw e;
        }
    }

    console.log("✅ Migration complete!");
}

migrate().catch(console.error);
