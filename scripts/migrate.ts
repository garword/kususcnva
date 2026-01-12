import { sql } from '../lib/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    try {
        console.log("🚀 Starting Migration: add_canva_accounts...");

        const migrationPath = path.join(__dirname, '../migrations/add_canva_accounts.sql');
        const query = fs.readFileSync(migrationPath, 'utf-8');

        // Split by semicolon to run statements sequentially (simple split)
        // Note: This is a basic split, complex queries might need better parsing but sufficient for this.
        const statements = query.split(';').map(s => s.trim()).filter(s => s.length > 0);

        for (const statement of statements) {
            console.log(`Executing: ${statement.substring(0, 50)}...`);
            await sql(statement);
        }

        console.log("✅ Migration Success!");

        // Verify
        const check = await sql("SELECT * FROM canva_accounts");
        console.log("📊 Current Accounts:", check.rows);

    } catch (e: any) {
        console.error("❌ Migration Failed:", e.message);
    }
}

runMigration();
