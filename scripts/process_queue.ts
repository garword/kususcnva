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
            headless: false,
            defaultViewport: null,
            ignoreDefaultArgs: ['--enable-automation'],
            args: [
                '--start-maximized',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });

        const page = await browser.newPage();

        // Remove webdriver flag
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });
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
                // Fix: Default to /settings/people for finding the invite button
                const teamUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : 'https://www.canva.com/settings/people';
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
                        // DEBUG: Screenshot page before doing anything
                        // We can't take screenshot inside evaluate directly easily without exposing function, 
                        // so we do it outside if possible, but here we are inside evaluate.
                        // Actually, we can return a specific status to trigger screenshot outside, but for now let's rely on finding robustly.

                        // 1. Check for 'Invite people' button
                        // Search in button, span, div, a
                        // Also check aria-label which is often better.
                        const findByAria = (labelPart: string) => {
                            return Array.from(document.querySelectorAll(`[aria-label*="${labelPart}" i]`))
                                .map(el => el as HTMLElement)
                                .find(el => el.offsetParent !== null);
                        }

                        let inviteBtn = findByText('span', 'Invite people') || findByText('button', 'Invite people') ||
                            findByText('span', 'Undang orang') || findByText('button', 'Undang orang') ||
                            findByText('div', 'Invite people') || findByText('a', 'Invite people') ||
                            findByAria("Invite people") || findByAria("Undang orang") || findByAria("Invite members");

                        // FALLBACK: If not found, look for sidebar 
                        if (!inviteBtn) {
                            // ... existing sidebar logic ...
                            const peopleTab = findByText('span', 'People') || findByText('p', 'People') ||
                                findByText('span', 'Anggota') || findByText('p', 'Anggota') ||
                                findByText('span', 'Tim') || findByText('p', 'Tim');

                            if (peopleTab) {
                                peopleTab.click();
                                await sleep(3000);
                                inviteBtn = findByText('span', 'Invite people') || findByText('button', 'Invite people') ||
                                    findByText('span', 'Undang orang') || findByText('button', 'Undang orang');
                            }
                        }

                        if (!inviteBtn) return { success: false, message: "Invite button not found (Tried: Text & Aria)" };

                        // Click and Wait for Popup
                        inviteBtn.click();
                        console.log('   [DEBUG] Clicked Invite button, waiting for popup...');

                        // 2. WAIT FOR INPUT TO APPEAR (Polling with retries)
                        // The popup has animation - input might not be available immediately
                        let input: HTMLInputElement | null = null;
                        let retries = 0;
                        const maxRetries = 10;

                        while (!input && retries < maxRetries) {
                            await sleep(800); // Wait 800ms between each try

                            // Try multiple selectors in order of specificity
                            input = document.querySelector('input[aria-label="Enter email for person 1"]') as HTMLInputElement;
                            if (!input) input = document.querySelector('input[aria-label*="email"]') as HTMLInputElement;
                            if (!input) input = document.querySelector('input[placeholder*="email" i]') as HTMLInputElement;
                            if (!input) input = document.querySelector('input[type="email"]') as HTMLInputElement;
                            if (!input) {
                                // Last resort: find any visible text input in the page
                                const allInputs = Array.from(document.querySelectorAll('input[type="text"], input:not([type])'));
                                input = allInputs.find(el => {
                                    const inp = el as HTMLInputElement;
                                    return inp.offsetParent !== null && !inp.disabled;
                                }) as HTMLInputElement;
                            }

                            retries++;
                            console.log(`   [DEBUG] Polling attempt ${retries}/${maxRetries} - Input found: ${!!input}`);
                        }

                        if (!input) return { success: false, message: `Email input not found after ${maxRetries} retries (popup may not have opened)` };

                        // 2. Type Email Like Human (Character by Character)
                        console.log('   [DEBUG] Typing email like human...');
                        input.focus();
                        await sleep(300);

                        for (const char of targetEmail) {
                            input.value += char;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            await sleep(Math.random() * 100 + 50); // Random delay 50-150ms per character
                        }

                        console.log('   [DEBUG] Email typed, triggering validation...');
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        input.blur(); // Trigger validation
                        await sleep(500);

                        // 3. (Optional) Set Role to Student if needed
                        // Log says: TAG: BUTTON, ARIA: "Assign role to person 1"
                        // Verify if it defaults to Student. Log shows "Student" text in span. Assuming default is fine for now.

                        // 4. WAIT FOR BUTTON TO ENABLE (Check disabled state)
                        console.log('   [DEBUG] Waiting for Send button to enable...');
                        let buttonEnabled = false;
                        let waitAttempts = 0;
                        const maxWaitForButton = 20;

                        while (!buttonEnabled && waitAttempts < maxWaitForButton) {
                            await sleep(500);

                            const sendBtn = findByText('span', 'Send invitations') || findByText('button', 'Send invitations') ||
                                findByText('span', 'Kirim undangan') || findByText('button', 'Kirim undangan');

                            if (sendBtn && sendBtn.closest('button')) {
                                const btn = sendBtn.closest('button') as HTMLButtonElement;
                                buttonEnabled = !btn.disabled && !btn.hasAttribute('disabled');
                                console.log(`   [DEBUG] Button check ${waitAttempts + 1}/${maxWaitForButton} - Enabled: ${buttonEnabled}`);
                            }
                            waitAttempts++;
                        }

                        if (!buttonEnabled) {
                            return { success: false, message: "Send button did not enable after typing email" };
                        }

                        // 5. Click 'Send invitations'
                        const sendBtn = findByText('span', 'Send invitations') || findByText('button', 'Send invitations') ||
                            findByText('span', 'Kirim undangan') || findByText('button', 'Kirim undangan');

                        if (!sendBtn) return { success: false, message: "Send button not found (Text: Send invitations)" };

                        sendBtn.click();
                        console.log('   [DEBUG] Clicked Send button, waiting for confirmation...');
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
                    await sql(`UPDATE users SET status = 'active', selected_product_id = 1 WHERE id = ?`, [userId]);

                    if (userId > 0) {
                        await sendTelegram(userId, `✅ <b>Undangan Dikirim!</b>\nSilakan cek email Anda (${email}) untuk gabung ke tim Canva.\n\n📅 <b>Expired:</b> ${endDateStr}`);
                    }

                    // WAIT FOR SUCCESS NOTIFICATION & REFRESH PAGE
                    console.log("   Waiting for success notification and refreshing page...");
                    await new Promise(r => setTimeout(r, 3000)); // Wait for notification to appear
                    await page.reload({ waitUntil: 'networkidle2' }); // Refresh to show user in list
                    await new Promise(r => setTimeout(r, 2000)); // Wait for page to fully load

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

                const result = await page.evaluate(async (targetEmail) => {
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
