// @ts-nocheck
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as puppeteerCore from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Setup Puppeteer
const puppeteer = addExtra(puppeteerCore as any);
puppeteer.use(StealthPlugin());

// Chrome Path Logic
const findChromeParams = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\" + process.env.USERNAME + "\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
];

function getChromePath() {
    if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
    for (const path of findChromeParams) {
        try { if (fs.existsSync(path)) return path; } catch (e) { continue; }
    }
    return null;
}

async function syncMemberCount() {
    console.log("🔄 Starting Member Count Sync...");

    const chromePath = getChromePath();
    if (!chromePath) throw new Error("Chrome not found!");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: process.env.CI ? 'new' : false,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--start-maximized',
            '--disable-notifications'
        ]
    });

    try {
        const page = await browser.newPage();

        // Restore Session
        if (fs.existsSync('auth_cookies.json')) {
            const cookies = JSON.parse(fs.readFileSync('auth_cookies.json', 'utf-8'));
            await page.setCookie(...cookies);
        }

        // Navigate
        console.log("navigating to Settings...");
        const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
        const teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value : null;
        const peopleUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : `https://www.canva.com/settings/people`;

        await page.goto(peopleUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Auto Scroll Loop (Full Load)
        console.log("   📜 Scrolling to load all members...");
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    (window as any).scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= 25000) { clearInterval(timer); resolve(); } // High limit for safety
                    if (((window as any).innerHeight + (window as any).scrollY) >= (document as any).body.scrollHeight - 50) {
                        // At bottom
                    }
                }, 50);
            });
        });
        await new Promise(r => setTimeout(r, 2000));

        // Count Members
        // We count TRs in tbody. Assuming one TR per member.
        const memberCount = await page.$$eval('tbody tr', rows => rows.length);

        console.log(`✅ Detected ${memberCount} members (Including Invites).`);

        // Check Pending vs Active (Optional but good for stats)
        const counts = await page.evaluate(() => {
            let pending = 0;
            const rows = Array.from(document.querySelectorAll('tbody tr'));
            rows.forEach(r => {
                if (r.innerText.toLowerCase().includes('invited') || r.innerText.toLowerCase().includes('diundang')) pending++;
            });
            return { total: rows.length, pending, active: rows.length - pending };
        });

        console.log(`   📊 Detail: ${counts.active} Active, ${counts.pending} Pending.`);

        // Sync to DB
        // Update total_members in settings
        // If key doesn't exist, insert it.
        await sql(`
            INSERT INTO settings (key, value) 
            VALUES ('team_member_count', ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [counts.total.toString()]);

        // Also save pending count for dashboard
        await sql(`
            INSERT INTO settings (key, value) 
            VALUES ('team_pending_count', ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [counts.pending.toString()]);

        await sql(`
            INSERT INTO settings (key, value) 
            VALUES ('last_sync_at', ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [new Date().toISOString()]);

        console.log("💾 Database Updated Successfully.");

    } catch (e: any) {
        console.error("❌ Sync Failed:", e);
    } finally {
        setTimeout(() => browser.close(), 2000);
    }
}

syncMemberCount();
