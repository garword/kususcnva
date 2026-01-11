import { sql } from '../lib/db';
import fs from 'fs';
import path from 'path';

async function migrate() {
    console.log("🚀 Starting Local to Turso Migration...");

    // 1. Migrate Cookies
    const cookiePath = path.resolve(__dirname, '../auth_cookies.json');
    if (fs.existsSync(cookiePath)) {
        console.log("📦 Found 'auth_cookies.json'. Migrating...");
        const content = fs.readFileSync(cookiePath, 'utf-8');
        let finalValue = content;

        try {
            // Minify if JSON
            const json = JSON.parse(content);
            // If Puppeteer format, convert to simple string or keep as JSON string
            // The bot supports both, but let's just save the raw content
        } catch (e) { }

        await sql(`
            INSERT INTO settings (key, value) VALUES ('canva_cookie', ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [finalValue]);
        console.log("   ✅ Cookies migrated to DB!");
    } else {
        console.log("   ℹ️ No 'auth_cookies.json' found. Skipping.");
    }

    // 2. Migrate User Agent
    const uaPath = path.resolve(__dirname, '../auth_user_agent.txt');
    if (fs.existsSync(uaPath)) {
        console.log("📦 Found 'auth_user_agent.txt'. Migrating...");
        const ua = fs.readFileSync(uaPath, 'utf-8').trim();

        if (ua) {
            await sql(`
                INSERT INTO settings (key, value) VALUES ('canva_user_agent', ?) 
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `, [ua]);
            console.log("   ✅ User-Agent migrated to DB!");
        }
    } else {
        console.log("   ℹ️ No 'auth_user_agent.txt' found. Skipping.");
    }

    console.log("🏁 Migration Complete. Your data is now in Turso.");
}

migrate().catch(console.error);
