// @ts-nocheck
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

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

// Chrome Path Logic (from auto_kick.ts)
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

// Helpers
const randomDelay = (min: number, max: number) => new Promise(r => setTimeout(r, Math.random() * (max - min) + min));

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

async function revokeStaleInvites() {
    console.log("🧹 Starting Stale Invite Cleanup Job...");

    // 1. Get Stale Users from DB (> 1 hour old)
    // We only care about users created > 1 hour ago. 
    // If they are still "Invited" in Canva, we remove them.
    const staleThreshold = await sql("SELECT datetime('now', '-1 hour') as threshold");
    console.log(`🕒 Threshold Time: ${staleThreshold.rows[0].threshold} UTC`);

    const staleDBUsers = await sql(`
        SELECT * FROM users 
        WHERE joined_at < datetime('now', '-1 hour')
    `);

    // Create a Set of emails/names to check against
    // In Canva Pending Invites: 
    // The "Name" column often holds the Email Address if they haven't set a name.
    // The "Email" column says "Invited".
    // So we match the Canva "Name" against our DB "email".
    const staleEmailSet = new Set(staleDBUsers.rows.map((u: any) => (u.email || "").toLowerCase().trim()));
    console.log(`📋 Found ${staleDBUsers.rows.length} potential stale users in DB.`);

    if (staleDBUsers.rows.length === 0) {
        console.log("✅ No old users in DB to check.");
        return;
    }

    // 2. Launch Browser
    const chromePath = getChromePath();
    if (!chromePath) throw new Error("Chrome not found!");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: process.env.CI ? 'new' : false, // Headless in CI, Headful locally
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

        // SET USER AGENT FROM DB
        try {
            const uaRes = await sql("SELECT value FROM settings WHERE key = 'canva_user_agent'");
            if (uaRes.rows.length > 0) {
                await page.setUserAgent(uaRes.rows[0].value as string);
                console.log("   ✅ User-Agent set from DB!");
            }
        } catch (e) { }

        // 3. Restore Session
        if (fs.existsSync('auth_cookies.json')) {
            const cookies = JSON.parse(fs.readFileSync('auth_cookies.json', 'utf-8'));
            await page.setCookie(...cookies);
            console.log("🍪 Session restored.");
        }

        // 4. Navigate to People
        console.log("navigating to Settings...");
        // Get Team ID if exists (robustness from auto_kick.ts)
        const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
        const teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value : null;
        const peopleUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : `https://www.canva.com/settings/people`;

        await page.goto(peopleUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // 5. Auto Scroll (from count_member.ts)
        console.log("   📜 Scrolling to load all members...");
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    (window as any).scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= 20000) { clearInterval(timer); resolve(); } // Increased limit
                    if (((window as any).innerHeight + (window as any).scrollY) >= (document as any).body.scrollHeight - 50) {
                        // At bottom
                    }
                }, 50);
            });
        });
        await randomDelay(2000, 3000);

        // 6. Scan & Revoke
        console.log("🔍 Scanning for stale 'Invited' status...");

        // Strategy: Iterate rows and check checks
        // We will find targets first, then act on them one by one to avoid DOM detachment issues.

        // 1. Get List of Stale Names from DOM
        const staleTargets = await page.evaluate((dbEmails: string[]) => {
            const targets: string[] = [];
            const rows = Array.from(document.querySelectorAll('tbody tr'));

            console.log(`Debug: Found ${rows.length} rows in table.`);

            rows.forEach((row, idx) => {
                const tds = Array.from(row.querySelectorAll('td'));
                if (tds.length < 2) return;

                const nameText = tds[0].innerText.replace(/[\n\r]+/g, ' ').trim().toLowerCase();
                const statusText = tds[1].innerText.replace(/[\n\r]+/g, ' ').trim().toLowerCase();

                console.log(`Row ${idx}: Name="${nameText}" | Status="${statusText}"`);

                const isInvited = statusText.includes('invited');
                const isMatch = dbEmails.some(email => nameText.includes(email)); // Use includes for partial match safety

                if (isInvited && isMatch) {
                    console.log(`   -> MATCH FOUND: ${nameText}`);
                    targets.push(nameText);
                }
            });
            return targets;
        }, Array.from(staleEmailSet));

        console.log(`🎯 Found ${staleTargets.length} stale invites to revoke:`, staleTargets);

        let revokedCount = 0;

        // 7. Revoke Loop (Using auto_kick.ts logic)
        for (const targetName of staleTargets) {
            console.log(`⚔️ Revoking: ${targetName}`);

            try {
                // Find and Click Checkbox for this user
                const userRowFound = await page.evaluate(async (targetName) => {
                    const elements = Array.from(document.querySelectorAll('td'));
                    // Strict match for name column mainly
                    const nameEl = elements.find(e => e.innerText.trim().toLowerCase() === targetName);

                    if (!nameEl) return false;
                    const row = nameEl.closest('tr');
                    if (row) {
                        const checkbox = row.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            (checkbox as HTMLElement).click();
                            return true;
                        }
                    }
                    return false;
                }, targetName);

                if (userRowFound) {
                    await randomDelay(1000, 1500);

                    // Click "Remove users" (Header button that appears)
                    // auto_kick.ts uses: button[aria-label="Remove users"]
                    const removeMainBtn = await page.waitForSelector('button[aria-label="Remove users"], button[aria-label="Hapus pengguna"]', { visible: true, timeout: 5000 }).catch(() => null);

                    if (removeMainBtn) {
                        await removeMainBtn.click();
                        console.log("      🗑️ Clicked Remove button.");
                        await randomDelay(1000, 1500);

                        // Confirm Modal "Remove from team"
                        const confirmBtn = await page.evaluateHandle(() => {
                            const spans = Array.from(document.querySelectorAll('span'));
                            // Check english and indonesian
                            const target = spans.find(s =>
                                s.textContent?.includes('Remove from team') ||
                                s.textContent?.includes('Hapus dari tim')
                            );
                            return target ? target.parentElement : null;
                        });

                        if (confirmBtn) {
                            await (confirmBtn as any).click();
                            console.log("      ✅ Confirmed Removal.");
                            revokedCount++;
                            await sendTelegram(`♻️ <b>Stale Invite Revoked</b>\nUser: ${targetName}\nReason: > 1 Hour Pending`);

                            // Optional: Update DB status to 'revoked' or 'deleted'
                            await sql("UPDATE users SET status = 'revoked' WHERE email = ?", [targetName]); // assuming name=email match
                        } else {
                            console.log("      ⚠️ Configure button not found.");
                        }
                    } else {
                        console.log("      ⚠️ Remove header button not found (Maybe multiple selected? or lost focus)");
                    }

                    // Uncheck if failed? Or page refresh?
                    // Safe to reload if bulk logic is complex, but one by one is fine.
                    // If successful, the row disappears.
                    await randomDelay(2000, 3000);

                } else {
                    console.log("      ⚠️ Row not found/clickable.");
                }

            } catch (err: any) {
                console.error(`      ❌ Failed to revoke ${targetName}: ${err.message}`);
            }
        }

        console.log(`🏁 Cleanup Complete. Revoked: ${revokedCount}`);

    } catch (e: any) {
        console.error("Critical Error:", e);
        await page.screenshot({ path: 'error_revoke_stale.jpg' });
    } finally {
        setTimeout(() => browser.close(), 5000);
    }
}

revokeStaleInvites();
