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
    try {
        const result = await db.execute({ sql: query, args });
        return result;
    } catch (error) {
        console.error("Database Error:", error);
        throw error;
    }
};
