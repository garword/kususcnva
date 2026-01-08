import { db } from "../lib/db";
import fs from "fs";
import path from "path";

// Fungsi utama untuk menjalankan migrasi
async function runMigration() {
    try {
        console.log("Mulai migrasi database...");

        // Membaca file schema.sql
        const schemaPath = path.join(__dirname, "../migrations/schema.sql");
        const schemaSql = fs.readFileSync(schemaPath, "utf-8");

        // Memisahkan perintah berdasarkan titik koma (;) untuk eksekusi per statement
        // Ini pendekatan sederhana, untuk produksi yang kompleks disarankan menggunakan library migrasi
        const statements = schemaSql
            .split(";")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

        for (const statement of statements) {
            await db.execute(statement);
            console.log(`Berhasil mengeksekusi: ${statement.substring(0, 50)}...`);
        }

        console.log("Migrasi selesai! Database siap digunakan.");
    } catch (error) {
        console.error("Gagal melakukan migrasi:", error);
        process.exit(1);
    }
}

runMigration();
