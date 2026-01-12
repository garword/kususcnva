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
    "/usr/bin/google-chrome"
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
    console.log(`[${TimeUtils.format()}] 🔄 Starting Member Count Sync (Multi-Account)...`);

    const chromePath = getChromePath();
    if (!chromePath) throw new Error("Chrome not found!");

    // 1. Get Accounts
    const accountsRes = await sql("SELECT * FROM canva_accounts WHERE is_active = 1");
    const accounts = accountsRes.rows;

    if (accounts.length === 0) {
        console.log("⚠️ No active accounts found to sync.");
        return;
    }

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: process.env.CI ? 'new' : false,
        defaultViewport: null,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--start-maximized',
            '--disable-notifications',
            '--timezone=Asia/Jakarta'
        ]
    });

    try {
        const page = await browser.newPage();
        let totalClusterMembers = 0;
        let totalClusterPending = 0;

        for (const account of accounts) {
            console.log(`\n============== ACCOUNT ID: ${account.id} =================`);
            try {
                // AUTH
                const cookieStr = account.cookie as string;
                if (!cookieStr) continue;

                let cookies: any[] = [];
                try {
                    cookies = JSON.parse(cookieStr);
                } catch {
                    cookies = cookieStr.split(';').map(p => {
                        const [n, ...v] = p.trim().split('=');
                        return { name: n, value: v.join('='), domain: '.canva.com', path: '/', secure: true };
                    });
                }
                if (!Array.isArray(cookies)) cookies = [cookies];

                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');

                await page.setCookie(...cookies);
                console.log(`   🍪 Loaded cookies for Account ${account.id}.`);

                // Navigate
                const teamId = account.team_id;
                const peopleUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : `https://www.canva.com/settings/people`;

                await page.goto(peopleUrl, { waitUntil: 'networkidle2', timeout: 60000 });

                if (page.url().includes('login') || page.url().includes('signup')) {
                    console.log(`   ❌ Account ${account.id} Cookie EXPIRED!`);
                    await sql("UPDATE canva_accounts SET is_active = 0 WHERE id = ?", [account.id]);
                    continue;
                }

                // Scroll
                console.log("   📜 Scrolling...");
                await page.evaluate(async () => {
                    await new Promise<void>((resolve) => {
                        let totalHeight = 0;
                        const distance = 100;
                        const timer = setInterval(() => {
                            const sH = (document as any).body.scrollHeight;
                            (window as any).scrollBy(0, distance);
                            totalHeight += distance;
                            if (totalHeight >= 25000) { clearInterval(timer); resolve(); }
                            if (((window as any).innerHeight + (window as any).scrollY) >= sH - 50) {
                                // Bottom
                            }
                        }, 50);
                    });
                });
                await new Promise(r => setTimeout(r, 2000));

                // Count
                const counts = await page.evaluate(() => {
                    let pending = 0;
                    const rows = Array.from(document.querySelectorAll('tbody tr'));
                    rows.forEach(r => {
                        const text = r.innerText.toLowerCase();
                        if (text.includes('invited') || text.includes('diundang') || text.includes('pending')) pending++;
                    });
                    return { total: rows.length, pending, active: rows.length - pending };
                });

                console.log(`   ✅ Account ${account.id}: ${counts.total} Members (${counts.active} Active, ${counts.pending} Pending).`);

                // UPDATE DB for this Account
                await sql("UPDATE canva_accounts SET member_count = ?, last_used = datetime('now', '+7 hours') WHERE id = ?", [counts.total, account.id]);

                totalClusterMembers += counts.total;
                totalClusterPending += counts.pending;

                // ALERT PER NODE
                if (counts.total >= 480) {
                    await sendTelegram(`⚠️ <b>NODE ${account.id} FULL</b>\nStatus: ${counts.total}/500\nSegera cek!`);
                }

            } catch (e: any) {
                console.error(`   ❌ Failed to sync Account ${account.id}:`, e.message);
            }
        } // End Loop

        // Global Stats Update (Optional, just logging last sync)
        await sql(`
            INSERT INTO settings (key, value) 
            VALUES ('last_sync_at', ?) 
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `, [new Date().toISOString()]);

        console.log(`[${TimeUtils.format()}] 💾 Sync Complete via Cluster.`);
        await sendTelegram(`📊 <b>Cluster Sync Reports</b>\nTotal Nodes: ${accounts.length}\nTotal Members: ${totalClusterMembers}\nTotal Pending: ${totalClusterPending}`);

    } catch (e: any) {
        console.error("❌ Sync Failed:", e);
    } finally {
        setTimeout(() => browser.close(), 2000);
    }
}

syncMemberCount();
