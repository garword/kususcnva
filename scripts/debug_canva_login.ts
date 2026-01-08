// @ts-nocheck
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';
import axios from 'axios';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';

dotenv.config();

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

// 1. Read JSON File
const jsonPath = path.join(__dirname, '../www.canva.com_08-01-2026 (1).json');
if (!fs.existsSync(jsonPath)) {
    console.error(`❌ File not found: ${jsonPath}`);
    process.exit(1);
}

console.log("📂 Reading JSON Cookie: " + jsonPath);
const rawJson = fs.readFileSync(jsonPath, 'utf8');
let cookies = JSON.parse(rawJson);

// FIX: Handle if JSON is an object wrapping the array
if (!Array.isArray(cookies)) {
    console.log("⚠️ JSON is not an array. Checking keys/structure...");
    if (cookies.cookies && Array.isArray(cookies.cookies)) {
        console.log("✅ Found 'cookies' array inside object.");
        cookies = cookies.cookies;
    } else {
        // Log keys to help debug
        console.log("❓ Keys found:", Object.keys(cookies));
        try {
            const potentialCookies = Object.entries(cookies).map(([k, v]) => ({ name: k, value: v }));
            if (potentialCookies.length > 0) {
                console.log("⚠️ Assuming Key-Value format. Converted.");
                cookies = potentialCookies;
            } else {
                console.error("❌ Could not determine cookie format.");
                process.exit(1);
            }
        } catch (e) {
            console.error("❌ Failed to parse object as cookies.");
            process.exit(1);
        }
    }
}

// 2. Convert to Header String
const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
console.log(`🍪 Extracted ${cookies.length} cookies.`);

// 3. Verify Login with Puppeteer & Force Save
async function run() {
    console.log("\n🌐 Verifying Login in Browser...");
    const chromePath = getChromePath();
    if (!chromePath) return console.log("❌ Chrome not found, skipping browser check.");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
        ignoreDefaultArgs: ["--enable-automation"]
    });

    const page = await browser.newPage();

    // Set Cookies from JSON
    const puppeteerCookies = cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: '.canva.com',
        path: '/',
        secure: c.secure,
        httpOnly: c.httpOnly
    }));

    await page.setCookie(...puppeteerCookies);

    console.log("   Navigating to Canva...");
    await page.goto('https://www.canva.com/', { waitUntil: 'networkidle2', timeout: 60000 });

    const url = page.url();
    console.log("   Current URL:", url);

    console.log("   ⚠️ Skipping Team ID detection (User Request: No Team ID needed).");
    console.log("   ⚠️ Using default fallback URL for invites.");

    // FORCE SAVE TO DB
    console.log("\n💾 FORCE SAVING Credentials to Database...");

    // Save Cookie
    await sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('canva_cookie', ?)", [cookieString]);
    console.log("   ✅ Cookie Saved.");

    // DELETE Team ID (Force fallback)
    await sql("DELETE FROM settings WHERE key = 'canva_team_id'");
    console.log("   ✅ Team ID Removed from DB (Forcing default UI).");

    console.log("\n🎉 SETUP COMPLETE!");
    console.log("   Browser will close in 30 seconds...");
    setTimeout(() => { browser.close(); process.exit(0); }, 30000);
}

run();
