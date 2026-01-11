// @ts-nocheck
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as puppeteerCore from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import fs from 'fs';
import axios from 'axios';
import { TimeUtils } from '../src/lib/time';

dotenv.config();

// Setup Puppeteer
const puppeteer = addExtra(puppeteerCore as any);
puppeteer.use(StealthPlugin());

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

// Chrome Path Logic
const findChromeParams = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\" + process.env.USERNAME + "\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser"
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

async function syncMemberCount() {
    console.log(`[${TimeUtils.format()}] 🔄 Starting Member Count Sync...`);

    const chromePath = getChromePath();
    if (!chromePath) throw new Error("Chrome not found!");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: process.env.CI ? 'new' : false,
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
                console.log(`[${TimeUtils.format()}]    ✅ User-Agent set from DB!`);
            }
        } catch (e) { }

        // Restore Session (Priority: DB -> File)
        let cookies: any[] = [];
        try {
            const cookieRes = await sql("SELECT value FROM settings WHERE key = 'canva_cookie'");
            if (cookieRes.rows.length > 0) {
                const cookieStr = cookieRes.rows[0].value as string;
                if (cookieStr.trim().startsWith("[") || cookieStr.trim().startsWith("{")) {
                    cookies = JSON.parse(cookieStr);
                    if (!Array.isArray(cookies) && cookies.cookies) cookies = cookies.cookies;
                }
                console.log(`[${TimeUtils.format()}]    ✅ Cookie loaded from DB.`);
            }
        } catch (e) { }

        if (cookies.length === 0 && fs.existsSync('auth_cookies.json')) {
            cookies = JSON.parse(fs.readFileSync('auth_cookies.json', 'utf-8'));
            console.log(`[${TimeUtils.format()}]    ✅ Cookie loaded from Local File.`);
        }

        if (cookies.length > 0) {
            await page.setCookie(...cookies);
        }

        // Navigate
        console.log(`[${TimeUtils.format()}] navigating to Settings...`);
        const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
        const teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value : null;
        const peopleUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : `https://www.canva.com/settings/people`;

        await page.goto(peopleUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Auto Scroll Loop (Full Load)
        console.log(`[${TimeUtils.format()}]    📜 Scrolling to load all members...`);
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    (window as any).scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= 25000) { clearInterval(timer); resolve(); } // High limit for safety
                    if (((window as any).innerHeight + (window as any).scrollY) >= (document as any).body.scrollHeight - 50) {
                        // At bottom
                    }
                }, 50);
            });
        });
        await new Promise(r => setTimeout(r, 2000));

        // Count Members
        // We count TRs in tbody. Assuming one TR per member.
        const memberCount = await page.$$eval('tbody tr', rows => rows.length);

        console.log(`[${TimeUtils.format()}] ✅ Detected ${memberCount} members (Including Invites).`);

        // Check Pending vs Active (Optional but good for stats)
        const counts = await page.evaluate(() => {
            let pending = 0;
            const rows = Array.from(document.querySelectorAll('tbody tr'));
            rows.forEach(r => {
                const text = r.innerText.toLowerCase();
                if (text.includes('invited') || text.includes('diundang') || text.includes('pending')) pending++;
            });
            return { total: rows.length, pending, active: rows.length - pending };
        });

        console.log(`[${TimeUtils.format()}]    📊 Detail: ${counts.active} Active, ${counts.pending} Pending.`);

        // Sync to DB
        // Update total_members in settings
        // If key doesn't exist, insert it.
        await sql(`
            INSERT INTO settings (key, value) 
            VALUES ('team_member_count', ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [counts.total.toString()]);

        // Also save pending count for dashboard
        await sql(`
            INSERT INTO settings (key, value) 
            VALUES ('team_pending_count', ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [counts.pending.toString()]);

        await sql(`
            INSERT INTO settings (key, value) 
            VALUES ('last_sync_at', ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [new Date().toISOString()]);

        console.log(`[${TimeUtils.format()}] 💾 Database Updated Successfully.`);

        // Send Report
        await sendTelegram(`📊 <b>Team Sync Report</b>\nTotal: ${counts.total}\nActive: ${counts.active}\nPending: ${counts.pending}\n<i>Synced at: ${TimeUtils.format()}</i>`);

        // ========================================================================
        // 🚨 SLOT AVAILABILITY NOTIFICATION (Requested by User)
        // ========================================================================
        // Logic: If >= 480 members, check when next slot opens.
        // Send to configured Topic ID.
        if (counts.total >= 480) {
            console.log(`⚠️ Team is NEAR FULL/FULL (${counts.total}/500). Checking Slot Notification...`);

            // 1. Check Rate Limit (e.g. Once every 4 hours)
            const lastNotifRes = await sql("SELECT value FROM settings WHERE key = 'last_slot_notif'");
            const lastNotifStr = lastNotifRes.rows.length > 0 ? lastNotifRes.rows[0].value as string : null;
            let shouldSend = true;

            if (lastNotifStr) {
                const lastDate = new Date(lastNotifStr);
                const diffMs = Date.now() - lastDate.getTime();
                const diffHours = diffMs / (1000 * 60 * 60);
                if (diffHours < 4) {
                    shouldSend = false;
                    console.log(`   ⏳ Skipping notification (Cooldown: ${diffHours.toFixed(1)}/4 hours)`);
                }
            }

            if (shouldSend) {
                // 2. Predict Next Slot
                const nextSlotRes = await sql(`SELECT MIN(end_date) as next_slot FROM subscriptions WHERE status = 'active' AND end_date > datetime('now')`);

                let nextSlotMsg = "Tidak diketahui";
                if (nextSlotRes.rows.length > 0 && nextSlotRes.rows[0].next_slot) {
                    const dbDate = nextSlotRes.rows[0].next_slot as string;
                    // Ensure valid date parsing for SQLite string
                    const utcDate = new Date(dbDate.includes('T') ? dbDate : dbDate.replace(' ', 'T') + 'Z');
                    nextSlotMsg = TimeUtils.format(utcDate);
                }

                // 3. Get Target Topic
                const chatRes = await sql("SELECT value FROM settings WHERE key = 'slot_topic_chat_id'");
                const threadRes = await sql("SELECT value FROM settings WHERE key = 'slot_topic_thread_id'");

                if (chatRes.rows.length > 0) {
                    const targetChat = chatRes.rows[0].value as string;
                    const targetThread = threadRes.rows.length > 0 ? threadRes.rows[0].value as string : undefined;

                    const alertMsg = `⚠️ <b>PERINGATAN SLOT TEAM</b>\n\n` +
                        `👥 <b>Status:</b> ${counts.total} / 500 Member\n` +
                        `⛔ <b>Kondisi:</b> ${counts.total >= 500 ? "PENUH (FULL)" : "HAMPIR PENUH"}\n\n` +
                        `⏳ <b>Slot Berikutnya Tersedia:</b>\n` +
                        `📅 ${nextSlotMsg}\n\n` +
                        `<i>Sistem akan otomatis menghapus user yang expired pada tanggal tersebut.</i>`;

                    // Send to Topic
                    try {
                        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                            chat_id: targetChat,
                            message_thread_id: targetThread,
                            text: alertMsg,
                            parse_mode: 'HTML'
                        });
                        console.log(`   📢 Notification sent to Chat ${targetChat} (Thread: ${targetThread || 'Main'})`);

                        // Update Rate Limit
                        await sql(`INSERT INTO settings (key, value) VALUES ('last_slot_notif', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [new Date().toISOString()]);

                    } catch (e: any) {
                        console.error(`   ❌ Failed to send topic notification: ${e.message}`);
                    }

                } else {
                    console.log("   ℹ️ No log topic configured (Use /addlogtopik).");
                }
            }
        }

    } catch (e: any) {
        console.error("❌ Sync Failed:", e);
        await sendTelegram(`⚠️ <b>Sync Failed:</b> ${e.message}`);
    } finally {
        setTimeout(() => browser.close(), 2000);
    }
}

syncMemberCount();
