/// <reference lib="dom" />
import puppeteer from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = process.env.ADMIN_ID || '';

// Find Chrome Path (supports both Windows and Linux/Ubuntu)
const findChromeParams = [
    // Windows paths
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\" + process.env.USERNAME + "\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    // Linux paths (GitHub Actions)
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
];

function getChromePath() {
    // For CI environments, check for CHROME_BIN env var
    if (process.env.CHROME_BIN) return process.env.CHROME_BIN;

    const fs = require('fs');
    for (const path of findChromeParams) {
        try {
            if (fs.existsSync(path)) return path;
        } catch (e) {
            continue;
        }
    }
    return null;
}

async function sendTelegramNotif(message: string) {
    if (!BOT_TOKEN || !ADMIN_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (e) {
        console.error("Failed to send Telegram notification:", e);
    }
}

async function kickExpiredUsers() {
    console.log("🤖 Auto-Kick Job Started...");
    console.log(`⏰ Time: ${new Date().toISOString()}`);

    try {
        // 1. Get expired users from database
        const expiredUsers = await sql(
            `SELECT * FROM users WHERE expire_at < datetime('now') AND status = 'active'`
        );

        if (expiredUsers.rows.length === 0) {
            console.log("✅ No expired users found.");
            return;
        }

        console.log(`🎯 Found ${expiredUsers.rows.length} expired user(s) to kick.`);

        // 2. Get Canva credentials
        const cookieRes = await sql("SELECT value FROM settings WHERE key = 'canva_cookie'");
        const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
        const uaRes = await sql("SELECT value FROM settings WHERE key = 'canva_user_agent'");

        if (cookieRes.rows.length === 0) {
            throw new Error("Canva cookie not found in database!");
        }

        const cookie = cookieRes.rows[0].value as string;
        const teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value as string : undefined;
        const userAgent = uaRes.rows.length > 0 ? uaRes.rows[0].value as string :
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

        // 3. Launch Puppeteer
        const chromePath = getChromePath();
        if (!chromePath) {
            throw new Error("Chrome/Chromium not found! Cannot proceed with auto-kick.");
        }

        console.log(`🚀 Launching browser: ${chromePath}`);

        const browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const page = await browser.newPage();
        await page.setUserAgent(userAgent);

        // Parse and set cookies
        const cookieObjects = cookie.split(';').map(c => {
            const [name, ...v] = c.trim().split('=');
            return { name, value: v.join('='), domain: '.canva.com', path: '/' };
        }).filter(c => c.name && c.value);

        await page.setCookie(...cookieObjects);

        let kickedCount = 0;
        let failedCount = 0;

        // 4. Kick each expired user
        for (const user of expiredUsers.rows) {
            const email = user.email as string;
            const userId = user.id as number;

            console.log(`🔄 Kicking user: ${email}...`);

            try {
                // Navigate to team members page
                const teamUrl = teamId
                    ? `https://www.canva.com/brand/${teamId}/people`
                    : 'https://www.canva.com/settings/team';

                await page.goto(teamUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 2000));

                // Try to kick via UI
                const kickResult = await page.evaluate(async (targetEmail) => {
                    try {
                        // Find user row by email
                        const allText = Array.from(document.querySelectorAll('*'));
                        const userElement = allText.find(el =>
                            el.textContent?.includes(targetEmail)
                        );

                        if (!userElement) {
                            return { success: false, message: "User not found on page" };
                        }

                        // Find parent row and look for remove/delete button
                        let currentEl = userElement as HTMLElement;
                        for (let i = 0; i < 10; i++) {
                            if (!currentEl.parentElement) break;
                            currentEl = currentEl.parentElement;

                            // Look for remove/delete buttons within this parent
                            const buttons = Array.from(currentEl.querySelectorAll('button'));
                            for (const btn of buttons) {
                                const text = btn.textContent?.toLowerCase() || '';
                                const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                                if (text.includes('remove') || text.includes('delete') ||
                                    ariaLabel.includes('remove') || ariaLabel.includes('delete')) {
                                    btn.click();
                                    await new Promise(r => setTimeout(r, 1000));

                                    // Look for confirm button
                                    const confirmButtons = Array.from(document.querySelectorAll('button'));
                                    const confirmBtn = confirmButtons.find(b =>
                                        b.textContent?.toLowerCase().includes('remove') ||
                                        b.textContent?.toLowerCase().includes('confirm')
                                    ) as HTMLButtonElement;

                                    if (confirmBtn) confirmBtn.click();

                                    return { success: true, message: "Kicked successfully" };
                                }
                            }
                        }

                        return { success: false, message: "Remove button not found" };
                    } catch (e: any) {
                        return { success: false, message: e.message };
                    }
                }, email);

                if (kickResult.success) {
                    console.log(`✅ Successfully kicked: ${email}`);
                    kickedCount++;

                    // Update database
                    await sql(
                        `UPDATE users SET status = 'kicked', kicked_at = datetime('now') WHERE id = ?`,
                        [userId]
                    );
                } else {
                    console.log(`❌ Failed to kick ${email}: ${kickResult.message}`);
                    failedCount++;
                }

                // Wait between kicks
                await new Promise(r => setTimeout(r, 2000));

            } catch (err: any) {
                console.error(`❌ Error kicking ${email}:`, err.message);
                failedCount++;
            }
        }

        await browser.close();

        // 5. Send summary notification
        const summary = `
🤖 <b>Auto-Kick Report</b>
⏰ ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}

✅ Kicked: ${kickedCount}
❌ Failed: ${failedCount}
📊 Total processed: ${expiredUsers.rows.length}
        `.trim();

        console.log("\n" + summary);
        await sendTelegramNotif(summary);

        console.log("✅ Auto-Kick Job Completed!");

    } catch (error: any) {
        console.error("❌ Auto-Kick Job Failed:", error.message);
        await sendTelegramNotif(`❌ <b>Auto-Kick Error:</b>\n${error.message}`);
        process.exit(1);
    }
}

// Run the script
kickExpiredUsers();
