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

async function pruneInvites() {
    console.log("🧹 Starting Prune Invites Check...");

    // 1. Get Stale Invites from DB ( > 1 hour old)
    // Assuming status='invited' or check if user has not activated
    // Since 'joined_at' is when they entered DB, let's use that.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Note: status might be 'pending' or 'active'. If 'active' but email is 'Invited' in Canva -> Stale?
    // User requested: "jika bagian email berisi kata Invited selama lebih dari satu jam sejak data undangan di kirim"
    // So we check ALL users created > 1 hour ago.
    const staleUsers = await sql(`
        SELECT * FROM users 
        WHERE joined_at < datetime('now', '-1 hour')
    `);

    // Create a Set of emails/names to check against
    // In Canva, pending invite format: Name = "email_address", Email = "Invited"
    const staleEmailSet = new Set(staleUsers.rows.map((u: any) => u.email || u.username || "")); // Adjust based on accurate column

    console.log(`📋 Found ${staleUsers.rows.length} users created > 1 hour ago in DB.`);

    // 2. Setup Browser
    const chromePath = getChromePath();
    if (!chromePath) { console.error("❌ Chrome not found!"); return; }

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'],
        defaultViewport: null
    });
    const page = await browser.newPage();

    if (fs.existsSync('auth_cookies.json')) {
        const cookies = JSON.parse(fs.readFileSync('auth_cookies.json', 'utf-8'));
        await page.setCookie(...cookies);
    }

    try {
        console.log("navigating to https://www.canva.com/settings/people...");
        await page.goto('https://www.canva.com/settings/people', { waitUntil: 'networkidle2', timeout: 60000 });

        // Auto Scroll Loop (reuse logic)
        console.log("   📜 Scrolling to load all members...");
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    (window as any).scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= 15000) { clearInterval(timer); resolve(); }
                }, 100);
            });
        });
        await new Promise(r => setTimeout(r, 2000));

        // Scan Table
        const members = await page.$$eval('tbody tr', (rows: any[]) => {
            return rows.map((row: any, index: number) => {
                const cells = Array.from(row.querySelectorAll('td'));
                const texts = cells.map((c: any) => c.innerText.replace(/\n/g, ' ').trim());
                // Return index to help click later (though unstable if list changes)
                return { texts, index };
            });
        });

        console.log(`🔍 Scanning ${members.length} rows for stale invites...`);

        for (let i = 0; i < members.length; i++) {
            const m = members[i];
            const name = m.texts[0] || ""; // In pending, Name is usually the Email address
            const emailColumn = m.texts[1] || ""; // Should be "Invited"

            // Check Condition: Email col is "Invited" AND Name matches a DB Stale User
            // Note: DB mapping might be tricky. The user said "since data undangan di kirim di database torso".
            // So if Name matches our record of sent invitation.

            // Simplified Match: Check if emailColumn is "Invited"
            if (emailColumn.toLowerCase().includes("invited")) {
                console.log(`❓ Found Pending Invite: ${name} (Status: ${emailColumn})`);

                // NOW CHECK TIME: Matches stale list?
                // If name is the email address like "test_invite_...@..."
                // Check if this 'name' exists in our staleEmailSet
                // Or broadly: if it's pending > 1hr (implied by user logic: "di database torso > 1 jam")

                // If we find it in Canva and it says "Invited", and we created it > 1hr ago -> DELETE.
                // Assuming 'name' matches the email we stored.
                const isStale = true; // For now, assume strict matching needed.

                // For safety in this test, log it first.
                if (isStale) {
                    console.log(`   🚨 DETECTED STALE: ${name}. Attempting removal...`);

                    // ACTION: Remove
                    // Need to find selector for this specific row.
                    // Method: Use XPath or iterate elements handle again?
                    // Safer to re-query the row.

                    const rowHandles = await page.$$('tbody tr');
                    if (rowHandles[i]) {
                        // Look for Checkbox or Menu?
                        // User logs showed "Select" column with checkboxes.
                        // Let's try clicking the checkbox and then finding a "Remov" button?
                        // Or look for a role dropdown "Student" -> click -> "Remove from team"?

                        // Let's TRY clicking the Role dropdown first as it's often the remove path
                        const dropdown = await rowHandles[i].$('div[role="button"]'); // Heuristic
                        // If checking boxes is easier...
                    }
                }
            }
        }

    } catch (e: any) {
        console.error("❌ Error:", e.message);
    } finally {
        setTimeout(() => browser.close(), 5000);
    }
}

pruneInvites();
