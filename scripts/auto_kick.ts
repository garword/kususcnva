/// <reference lib="dom" />
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as puppeteerCore from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';

import { TimeUtils } from '../src/lib/time';

dotenv.config();

// Setup Puppeteer
const puppeteer = addExtra(puppeteerCore as any);
puppeteer.use(StealthPlugin());

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = process.env.ADMIN_ID || '';
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID || '';

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

async function kickEnforcer() {
    console.log(`[${TimeUtils.format()}] 👮 Auto-Kick ENFORCER Mode Started (Multi-Account)...`);

    // 0. PRE-KICK: Update Expired Status (Self-healing)
    await sql(`UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND end_date < datetime('now', '+7 hours')`);

    // 0.1 Prepare Memory Lists
    const activeSubRes = await sql(`
        SELECT u.email FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.status = 'active'
        UNION
        SELECT email FROM users WHERE status = 'pending_invite'
        UNION
        SELECT email FROM users WHERE status = 'active'
    `);
    const expiredSubRes = await sql(`SELECT u.email FROM subscriptions s JOIN users u ON s.user_id = u.id WHERE s.status = 'expired'`);
    const staleRes = await sql(`SELECT email FROM users WHERE status = 'pending_invite' AND joined_at < datetime('now', '+7 hours', '-1 hour')`);
    const adminRes = await sql(`SELECT email FROM users WHERE role = 'admin'`);

    // Safety List
    const safetyList = new Set([
        ...adminRes.rows.map((r: any) => (r.email || "").toLowerCase())
    ]);

    const whiteList = new Set(activeSubRes.rows.map((r: any) => (r.email || "").toLowerCase()));
    const blackList = new Set(expiredSubRes.rows.map((r: any) => (r.email || "").toLowerCase()));
    const staleSet = new Set(staleRes.rows.map((r: any) => (r.email || "").toLowerCase()));

    console.log(`📊 DB Stats: ${whiteList.size} Active, ${blackList.size} Expired, ${staleSet.size} Stale Invites.`);

    // 1. Get Accounts
    const accountsRes = await sql("SELECT * FROM canva_accounts WHERE is_active = 1");
    const accounts = accountsRes.rows;

    if (accounts.length === 0) {
        console.log("⚠️ No active accounts found. Skipping kick job.");
        return;
    }

    // 2. Launch Browser
    const chromePath = getChromePath();
    if (!chromePath) throw new Error("Chrome not found!");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: process.env.CI ? "new" : false,
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-notifications',
            '--timezone=Asia/Jakarta',
            '--disable-gpu',
        ]
    });

    try {
        const page = await browser.newPage();

        // Loop Accounts
        for (const account of accounts) {
            console.log(`\n============== ACCOUNT ID: ${account.id} =================`);

            // AUTHENTICATION
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

            // Clear previous cookies
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');

            await page.setCookie(...cookies);
            console.log(`   🍪 Loaded cookies for Account ${account.id}.`);

            // Determine URL
            const teamId = account.team_id;
            const peopleUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : `https://www.canva.com/settings/people`;
            console.log(`   🔗 Navigating to: ${peopleUrl}`);

            await page.goto(peopleUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await randomDelay(2000, 3000);

            if (page.url().includes('login') || page.url().includes('signup')) {
                console.error(`   ❌ Account ${account.id} Cookie EXPIRED!`);
                await sql("UPDATE canva_accounts SET is_active = 0 WHERE id = ?", [account.id]);
                continue;
            }

            // SCROLL LOADER
            console.log("   📜 Scrolling...");
            await page.evaluate(async () => {
                await new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    let noScrollCount = 0;
                    const timer = setInterval(() => {
                        const sH = (document as any).body.scrollHeight;
                        (window as any).scrollBy(0, distance);
                        totalHeight += distance;
                        if (((window as any).innerHeight + (window as any).scrollY) >= sH - 50) {
                            noScrollCount++;
                            if (noScrollCount > 50) { clearInterval(timer); resolve(); }
                        } else { noScrollCount = 0; }
                        if (totalHeight >= 200000) { clearInterval(timer); resolve(); }
                    }, 50);
                });
            });
            await randomDelay(2000, 3000);

            // SCAN
            console.log("   🔍 Scanning...");
            const scanResult = await page.evaluate((bgWhiteList: string[], bgBlackList: string[], bgSafetyList: string[], bgStaleList: string[]) => {
                const targets: string[] = [];
                const safeSet = new Set(bgSafetyList);
                const whiteSet = new Set(bgWhiteList);
                const blackSet = new Set(bgBlackList);
                const staleSet = new Set(bgStaleList);

                document.querySelectorAll('tbody tr, div[role="row"]').forEach(row => {
                    const text = (row as HTMLElement).innerText.toLowerCase();
                    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
                    const match = text.match(emailRegex);
                    if (!match) return;

                    const email = match[0];
                    if (safeSet.has(email) || text.includes('owner') || text.includes('administrator')) return;
                    if (whiteSet.has(email)) return; // ✅ SAFE: Active user (Priority over Blacklist)

                    const isInvited = text.includes('invited') || text.includes('pending') || text.includes('diundang');
                    let reason = "";

                    if (isInvited) {
                        if (staleSet.has(email)) reason = "STALE INVITE";
                        else if (!whiteSet.has(email) && !blackSet.has(email)) reason = "GHOST INVITE";
                    } else {
                        if (blackSet.has(email)) reason = "EXPIRED";
                        else if (!whiteSet.has(email)) reason = "GHOST MEMBER";
                    }

                    if (reason) {
                        const checkbox = row.querySelector('input[type="checkbox"]');
                        if (checkbox && !(checkbox as any).checked) {
                            (checkbox as HTMLElement).click();
                            targets.push(email);
                        }
                    }
                });
                return { targets };
            }, Array.from(whiteList), Array.from(blackList), Array.from(safetyList), Array.from(staleSet));

            console.log(`   🎯 Selected ${scanResult.targets.length} users.`);

            if (scanResult.targets.length > 0) {
                // Execute Removal Logic
                try {
                    console.log(`   🏹 Preparing to kick ${scanResult.targets.length} users...`);

                    // 1. Wait for Bulk Action Bar (Generic wait)
                    await randomDelay(1000, 2000);

                    const buttons = await page.$$('button');
                    let kickSuccess = false;
                    let clickedButtonText = "";

                    // Strategy: Find the "Remove" button (Bulk Action Bar)
                    // LOGS REVEAL: The primary button has EMPTY text but has aria-label="Remove users"
                    for (const btn of buttons) {
                        const txtRaw = await btn.evaluate((e: any) => e.innerText);
                        const ariaLabel = await btn.evaluate((e: any) => e.getAttribute('aria-label')) || "";
                        const txt = txtRaw.toLowerCase();
                        const aria = ariaLabel.toLowerCase();

                        // Check ARIA Label first (for Icon Buttons) OR Text
                        if (aria.includes('remove users') || aria.includes('hapus pengguna') ||
                            ((txt.includes('remove') || txt.includes('hapus')) && (txt.includes('team') || txt.includes('tim')))) {

                            console.log(`   🖱️ Clicking Primary Button: "${ariaLabel || txtRaw}"`);
                            await btn.click();
                            clickedButtonText = ariaLabel || txtRaw;

                            // Wait for Modal
                            await randomDelay(1000, 2000);
                            kickSuccess = await handleConfirmation(page);
                            if (kickSuccess) break;
                        }
                    }

                    // Fallback: If no strict match, find ANY button with "Remove" in text or aria
                    if (!kickSuccess) {
                        console.log("   ⚠️ Strict button not found. Trying generic 'Remove'...");
                        for (const btn of buttons) {
                            const txtRaw = await btn.evaluate((e: any) => e.innerText);
                            const ariaLabel = await btn.evaluate((e: any) => e.getAttribute('aria-label')) || "";

                            if ((txtRaw && txtRaw.toLowerCase().includes('remove')) || (ariaLabel && ariaLabel.toLowerCase().includes('remove'))) {
                                console.log(`   🖱️ Clicking Fallback Button: "${ariaLabel || txtRaw}"`);
                                await btn.click();
                                clickedButtonText = ariaLabel || txtRaw;

                                await randomDelay(1000, 2000);
                                kickSuccess = await handleConfirmation(page);
                                if (kickSuccess) break;
                            }
                        }
                    }

                    if (kickSuccess) {
                        console.log("   ⚔️ Executed Kick (Confirmed).");
                        await sendTelegram(`⚔️ <b>Auto-Kick Executed</b>\nAccount: ${account.id}\nTargets: ${scanResult.targets.length}`);
                    } else {
                        console.log("   ❌ Failed to find/click Confirmation Button.");
                    }

                } catch (e) {
                    console.error("Kick execution failed", e);
                }
            }
        } // End Accont Loop

    } catch (e: any) {
        console.error("Critical Error:", e);
    } finally {
        setTimeout(() => browser.close(), 3000);
    }
}

