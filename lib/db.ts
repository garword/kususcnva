import { createClient } from "@libsql/client";
import dotenv from "dotenv";

// Memuat variabel lingkungan dari file .env
dotenv.config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
    throw new Error("TURSO_DATABASE_URL tidak ditemukan di environment variables");
}

// Inisialisasi klien Turso (LibSQL)
// Digunakan untuk berinteraksi dengan database di seluruh aplikasi
export const db = createClient({
    url,
    authToken,
});

// Fungsi bantuan untuk menjalankan query SQL standar
// Contoh penggunaan: await sql("SELECT * FROM users WHERE id = ?", [123]);
export const sql = async (query: string, args: any[] = []) => {
    let attempts = 0;
    const maxRetries = 3;

    while (attempts < maxRetries) {
        attempts++;
        try {
            const result = await db.execute({ sql: query, args });
            return result;
        } catch (error: any) {
            // Only retry on network/fetch errors
            if (attempts < maxRetries && (
                error.message.includes("fetch failed") ||
                error.message.includes("ConnectTimeoutError") ||
                error.code === "UND_ERR_CONNECT_TIMEOUT"
            )) {
                console.warn(`⚠️ DB Retry ${attempts}/${maxRetries} due to network error...`);
                await new Promise(r => setTimeout(r, 1500)); // Wait 1.5s
                continue;
            }

            console.error("Database Error:", error);
            throw error;
        }
    }
    // Fallback (should be unreachable due to throw)
    throw new Error("DB Connection Failed after retries");
};
