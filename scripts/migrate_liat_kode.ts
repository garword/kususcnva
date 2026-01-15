
import { sql } from '../lib/db';

async function runSubscriptionMigration() {
    try {
        console.log("Running Migration: Add 'account_id' to subscriptions...");
        await sql(`ALTER TABLE subscriptions ADD COLUMN account_id INTEGER DEFAULT NULL`);
        console.log("✅ Added account_id to subscriptions");
    } catch (e: any) {
        if (e.message.includes("duplicate column")) {
            console.log("ℹ️ Column 'account_id' already exists in subscriptions.");
        } else {
            console.error("❌ Failed to add account_id:", e.message);
        }
    }
}

async function runAccountMigration() {
    try {
        console.log("Running Migration: Add 'invite_code' to canva_accounts...");
        await sql(`ALTER TABLE canva_accounts ADD COLUMN invite_code TEXT DEFAULT NULL`);
        console.log("✅ Added invite_code to canva_accounts");
    } catch (e: any) {
        if (e.message.includes("duplicate column")) {
            console.log("ℹ️ Column 'invite_code' already exists in canva_accounts.");
        } else {
            console.error("❌ Failed to add invite_code:", e.message);
        }
    }
}

async function migrate() {
    await runSubscriptionMigration();
    await runAccountMigration();
    console.log("🏁 Migration Complete.");
}

migrate();
