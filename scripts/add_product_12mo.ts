import { sql } from '../src/lib/db';

async function migrate() {
    try {
        console.log("Adding 12 Month (Stacked) Product...");
        // Check if exists
        const res = await sql("SELECT * FROM products WHERE id = 4");
        if (res.rows.length > 0) {
            console.log("ℹ️ Product ID 4 already exists.");
        } else {
            // Insert Product 4: 12 Bulan (360 days)
            // Assuming Product 3 is 6 Month (180 days)
            await sql(`
                INSERT INTO products (id, name, duration_days, price_points) 
                VALUES (4, '12 Bulan (2x 6 Bulan)', 360, 12)
            `);
            console.log("✅ Product 4 added: 12 Bulan (360 days) - 12 Poin");
        }
    } catch (e: any) {
        console.error("❌ Migration failed:", e.message);
    }
}

migrate();
