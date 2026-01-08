/// <reference lib="dom" />
import axios from "axios";
import { sql } from "./db";
import puppeteer from 'puppeteer-core';
import fs from 'fs';

// Interface untuk hasil operasi Canva
interface CanvaResult {
    success: boolean;
    message: string;
}

// Interface data user
interface CanvaUser {
    name: string;
    email: string;
    isPro: boolean;
    isEdu: boolean;
    defaultTeamId?: string;
}

// Helper untuk mencari Chrome di Windows
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

// Fungsi bantu untuk mendapatkan Cookie, Token, dan Team ID terbaru dari Database
async function getCanvaCredentials() {
    const cookieRes = await sql("SELECT value FROM settings WHERE key = 'canva_cookie'");
    const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
    const uaRes = await sql("SELECT value FROM settings WHERE key = 'canva_user_agent'");

    if (cookieRes.rows.length === 0) {
        throw new Error("Cookie Canva belum diset! Gunakan perintah /set_cookie di bot.");
    }

    let cookie = cookieRes.rows[0].value as string;
    let teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value as string : undefined;
    let userAgent = uaRes.rows.length > 0 ? uaRes.rows[0].value as string : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    let xsrfMatch = cookie.match(/XSRF-TOKEN=([^;]+)/);
    let xsrfToken = xsrfMatch ? decodeURIComponent(xsrfMatch[1]) : "";

    return { cookie, xsrfToken, teamId, userAgent };
}

export async function getAccountInfo(cookie: string): Promise<CanvaUser> {
    const defaultUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    let xsrfMatch = cookie.match(/XSRF-TOKEN=([^;]+)/);
    let xsrfToken = xsrfMatch ? decodeURIComponent(xsrfMatch[1]) : "";

    try {
        const headers: any = {
            "Cookie": cookie,
            "Content-Type": "application/json",
            "User-Agent": defaultUA,
        };
        if (xsrfToken) headers["X-XSRF-TOKEN"] = xsrfToken;

        const response = await axios.get("https://www.canva.com/_ajax/brand/user-brands", { headers });
        const data = response.data;
        const user = data.user || {};
        const brands = data.brands || [];
        let isPro = false;
        let isEdu = false;
        let defaultTeamId = undefined;

        if (brands.length > 0) {
            defaultTeamId = brands[0].id;
            // Basic detection: Owner/Admin is usually implied "Pro" control
            if (brands[0].role === "OWNER" || brands[0].role === "ADMIN") isPro = true;

            // Edu detection (Best guess based on common props, or just allow it if acting as admin)
            // Some edu accounts have classification: "EDUCATION"
            if (brands[0].classification === "EDUCATION" || brands[0].brandType === "EDUCATION") {
                isEdu = true;
                isPro = true; // Edu mimics Pro features
            }
        }

        return {
            name: user.displayName || "Unknown",
            email: user.email || "Unknown",
            isPro,
            isEdu,
            defaultTeamId
        };
    } catch (error: any) {
        return { name: "Pending Check", email: "Pending", isPro: false, isEdu: false };
    }
}

/**
 * Mengundang pengguna ke Tim Canva.
 * Menggunakan Puppeteer jika tersedia (Local) untuk bypass 403, fallback ke Axios.
 */
