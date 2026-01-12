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

    // 2. Get Global User Agent
    let globalUA = "";
    try {
        const uaRes = await sql("SELECT value FROM settings WHERE key = 'canva_user_agent'");
        if (uaRes.rows.length > 0) globalUA = uaRes.rows[0].value as string;
    } catch { console.log("⚠️ Failed to fetch custom UA, using default."); }

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
        if (globalUA) {
            console.log(`   🎭 Apply Custom UA: ${globalUA.substring(0, 30)}...`);
            await page.setUserAgent(globalUA);
        }
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

                // ===================================
                // AUTO-DISCOVERY (Self-Healing)
                // ===================================
                const needsMetadata = !account.email || account.email === 'Unknown' || !account.team_id;

                if (needsMetadata) {
                    console.log("   🕵️ Metadata Missing! Starting Auto-Discovery...");

                    // 1. Capture Team ID from URL
                    // URL is likely https://www.canva.com/brand/TEAM_ID/people or similar
                    const currentUrl = page.url();
                    const brandMatch = currentUrl.match(/brand\/([a-zA-Z0-9_-]+)/);
                    const detectedTeamId = brandMatch ? brandMatch[1] : null;

                    // 2. Capture Email (If missing or Pending)
                    let detectedEmail = null;
                    const isEmailMissing = !account.email || account.email === 'Unknown' || account.email.includes('Pending');

                    if (isEmailMissing) {
                        try {
                            console.log("   📧 Checking Email settings...");
                            await page.goto("https://www.canva.com/settings/your-account", { waitUntil: 'networkidle2', timeout: 30000 });
                            detectedEmail = await page.evaluate(() => {
                                // Common selectors for email in Canva settings
                                const p = document.querySelector('p[data-cy="email-address"]');
                                if (p) return p.textContent;
                                return null;
                            });
                            // Return to People page to continue counting
                            if (detectedTeamId || account.team_id) {
                                const tid = detectedTeamId || account.team_id;
                                await page.goto(`https://www.canva.com/brand/${tid}/people`, { waitUntil: 'domcontentloaded' });
                            } else {
                                // Fallback if Team ID not found yet: Go to generic People settings (Redirects automatically)
                                await page.goto("https://www.canva.com/settings/people", { waitUntil: 'networkidle2' });
                            }
                        } catch (e) { console.log("   ⚠️ Email check failed:", e); }
                    }

                    if (detectedTeamId || detectedEmail) {
                        console.log(`   ✅ UPDATING DB: Team=${detectedTeamId || 'Keep'}, Email=${detectedEmail || 'Keep'}`);
                        await sql(`
                            UPDATE canva_accounts 
                            SET team_id = COALESCE(?, team_id), 
                                email = COALESCE(?, email)
                            WHERE id = ?
                        `, [detectedTeamId, detectedEmail, account.id]);
                    }
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
