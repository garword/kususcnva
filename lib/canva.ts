import axios from "axios";
import { sql } from "./db";

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
// (Removed for Serverless Safety)

// Fungsi bantu untuk mendapatkan Cookie
async function getCanvaCredentials() {
    const cookieRes = await sql("SELECT value FROM settings WHERE key = 'canva_cookie'");
    if (cookieRes.rows.length === 0) {
        throw new Error("Cookie Canva belum diset! Gunakan perintah /set_cookie di bot.");
    }
    const cookie = cookieRes.rows[0].value as string;
    return { cookie };
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
            if (brands[0].role === "OWNER" || brands[0].role === "ADMIN") isPro = true;
            if (brands[0].classification === "EDUCATION" || brands[0].brandType === "EDUCATION") {
                isEdu = true;
                isPro = true;
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
 * Mengundang pengguna ke Tim Canva (Serverless Safe Stub).
 * Di mode Serverless, fungsi ini digantikan oleh Queue System (db update).
 * Fungsi ini disisakan untuk kompatibilitas type saja.
 */
export async function inviteUser(email: string): Promise<CanvaResult> {
    return {
        success: true,
        message: "Permintaan masuk antrian (Processed via GitHub Actions)"
    };
}

export async function removeUser(email: string): Promise<CanvaResult> {
    return { success: true, message: "Simulasi: User berhasil dihapus." };
}

export async function checkSlots(): Promise<string> {
    return "Cek slot via Worker Logs.";
}