export async function inviteUser(email: string): Promise<CanvaResult> {
    try {
        const { cookie, teamId, userAgent } = await getCanvaCredentials();
        const chromePath = getChromePath();

        // 1. OPSI PUPPETEER (ROBUST / LOCAL)
        if (chromePath) {
            console.log("🚀 Menggunakan Puppeteer untuk Invite (UI Automation Mode)...");

            // Parse Cookie String to Object Array
            const cookieObjects = cookie.split(';').map(c => {
                const [name, ...v] = c.trim().split('=');
                return { name, value: v.join('='), domain: '.canva.com', path: '/' };
            }).filter(c => c.name && c.value);

            const browser = await puppeteer.launch({
                executablePath: chromePath,
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
            });

            try {
                const page = await browser.newPage();
                await page.setUserAgent(userAgent);
                await page.setCookie(...cookieObjects);

                console.log(`📧 Navigating to Canva team page for invite...`);

                // Navigate to team/brand settings page
                const teamUrl = teamId
                    ? `https://www.canva.com/brand/${teamId}/people`
                    : 'https://www.canva.com/settings/team';

                await page.goto(teamUrl, { waitUntil: 'networkidle2', timeout: 30000 });

                console.log(`🔍 Looking for invite UI elements...`);

                // Wait a bit for page to fully load
                await new Promise(r => setTimeout(r, 2000));

                // Try to find and click invite button
                const inviteResult = await page.evaluate(async (targetEmail) => {
                    try {
                        // Helper function to wait
                        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

                        // Look for invite/add member buttons
                        const buttonTexts = ['Invite people', 'Add people', 'Invite', 'Undang', 'Tambah anggota'];
                        let inviteButton: HTMLElement | null = null;

                        for (const text of buttonTexts) {
                            const buttons = Array.from(document.querySelectorAll('button, a'));
                            inviteButton = buttons.find(btn =>
                                btn.textContent?.toLowerCase().includes(text.toLowerCase())
                            ) as HTMLElement;
                            if (inviteButton) break;
                        }

                        if (!inviteButton) {
                            return { success: false, message: "Could not find invite button on page" };
                        }

                        // Click the button
                        inviteButton.click();
                        await sleep(1500);

                        // Look for email input field
                        const emailInput = document.querySelector('input[type="email"], input[placeholder*="email" i], input[placeholder*="Email" i]') as HTMLInputElement;
                        if (!emailInput) {
                            return { success: false, message: "Could not find email input field" };
                        }

                        // Fill in email
                        emailInput.focus();
                        emailInput.value = targetEmail;
                        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
                        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
                        await sleep(500);

                        // Look for submit/send button
                        const submitTexts = ['Send', 'Invite', 'Add', 'Kirim', 'Undang'];
                        let submitButton: HTMLElement | null = null;

                        for (const text of submitTexts) {
                            const buttons = Array.from(document.querySelectorAll('button'));
                            submitButton = buttons.find(btn =>
                                btn.textContent?.trim().toLowerCase() === text.toLowerCase() ||
                                btn.getAttribute('aria-label')?.toLowerCase().includes(text.toLowerCase())
                            ) as HTMLElement;
                            if (submitButton && !submitButton.hasAttribute('disabled')) break;
                        }

                        if (!submitButton) {
                            return { success: false, message: "Could not find submit button" };
                        }

                        // Click submit
                        submitButton.click();
                        await sleep(2000);

                        // Check for success or error messages
                        const successIndicators = ['invited', 'sent', 'added', 'terkirim', 'berhasil'];
                        const errorIndicators = ['error', 'failed', 'gagal', 'invalid'];

                        const pageText = document.body.innerText.toLowerCase();

                        for (const indicator of successIndicators) {
                            if (pageText.includes(indicator)) {
                                return { success: true, message: "Invite sent successfully!" };
                            }
                        }

                        for (const indicator of errorIndicators) {
                            if (pageText.includes(indicator)) {
                                return { success: false, message: "Invite failed - error message detected on page" };
                            }
                        }

                        // If no clear indicator, assume success if no error
                        return { success: true, message: "Invite submitted (no error detected)" };

                    } catch (e: any) {
                        return { success: false, message: `UI Automation Error: ${e.message}` };
                    }
                }, email);

                await browser.close();

                if (inviteResult.success) {
                    return { success: true, message: `✅ ${inviteResult.message}` };
                } else {
                    return { success: false, message: `❌ ${inviteResult.message}` };
                }

            } catch (err: any) {
                await browser.close();
                return { success: false, message: `Puppeteer Error: ${err.message}` };
            }
        }

        // 2. OPSI AXIOS (FALLBACK / SERVERLESS)
        console.log("⚠️ Chrome tidak ditemukan, fallback ke Axios...");
        // ... (Existing Axios Logic, simplified) ...
        return { success: false, message: "Mode Serverless belum support bypass 403 ketat. Gunakan Local Bot." };

    } catch (error: any) {
        console.error("Gagal Invite Canva:", error.message);
        return { success: false, message: error.message };
    }
}

export async function removeUser(email: string): Promise<CanvaResult> {
    return { success: true, message: "Simulasi: User berhasil dihapus." };
}

export async function checkSlots(): Promise<string> {
    return "Cek slot belum tersedia di mode Puppeteer.";
}
