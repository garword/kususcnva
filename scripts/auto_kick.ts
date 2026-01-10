/// <reference lib="dom" />
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as puppeteerCore from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';

dotenv.config();

// Setup Puppeteer Extra with Stealth
const puppeteer = addExtra(puppeteerCore as any);
puppeteer.use(StealthPlugin());

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = process.env.ADMIN_ID || '';
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID || '';

// Credentials
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
    // Don't re-import fs, use the top level one
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

async function humanType(element: any, text: string) {
    await element.click();
    await randomDelay(300, 600);
    for (const char of text) {
        await element.type(char, { delay: Math.random() * 100 + 50 });
        if (Math.random() < 0.1) await randomDelay(200, 400);
    }
}

async function kickExpiredUsers() {
    console.log("🤖 Auto-Kick Job Started (v2.0 - CookieAuth)...");

    // 0. Check for Manual Target
    const args = process.argv.slice(2);
    const manualTarget = args.find(a => a.includes('@')); // Simple detection: any arg with '@' is treated as email

    let targets: { email: string, id: any, sub_id: any }[] = [];

    if (manualTarget) {
        console.log(`🎯 MANUAL MODE: Targeting specific user: ${manualTarget}`);
        targets = [{ email: manualTarget, id: null, sub_id: null }];
    } else {
        // 1. Get Expired Users (Expiry is in subscriptions table)
        const expiredUsers = await sql(`
            SELECT u.email, u.id, s.id as sub_id 
            FROM users u 
            JOIN subscriptions s ON u.id = s.user_id 
            WHERE s.end_date < datetime('now') 
            AND s.status = 'active'
        `);

        if (expiredUsers.rows.length === 0) {
            console.log("✅ No expired users found.");
            return;
        }
        targets = expiredUsers.rows as any;
        console.log(`🎯 Found ${targets.length} expired user(s) to kick.`);
    }

    // 1.5. RESTORE SESSION FROM ENV (FOR GITHUB ACTIONS)
    if (process.env.CANVA_COOKIES) {
        console.log("📂 Restoring Cookies from Env Var...");
        fs.writeFileSync('auth_cookies.json', process.env.CANVA_COOKIES);
    }
    if (process.env.CANVA_USER_AGENT) {
        console.log("📂 Restoring User-Agent from Env Var...");
        fs.writeFileSync('auth_user_agent.txt', process.env.CANVA_USER_AGENT);
    }

    // 2. Launch Browser (Stealth + Incognito)
    const chromePath = getChromePath();
    if (!chromePath) throw new Error("Chrome not found!");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: process.env.CI ? "new" : false,
        defaultViewport: null,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--incognito',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--disable-features=IsolateOrigins,site-per-process',
            '--timezone=Asia/Jakarta'
        ]
    });

    try {
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        // 3. Login Flow (Cookie Priority -> Email/Password)
        const cookieFile = 'auth_cookies.json';
        const uaFile = 'auth_user_agent.txt';
        let isLoggedIn = false;

        // A. Load User-Agent if Valid
        if (fs.existsSync(uaFile)) {
            try {
                const savedUA = fs.readFileSync(uaFile, 'utf-8').trim();
                if (savedUA.length > 0) {
                    await page.setUserAgent(savedUA);
                    console.log(`🎭 User-Agent Synced with Session: ${savedUA.substring(0, 40)}...`);
                }
            } catch (e) {
                console.error("   ⚠️ Failed to sync User-Agent:", e);
            }
        }

        // B. Load Cookies
        if (fs.existsSync(cookieFile)) {
            try {
                console.log(`🍪 Found ${cookieFile}. Attempting Session Restore...`);
                const cookiesStr = fs.readFileSync(cookieFile, 'utf-8');
                const cookies = JSON.parse(cookiesStr);

                await page.setCookie(...cookies);
                console.log(`   Loaded ${cookies.length} cookies.`);

                await page.goto('https://www.canva.com/folder/all-designs', { waitUntil: 'networkidle2', timeout: 60000 });
                await randomDelay(2000, 3000);

                if (page.url().includes('login') || page.url().includes('signup')) {
                    console.log("   ❌ Cookie Expired. Falling back to Login...");
                } else {
                    console.log("   ✅ Session Restored!");
                    isLoggedIn = true;
                }
            } catch (e) {
                console.error("   ⚠️ Load cookie failed:", e);
            }
        }

        if (!isLoggedIn && (!CANVA_EMAIL || !CANVA_PASSWORD)) {
            throw new Error("CANVA_EMAIL & CANVA_PASSWORD required (or valid cookies)!");
        }

        if (!isLoggedIn) {
            console.log(`🔐 Logging in as ${CANVA_EMAIL}...`);
            await page.goto('https://www.canva.com/login', { waitUntil: 'networkidle2' });
            await randomDelay(2000, 4000);

            // STEP 1: Click "Continue with email" button
            console.log("   [1/5] Looking for 'Continue with email' button...");
            await randomDelay(1000, 2000);

            const continueWithEmailBtn = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => b.textContent?.includes('Continue with email') || b.textContent?.includes('Lanjutkan dengan email'));
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            });

            if (!continueWithEmailBtn) console.log("   'Continue with email' button not found, trying user input...");
            await randomDelay(1200, 2500);

            // STEP 2: Enter Email
            console.log("   [2/5] Entering Email...");
            const emailInput = await page.waitForSelector('input.bCVoGQ, input[type="email"], input[name="email"]', { timeout: 15000 });
            if (emailInput) await humanType(emailInput, CANVA_EMAIL || "");

            // STEP 3: Click "Continue"
            console.log("   [3/5] Clicking Continue...");
            await randomDelay(800, 1500);

            const continueClicked = await page.evaluate(() => {
                const spans = Array.from(document.querySelectorAll('span'));
                const continueSpan = spans.find(s => s.textContent?.trim() === 'Continue' || s.textContent?.trim() === 'Lanjutkan');
                if (continueSpan) {
                    const button = continueSpan.closest('button');
                    if (button) {
                        button.click();
                        return true;
                    }
                }
                return false;
            });

            if (!continueClicked) await emailInput?.press('Enter');
            await randomDelay(2500, 4000); // Wait for password field transition

            // STEP 4: Password
            console.log("   [4/5] Waiting for password field...");
            const inputSelector = 'input[type="password"], input.bCVoGQ';
            await page.waitForSelector(inputSelector, { timeout: 15000 });
            const passInput = await page.$(inputSelector);

            if (passInput) {
                console.log("   [4/5] Entering Password...");
                await randomDelay(500, 1000);
                await humanType(passInput, CANVA_PASSWORD || "");
            } else {
                throw new Error("Password input field not found after wait.");
            }

            // STEP 5: Click Log in
            console.log("   [5/5] Clicking Log in...");
            await randomDelay(1000, 2000);

            const loginClicked = await page.evaluate(() => {
                const spans = Array.from(document.querySelectorAll('span'));
                const loginSpan = spans.find(s => s.textContent?.trim() === 'Log in' || s.textContent?.trim() === 'Masuk');
                if (loginSpan) {
                    const button = loginSpan.closest('button');
                    if (button) {
                        button.click();
                        return true;
                    }
                }
                return false;
            });

            if (!loginClicked) await passInput?.press('Enter');

            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
            console.log("✅ Login success!");
            await randomDelay(3000, 5000);
        }

        // 4. Kick Loop
        let kickedCount = 0;
        let failCount = 0;

        for (const user of targets) {
            const targetEmail = user.email;
            console.log(`⚔️ Processing Kick: ${targetEmail}`);

            try {
                // Determine Team URL
                const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
                const teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value : null;
                const url = teamId ? `https://www.canva.com/brand/${teamId}/people` : `https://www.canva.com/settings/people`;

                if (page.url() !== url) {
                    await page.goto(url, { waitUntil: 'networkidle2' });
                    await randomDelay(3000, 5000);
                }

                // A. Search for User
                console.log("   Searching for user...");
                const userRowFound = await page.evaluate(async (email: string) => {
                    const elements = Array.from(document.querySelectorAll('td, div, span'));
                    const emailEl = elements.find(e => e.textContent?.trim() === email);
                    if (!emailEl) return false;

                    let row = emailEl.closest('tr');
                    if (!row) {
                        row = emailEl.closest('div[role="row"]') as any;
                    }

                    if (row) {
                        // Find Checkbox in this row
                        const checkbox = row.querySelector('input[type="checkbox"], input.UufAxw') as HTMLElement;
                        if (checkbox) {
                            checkbox.click();
                            return true;
                        }
                    }
                    return false;
                }, targetEmail);

                if (!userRowFound) {
                    throw new Error("User email not found visible on page");
                }

                console.log("   ✅ User selected. Clicking Remove...");
                await randomDelay(1000, 2000);

                // B. Click "Remove users" Button
                const removeMainBtn = await page.waitForSelector('button[aria-label="Remove users"]', { visible: true, timeout: 5000 });
                if (removeMainBtn) {
                    await removeMainBtn.click();
                } else {
                    throw new Error("Remove users button not appeared");
                }

                await randomDelay(1000, 2000);

                // C. Confirm Modal "Remove from team"
                const confirmBtn = await page.evaluateHandle(() => {
                    const spans = Array.from(document.querySelectorAll('span'));
                    return spans.find(s => s.textContent?.includes('Remove from team'))?.parentElement;
                });

                if (confirmBtn) {
                    await (confirmBtn as any).click();
                    console.log("   ✅ Kick Confirmed!");
                    kickedCount++;

                    // Update DB (Only Subscriptions, preserve User record)
                    if (user.id) {
                        // Jangan ubah status User jadi kicked, biar kalau dia beli lagi nggak error
                        // await sql("UPDATE users SET status = 'kicked' WHERE id = ?", [user.id]);

                        // Cukup tandai langganan ini yang berakhir
                        await sql("UPDATE subscriptions SET status = 'kicked' WHERE id = ?", [user.sub_id]);
                    }
                    await sendTelegram(`🚫 <b>User Kicked</b>\nEmail: ${targetEmail}\nReason: ${manualTarget ? 'Manual Kick' : 'Expired'}`);
                } else {
                    throw new Error("Confirm button not found");
                }

                await randomDelay(2000, 4000);

            } catch (kErr: any) {
                console.error(`   ❌ Kick Failed: ${kErr.message}`);
                failCount++;
            }
        }

        const summary = `🏁 <b>Auto-Kick Finished</b>\n✅ Kicked: ${kickedCount}\n❌ Failed: ${failCount}`;
        console.log(summary);
        await sendTelegram(summary);

        await browser.close();

    } catch (err: any) {
        console.error("Critical Error:", err);
        await sendTelegram(`⛔ <b>Auto-Kick Critical</b>\n${err.message}`);
        await browser.close();
    }
}

kickExpiredUsers();
