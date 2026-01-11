
import { sql } from '../lib/db';
import { TimeUtils } from '../src/lib/time';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function runHealthCheck() {
    console.log("🏥 STARTING FINAL SYSTEM HEALTH CHECK...");
    let errors = 0;

    // 1. CHECK CONFIG
    console.log("\n1️⃣  Checking Environment Variables...");
    const requiredVars = ['BOT_TOKEN', 'ADMIN_ID', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];
    requiredVars.forEach(v => {
        if (!process.env[v]) {
            console.error(`   ❌ MISSING: ${v}`);
            errors++;
        } else {
            console.log(`   ✅ FOUND: ${v}`);
        }
    });

    // 2. CHECK TIMEZONE
    console.log("\n2️⃣  Checking Timezone Logic...");
    try {
        const nowWIB = TimeUtils.format();
        console.log(`   ✅ Curren Time (WIB): ${nowWIB}`);
        if (!nowWIB.includes('WIB')) {
            console.error(`   ❌ Time format seems wrong!`);
            errors++;
        }
    } catch (e: any) {
        console.error(`   ❌ TimeUtils Error: ${e.message}`);
        errors++;
    }

    // 3. CHECK DATABASE CONNECTION
    console.log("\n3️⃣  Checking Database Connection (Turso)...");
    try {
        const start = Date.now();
        const res = await sql("SELECT 1 as val");
        const duration = Date.now() - start;
        if (res.rows[0].val === 1) {
            console.log(`   ✅ DB Connected! (Ping: ${duration}ms)`);
        } else {
            console.error(`   ❌ DB Query returned unexpected value.`);
            errors++;
        }
    } catch (e: any) {
        console.error(`   ❌ DB Connection FAILED: ${e.message}`);
        errors++;
    }

    // 4. CHECK CRITICAL FILES EXISTENCE
    console.log("\n4️⃣  Checking Critical Files...");
    const files = [
        'src/bot.ts',
        'scripts/process_queue.ts',
        'scripts/auto_kick.ts',
        'migrations/schema.sql',
        'CLOUDFLARE_WORKER.js'
    ];
    files.forEach(f => {
        if (fs.existsSync(f)) console.log(`   ✅ Found: ${f}`);
        else {
            console.error(`   ❌ MISSING FILE: ${f}`);
            errors++;
        }
    });

    console.log("\n========================================");
    if (errors === 0) {
        console.log("✅ SYSTEM ALL GREEN! READY DEPLOY.");
    } else {
        console.log(`⚠️ FOUND ${errors} ERRORS. PLEASE FIX.`);
    }
    console.log("========================================");
}

runHealthCheck();
