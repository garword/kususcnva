import { sql } from '../lib/db';

async function revampDatabase() {
    console.log("🏗️ Starting Database Revamp...");

    // 1. Users Table
    console.log("   Checking 'users' table...");
    await sql(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            language TEXT DEFAULT 'id',
            timezone TEXT DEFAULT 'Asia/Jakarta',
            email TEXT,
            status TEXT DEFAULT 'active',
            role TEXT DEFAULT 'user',
            selected_product_id INTEGER DEFAULT 1,
            referral_code TEXT UNIQUE,
            referred_by INTEGER,
            referral_points INTEGER DEFAULT 0,
            last_message_id TEXT,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Add columns if missing
    try { await sql("ALTER TABLE users ADD COLUMN last_message_id TEXT"); console.log("      + Added last_message_id"); } catch (e) { }
    try { await sql("ALTER TABLE users ADD COLUMN referral_points INTEGER DEFAULT 0"); console.log("      + Added referral_points"); } catch (e) { }
    try { await sql("ALTER TABLE users ADD COLUMN selected_product_id INTEGER DEFAULT 1"); console.log("      + Added selected_product_id"); } catch (e) { }

    // Drop redundant columns (SQLite specific, might fail on old versions but harmless)
    try { await sql("ALTER TABLE users DROP COLUMN telegram_id"); console.log("      - Dropped redundant telegram_id"); } catch (e) { }

    // 2. Subscriptions
    console.log("   Checking 'subscriptions' table...");
    await sql(`
        CREATE TABLE IF NOT EXISTS subscriptions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_date DATETIME NOT NULL,
            status TEXT DEFAULT 'active',
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(product_id) REFERENCES products(id)
        )
    `);

    // Drop dead column
    try { await sql("ALTER TABLE subscriptions DROP COLUMN canva_team_id"); console.log("      - Dropped dead canva_team_id"); } catch (e) { }

    // 3. Products
    console.log("   Checking 'products' table...");
    await sql(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            duration_days INTEGER NOT NULL,
            price INTEGER NOT NULL,
            is_active BOOLEAN DEFAULT 1
        )
    `);

    // 4. Settings
    console.log("   Checking 'settings' table...");
    await sql(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);

    // 5. Transactions
    console.log("   Checking 'transactions' table...");
    await sql(`
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    `);

    console.log("✅ Database Revamp Complete!");
}

revampDatabase();