// Helper: Handle Confirmation Modal
async function handleConfirmation(page: any): Promise<boolean> {
    console.log("   👀 Waking up for Confirmation Modal...");
    await new Promise(r => setTimeout(r, 2000)); // Explicit Wait

    // 1. Try Standard Buttons
    const confirms = await page.$$('button');
    const debugTexts: string[] = [];

    for (const cBtn of confirms) {
        const cTxtRaw = await cBtn.evaluate((e: any) => e.innerText);
        debugTexts.push(cTxtRaw.trim());
        const cTxt = cTxtRaw.toLowerCase();

        // Modal Confirm Button usually repeats the action name
        if (cTxt.includes('remove') || cTxt.includes('hapus') || cTxt.includes('delete') || cTxt.includes('confirm')) {
            console.log(`   🔨 Clicking Confirm (Button): "${cTxtRaw}"`);
            await cBtn.click();
            return true;
        }
    }

    // 2. Try Div Buttons (Common in Modern Frameworks)
    const divBtns = await page.$$('div[role="button"]');
    for (const dBtn of divBtns) {
        const dTxtRaw = await dBtn.evaluate((e: any) => e.innerText);
        debugTexts.push(`[DIV] ${dTxtRaw.trim()}`);
        const dTxt = dTxtRaw.toLowerCase();

        if (dTxt.includes('remove') || dTxt.includes('hapus')) {
            console.log(`   🔨 Clicking Confirm (Div): "${dTxtRaw}"`);
            await dBtn.click();
            return true;
        }
    }

    console.log(`   ❌ Confirmation Button NOT Found! Saw: ${JSON.stringify(debugTexts)}`);
    return false;
}

kickEnforcer();
