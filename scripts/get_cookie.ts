
/// <reference lib="dom" />
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { sql } from '../lib/db';
import * as dotenv from 'dotenv';
dotenv.config();

// Find Chrome Path Windows
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

async function start() {
    const chromePath = getChromePath();
    if (!chromePath) {
        console.error("❌ Google Chrome tidak ditemukan di lokasi standar.");
        console.error("Silakan edit file `scripts/get_cookie.ts` dan masukkan path Chrome Anda.");
        process.exit(1);
    }

    console.log("🚀 Meluncurkan Chrome untuk Login Canva...");
    console.log("⏳ Silakan LOGIN ke Canva di window Chrome yang terbuka...");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: null,
        ignoreDefaultArgs: ["--enable-automation"],
        args: [
            '--start-maximized',
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled'
        ]
    });

    const page = await browser.newPage();

    // Anti-detection simple script
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    // SNIFFING VARIABLES
    let sniffedCookie = "";
    let sniffedXsrf = "";

    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const url = req.url();
        // Log traffic untuk debug
        if (url.includes("canva.com")) {
            console.log(`>> Request: ${url.substring(0, 40)}...`);
        }

        // Target request internal Canva yang pasti butuh auth
        if (url.includes("/_ajax/") || url.includes("/api/")) {
            const headers = req.headers();
            const cookie = headers['cookie'] || "";
            // Cek berbagai variasi nama header token
            const xsrf = headers['x-xsrf-token'] || headers['X-XSRF-TOKEN'] || headers['x-csrf-token'] || headers['xsrf-token'] || "";

            if (cookie && xsrf) {
                if (!sniffedCookie || !sniffedXsrf) {
                    console.log(`🔥 TERTANGKAP: Credentials dari request ke ${url.substring(0, 40)}...!`);
                    sniffedCookie = cookie;
                    sniffedXsrf = xsrf;
                }
            }
        }
        req.continue();
    });

    await page.goto('https://www.canva.com/login', { waitUntil: 'networkidle2' });

    console.log("👀 Memantau traffic (Login & Klik Menu)...");

    // Polling setiap 2 detik
    const checkInterval = setInterval(async () => {
        if (browser.process()?.killed) {
            clearInterval(checkInterval);
            process.exit(0);
        }

        const cookies = await page.cookies();
        const hasCAU = cookies.find(c => c.name === 'CAU'); // Canva Auth User (Indikator Login Sukses)

        // COBA CARI DI LOCAL STORAGE (Backup)
        if (!sniffedXsrf) {
            const lsToken = await page.evaluate(() => {
                // Coba cari di cookies document langsung
                const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
                if (match) return decodeURIComponent(match[1]);
                return null;
            });
            if (lsToken) {
                console.log("🧩 XSRF-TOKEN ditemukan di Document Cookie!");
                sniffedXsrf = lsToken;
                // Ambil cookie saat ini juga
                sniffedCookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            }
        }

        // Jika sudah dapat credentials lengkap dari sniffing
        if (sniffedCookie && sniffedXsrf) {
            if (!hasCAU) {
                console.log("⚠️ Token tertangkap, tapi belum login penuh (Menunggu Cookie CAU)...");
            } else {
                console.log("✅ KUNCI DITEMUKAN & LOGIN VALID!");
                clearInterval(checkInterval);

                // Cek apakah cookie string sudah mengandung XSRF-TOKEN
                let finalCookie = sniffedCookie;
                if (!finalCookie.includes("XSRF-TOKEN=") && sniffedXsrf) {
                    finalCookie += `; XSRF-TOKEN=${sniffedXsrf}`;
                }

                console.log("💾 Menyimpan Data Valid ke Database...");

                // Get User Agent
                const userAgent = await page.evaluate(() => navigator.userAgent);
                console.log(`🕵️ User-Agent: ${userAgent.substring(0, 50)}...`);

                await sql(
                    `INSERT INTO settings (key, value) VALUES ('canva_cookie', ?) 
                    ON CONFLICT(key) DO UPDATE SET value = ?`,
                    [finalCookie, finalCookie]
                );

                await sql(
                    `INSERT INTO settings (key, value) VALUES ('canva_user_agent', ?) 
                    ON CONFLICT(key) DO UPDATE SET value = ?`,
                    [userAgent, userAgent]
                );

                // Auto detect Team ID from URL
                const currentUrl = page.url();
                const teamMatch = currentUrl.match(/brand\/([^\/]+)/);
                if (teamMatch) {
                    const tid = teamMatch[1];
                    await sql(
                        `INSERT INTO settings (key, value) VALUES ('canva_team_id', ?) 
                        ON CONFLICT(key) DO UPDATE SET value = ?`,
                        [tid, tid]
                    );
                }

                console.log("✅ SEMUA DATA TERSIMPAN!");
                console.log("🔐 Menutup browser dalam 3 detik...");

                setTimeout(async () => {
                    if (browser.isConnected()) await browser.close();
                    console.log("👋 Selesai! SIAP TEMPUR.");
                    process.exit(0);
                }, 3000);
                return;
            }
        }

        // AUTO-CLICKER (Tetap jalankan, untuk memancing request)
        try {
            const url = page.url();
            // Hanya klik jika sudah login (bukan di halaman login/signup)
            if (!url.includes("login") && !url.includes("signup")) {
                await page.evaluate(() => {
                    const targets = ["Pribadi", "Personal", "Projects", "Proyek", "Home", "Beranda"];
                    const allElements = Array.from(document.querySelectorAll('span, p, div, a'));
                    for (const el of allElements) {
                        if (el.textContent && targets.includes(el.textContent.trim())) {
                            // Klik elemen acak untuk memancing
                            if (Math.random() > 0.7) (el as HTMLElement).click();
                        }
                    }
                });
            }
        } catch (e) { }

    }, 2000);

    // Timeout 10 menit
    setTimeout(async () => {
        console.log("⏰ Waktu habis (10 menit).");
        if (browser.isConnected()) await browser.close();
        process.exit(1);
    }, 600000);
}

start();
