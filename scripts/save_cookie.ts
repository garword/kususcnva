import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"; // Sesuaikan path ini jika perlu

async function saveCookie() {
    puppeteer.use(StealthPlugin());

    console.log("🚀 Membuka Browser untuk Login Manual...");
    console.log("👉 Silakan Login ke Canva secara manual di browser yang terbuka.");
    console.log("👉 Pastikan sampai masuk ke Dashboard (Home).");
    console.log("👉 Setelah sukses login, KEMBALI KE SINI dan tekan ENTER.");

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const page = await browser.newPage();
    await page.goto('https://www.canva.com/login', { waitUntil: 'networkidle2' });

    // Tunggu input user di terminal
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', async () => {
        console.log("\n💾 Sedang menyimpan cookies...");

        try {
            const cookies = await page.cookies();
            const userAgent = await page.evaluate(() => navigator.userAgent);

            fs.writeFileSync('auth_cookies.json', JSON.stringify(cookies, null, 2));
            fs.writeFileSync('auth_user_agent.txt', userAgent);

            console.log("✅ SUKSES! Cookies tersimpan di 'auth_cookies.json'.");
            console.log("✅ SUKSES! User-Agent tersimpan di 'auth_user_agent.txt'.");
            console.log("Bot sekarang bisa login tanpa password dan menggunakan User-Agent yang sama.");
        } catch (e) {
            console.error("❌ Gagal simpan cookie:", e);
        } finally {
            await browser.close();
            process.exit(0);
        }
    });
}

saveCookie();
