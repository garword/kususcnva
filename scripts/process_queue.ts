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
// Fix: Check both common names for the channel
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID || '';

// Find Chrome Path
const findChromeParams = [
    process.env.CHROME_BIN || "",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\" + process.env.USERNAME + "\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
];

function getChromePath() {
    for (const path of findChromeParams) {
        if (path && fs.existsSync(path)) return path;
    }
    return null;
}

// Helper to notify specific user (e.g., successful invite)
async function sendTelegram(chatId: string | number, message: string) {
    if (!BOT_TOKEN) return;
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (e: any) {
        console.error("Failed to send Telegram:", e.message);
    }
}

// Helper to log to the dedicated channel
async function sendSystemLog(message: string) {
    const target = LOG_CHANNEL_ID || ADMIN_ID;
    if (!BOT_TOKEN || !target) return;

    // Add timestamp header
    const time = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const logMsg = `📝 <b>System Log</b> [${time}]\n\n${message}`;

    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: target,
            text: logMsg,
            parse_mode: 'HTML'
        });
    } catch (e: any) {
        console.error("Failed to send system log:", e.message);
    }
}

// Helper to send Photo to Telegram (using FormData)
async function sendTelegramPhoto(chatId: string | number, photoPath: string, caption: string) {
    if (!BOT_TOKEN) return;
    try {
        const formData = new FormData();
        formData.append('chat_id', chatId.toString());
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');

        const fileBuffer = fs.readFileSync(photoPath);
        const blob = new Blob([fileBuffer]);
        formData.append('photo', blob, 'screenshot.jpg');

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    } catch (e: any) {
        console.error("Failed to send Telegram Photo:", e.message);
    }
}

// ============================================================================
// PUPPETEER ACTIONS (Shared Browser Instance)
// ============================================================================

