import { db } from "../lib/db";

async function fixSchema() {
    console.log("🛠️ Memulai perbaikan schema database...");

    // List kolom yang perlu ditambahkan jika belum ada
    const alterations = [
        "ALTER TABLE users ADD COLUMN referral_code TEXT",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)",
        "ALTER TABLE users ADD COLUMN referred_by INTEGER",
        "ALTER TABLE users ADD COLUMN referral_points INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN selected_product_id INTEGER DEFAULT 1",
        "ALTER TABLE users ADD COLUMN joined_at DATETIME DEFAULT CURRENT_TIMESTAMP"
    ];

    for (const sql of alterations) {
        try {
            await db.execute(sql);
            console.log(`✅ Sukses: ${sql}`);
        } catch (error: any) {
            // Ignore error if column already exists
            if (error.message.includes("duplicate column name")) {
                console.log(`⚠️ Skip (Sudah ada): ${sql}`);
            } else {
                console.error(`❌ Gagal: ${sql}`, error.message);
            }
        }
    }

    console.log("✅ Perbaikan Schema Selesai!");
}

fixSchema();
