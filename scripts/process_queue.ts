// @ts-nocheck
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as puppeteerCore from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import { TimeUtils } from '../src/lib/time';

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

// Helper: Random Delay
const randomDelay = (min: number, max: number) => new Promise(r => setTimeout(r, Math.random() * (max - min) + min));

// Helper to edit existing Telegram message
async function editTelegramMessage(chatId: string | number, messageId: number, text: string, options: any = {}) {
    if (!BOT_TOKEN) return null;
    try {
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: text,
            parse_mode: 'HTML',
            ...options
        });
        return response.data.result.message_id;
    } catch (e: any) {
        console.error("Failed to edit Telegram message:", e.message);
        return null;
    }
}

async function sendTelegram(chatId: string | number, message: string, options: any = {}) {
    if (!BOT_TOKEN) return null;
    try {
        const response = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML',
            ...options
        });
        return response.data.result.message_id;
    } catch (e: any) {
        console.error("Failed to send Telegram:", e.message);
        return null;
    }
}


async function deleteTelegramMessage(chatId: string | number, messageId: number) {
    if (!BOT_TOKEN) return;
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
            chat_id: chatId,
            message_id: messageId
        });
        console.log(`🗑️ Deleted message ${messageId} for user ${chatId}`);
    } catch (e: any) {
        console.error("Failed to delete Telegram message:", e.message);
    }
}