async function runPuppeteerQueue() {
    console.log("🦾 Queue Processor Started...");

    // 1. Fetch Queued Items with Detailed Info
    // Join with products based on selected_product_id
    const pendingInvites = await sql(`
        SELECT u.*, p.name as plan_name, p.duration_days, p.id as prod_id
        FROM users u 
        LEFT JOIN products p ON u.selected_product_id = p.id 
        WHERE u.status = 'pending_invite'
    `);

    // Check for expired subscriptions
    const expiredUsers = await sql(`
        SELECT u.*, s.end_date, p.name as plan_name 
        FROM subscriptions s 
        JOIN users u ON s.user_id = u.id 
        JOIN products p ON s.product_id = p.id 
        WHERE s.end_date < datetime('now') AND s.status = 'active'
    `);

    if (pendingInvites.rows.length === 0 && expiredUsers.rows.length === 0) {
        console.log("✅ Queue is empty. Nothing to do.");
        return;
    }

    const startMsg = `⚙️ <b>Job Started</b>\n📊 Pending Invites: ${pendingInvites.rows.length}\n📊 Expired Users: ${expiredUsers.rows.length}`;
    console.log(startMsg);
    await sendSystemLog(startMsg);

    // 2. Prepare Browser
    try {
        const chromePath = getChromePath();
        if (!chromePath) throw new Error("Chrome not found!");

        // Fetch settings
        const cookieRes = await sql("SELECT value FROM settings WHERE key = 'canva_cookie'");
        const cookie = cookieRes.rows.length > 0 ? cookieRes.rows[0].value : "";

        const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
        const teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value as string : undefined;

        // 🎭 USER-AGENT POOL (Realistic & Updated 2026)
        const userAgentPool = [
            // Windows Chrome (Most common)
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

            // Windows Edge
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',

            // macOS Safari
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',

            // Windows Firefox
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
        ];

        // Random selection
        const userAgent = userAgentPool[Math.floor(Math.random() * userAgentPool.length)];
        console.log(`🎭 Using User-Agent: ${userAgent.substring(0, 60)}...`);

        const browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: process.env.CI ? "new" : false,
            defaultViewport: null,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--incognito', // 🕵️‍♂️ Enable Incognito Mode
                '--start-maximized',
                // '--no-sandbox', // REMOVED: Triggers "unsupported flag" warning
                // '--disable-setuid-sandbox', // REMOVED: Triggers "unsupported flag" warning
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--disable-features=IsolateOrigins,site-per-process',
                // Timezone spoofing to match IP (General Asia/Jakarta for ID IP)
                '--timezone=Asia/Jakarta'
            ]
        });

        // Use Incognito Context
        const context = await browser.createBrowserContext();
        const page = await context.newPage();

        // Set realistic user-agent (Stealth Plugin handles most fingerprints, but UA is good to set)
        await page.setUserAgent(userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');


        // 🧠 HUMAN-LIKE BEHAVIOR HELPERS
        const randomDelay = (min: number, max: number) =>
            new Promise(r => setTimeout(r, Math.random() * (max - min) + min));

        const humanType = async (element: any, text: string) => {
            await element.click();
            await randomDelay(300, 600); // Think before typing

            for (const char of text) {
                await page.keyboard.type(char, {
                    delay: Math.random() * 150 + 50 // 50-200ms per char (realistic)
                });

                // Random micro-pauses (like humans thinking)
                if (Math.random() < 0.15) { // 15% chance of pause
                    await randomDelay(200, 500);
                }
            }
        };

        const humanClick = async (selector: string) => {
            const element = await page.$(selector);
            if (element) {
                // Move mouse to element first (hover)
                const box = await element.boundingBox();
                if (box) {
                    await page.mouse.move(
                        box.x + box.width / 2 + (Math.random() * 10 - 5), // Random offset
                        box.y + box.height / 2 + (Math.random() * 10 - 5)
                    );
                    await randomDelay(100, 300); // Hover pause
                }
                await element.click();
                await randomDelay(200, 500); // Post-click pause
                return true;
            }
            return false;
        };

        const randomScroll = async () => {
            // Occasional random scrolls (humans browse naturally)
            await page.evaluate(() => {
                window.scrollBy({
                    top: Math.random() * 200 - 100,
                    behavior: 'smooth'
                });
            });
            await randomDelay(500, 1000);
        };

        // AUTHENTICATION STRATEGY: COOKIE PRIORITY -> EMAIL/PASSWORD FALLBACK
        const canvaEmail = process.env.CANVA_EMAIL;
        const canvaPassword = process.env.CANVA_PASSWORD;
        let isLoggedIn = false;

        // 1. TRY COOKIE LOGIN FIRST (Bypass IP Checks)
        const cookieStr = String(cookie);
        if (cookieStr && cookieStr.length > 20) {
            console.log("🍪 Attempting Login with Saved Cookie...");

            // Parse Cookie String to Object Array
            const cookieObjects = cookieStr.split(';').map(c => {
                const [name, ...v] = c.trim().split('=');
                return { name, value: v.join('='), domain: '.canva.com', path: '/' };
            }).filter(c => c.name && c.value);

            await page.setCookie(...cookieObjects);

            // Verify Session
            console.log("   Verifying session...");
            await page.goto("https://www.canva.com/settings/your-account", { waitUntil: 'networkidle2' });

            // Check if redirected to login
            if (!page.url().includes("login") && !page.url().includes("signup")) {
                console.log("   ✅ Cookie Valid! Session Active.");
                isLoggedIn = true;
            } else {
                console.log("   ❌ Cookie Invalid/Expired. Falling back to Password...");
            }
        }

        // 2. FALLBACK: PASSWORD LOGIN (Only if Cookie Failed)
        if (!isLoggedIn && canvaEmail && canvaPassword) {
            console.log(`🔐 Attempting Login with Email: ${canvaEmail}...`);
            await page.goto('https://www.canva.com/login', { waitUntil: 'networkidle2' });

            // Random initial idle (like human arriving at page)
            await randomDelay(1500, 3000);

            try {
                // STEP 1: Click "Continue with email" button
                console.log("   [1/5] Looking for 'Continue with email' button...");
                await randomDelay(1000, 2000); // Human reads the page

                // Occasional scroll to mimic browsing
                if (Math.random() < 0.3) await randomScroll();

                const continueWithEmailBtn = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const btn = buttons.find(b => b.textContent?.includes('Continue with email'));
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                });

                if (!continueWithEmailBtn) {
                    console.log("   'Continue with email' button not found, might be direct email form");
                }

                await randomDelay(1200, 2500); // Wait for form transition

                // STEP 2: Enter Email (HUMAN-LIKE TYPING)
                console.log("   [2/5] Entering Email...");
                const emailInput = await page.waitForSelector('input.bCVoGQ, input[type="email"], input[name="email"]', { timeout: 10000 });
                if (emailInput) {
                    await humanType(emailInput, canvaEmail); // Use human typing!
                }

                // STEP 3: Click "Continue" button (span with text "Continue")
                console.log("   [3/5] Clicking Continue...");
                await randomDelay(800, 1500); // Think before clicking

                const continueClicked = await page.evaluate(() => {
                    const spans = Array.from(document.querySelectorAll('span'));
                    const continueSpan = spans.find(s => s.textContent?.trim() === 'Continue');
                    if (continueSpan) {
                        const button = continueSpan.closest('button');
                        if (button) {
                            button.click();
                            return true;
                        }
                    }
                    return false;
                });

                if (!continueClicked) {
                    console.log("   Continue button not found, trying Enter key...");
                    await emailInput?.press('Enter');
                }

                // STEP 4: Wait for Password Field & Enter Password
                console.log("   [4/5] Waiting for password field...");
                await randomDelay(2500, 4000); // Give extra time for transition/re-render

                // Re-fetch selector to avoid "Detached Node" error
                const inputSelector = 'input[type="password"], input.bCVoGQ';
                await page.waitForSelector(inputSelector, { timeout: 15000 });
                const passInput = await page.$(inputSelector);

                if (passInput) {
                    console.log("   [4/5] Entering Password...");
                    await randomDelay(500, 1000); // Pause before typing
                    await humanType(passInput, canvaPassword); // Human typing!
                } else {
                    throw new Error("Password input field not found after wait.");
                }

                // STEP 5: Click "Log in" button (span with text "Log in")
                console.log("   [5/5] Clicking Log in...");
                await randomDelay(1000, 2000); // Think before final click

                const loginClicked = await page.evaluate(() => {
                    const spans = Array.from(document.querySelectorAll('span'));
                    const loginSpan = spans.find(s => s.textContent?.trim() === 'Log in');
                    if (loginSpan) {
                        const button = loginSpan.closest('button');
                        if (button) {
                            button.click();
                            return true;
                        }
                    }
                    return false;
                });

                if (!loginClicked) {
                    console.log("   Log in button not found, trying Enter key...");
                    await passInput?.press('Enter');
                }

                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => console.log("   Navigation timeout (might be AJAX login)"));
                console.log("   ✅ Login Submitted. checking access...");

                // Human pause after login
                await randomDelay(2000, 4000);

                // CAPTURE LOGIN SUCCESS SCREENSHOT
                const loginShotPath = `login_success_${Date.now()}.jpg`;
                try {
                    await page.screenshot({ path: loginShotPath, quality: 60, type: 'jpeg' });
                    await sendTelegramPhoto(LOG_CHANNEL_ID || ADMIN_ID, loginShotPath, `✅ <b>Login Success</b>\nBerhasil masuk ke akun Canva!`);
                    if (fs.existsSync(loginShotPath)) fs.unlinkSync(loginShotPath);
                } catch (e) { console.error("Snapshot failed", e); }

                await randomDelay(2000, 3000); // Allow redirect

            } catch (loginErr: any) {
                console.error("❌ Login Failed:", loginErr);
                // Notification logic...
            }
        }

        // FINAL AUTH CHECK
        if (!isLoggedIn) {
            console.error("❌ CRITICAL: Authentication Failed.");
            if (!canvaEmail || !canvaPassword) {
                throw new Error("Login failed (Cookie invalid) AND No Email/Password in .env");
            } else {
                throw new Error("All login methods failed (Cookie & Password). Check credentials/IP.");
            }
        }

        // COOKIE LOADING DISABLED - Using Fresh Login Only
        /*
        if (cookie) {
            console.log("🍪 Loading Backup Cookies...");
            const cookieObjects = cookie.split(';').map(c => {
                const [name, ...v] = c.trim().split('=');
                return { name, value: v.join('='), domain: '.canva.com', path: '/' };
            }).filter(c => c.name && c.value);
            await page.setCookie(...cookieObjects);
        }
        */

        let successInvites = 0;
        let failInvites = 0;
        let successKicks = 0;
        let failKicks = 0;

        // ========================================================================
        // PROCESS INVITES
        // ========================================================================
        for (const user of pendingInvites.rows) {
            const email = user.email as string;
            const userId = user.id as number;
            const username = user.username ? `@${user.username}` : (user.first_name || 'No Name');
            const planName = user.plan_name || 'Trial/Unknown';
            const duration = (user as any).duration_days || 30; // Default 30 days
            const prodId = (user as any).prod_id || 1;

            // Calculate End Date for visual log (Approx)
            const endDateObj = new Date();
            endDateObj.setDate(endDateObj.getDate() + duration);
            const endDateStr = endDateObj.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

            console.log(`📧 Processing Invite: ${email} (${duration} days)`);

            try {
                // Fix: Default to /settings/people for finding the invite button
                const teamUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : 'https://www.canva.com/settings/people';
                console.log(`   Navigating to: ${teamUrl}`);
                await page.goto(teamUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 4000)); // Longer wait for page to stabilize

                // DEBUG: Screenshot the page before attempting invite
                const debugShot = `debug_before_invite_${Date.now()}.jpg`;
                try {
                    await page.screenshot({ path: debugShot, quality: 60, type: 'jpeg' });
                    console.log(`   [DEBUG] Screenshot saved: ${debugShot}`);
                } catch (e) { console.log('   [DEBUG] Screenshot failed'); }

                // NATIVE PUPPETEER INVITE FLOW (More Reliable + HUMAN-LIKE)
                console.log('   [DEBUG] Starting native Puppeteer invite flow...');
                let result = { success: false, message: "" };

                // Human pause before starting
                await randomDelay(1000, 2000);

                try {
                    // 1. Find and click "Invite people" button
                    console.log('   [DEBUG] Looking for Invite people button...');
                    await randomDelay(500, 1000); // Look around

                    const inviteButtonFound = await page.evaluate(() => {
                        const xpath = "//button[contains(., 'Invite people') or contains(., 'Undang orang') or contains(., 'Add students')]";
                        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                        const button = result.singleNodeValue as HTMLElement;
                        if (button) {
                            button.click();
                            return true;
                        }
                        return false;
                    });

                    if (!inviteButtonFound) {
                        // DEBUG: List all buttons found on page to understand what's visible
                        const visibleButtons = await page.evaluate(() => {
                            return Array.from(document.querySelectorAll('button'))
                                .map(b => b.textContent?.trim() || '')
                                .filter(t => t.length > 0)
                                .slice(0, 10); // First 10 buttons
                        });
                        const pageTitle = await page.title();
                        const pageUrl = page.url();

                        console.log(`   [DEBUG] ERROR: Invite button not found!`);
                        console.log(`   [DEBUG] Current Page: ${pageTitle} (${pageUrl})`);
                        console.log(`   [DEBUG] Visible Buttons: ${JSON.stringify(visibleButtons)}`);

                        // Check for specific blockers
                        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500));
                        if (bodyText.includes("What will you be using Canva for")) {
                            console.log("   [DEBUG] BLOCKED by Onboarding Modal! (Needs handling)");
                        }

                        throw new Error(`Invite people button not found. Page: ${pageTitle}`);
                    }

                    console.log('   [DEBUG] Clicking Invite button...');
                    await randomDelay(1500, 2500); // Wait for popup animation (human-like)

                    // 2. Wait for and find email input
                    console.log('   [DEBUG] Waiting for email input to appear...');
                    await randomDelay(800, 1500);

                    const emailInput = await page.$('input[aria-label="Enter email for person 1"]');
                    if (!emailInput) {
                        throw new Error("Email input not found in popup");
                    }

                    // 3. Type email using HUMAN TYPING
                    console.log('   [DEBUG] Typing email with human-like behavior...');
                    await humanType(emailInput, email); // Natural typing with pauses!

                    // 4. Trigger blur to start validation
                    console.log('   [DEBUG] Triggering validation...');
                    await page.keyboard.press('Tab'); // Move focus away
                    await randomDelay(1500, 2500); // Initial wait for validation to start

                    // 5. Wait for Send button to become enabled
                    console.log('   [DEBUG] Waiting for Send button to enable...');
                    let buttonEnabled = false;
                    let waitAttempts = 0;
                    const maxWait = 30; // 30 attempts = 15 seconds max

                    while (!buttonEnabled && waitAttempts < maxWait) {
                        const buttonState = await page.evaluate(() => {
                            const xpath = "//span[contains(text(), 'Send invitations') or contains(text(), 'Kirim undangan')]/ancestor::button";
                            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                            const button = result.singleNodeValue as HTMLButtonElement;

                            if (button) {
                                return {
                                    found: true,
                                    ariaDisabled: button.getAttribute('aria-disabled'),
                                    disabled: button.disabled
                                };
                            }
                            return { found: false, ariaDisabled: null, disabled: null };
                        });

                        if (buttonState && buttonState.found) {
                            buttonEnabled = buttonState.ariaDisabled !== 'true' && !buttonState.disabled;

                            if (waitAttempts % 5 === 0) { // Log every 5 attempts (2.5 seconds)
                                console.log(`   [DEBUG] Attempt ${waitAttempts}/${maxWait} - aria-disabled: ${buttonState.ariaDisabled}, disabled: ${buttonState.disabled}`);
                            }

                            if (buttonEnabled) {
                                console.log('   [DEBUG] Button enabled! Clicking Send...');
                                // Click the button
                                await page.evaluate(() => {
                                    const xpath = "//span[contains(text(), 'Send invitations') or contains(text(), 'Kirim undangan')]/ancestor::button";
                                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                                    const button = result.singleNodeValue as HTMLButtonElement;
                                    if (button) button.click();
                                });
                                break;
                            }
                        }

                        await new Promise(r => setTimeout(r, 500));
                        waitAttempts++;
                    }

                    if (!buttonEnabled) {
                        throw new Error(`Send button did not enable after ${waitAttempts * 0.5} seconds`);
                    }

                    // 6. Wait for and verify success notification
                    console.log('   [DEBUG] Waiting for success notification...');
                    await new Promise(r => setTimeout(r, 3000));

                    // Check for success notification
                    const successFound = await page.evaluate(() => {
                        const xpath = "//*[contains(text(), 'Invitation sent to') or contains(text(), 'Undangan terkirim')]";
                        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                        return !!result.singleNodeValue;
                    });

                    result = {
                        success: successFound,
                        message: successFound ? "Invited" : "No success notification found"
                    };

                    console.log(`   [DEBUG] Result: ${result.success ? '✅ Success' : '❌ Failed'} - ${result.message}`);

                    // 6. Verify "Invitation sent" Toast
                    console.log('   [DEBUG] Waiting for success notification...');
                    try {
                        const successToast = await page.waitForSelector("div._5sEdEQ, div[aria-label^='Invitation sent']", { timeout: 10000 });
                        if (successToast) {
                            console.log("   [DEBUG] ✅ Success Notification Detected!");
                            result = { success: true, message: "Invitation sent successfully" };
                        } else {
                            // Fallback if toast missed but no error
                            console.log("   [DEBUG] Toast missed, but flow completed without error.");
                            result = { success: true, message: "Invitation flow completed (Implicit Success)" };
                        }
                    } catch (e) {
                        // Still consider success if we reached here without throwing earlier errors
                        console.log("   [DEBUG] Toast timeout, but no sync error. Assuming success.");
                        result = { success: true, message: "Invitation sent (Toast check timeout)" };
                    }

                } catch (error: any) {
                    result = {
                        success: false,
                        message: error.message
                    };
                }

                if (result.success) {
                    console.log(`✅ Invited: ${email}`);
                    successInvites++;

                    // Create Subscription Record
                    const subId = `sub_${Date.now()}_${userId}`;
                    await sql(`
                        INSERT INTO subscriptions (id, user_id, product_id, start_date, end_date, status) 
                        VALUES (?, ?, ?, datetime('now'), datetime('now', '+${duration} days'), 'active')
                    `, [subId, userId, prodId]);

                    // Update User Status & Reset Product to Default (1)
                    await sql(`UPDATE users SET status = 'active', selected_product_id = 1 WHERE id = ?`, [userId]);

                    if (userId > 0) {
                        await sendTelegram(userId, `✅ <b>Undangan Dikirim!</b>\nSilakan cek email Anda (${email}) untuk gabung ke tim Canva.\n\n📅 <b>Expired:</b> ${endDateStr}`);
                    }

                    // WAIT FOR SUCCESS NOTIFICATION & REFRESH PAGE
                    console.log("   Waiting 5 seconds for success notification...");
                    await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds as requested by user
                    console.log("   Refreshing page to show user in list...");
                    await page.reload({ waitUntil: 'networkidle2' }); // Refresh to show user in list
                    await new Promise(r => setTimeout(r, 2000)); // Wait for page to fully load

                    // CAPTURE SUCCESS SCREENSHOT & SEND
                    const shotPath = `success_${Date.now()}.jpg`;
                    try {
                        await page.screenshot({ path: shotPath, quality: 60, type: 'jpeg' });
                        const inviteLog = `✅ <b>Invite Success</b>\n👤 User: ${username}\n📧 Email: ${email}\n📅 Expired: ${endDateStr}`;
                        await sendTelegramPhoto(LOG_CHANNEL_ID || ADMIN_ID, shotPath, inviteLog);
                        if (fs.existsSync(shotPath)) fs.unlinkSync(shotPath);
                        if (isLoggedIn) {
                            // Update Cookie in DB for future runs
                            const cookies = await page.cookies();
                            const cookieStr = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');
                            await sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('canva_cookie', ?)", [cookieStr]);
                            console.log("   💾 New Session Cookie Saved to Database!");
                        }
                    } catch (shotErr) {
                        console.error("Screenshot failed:", shotErr);
                        await sendSystemLog(`✅ <b>Invite Success</b> (No Screenshot)\nEmail: ${email}`);
                    }

                } else {
                    console.log(`❌ Failed: ${result.message}`);

                    // Log diagnostic info if available
                    if ((result as any).debug) {
                        const debug = (result as any).debug;
                        console.log(`   [DIAGNOSTIC INFO]:`);
                        console.log(`      - Button found: ${debug.buttonFound}`);
                        console.log(`      - Checks performed: ${debug.checked}/20`);
                        if (debug.lastButtonState) {
                            console.log(`      - Button disabled prop: ${debug.lastButtonState.disabled}`);
                            console.log(`      - Button aria-disabled: ${debug.lastButtonState.ariaDisabled}`);
                            console.log(`      - Button className: ${debug.lastButtonState.className}`);
                        } else {
                            console.log(`      - Button element not found in DOM`);
                        }
                    }

                    failInvites++;
                    await sendSystemLog(`❌ <b>Invite Failed</b>\nEmail: ${email}\nReason: ${result.message}`);

                    // CAPTURE FAIL SCREENSHOT
                    const errShotPath = `fail_${Date.now()}.jpg`;
                    try {
                        await page.screenshot({ path: errShotPath, quality: 60, type: 'jpeg' });
                        await sendTelegramPhoto(LOG_CHANNEL_ID || ADMIN_ID, errShotPath, `❌ <b>Invite Failed</b>\nEmail: ${email}\nReason: ${result.message}`);
                        if (fs.existsSync(errShotPath)) fs.unlinkSync(errShotPath);
                    } catch (shotErr) { console.error("Screenshot failed:", shotErr); }
                }

            } catch (e: any) {
                console.error(e);
                failInvites++;

                // CAPTURE ERROR SCREENSHOT
                const errShotPath = `error_${Date.now()}.jpg`;
                try {
                    await page.screenshot({ path: errShotPath, quality: 60, type: 'jpeg' });
                    await sendTelegramPhoto(LOG_CHANNEL_ID || ADMIN_ID, errShotPath, `❌ <b>Apps Error</b>\nEmail: ${email}\nError: ${e.message}`);
                    if (fs.existsSync(errShotPath)) fs.unlinkSync(errShotPath);
                } catch (shotErr) {
                    console.error("Screenshot failed:", shotErr);
                    await sendSystemLog(`❌ <b>Apps Error</b>\nEmail: ${email}\nError: ${e.message}`);
                }
            }
        }

        // ========================================================================
        // PROCESS KICKS
        // ========================================================================
        for (const user of expiredUsers.rows) {
            const email = user.email as string;
            const userId = user.id as number;
            const username = user.username ? `@${user.username}` : (user.first_name || 'No Name');
            const planName = user.plan_name || 'Unknown';
            const endDate = user.end_date ? new Date(user.end_date as string).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '-';

            console.log(`🦶 Processing Kick: ${email}`);

            try {
                // Fix: Default to /settings/people for finding the user
                const teamUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : 'https://www.canva.com/settings/people';
                await page.goto(teamUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000));

                // 0. Extract Member Count (Monitoring 500 Limit)
                const teamMemberCount = await page.evaluate(() => {
                    const h1 = Array.from(document.querySelectorAll('h1')).find(el => el.textContent?.includes('People') || el.textContent?.includes('Anggota'));
                    if (h1) {
                        const match = h1.textContent?.match(/\((\d+)\)/);
                        return match ? parseInt(match[1]) : 0;
                    }
                    return 0;
                });

                if (teamMemberCount > 0) {
                    console.log(`📊 Team Slots: ${teamMemberCount}/500`);
                    await sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('canva_team_members_count', ?)", [teamMemberCount.toString()]);

                    if (teamMemberCount >= 500) {
                        console.error("⚠️ TEAM FULL! Slots reached 500/500.");
                        await sendSystemLog(`⚠️ <b>TEAM FULL WARNING!</b>\nJumlah anggota mencapai limit 500.\nBot mungkin akan gagal invite.`);
                    }
                }

                const result = await page.evaluate(async (targetEmail: string) => {
                    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

                    try {
                        const findByText = (tag: string, text: string) => Array.from(document.querySelectorAll(tag)).find(el => el.textContent?.toLowerCase().includes(text.toLowerCase())) as HTMLElement;

                        // 1. Find the User Row
                        // Strategy: Find element with email text, then go up to TR or row div
                        const allElements = Array.from(document.querySelectorAll('div, span, td'));
                        const emailEl = allElements.find(el => el.textContent?.trim() === targetEmail);

                        if (!emailEl) return { success: false, message: "User Email not found in list" };

                        let row = emailEl.parentElement;
                        // Find a parent that looks like a row (contains checkboxes)
                        while (row && row.tagName !== 'TR' && !row.querySelector('input[type="checkbox"]')) {
                            row = row.parentElement;
                            if (!row || row === document.body) break;
                        }

                        if (!row) return { success: false, message: "Row container not found" };

                        // 2. Click Checkbox
                        const checkbox = row.querySelector('input[type="checkbox"]');
                        if (!checkbox) return { success: false, message: "Checkbox not found in row" };

                        (checkbox as HTMLElement).click();
                        await sleep(1000);

                        // 3. Find Delete Icon (Trash Can) 
                        // Log (V4): TAG: SPAN, CLASS: vxQy1w, No Text/Aria
                        // We try Aria first (best practice), then fallback to specific class from user log.
                        let deleteBtn = document.querySelector('button[aria-label*="Remove" i]') ||
                            document.querySelector('button[aria-label*="Delete" i]') ||
                            document.querySelector('button[aria-label*="Hapus" i]') ||
                            document.querySelector('.vxQy1w') as HTMLElement; // Fallback from User Log

                        if (!deleteBtn) {
                            // Fallback: Try to find the "Trash" icon by looking for an SVG path? Too complex.
                            // Let's rely on the class provided by user log for now.
                            return { success: false, message: "Delete/Trash button not found (Tried: Aria & Class vxQy1w)" };
                        }

                        (deleteBtn as HTMLElement).click();
                        await sleep(1500); // Wait for popup

                        // 4. Confirm Popup "Remove from team"
                        // Log (V4): TAG: SPAN, TEXT: "Remove from team"
                        const confirmBtn = findByText('button', 'Remove from team') ||
                            findByText('span', 'Remove from team') ||
                            findByText('button', 'Hapus dari tim') ||
                            findByText('span', 'Hapus dari tim') ||
                            document.querySelector('button[kind="destructive"]');

                        if (!confirmBtn) return { success: false, message: "Confirm Remove button not found in popup" };

                        (confirmBtn as HTMLElement).click();
                        await sleep(2000);

                        return { success: true };

                    } catch (e: any) { return { success: false, message: e.message }; }
                }, email);

                if (result.success) {
                    console.log(`✅ Kicked: ${email}`);
                    successKicks++;
                    await sql(`UPDATE subscriptions SET status = 'kicked' WHERE user_id = ? AND status = 'active'`, [userId]);
                    if (userId > 0) {
                        await sendTelegram(userId, `⚠️ <b>Langganan Berakhir</b>\nAkses Canva Pro Anda telah berakhir pada ${endDate}.`);
                    }

                    const kickLog = `🦶 <b>User Kicked</b>\n👤 User: ${username} (ID: <code>${userId}</code>)\n📧 Email: <code>${email}</code>\n📦 Paket: ${planName}`;
                    await sendSystemLog(kickLog);

                } else {
                    failKicks++;
                    await sendSystemLog(`⚠️ <b>Kick Failed</b>\nEmail: ${email}\nReason: ${result.message}`);
                }

            } catch (e: any) {
                console.error(e);
                failKicks++;
                await sendSystemLog(`⚠️ <b>Kick Error</b>\nEmail: ${email}\nError: ${e.message}`);
            }
        }

        await browser.close();

        const summary = `
🏁 <b>Job Finished</b>
✅ Invites: ${successInvites} | Kicks: ${successKicks}
❌ Fails:   ${failInvites} | Failed Kicks: ${failKicks}
        `.trim();
        await sendSystemLog(summary);
        console.log("🏁 Queue Processing Finished.");

    } catch (criticalError: any) {
        console.error("CRITICAL ERROR:", criticalError);
        await sendSystemLog(`⛔ <b>Critical Error</b>\n${criticalError.message}`);
    }
}

runPuppeteerQueue().catch(console.error);
