// @ts-nocheck
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as puppeteerCore from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import fs from 'fs';
import { TimeUtils } from '../src/lib/time';

dotenv.config();

// Setup Puppeteer
const puppeteer = addExtra(puppeteerCore as any);
puppeteer.use(StealthPlugin());

const findChromeParams = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\" + process.env.USERNAME + "\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome"
];

function getChromePath() {
    if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
    for (const path of findChromeParams) {
        try { if (fs.existsSync(path)) return path; } catch (e) { continue; }
    }
    return null;
}

// Helper: Sleep
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function refreshSessions() {
    console.log(`[${TimeUtils.format()}] 🔄 Starting Session Rolling (Auto-Save Cookie)...`);

    // 1. Get Active Accounts
    const accountsRes = await sql("SELECT id, cookie, email, team_id FROM canva_accounts WHERE is_active = 1 ORDER BY id ASC");
    const accounts = accountsRes.rows;

    if (accounts.length === 0) {
        console.log("⚠️ No active accounts to refresh.");
        return;
    }

    const chromePath = getChromePath();
    if (!chromePath) throw new Error("Chrome not found!");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: process.env.CI ? 'new' : false,
        args: [
            '--no-sandbox', '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', '--start-maximized',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    try {
        const page = await browser.newPage();

        // Loop Accounts Sequentially
        for (const account of accounts) {
            console.log(`\n============== ROLLING SESSION #${account.id} (${account.email || 'No Email'}) =================`);
            try {
                // A. Prepare Cookies
                let cookies: any[] = [];
                const cookieStr = account.cookie as string;
                try {
                    cookies = JSON.parse(cookieStr);
                } catch {
                    // Manual Parse Fallback
                    cookies = cookieStr.split(';').map(p => {
                        const [n, ...v] = p.trim().split('=');
                        return { name: n, value: v.join('='), domain: '.canva.com', path: '/', secure: true };
                    });
                }
                if (!Array.isArray(cookies)) cookies = [cookies];

                // B. Clear & Set
                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');
                await page.setCookie(...cookies);

                // C. Active Navigation to Refresh Token
                // Visiting /settings/your-account usually triggers a token refresh
                console.log("   🌐 Navigating to Canva Settings...");
                const targetUrl = account.team_id
                    ? `https://www.canva.com/brand/${account.team_id}/settings`
                    : 'https://www.canva.com/settings/your-account';

                await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 45000 });

                // D. Check Alive
                if (page.url().includes('login') || page.url().includes('signup')) {
                    console.log(`   ❌ Session Invalid/Expired! Marking inactive.`);
                    await sql("UPDATE canva_accounts SET is_active = 0 WHERE id = ?", [account.id]);
                } else {
                    // E. CAPTURE NEW COOKIES
                    const refreshedCookies = await page.cookies();
                    const jsonCookie = JSON.stringify(refreshedCookies);

                    // F. SAVE
                    await sql(
                        "UPDATE canva_accounts SET cookie = ?, last_used = datetime('now', '+7 hours') WHERE id = ?",
                        [jsonCookie, account.id]
                    );
                    console.log(`   ✅ Session Rolled & Saved! (Count: ${refreshedCookies.length} cookies)`);
                }

            } catch (e: any) {
                console.error(`   ❌ Error rolling Account #${account.id}:`, e.message);
            }

            // Cool down between accounts to allow CF/Server processing
            await sleep(3000);
        }

    } catch (e) {
        console.error("❌ Fatal Error:", e);
    } finally {
        await browser.close();
        process.exit(0);
    }
}

refreshSessions();
