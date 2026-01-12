/// <reference lib="dom" />
import { addExtra } from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as puppeteerCore from 'puppeteer-core';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

// Setup Puppeteer
const puppeteer = addExtra(puppeteerCore as any);
puppeteer.use(StealthPlugin());

const findChromeParams = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome"
];

function getChromePath() {
    if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
    for (const path of findChromeParams) {
        try { if (fs.existsSync(path)) return path; } catch (e) { continue; }
    }
    return null;
}

const randomDelay = (min: number, max: number) => new Promise(r => setTimeout(r, Math.random() * (max - min) + min));

async function debugScan() {
    console.log("🕵️ Starting Debug Scan (No Kick)...");

    const accountsRes = await sql("SELECT id, cookie, team_id FROM canva_accounts WHERE id = 2 AND is_active = 1"); // Target Account 2
    if (accountsRes.rows.length === 0) return console.log("No active accounts.");
    const account = accountsRes.rows[0];

    const chromePath = getChromePath();
    if (!chromePath) throw new Error("Chrome not found!");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false, // Show browser
        defaultViewport: null,
        args: ['--start-maximized', '--disable-notifications']
    });

    const page = await browser.newPage();

    // Auth
    let cookies: any[] = [];
    try {
        cookies = JSON.parse(account.cookie as string);
    } catch {
        // Simple fallback
        cookies = (account.cookie as string).split(';').map(p => {
            const [n, ...v] = p.trim().split('=');
            return { name: n, value: v.join('='), domain: '.canva.com', path: '/', secure: true };
        });
    }

    await page.setCookie(...(Array.isArray(cookies) ? cookies : [cookies]));

    const teamId = account.team_id;
    const peopleUrl = teamId ? `https://www.canva.com/brand/${teamId}/people` : `https://www.canva.com/settings/people`;

    console.log(`   🔗 Navigating to: ${peopleUrl}`);
    await page.goto(peopleUrl, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log("   ⏳ Waiting for rows to load...");
    try {
        await page.waitForSelector('tbody tr, div[role="row"]', { timeout: 15000 });
    } catch (e) {
        console.log("   ⚠️ Warning: Rows selector timed out. Page might be empty or using different structure.");
    }

    console.log("   📜 Scrolling...");
    await page.evaluate(async () => {
        for (let i = 0; i < 3; i++) {
            window.scrollBy(0, 500);
            await new Promise(r => setTimeout(r, 1500));
        }
    });

    // Give user time to see
    console.log("   👀 Keeping open for 10 seconds...");
    await new Promise(r => setTimeout(r, 10000));

    console.log("   🔍 Scanning Visible Rows...");
    const logs = await page.evaluate(() => {
        const results: any[] = [];
        document.querySelectorAll('tbody tr, div[role="row"]').forEach((row, i) => {
            const rawText = (row as HTMLElement).innerText;
            const text = rawText.toLowerCase();
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
            const match = text.match(emailRegex);

            let extractedEmail = match ? match[0] : "NULL";

            // Check for Title Attribute (Anti-Truncation)
            // Sometimes email is hidden in a title="user@email.com" inside a div
            let titleEmail = "";
            const titleEl = row.querySelector('[title*="@"]');
            if (titleEl) titleEmail = titleEl.getAttribute('title') || "";

            results.push({
                index: i,
                rawText: rawText.substring(0, 50) + "...",
                extractedEmail: extractedEmail,
                titleEmail: titleEmail,
                isTruncatedEstimate: text.includes('...')
            });
        });
        return results;
    });

    console.table(logs);

    await browser.close();
}

debugScan();
