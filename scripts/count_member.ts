// @ts-nocheck
import { sql } from '../lib/db';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

// Find Chrome Path
const findChromeParams = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\" + process.env.USERNAME + "\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
];

function getChromePath() {
    for (const path of findChromeParams) {
        if (fs.existsSync(path)) return path;
    }
    return null;
}

async function countMembers() {
    console.log("🔢 Starting Member Count Check...");

    const chromePath = getChromePath();
    if (!chromePath) {
        console.error("❌ Chrome not found!");
        return;
    }

    // 1. Setup Browser
    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false, // Show browser for debug
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
        defaultViewport: null
    });
    const page = await browser.newPage();

    // 2. Restore Session
    if (fs.existsSync('auth_cookies.json')) {
        const cookies = JSON.parse(fs.readFileSync('auth_cookies.json', 'utf-8'));
        await page.setCookie(...cookies);
        console.log("🍪 Session restored.");
    }

    try {
        // 3. Navigate to People Page
        console.log("navigating to https://www.canva.com/settings/people...");
        await page.goto('https://www.canva.com/settings/people', { waitUntil: 'domcontentloaded' });

        // 4. Wait for Content (More robust selector)
        // 4. Wait for Content (More robust selector)
        console.log("   Waiting for member list (networkidle2)...");
        try {
            // Wait for network to be idle (page fully loaded)
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });

            // Explicit wait to be safe
            await new Promise(r => setTimeout(r, 5000));

            await page.waitForSelector('div._0rTSIQ', { timeout: 30000 });
            console.log("✅ Member list detected (div._0rTSIQ).");
        } catch (e) {
            console.log("⚠️ Selector div._0rTSIQ not found even after wait...");
        }

        // 4b. Auto Scroll to Load All Members
        console.log("   📜 Scrolling to load all members...");
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = (document as any).body.scrollHeight;
                    (window as any).scrollBy(0, distance);
                    totalHeight += distance;

                    // Stop if we've scrolled past valid height or hit a limit (e.g. 10s or bottom)
                    // Simple check: if we are at bottom
                    if (((window as any).innerHeight + (window as any).scrollY) >= scrollHeight - 50) {
                        // Wait a bit to see if more loads
                    }

                    if (totalHeight >= 15000) { // Safety limit: 150 scrolls 
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
        // Wait a bit after scroll for final render
        await new Promise(r => setTimeout(r, 2000));

        // 5. Count Rows & Analyze Content (Full Table Scan)
        const members = await page.$$eval('tbody tr', (rows: any[]) => {
            return rows.map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                const texts = cells.map((c: any) => c.innerText.replace(/\n/g, ' ').trim());
                return texts;
            }).filter(row => row.length > 0);
        });

        console.log(`\n📊 LAPORAN MEMBER DEATIL (${members.length}):`);
        console.log(`   Format: [Name, Email, Role, ...]`);

        members.forEach((m: string[], i: number) => {
            const name = m[0] || "-";
            const email = m[1] || "-";
            const role = m[2] || "-";
            console.log(`\n   👤 MEMBER ${i + 1}`);
            console.log(`      📛 Name  : ${name}`);
            console.log(`      📧 Email : ${email}`);
            console.log(`      ️🛡️ Role  : ${role}`);
            console.log(`      📄 Allow : ${JSON.stringify(m)}`);
        });

        // Screenshot for verification
        await page.screenshot({ path: 'debug_member_count.jpg', fullPage: true });
        console.log("📸 Screenshot saved to debug_member_count.jpg");

    } catch (e: any) {
        console.error("❌ Error:", e.message);
        await page.screenshot({ path: 'error_member_count.jpg' });
    } finally {
        setTimeout(() => browser.close(), 2000);
    }
}

countMembers();
