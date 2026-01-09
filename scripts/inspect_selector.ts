// @ts-nocheck
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
import path from 'path';

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

// THE CLIENT-SIDE SCRIPT TO INJECT
// This runs inside the browser (and every iframe)
const clientScript = () => {
    if (window.hasInjectedInspector) return;
    window.hasInjectedInspector = true;

    console.log("✅ Inspector V4 Injected into: " + window.location.href);

    // 1. Create Floating Tooltip
    const tooltip = document.createElement('div');
    Object.assign(tooltip.style, {
        position: 'fixed',
        zIndex: '1000000',
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        padding: '5px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        pointerEvents: 'none',
        display: 'none',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
        fontFamily: 'monospace'
    });
    document.body.appendChild(tooltip);

    // 2. Highlighting Style
    const style = document.createElement('style');
    style.innerHTML = `
        .v4-hover { outline: 2px solid #3b82f6 !important; background: rgba(59, 130, 246, 0.1) !important; cursor: crosshair !important; }
        .v4-click { outline: 2px solid #22c55e !important; background: rgba(34, 197, 94, 0.2) !important; transition: all 0.2s; }
    `;
    document.head.appendChild(style);

    let lastTarget = null;

    // 3. Mouse Move (Hover Effect)
    document.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
        if (target === document.body || target === document.documentElement) return;

        // Add highlight
        target.classList.add('v4-hover');

        // Update Tooltip
        const tagName = target.tagName.toLowerCase();
        const id = target.id ? '#' + target.id : '';
        const classes = target.className && typeof target.className === 'string'
            ? '.' + target.className.split(' ').filter(c => c && c !== 'v4-hover' && c !== 'v4-click').join('.')
            : '';

        tooltip.innerHTML = `<span style="color:#60a5fa">${tagName}</span>${id}<span style="color:#fbbf24">${classes}</span>`;
        tooltip.style.display = 'block';
    });

    document.addEventListener('mousemove', (e) => {
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY + 10) + 'px';
    });

    document.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement;
        target.classList.remove('v4-hover');
        tooltip.style.display = 'none';
    });

    // 4. Click Capture
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // Flash Effect
        target.classList.add('v4-click');
        setTimeout(() => target.classList.remove('v4-click'), 500);

        const data = {
            tagName: target.tagName,
            innerText: target.innerText || target.textContent || (target.value ? target.value : ''),
            className: target.className && typeof target.className === 'string' ? target.className : '',
            id: target.id,
            href: target.getAttribute('href') || '',
            ariaLabel: target.getAttribute('aria-label') || '',
            placeholder: target.getAttribute('placeholder') || '',
            url: window.location.href
        };

        // Send to Node.js
        console.log('__CLICK__JSON__' + JSON.stringify(data));

    }, true); // Capture phase!
};


async function start() {
    console.log("🕵️ Starting VISUAL Inspector V4 (DevTools Style)...");

    const chromePath = getChromePath();
    if (!chromePath) return console.error("Chrome missing");

    const cookieRes = await sql("SELECT value FROM settings WHERE key = 'canva_cookie'");
    const cookie = cookieRes.rows.length > 0 ? cookieRes.rows[0].value : "";

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized', '--no-sandbox', '--disable-blink-features=AutomationControlled'],
        ignoreDefaultArgs: ["--enable-automation"]
    });

    const page = await browser.newPage();

    // 0. RESTORE SESSION FROM ENV (FOR GITHUB ACTIONS)
    if (process.env.CANVA_COOKIES) {
        fs.writeFileSync('auth_cookies.json', process.env.CANVA_COOKIES);
    }
    if (process.env.CANVA_USER_AGENT) {
        fs.writeFileSync('auth_user_agent.txt', process.env.CANVA_USER_AGENT);
    }

    // 1. Session Restoration (Cookie & UA)
    const COOKIE_PATH = 'auth_cookies.json';
    const UA_PATH = 'auth_user_agent.txt';

    if (fs.existsSync(UA_PATH)) {
        const ua = fs.readFileSync(UA_PATH, 'utf8').trim();
        console.log(`🎭 Using SAVED User-Agent: ${ua}`);
        await page.setUserAgent(ua);
    }

    let isLoggedIn = false;
    if (fs.existsSync(COOKIE_PATH)) {
        console.log(`🍪 Found ${COOKIE_PATH}. Attempting Session Restore...`);
        try {
            const cookiesString = fs.readFileSync(COOKIE_PATH, 'utf8');
            const cookies = JSON.parse(cookiesString);
            if (Array.isArray(cookies) && cookies.length > 0) {
                await page.setCookie(...cookies);
                console.log(`   Loaded ${cookies.length} cookies.`);
                isLoggedIn = true;
            }
        } catch (e) {
            console.error("   Failed to parse cookie file:", e);
        }
    }

    // Capture Console Logs and parse our custom JSON
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('__CLICK__JSON__')) {
            try {
                const data = JSON.parse(text.replace('__CLICK__JSON__', ''));
                console.log(`\n🖱️ [KLIK DETECTED] ---------------------------------`);
                console.log(`   URL:   ${data.url}`);
                console.log(`   TAG:   ${data.tagName}`);
                console.log(`   TEXT:  "${data.innerText.substring(0, 50).replace(/\n/g, ' ')}"`);
                console.log(`   ID:    ${data.id}`);
                console.log(`   CLASS: ${data.className}`);
                console.log(`   ARIA:  ${data.ariaLabel}`);
                console.log(`-----------------------------------------------------`);
            } catch (e) { }
        }
    });

    // INJECTION FUNCTION
    const inject = async (target) => {
        try {
            await target.evaluate(clientScript);
        } catch (e) {
            // Ignore errors on cross-origin frames
        }
    };

    // 1. Initial Load
    if (isLoggedIn) {
        console.log("🌐 Navigating to Canva (Authenticated)...");
        await page.goto('https://www.canva.com/settings/people', { waitUntil: 'domcontentloaded' });
    } else {
        console.log("🌐 Navigating to Canva Login...");
        console.log("⚠️ PLEASE LOGIN MANUALLY!");
        await page.goto('https://www.canva.com/login', { waitUntil: 'domcontentloaded' });
    }

    // 2. Continuous Injection Loop (The only reliable way for dynamic iframes)
    console.log("\n✨ MODE V4 AKTIF! ✨");
    console.log("👉 Gerakkan mouse Anda. Harusnya ada KOTAK TOOLTIP yang mengikuti mouse.");
    console.log("👉 Jika kotak itu muncul, berarti bot MELIHAT elemen itu.");
    console.log("👉 Klik tombol Invite, dan lihat terminal ini.\n");

    setInterval(async () => {
        const frames = page.frames();
        for (const frame of frames) {
            await inject(frame);
        }
    }, 1000); // Check every second

}

start();
