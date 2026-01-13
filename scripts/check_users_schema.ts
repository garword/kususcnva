import { createClient } from "@libsql/client";
import dotenv from "dotenv";

dotenv.config();

const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
});

export const sql = async (query: string, args: any[] = []) => {
    try {
        const result = await db.execute({ sql: query, args });
        return result;
    } catch (error: any) {
        console.error("Database Error:", error.message);
        throw error;
    }
};

async function checkSchema() {
    console.log("🔍 Checking 'users' table schema...");
    try {
        const res = await sql("PRAGMA table_info(users)");
        console.table(res.rows);
    } catch (e: any) {
        console.error("❌ Error:", e.message);
    }
}

checkSchema();