// Helper to log to the dedicated channel
async function sendSystemLog(message: string) {
    const target = LOG_CHANNEL_ID || ADMIN_ID;
    if (!BOT_TOKEN || !target) return;

    // Add timestamp header
    const time = TimeUtils.format(); // Consistent WIB Time
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
        WHERE s.end_date < datetime('now', '+7 hours') AND s.status = 'active'
    `);

    if (pendingInvites.rows.length === 0 && expiredUsers.rows.length === 0) {
        console.log("✅ Queue is empty. Nothing to do.");
        return;
    }

    const startMsg = `⚙️ <b>Job Dimulai</b>\n📊 Antrian Invite: ${pendingInvites.rows.length}\n📊 User Expired: ${expiredUsers.rows.length}`;
    console.log(startMsg);
    await sendSystemLog(startMsg);

    // 2. Siapkan Browser
    try {
        const chromePath = getChromePath();
        if (!chromePath) throw new Error("Chrome tidak ditemukan!");

        // 2a. Get Global User Agent
        let globalUA = "";
        try {
            const uaRes = await sql("SELECT value FROM settings WHERE key = 'canva_user_agent'");
            if (uaRes.rows.length > 0) globalUA = uaRes.rows[0].value as string;
        } catch { console.log("⚠️ Failed to fetch custom UA, using default."); }

        const browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: process.env.CI ? 'new' : false,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', '--start-maximized',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        if (globalUA) {
            console.log(`   🎭 Apply Custom UA: ${globalUA.substring(0, 30)}...`);
            await page.setUserAgent(globalUA);
        }

        // ============================================================================
        // MULTI-ACCOUNT SELECTOR (ROUND ROBIN / FILL FIRST)
        // ============================================================================
        console.log("🔄 Selecting Active Account...");

        // 1. Get All Active Accounts (Sorted by ID to Prioritize Main Account)
        const accountsRes = await sql("SELECT * FROM canva_accounts WHERE is_active = 1 ORDER BY id ASC");
        const accounts = accountsRes.rows;

        if (accounts.length === 0) {
            throw new Error("❌ No active Canva accounts found in DB! Use /addaccount to setup.");
        }

        // 2. Select First Available Account (Smart Refill)
        let selectedAccount: any = null;
        for (const acc of accounts) {
            const currentMembers = parseInt(acc.member_count as any) || 0;
            const maxSlots = parseInt(acc.max_slots as any) || 500;

            if (currentMembers < maxSlots) {
                selectedAccount = acc;
                console.log(`✅ Selected Account ID: ${acc.id} (Slots: ${currentMembers}/${maxSlots})`);
                break;
            }
        }

        // Fallback: If all full, use the LAST account (to at least try or show error)
        if (!selectedAccount) {
            console.warn("⚠️ All Accounts are FULL! Using the last account as fallback.");
            selectedAccount = accounts[accounts.length - 1];
        }

        // ============================================================================
        // AUTHENTICATION (COOKIE ONLY)
        // ============================================================================
        const cookieStr = selectedAccount.cookie as string;
        let cookies: any[] = [];
        let isLoggedIn = false;

        try {
            // Parse Cookie (JSON or String)
            try {
                cookies = JSON.parse(cookieStr);
            } catch {
                cookies = cookieStr.split(';').map(part => {
                    const [name, ...rest] = part.trim().split('=');
                    if (!name) return null;
                    return { name, value: rest.join('='), domain: '.canva.com', path: '/', secure: true };
                }).filter(c => c !== null);
            }

            if (!Array.isArray(cookies)) cookies = [cookies];

            // Set Cookies
            await page.setCookie(...cookies);
            console.log(`   🍪 Loaded ${cookies.length} cookies for Account ID ${selectedAccount.id}.`);

            // Verify Session
            await page.goto('https://www.canva.com/folder/all-designs', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await randomDelay(3000, 5000);

            if (!page.url().includes('login') && !page.url().includes('signup')) {
                console.log("   ✅ Login Success via Cookie!");
                isLoggedIn = true;
            } else {
                console.error(`   ❌ Account ID ${selectedAccount.id} Cookie EXPIRED!`);
                await sendSystemLog(`⚠️ <b>Akun Mati!</b>\nID: ${selectedAccount.id}\nCookie Expired. Mohon update dgn /addaccount lagi.`);

                // Disable Account? Optionally
                // await sql("UPDATE canva_accounts SET is_active = 0 WHERE id = ?", [selectedAccount.id]);
                throw new Error("Selected Account Cookie Invalid. Skipping job.");
            }

        } catch (e: any) {
            throw new Error(`Auth Failed for Account ${selectedAccount.id}: ${e.message}`);
        }

        // ============================================================================
        // AUTO-DISCOVERY (METADATA SCRAPING)
        // ============================================================================
        // If Email or Team ID is missing, fetch it now.
        if (!selectedAccount.email || !selectedAccount.team_id || accounts.length === 1) { // Always check for single account update
            try {
                console.log("🕵️ Auto-Discovery: Updating Account Metadata...");

                // 1. Get Team ID (from URL or API)
                // Current URL might be: https://www.canva.com/brand/TEAM_ID/....
                const currentUrl = page.url();
                const brandMatch = currentUrl.match(/brand\/([a-zA-Z0-9_-]+)/);
                let detectedTeamId = brandMatch ? brandMatch[1] : null;

                // 2. Get Email (from Settings)
                let detectedEmail = null;
                if (!selectedAccount.email) {
                    await page.goto("https://www.canva.com/settings/your-account", { waitUntil: 'networkidle2' });
                    await randomDelay(2000, 3000);
                    detectedEmail = await page.evaluate(() => {
                        // Try finding email in inputs or text
                        const emailEl = document.querySelector('p[data-cy="email-address"]'); // Theoretical selector
                        return emailEl ? emailEl.textContent : null;
                    });
                    // Fallback: If scraping fails, maybe infer or skip
                }

                if (detectedTeamId || detectedEmail) {
                    await sql(`
                        UPDATE canva_accounts 
                        SET team_id = COALESCE(?, team_id), 
                            email = COALESCE(?, email),
                            last_used = datetime('now', '+7 hours')
                        WHERE id = ?
                    `, [detectedTeamId, detectedEmail, selectedAccount.id]);
                    console.log(`   ✅ Metadata Updated: Team=${detectedTeamId || 'Keep'}, Email=${detectedEmail || 'Keep'}`);

                    // Update Local Var
                    if (detectedTeamId) selectedAccount.team_id = detectedTeamId;
                }

            } catch (e) {
                console.warn("   ⚠️ Auto-Discovery Warning (Non-Fatal):", e);
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

        const teamId = selectedAccount.team_id;
        let successInvites = 0;
        let failInvites = 0;
        let successKicks = 0;
        let failKicks = 0;

        // ========================================================================
        // PROCESS INVITES (BATCH MODE - "SERENTAK")
        // ========================================================================
        if (pendingInvites.rows.length > 0) {
            console.log(`🚀 Starting Batch Invite for ${pendingInvites.rows.length} users...`);
            let globalInviteData = { success: false, message: "" };

            try {
                // 1. NAVIGATE & GET CODE (ONCE)
                // Fix: Default to /settings/people for finding the invite button
                const teamUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : 'https://www.canva.com/settings/people';
                console.log(`   Navigating to: ${teamUrl}`);
                await page.goto(teamUrl, { waitUntil: 'networkidle2', timeout: 60000 });
                await randomDelay(3000, 5000);

                console.log('   [DEBUG] Looking for Invite people button...');
                const inviteButtonFound = await page.evaluate(() => {
                    const xpath = "//button[contains(., 'Invite people') or contains(., 'Undang orang') or contains(., 'Add students')]";
                    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const button = result.singleNodeValue as HTMLElement;
                    if (button) { button.click(); return true; }
                    return false;
                });

                if (!inviteButtonFound) throw new Error("Invite people button not found");

                await randomDelay(1500, 2500);
                console.log('   [DEBUG] Starting "Via Code" Flow...');

                const viaCodeBtn = await page.waitForSelector('button[aria-label="Via code"]', { timeout: 10000 });
                if (viaCodeBtn) {
                    await viaCodeBtn.click();
                    await randomDelay(2000, 3000);

                    // Try to scrape the code from the UI first (More reliable than clipboard)
                    let code = await page.evaluate(() => {
                        // Look for the large code text
                        const allDivs = Array.from(document.querySelectorAll('div, span, h1, h2, h3, p'));
                        for (const el of allDivs) {
                            let text = el.innerText?.trim();
                            if (!text) continue;

                            // 1. Format: "ABC - DEF - GHI" (New Detected Format)
                            if (/^[A-Z0-9]{3}\s?[-–]\s?[A-Z0-9]{3}\s?[-–]\s?[A-Z0-9]{3}$/i.test(text)) {
                                return text.replace(/[-–\s]/g, ''); // Return clean string "ABCDEFGHI"
                            }

                            // 2. Format: "ABC 123" (Old Format)
                            if (/^[A-Z0-9]{3}\s[A-Z0-9]{3}$/i.test(text)) {
                                return text.replace(/\s/g, '');
                            }

                            // 3. Format: "ABC123DEF" (Contiguous)
                            if (/^[A-Z0-9]{6,9}$/i.test(text)) return text;
                        }
                        return null;
                    });

                    if (code) {
                        console.log(`   [DEBUG] Scraped Code from UI: ${code}`);
                    } else {
                        // Fallback: Clipboard
                        console.log("   [DEBUG] UI Scrape failed, trying Clipboard...");
                        const copyCodeBtn = await page.waitForSelector('button[aria-label="Copy code"]', { timeout: 10000 });
                        if (copyCodeBtn) {
                            await copyCodeBtn.click();
                            await new Promise(r => setTimeout(r, 1000));
                            code = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
                        }
                    }

                    if (code) {
                        globalInviteData = { success: true, message: code };
                        console.log(`   [DEBUG] Success! Class Code retrieved: ${code}`);
                    } else {
                        throw new Error("Clipboard empty & UI scrape failed");
                    }
                } else throw new Error("Via code button not found");

            } catch (e: any) {
                console.error("❌ Failed to fetch Invite Code:", e.message);
                await sendSystemLog(`❌ <b>Batch Invite Error</b>\nGagal mengambil Invite Code.\nError: ${e.message}`);
            }

            // 2. DISTRIBUTE TO USERS (IF SUCCESS)
            if (globalInviteData.success) {
                console.log(`📤 Broadcasting Code to ${pendingInvites.rows.length} users...`);

                for (const user of pendingInvites.rows) {
                    const email = user.email as string;
                    const userId = user.id as number;
                    const prodId = (user as any).prod_id || 1;
                    const duration = (user as any).duration_days || 30;
                    // WIB Date Object for End Date
                    const endDateObj = TimeUtils.addDaysWIB(duration);
                    // WIB String for DB
                    const endDateStr = endDateObj.toISOString().replace('T', ' ').substring(0, 19);

                    console.log(`   📧 Sending to ${email}...`);

                    try {
                        // DB UPDATE (Subscription + Active Status)
                        // Check for ANY active subscription
                        const activeSubRes = await sql(`SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active'`, [userId]);

                        if (activeSubRes.rows.length > 0) {
                            // Update existing (Extend/Replace)
                            const existingId = activeSubRes.rows[0].id;
                            const startStr = TimeUtils.getWIBISOString();

                            // Important: For consistency, verify if we should just ADD to existing end_date or Replace.
                            // The user previous request implies simple replacement/extension logic in queue is OK for now, 
                            // as strict extension is handled in /aktivasi command. 
                            // Here we just accept the duration from queue.

                            await sql(`UPDATE subscriptions SET end_date = ?, product_id = ?, start_date = ? WHERE id = ?`, [endDateStr, prodId, startStr, existingId]);
                            console.log(`   🔄 Updated existing subscription ${existingId}`);
                        } else {
                            // Insert New
                            const subId = `sub_${Date.now()}_${userId}`;
                            const startStr = TimeUtils.getWIBISOString();
                            const endStr = endDateObj.toISOString().replace('T', ' ').substring(0, 19);
                            await sql(`INSERT INTO subscriptions (id, user_id, product_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, 'active')`, [subId, userId, prodId, startStr, endStr]);
                            console.log(`   ➕ Created new subscription ${subId}`);
                        }

                        // NOTIFY USER
                        if (userId > 0) {
                            let msgId = null;
                            const lastMsgId = user.last_message_id;

                            if (globalInviteData.message.startsWith("http")) {
                                const text = `⚠️ <b>Metode Email Dibatasi!</b>\n\nSilakan klik link di bawah untuk join:\n\n🔗 ${globalInviteData.message}\n\n📅 <b>Expired:</b> ${endDateStr}`;
                                if (lastMsgId) msgId = await editTelegramMessage(userId.toString(), parseInt(String(lastMsgId)), text);
                                if (!msgId) msgId = await sendTelegram(userId.toString(), text);
                            } else {
                                const code = globalInviteData.message;
                                const text = `🎉 <b>UNDANGAN CANVA PRO PROSES SUKSES!</b>\n\n<b>1. Buka Link:</b> <a href="https://www.canva.com/class/join">https://www.canva.com/class/join</a>\n<b>2. Masukkan Kode:</b> <code>${code}</code>\n\n⏳ <i>Pesan ini akan dihapus dalam 2 menit.</i>`;
                                if (lastMsgId) msgId = await editTelegramMessage(userId.toString(), parseInt(String(lastMsgId)), text, { disable_web_page_preview: true });
                                if (!msgId) msgId = await sendTelegram(userId.toString(), text, { disable_web_page_preview: true });
                            }

                            // Auto-Delete logic
                            if (msgId) setTimeout(() => { deleteTelegramMessage(userId, msgId); }, 120 * 1000);
                        }

                        // Mark Active
                        await sql(`UPDATE users SET status = 'active' WHERE id = ?`, [userId]);
                        successInvites++;

                    } catch (distErr) {
                        console.error(`   ❌ Error sending to ${userId}:`, distErr);
                        failInvites++;
                    }
                }
            } else {
                console.log("   ⚠️ Skipping distribution due to fetch failure.");
                failInvites += pendingInvites.rows.length;
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
            const endDate = user.end_date ? TimeUtils.format(new Date((user.end_date as string).replace(' ', 'T') + 'Z')).replace(' WIB', '') : '-';

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
                    console.log(`📊 Team Slots: ${teamMemberCount}/${selectedAccount.max_slots}`);
                    await sql("UPDATE canva_accounts SET member_count = ?, last_used = datetime('now', '+7 hours') WHERE id = ?", [teamMemberCount, selectedAccount.id]);

                    if (teamMemberCount >= selectedAccount.max_slots) {
                        console.error("⚠️ TEAM FULL! Slot mencapai limit.");
                        await sendSystemLog(`⚠️ <b>PERINGATAN SLOT PENUH!</b>\nAkun ID: ${selectedAccount.id} (${selectedAccount.email})\nJumlah anggota: ${teamMemberCount}/${selectedAccount.max_slots}.`);
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


        // ========================================================================
        // SESSION ROLLING (AUTO-REFRESH COOKIE)
        // ========================================================================
        try {
            const currentCookies = await page.cookies();
            if (currentCookies.length > 0) {
                const cookieJson = JSON.stringify(currentCookies);
                await sql("UPDATE canva_accounts SET cookie = ?, last_used = datetime('now', '+7 hours') WHERE id = ?", [cookieJson, selectedAccount.id]);
                console.log(`🍪 [SESSION] Cookies Auto-Refreshed & Saved to Account ${selectedAccount.id}!`);
            }
        } catch (e) {
            console.error("⚠️ Failed to auto-save cookies:", e);
        }

        await browser.close();

        const summary = `
🏁 <b>Job Selesai</b>
✅ Sukses Invite: ${successInvites} | Kicked: ${successKicks}
❌ Gagal Invite:   ${failInvites} | Gagal Kick: ${failKicks}
        `.trim();
        await sendSystemLog(summary);
        console.log("🏁 Queue Processing Finished.");

    } catch (criticalError: any) {
        console.error("CRITICAL ERROR:", criticalError);
        await sendSystemLog(`⛔ <b>Critical Error</b>\n${criticalError.message}`);
    }
}

runPuppeteerQueue().catch(console.error);
