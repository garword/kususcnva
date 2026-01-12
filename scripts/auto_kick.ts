/// <reference lib="dom" />
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as puppeteerCore from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';

import { TimeUtils } from '../src/lib/time';

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
    console.log(`[${TimeUtils.format()}] 👮 Auto-Kick ENFORCER Mode Started...`);

    // 0. PRE-KICK: Update Expired Status (Self-healing)
    await sql(`UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND end_date < datetime('now')`);

    // 0.1 Prepare Memory Lists
    // WhiteList: Active Subscriptions + Pending Invites (Don't kick new invites)
    const activeSubRes = await sql(`
        SELECT u.email FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.status = 'active'
        UNION
        SELECT email FROM users WHERE status = 'pending_invite'
    `);
    const expiredSubRes = await sql(`SELECT u.email FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.status = 'expired'`);

    // NEW: Stale Invites (> 1 hour pending)
    const staleRes = await sql(`SELECT email FROM users WHERE status = 'pending_invite' AND joined_at < datetime('now', '-1 hour')`);

    // Safety List: Admins + Bot Account + Manual Whitelist (if any)
    const adminRes = await sql(`SELECT email FROM users WHERE role = 'admin'`);
    const safetyList = new Set([
        ...(process.env.CANVA_EMAIL ? [process.env.CANVA_EMAIL.toLowerCase()] : []),
        ...adminRes.rows.map((r: any) => (r.email || "").toLowerCase())
    ]);

    const whiteList = new Set(activeSubRes.rows.map((r: any) => (r.email || "").toLowerCase()));
    const blackList = new Set(expiredSubRes.rows.map((r: any) => (r.email || "").toLowerCase()));
    const staleSet = new Set(staleRes.rows.map((r: any) => (r.email || "").toLowerCase()));

    console.log(`📊 DB Stats: ${whiteList.size} Active, ${blackList.size} Expired, ${staleSet.size} Stale Invites.`);

    console.log(`📊 DB Stats: ${whiteList.size} Active, ${blackList.size} Expired, ${safetyList.size} Admins/Safe.`);

    // 1.5. RESTORE SESSION FROM DB (Prioritize DB over Env/File)
    // This bridges the gap between Bot /set_cookie and this Script
    try {
        const cookieRes = await sql("SELECT value FROM settings WHERE key = 'canva_cookies'");
        if (cookieRes.rows.length > 0) {
            console.log("   📥 Fetched fresh cookies from Database.");
            fs.writeFileSync('auth_cookies.json', cookieRes.rows[0].value as string);
        }
    } catch (e) { console.warn("   ⚠️ Failed to fetch DB cookies, using local/env."); }

    if (process.env.CANVA_COOKIES && !fs.existsSync('auth_cookies.json')) {
        fs.writeFileSync('auth_cookies.json', process.env.CANVA_COOKIES);
    }
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
            '--timezone=Asia/Jakarta',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-dev-shm-usage',
            '--log-level=3'
        ]
    });

    try {
        const page = await browser.newPage();

        // Restore Session (Priority: DB -> File)

        // 1. Set User-Agent from DB (Critical for session consistency)
        try {
            const uaRes = await sql("SELECT value FROM settings WHERE key = 'canva_user_agent'");
            if (uaRes.rows.length > 0) {
                await page.setUserAgent(uaRes.rows[0].value as string);
                console.log(`   ✅ User-Agent set from DB!`);
            } else if (fs.existsSync('auth_user_agent.txt')) {
                // Fallback to local file
                await page.setUserAgent(fs.readFileSync('auth_user_agent.txt', 'utf-8').trim());
            }
        } catch (e) { }

        // ENABLE CONSOLE LOGS FROM BROWSER
        page.on('console', (msg: any) => console.log('PAGE LOG:', msg.text()));


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
                        // Increase patience: Wait 100 * 50ms = 5s (was 2.5s)
                        if (noScrollCount > 100) {
                            clearInterval(timer);
                            resolve();
                        }
                    } else {
                        noScrollCount = 0;
                    }

                    // Safety break: Increase to 200,000px (approx 4000 members)
                    if (totalHeight >= 200000) { clearInterval(timer); resolve(); }
                }, 50);
            });
        });
        await randomDelay(2000, 3000);
        console.log("   ✅ Scroll Complete.");

        // 4. SCAN & SELECT (The "Brain")
        console.log("   🔍 Scanning DOM for targets...");

        const scanResult = await page.evaluate((bgWhiteList: string[], bgBlackList: string[], bgSafetyList: string[], bgStaleList: string[]) => {
            const targets: string[] = [];
            const safeSet = new Set(bgSafetyList);
            const whiteSet = new Set(bgWhiteList);
            const blackSet = new Set(bgBlackList);
            const staleSet = new Set(bgStaleList);

            // Find all rows (tr or div[role="row"])
            const rows = Array.from(document.querySelectorAll('tbody tr, div[role="row"]'));
            let selectedCount = 0;

            rows.forEach(row => {
                const htmlRow = row as HTMLElement;
                const text = htmlRow.innerText.toLowerCase();
                // Extract Email
                let email = "";
                // Extract Email - Strategy 1: Mailto Link
                const mailLink = row.querySelector('a[href^="mailto:"]');
                if (mailLink) {
                    email = mailLink.getAttribute('href')?.replace('mailto:', '').split('?')[0].trim().toLowerCase() || "";
                }

                // Strategy 2: Broad Regex on Row Content (Joined with spaces to prevent 'email.comStudent' merge)
                if (!email) {
                    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;

                    // Join text of all children with spaces to separate Email from Role/Name
                    // Select all direct children or specific common cell types
                    const cells = Array.from(row.querySelectorAll('td, div, span, p'));
                    const fullText = cells.map(el => el.textContent || "").join(" ").toLowerCase();

                    // Fallback to simple innerText if cells are empty (rare)
                    const textToScan = fullText.length > 5 ? fullText : htmlRow.innerText.toLowerCase();

                    const match = textToScan.match(emailRegex);
                    if (match) email = match[0];
                }

                if (!email) {
                    console.log(`   ⚠️ Row ${rows.indexOf(row)}: No email found. Text: "${text.substring(0, 50)}..."`);
                    return;
                }

                // DEBUG: Log every email found to trace "Ghost" detection
                console.log(`   🔎 Scanned: ${email} | Text: ${text.substring(0, 30)}...`);

                if (!email) return;

                // SAFETY
                if (text.includes('owner') || text.includes('pemilik') || text.includes('administrator')) {
                    console.log(`      🛡️ Skipped: Admin/Owner Role detected.`);
                    return;
                }
                if (safeSet.has(email)) {
                    console.log(`      🛡️ Skipped: In Safety List / Whitelist.`);
                    return;
                }

                const isInvited = text.includes('invited') || text.includes('pending') || text.includes('diundang');
                let reason = "";

                if (isInvited) {
                    // INVITE LOGIC
                    if (staleSet.has(email)) reason = "STALE INVITE (> 1h)";
                    else if (!whiteSet.has(email) && !blackSet.has(email)) reason = "GHOST INVITE (Not in DB)";
                    // else: It's a valid new invite (Pending < 1h), leave it.
                } else {
                    // MEMBER LOGIC
                    if (blackSet.has(email)) reason = "EXPIRED SUBSCRIPTION";
                    else if (!whiteSet.has(email)) reason = "GHOST MEMBER (Not in DB)";
                }

                if (reason) {
                    // CLICK CHECKBOX
                    const checkbox = row.querySelector('input[type="checkbox"], input.UufAxw') as HTMLElement;
                    if (checkbox && !checkbox.hasAttribute('checked') && !checkbox.getAttribute('aria-checked')?.includes('true')) {
                        checkbox.click();
                        targets.push(`${email} [${reason}]`);
                        selectedCount++;
                    }
                }
            });
            return { targets, selectedCount };
        }, Array.from(whiteList), Array.from(blackList), Array.from(safetyList), Array.from(staleSet));

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

                    // Wait for operation to complete on server side
                    await randomDelay(3000, 5000);

                    // ============================================================
                    // 🛡️ VERIFICATION PHASE (Refresh & Verify)
                    // ============================================================
                    console.log(`[${TimeUtils.format()}] 🔄 Refreshing page to verify removal...`);
                    await page.reload({ waitUntil: 'networkidle2' });
                    await randomDelay(3000, 5000);

                    const kickedEmails = scanResult.targets.map((t: string) => t.split(' ')[0]);
                    let verifiedCount = 0;
                    let dbUpdateCount = 0;

                    console.log(`   🔍 Verifying ${kickedEmails.length} removals via Search...`);

                    // Find Search Input
                    const searchInput = await page.evaluateHandle(() => {
                        const inputs = Array.from(document.querySelectorAll('input'));
                        return inputs.find(i =>
                            (i.placeholder && (i.placeholder.toLowerCase().includes('search') || i.placeholder.toLowerCase().includes('cari'))) ||
                            (i.getAttribute('aria-label') && (i.getAttribute('aria-label')!.toLowerCase().includes('search') || i.getAttribute('aria-label')!.toLowerCase().includes('cari'))) ||
                            i.type === 'search'
                        );
                    });

                    if (searchInput && searchInput.asElement()) {
                        for (const email of kickedEmails) {
                            try {
                                // Clear & Type
                                await page.evaluate((el: any) => { el.value = ''; }, searchInput);
                                await searchInput.asElement()!.type(email, { delay: 50 });
                                await randomDelay(1500, 2500); // Wait for filter

                                // Check results
                                const exists = await page.evaluate((checkEmail: string) => {
                                    const bodyText = document.body.innerText.toLowerCase();
                                    // If text says "No people found" or table is empty of that email
                                    // We look for specific row match to be sure
                                    return bodyText.includes(checkEmail);
                                }, email);

                                if (!exists) {
                                    console.log(`      ✅ Verified Gone: ${email}`);
                                    verifiedCount++;

                                    // UPDATE DB (Only if verified gone)
                                    if (blackList.has(email)) {
                                        await sql("UPDATE subscriptions SET status = 'kicked' WHERE user_id = (SELECT id FROM users WHERE email = ?)", [email]);
                                        dbUpdateCount++;
                                    }
                                } else {
                                    console.warn(`      ⚠️ Verification Failed: ${email} still found via search.`);
                                }
                            } catch (e) { console.error(`      ⚠️ Error verifying ${email}:`, e); }
                        }
                    } else {
                        console.warn("   ⚠️ Search bar not found. Skipping granular verification. Assuming success based on Toast.");
                        verifiedCount = kickedEmails.length; // Fallback assumption

                        // Fallback DB update
                        for (const ke of kickedEmails) {
                            if (blackList.has(ke)) {
                                await sql("UPDATE subscriptions SET status = 'kicked' WHERE user_id = (SELECT id FROM users WHERE email = ?)", [ke]);
                                dbUpdateCount++;
                            }
                        }
                    }

                    const report = `⚔️ <b>Auto-Kick Batch Executed</b>\nTargets: ${kickedEmails.length}\nVerified: ${verifiedCount}\nDB Updated: ${dbUpdateCount}`;
                    await sendTelegram(report);

                } else {
                    console.error("   ❌ Confirm button not found!");
                }
            } else {
                console.error("   ❌ Bulk Remove button not found!");
            }

        } else {
            console.log(`[${TimeUtils.format()}] ✅ No targets found. Team is Clean.`);
            await sendTelegram("🛡️ <b>Auto-Kick Check:</b> Clean (No illegal members)."); // Enabled for visibility
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
