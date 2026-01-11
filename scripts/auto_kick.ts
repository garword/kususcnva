/// <reference lib="dom" />
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as puppeteerCore from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';

dotenv.config();

// Setup Puppeteer
const puppeteer = addExtra(puppeteerCore as any);
puppeteer.use(StealthPlugin());

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = process.env.ADMIN_ID || '';
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID || '';
const CANVA_EMAIL = process.env.CANVA_EMAIL;
const CANVA_PASSWORD = process.env.CANVA_PASSWORD;

// Helpers
const randomDelay = (min: number, max: number) => new Promise(r => setTimeout(r, Math.random() * (max - min) + min));

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

async function sendTelegram(message: string) {
    if (!BOT_TOKEN || (!ADMIN_ID && !LOG_CHANNEL_ID)) return;
    const target = LOG_CHANNEL_ID || ADMIN_ID;
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: target,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (e) {
        console.error("Telegram Error:", e);
    }
}

async function kickEnforcer() {
    console.log("👮 Auto-Kick ENFORCER Mode Started...");

    // 0. Prepare Memory Lists
    const activeSubRes = await sql(`SELECT u.email FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.status = 'active'`);
    const expiredSubRes = await sql(`SELECT u.email FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.status = 'expired'`);

    // Safety List: Admins + Bot Account + Manual Whitelist (if any)
    const adminRes = await sql(`SELECT email FROM users WHERE role = 'admin'`);
    const safetyList = new Set([
        ...(process.env.CANVA_EMAIL ? [process.env.CANVA_EMAIL.toLowerCase()] : []),
        ...adminRes.rows.map((r: any) => (r.email || "").toLowerCase())
    ]);

    const whiteList = new Set(activeSubRes.rows.map((r: any) => (r.email || "").toLowerCase()));
    const blackList = new Set(expiredSubRes.rows.map((r: any) => (r.email || "").toLowerCase()));

    console.log(`📊 DB Stats: ${whiteList.size} Active, ${blackList.size} Expired, ${safetyList.size} Admins/Safe.`);

    // 1.5. RESTORE SESSION FROM ENV
    if (process.env.CANVA_COOKIES) fs.writeFileSync('auth_cookies.json', process.env.CANVA_COOKIES);
    if (process.env.CANVA_USER_AGENT) fs.writeFileSync('auth_user_agent.txt', process.env.CANVA_USER_AGENT);

    // 2. Launch Browser
    const chromePath = getChromePath();
    if (!chromePath) throw new Error("Chrome not found!");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: process.env.CI ? "new" : false,
        defaultViewport: null,
        args: [
            '--incognito',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-notifications',
            '--timezone=Asia/Jakarta'
        ]
    });

    try {
        const page = await browser.newPage();

        // Restore Session
        if (fs.existsSync('auth_user_agent.txt')) {
            try { await page.setUserAgent(fs.readFileSync('auth_user_agent.txt', 'utf-8').trim()); } catch (e) { }
        }

        let isLoggedIn = false;
        if (fs.existsSync('auth_cookies.json')) {
            try {
                const cookies = JSON.parse(fs.readFileSync('auth_cookies.json', 'utf-8'));
                await page.setCookie(...cookies);
                console.log(`   🍪 Loaded ${cookies.length} cookies.`);

                // Determine Team URL
                const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
                const teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value : null;
                const peopleUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : `https://www.canva.com/settings/people`;

                await page.goto(peopleUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                await randomDelay(2000, 3000);

                if (!page.url().includes('login') && !page.url().includes('signup')) {
                    console.log("   ✅ Session Restored!");
                    isLoggedIn = true;
                }
            } catch (e) {
                console.error("   ⚠️ Cookie failed:", e);
            }
        }

        if (!isLoggedIn) {
            console.log("   ❌ Cookie Invalid. Please Login Manually first to save cookies.");
            throw new Error("Login Failed. Run 'npm run login' first.");
        }

        // 3. SCROLL LOADER (The "Heavy" Lift)
        console.log("   📜 Scrolling to load ALL members...");
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                let noScrollCount = 0;
                const timer = setInterval(() => {
                    const scrollHeightBefore = (document as any).body.scrollHeight;
                    (window as any).scrollBy(0, distance);
                    totalHeight += distance;

                    if (((window as any).innerHeight + (window as any).scrollY) >= scrollHeightBefore - 50) {
                        noScrollCount++;
                        if (noScrollCount > 50) { // If stuck at bottom for ~2.5s, assume done
                            clearInterval(timer);
                            resolve();
                        }
                    } else {
                        noScrollCount = 0;
                    }

                    if (totalHeight >= 50000) { clearInterval(timer); resolve(); } // Safety break
                }, 50);
            });
        });
        await randomDelay(2000, 3000);
        console.log("   ✅ Scroll Complete.");

        // 4. SCAN & SELECT (The "Brain")
        console.log("   🔍 Scanning DOM for targets...");

        const scanResult = await page.evaluate((bgWhiteList: string[], bgBlackList: string[], bgSafetyList: string[]) => {
            const targets: string[] = [];
            const safeSet = new Set(bgSafetyList);
            const whiteSet = new Set(bgWhiteList);
            const blackSet = new Set(bgBlackList);

            // Find all rows (tr or div[role="row"])
            // Strategy: Look for emails in page text
            const rows = Array.from(document.querySelectorAll('tbody tr, div[role="row"]'));
            let selectedCount = 0;

            rows.forEach(row => {
                const htmlRow = row as HTMLElement;
                const text = htmlRow.innerText.toLowerCase();
                // Extract Email
                let email = "";
                // Try from mailto?
                const mailLink = row.querySelector('a[href^="mailto:"]');
                if (mailLink) {
                    email = mailLink.getAttribute('href')?.replace('mailto:', '').split('?')[0].trim().toLowerCase() || "";
                }

                if (!email) {
                    const match = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
                    if (match) email = match[0];
                }

                if (!email) return;

                // SAFETY: CHECK FOR TEAM OWNER / ADMIN ROLE IN UI
                if (text.includes('owner') || text.includes('pemilik') || text.includes('administrator') || text.includes('team owner')) {
                    return;
                }

                // DECISION LOGIC
                let reason = "";
                if (safeSet.has(email)) return; // SAFE
                if (blackSet.has(email)) reason = "EXPIRED";
                else if (!whiteSet.has(email)) reason = "GHOST (Not in DB)";

                if (reason) {
                    // CLICK CHECKBOX
                    const checkbox = row.querySelector('input[type="checkbox"], input.UufAxw') as HTMLElement;
                    if (checkbox && !checkbox.hasAttribute('checked') && !checkbox.getAttribute('aria-checked')?.includes('true')) {
                        checkbox.click(); // Select it!
                        targets.push(`${email} [${reason}]`);
                        selectedCount++;
                    }
                }
            });
            return { targets, selectedCount };
        }, Array.from(whiteList), Array.from(blackList), Array.from(safetyList));

        console.log(`   🎯 Selected ${scanResult.selectedCount} users.`);
        if (scanResult.targets.length > 0) {
            console.log("   📝 Targets:", scanResult.targets.slice(0, 10), (scanResult.targets.length > 10 ? "...and more" : ""));
        }

        // 5. EXECUTE BATCH REMOVAL
        if (scanResult.selectedCount > 0) {
            await randomDelay(1000, 2000);

            // Find "Remove users" button in toolbar
            // It usually appears at top/bottom when items are selected
            const removeBtnHandle = await page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.find(b => {
                    const t = b.innerText.toLowerCase() || b.getAttribute('aria-label')?.toLowerCase() || "";
                    return t.includes('remove') || t.includes('hapus');
                });
            });

            const removeBtn = removeBtnHandle.asElement();
            if (removeBtn) {
                await removeBtn.click();
                console.log("   🖱️ Clicked Bulk Remove Button");

                await randomDelay(1000, 2000);

                // CONFIRM MODAL
                const confirmBtnHandle = await page.evaluateHandle(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    return buttons.find(b => {
                        const t = b.innerText.toLowerCase();
                        return t.includes('remove from team') || t.includes('hapus dari tim');
                    });
                });

                const confirmBtn = confirmBtnHandle.asElement();
                if (confirmBtn) {
                    await confirmBtn.click();
                    console.log("   ✅ Confirmed Removal.");

                    // Wait for Toast
                    try {
                        await page.waitForFunction(() => {
                            return document.body.innerText.toLowerCase().includes('removed') || document.body.innerText.toLowerCase().includes('dihapus');
                        }, { timeout: 10000 });

                        // UPDATE DB for Expired ones
                        // We iterate our known blacklist and see if they were in the DOM targets
                        // This is an approximation. Ideally we parse the success message.
                        const kickedEmails = scanResult.targets.map((t: string) => t.split(' ')[0]);
                        let dbUpdateCount = 0;
                        for (const ke of kickedEmails) {
                            if (blackList.has(ke)) {
                                // Mark as kicked in DB
                                await sql("UPDATE subscriptions SET status = 'kicked' WHERE user_id = (SELECT id FROM users WHERE email = ?)", [ke]);
                                dbUpdateCount++;
                            }
                        }

                        const report = `⚔️ <b>Auto-Kick Batch Executed</b>\nTargets: ${kickedEmails.length}\nType: Mixed (Ghost/Expired)\nDB Updated: ${dbUpdateCount}`;
                        await sendTelegram(report);

                    } catch (e) { console.warn("   ⚠️ Toast not seen."); }

                } else {
                    console.error("   ❌ Confirm button not found!");
                }
            } else {
                console.error("   ❌ Bulk Remove button not found!");
            }

        } else {
            console.log("   ✅ No targets found. Team is Clean.");
        }

    } catch (e: any) {
        console.error("Critical Error:", e);
        const pages = await browser.pages();
        if (pages.length > 0) {
            await pages[0].screenshot({ path: 'error_kick.jpg' });
        }
    } finally {
        setTimeout(() => browser.close(), 3000);
    }
}

kickEnforcer();
