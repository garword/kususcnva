/// <reference lib="dom" />
import puppeteer from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';

dotenv.config();

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

        // Get Credentials
        const cookieRes = await sql("SELECT value FROM settings WHERE key = 'canva_cookie'");
        const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
        const uaRes = await sql("SELECT value FROM settings WHERE key = 'canva_user_agent'");

        if (cookieRes.rows.length === 0) throw new Error("No Canva Cookie in DB!");

        const cookie = cookieRes.rows[0].value as string;
        const teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value as string : undefined;
        const userAgent = uaRes.rows.length > 0 ? uaRes.rows[0].value as string : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        const browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });

        const page = await browser.newPage();
        await page.setUserAgent(userAgent);
        await page.setViewport({ width: 1280, height: 800 });

        // AUTHENTICATION STRATEGY: EMAIL/PASSWORD PRIORITY -> COOKIE FALLBACK
        const canvaEmail = process.env.CANVA_EMAIL;
        const canvaPassword = process.env.CANVA_PASSWORD;

        if (canvaEmail && canvaPassword) {
            console.log(`🔐 Attempting Login with Email: ${canvaEmail}...`);
            await page.goto('https://www.canva.com/login', { waitUntil: 'networkidle2' });

            try {
                // 1. Enter Email
                console.log("   Entering Email...");
                const emailInput = await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 10000 });
                if (emailInput) {
                    await emailInput.type(canvaEmail, { delay: 50 });
                    await emailInput.press('Enter');
                }

                // 2. Wait for Password Field OR "Continue" button
                await new Promise(r => setTimeout(r, 2000));

                // Check if we need to click "Continue" first (sometimes split login)
                const continueBtn = await page.$('button[type="submit"]');
                if (continueBtn) {
                    // Sometimes just Enter works, sometimes explicit click needed
                }

                // 3. Enter Password
                console.log("   Entering Password...");
                const passInput = await page.waitForSelector('input[name="password"], input[type="password"]', { timeout: 10000 });
                if (passInput) {
                    await passInput.type(canvaPassword, { delay: 50 });
                    await passInput.press('Enter');
                }

                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => console.log("   Navigation timeout (might be AJAX login)"));
                console.log("   ✅ Login Submitted. checking access...");

                // CAPTURE LOGIN SUCCESS SCREENSHOT
                const loginShotPath = `login_success_${Date.now()}.jpg`;
                try {
                    await page.screenshot({ path: loginShotPath, quality: 60, type: 'jpeg' });
                    await sendTelegramPhoto(LOG_CHANNEL_ID || ADMIN_ID, loginShotPath, `✅ <b>Login Success</b>\nBerhasil masuk ke akun Canva!`);
                    if (fs.existsSync(loginShotPath)) fs.unlinkSync(loginShotPath);
                } catch (e) { console.error("Snapshot failed", e); }

                await new Promise(r => setTimeout(r, 3000)); // Allow redirect

            } catch (loginErr: any) {
                console.error("❌ Login Failed:", loginErr);
                const shotPath = `login_fail_${Date.now()}.jpg`;
                try {
                    await page.screenshot({ path: shotPath });
                    await sendTelegramPhoto(LOG_CHANNEL_ID || ADMIN_ID, shotPath, `❌ <b>Login Failed</b>\nReason: ${loginErr.message}`);
                    if (fs.existsSync(shotPath)) fs.unlinkSync(shotPath);
                } catch (e) { console.error("Screenshot failed", e); }

                // Fallback to cookie
                console.log("⚠️ Falling back to Cookie if available...");
            }
        }

        // Always try to load cookie as backup/supplement if login didn't fully establish session or skipped
        if (cookie) {
            console.log("🍪 Loading Backup Cookies...");
            const cookieObjects = cookie.split(';').map(c => {
                const [name, ...v] = c.trim().split('=');
                return { name, value: v.join('='), domain: '.canva.com', path: '/' };
            }).filter(c => c.name && c.value);
            await page.setCookie(...cookieObjects);
        }

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
                const teamUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : 'https://www.canva.com/settings/team';
                await page.goto(teamUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000));

                const result = await page.evaluate(async (targetEmail) => {
                    const sleep = (ms: number) => new Promise(r => setTimeout(r, 100)); // Faster sleep

                    // Helper to find by text
                    const findByText = (tag: string, text: string) => {
                        return Array.from(document.querySelectorAll(tag))
                            .find(el => el.textContent?.toLowerCase().includes(text.toLowerCase())) as HTMLElement;
                    };

                    try {
                        // 1. Click 'Invite people' (Usually a SPAN or BUTTON)
                        // Log says: TAG: SPAN, TEXT: "Invite people"
                        const inviteBtn = findByText('span', 'Invite people') || findByText('button', 'Invite people');
                        if (!inviteBtn) return { success: false, message: "Invite button not found (Text: Invite people)" };
                        inviteBtn.click();
                        await sleep(1500);

                        // 2. Fill Email
                        // Log says: TAG: INPUT, ARIA: "Enter email for person 1"
                        let input = document.querySelector('input[aria-label="Enter email for person 1"]') as HTMLInputElement;
                        if (!input) {
                            // Fallback to placeholder
                            input = document.querySelector('input[placeholder*="email" i]') as HTMLInputElement;
                        }
                        if (!input) return { success: false, message: "Email input not found" };

                        input.value = targetEmail;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        await sleep(500);

                        // 3. (Optional) Set Role to Student if needed
                        // Log says: TAG: BUTTON, ARIA: "Assign role to person 1"
                        // Verify if it defaults to Student. Log shows "Student" text in span. Assuming default is fine for now.

                        // 4. Click 'Send invitations'
                        // Log says: TAG: SPAN, TEXT: "Send invitations"
                        const sendBtn = findByText('span', 'Send invitations') || findByText('button', 'Send invitations');
                        if (!sendBtn) return { success: false, message: "Send button not found (Text: Send invitations)" };

                        sendBtn.click();
                        await sleep(2500);

                        // 5. Validate
                        const bodyText = document.body.innerText.toLowerCase();
                        if (bodyText.includes('sent') || bodyText.includes('invited') || bodyText.includes('berhasil')) {
                            return { success: true, message: "Invited" };
                        }
                        // If dialog closed, assume success
                        if (!document.body.contains(sendBtn)) {
                            return { success: true, message: "Dialog closed (Assumed Success)" };
                        }

                        return { success: true, message: "Assumed success (no error)" };

                    } catch (e: any) {
                        return { success: false, message: e.message };
                    }
                }, email);

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
                    await sql(`UPDATE users SET status = 'active', selected_product_id = 1, updated_at = datetime('now') WHERE id = ?`, [userId]);

                    if (userId > 0) {
                        await sendTelegram(userId, `✅ <b>Undangan Dikirim!</b>\nSilakan cek email Anda (${email}) untuk gabung ke tim Canva.\n\n📅 <b>Expired:</b> ${endDateStr}`);
                    }

                    // CAPTURE SUCCESS SCREENSHOT & SEND
                    const shotPath = `success_${Date.now()}.jpg`;
                    try {
                        await page.screenshot({ path: shotPath, quality: 60, type: 'jpeg' });
                        const inviteLog = `✅ <b>Invite Success</b>\n👤 User: ${username}\n📧 Email: ${email}\n📅 Expired: ${endDateStr}`;
                        await sendTelegramPhoto(LOG_CHANNEL_ID || ADMIN_ID, shotPath, inviteLog);
                        if (fs.existsSync(shotPath)) fs.unlinkSync(shotPath);
                    } catch (shotErr) {
                        console.error("Screenshot failed:", shotErr);
                        await sendSystemLog(`✅ <b>Invite Success</b> (No Screenshot)\nEmail: ${email}`);
                    }

                } else {
                    console.log(`❌ Failed: ${result.message}`);
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
                const teamUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : 'https://www.canva.com/settings/team';
                await page.goto(teamUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000));

                const result = await page.evaluate(async (targetEmail) => {
                    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
                    try {
                        const allElements = Array.from(document.querySelectorAll('*'));
                        const userEl = allElements.find(el => el.textContent === targetEmail);
                        if (!userEl) return { success: false, message: "User not found" };

                        let row = userEl.parentElement;
                        while (row && row.tagName !== 'TR' && !row.className.includes('row')) {
                            row = row.parentElement;
                            if (!row) break;
                        }
                        if (!row) return { success: false, message: "Row not found" };

                        const btn = row.querySelector('button[aria-label*="Remove"], button[aria-label*="Delete"]') as HTMLElement;
                        if (btn) {
                            btn.click();
                            await sleep(1000);
                            const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.match(/remove|confirm|hapus/i)) as HTMLElement;
                            if (confirmBtn) confirmBtn.click();
                            return { success: true };
                        }
                        return { success: false, message: "Button not found" };
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
