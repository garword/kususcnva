import { sql } from "../../lib/db"; // Adjust path if needed
import { TimeUtils } from "./time";

export class BackupService {

    // 1. Generate JSON Dump
    static async generate(): Promise<string> {
        // Fetch all tables
        const tables = ["users", "subscriptions", "products", "settings", "canva_accounts", "transactions"];
        const data: any = {};

        for (const table of tables) {
            try {
                const res = await sql(`SELECT * FROM ${table}`);
                data[table] = res.rows;
            } catch (e) {
                console.error(`Error fetching table ${table}:`, e);
                data[table] = []; // Empty fallback
            }
        }

        // Wrapper
        const backup = {
            version: 1,
            generated_at: TimeUtils.now().toISOString(),
            data: data
        };

        return JSON.stringify(backup, null, 2);
    }

    // 2. Restore JSON Dump (Danger!)
    static async restore(jsonContent: string): Promise<{ success: boolean; message: string }> {
        try {
            const parsed = JSON.parse(jsonContent);

            // Basic Validation
            if (!parsed.data || !parsed.data.users) {
                return { success: false, message: "Invalid Backup Format: Missing 'users' data." };
            }

            const data = parsed.data;

            // Danger Zone: Transactional? SQLite/LibSQL doesn't support massive transactions easily in HTTP mode,
            // so we do "Wipe & Insert" strategy.

            // A. Wipe (Child -> Parent)
            await sql("DELETE FROM transactions");
            await sql("DELETE FROM subscriptions");
            await sql("DELETE FROM canva_accounts");
            await sql("DELETE FROM products");
            await sql("DELETE FROM settings");
            await sql("DELETE FROM users");

            // B. Insert (Parent -> Child)

            // Helper: Batch Insert
            const insertBatch = async (table: string, rows: any[]) => {
                if (!rows || rows.length === 0) return;

                // Get Columns
                const cols = Object.keys(rows[0]);
                const placeholders = `(${cols.map(() => '?').join(',')})`;
                const sqlStmt = `INSERT INTO ${table} (${cols.join(',')}) VALUES ${rows.map(() => placeholders).join(',')}`;

                // Flatten Values
                const flatValues: any[] = [];
                for (const row of rows) {
                    for (const col of cols) {
                        flatValues.push(row[col]);
                    }
                }

                // Execute (Split if too large? LibSQL limit?)
                // Simple implementation: One big query (might fail if > 100 rows).
                // Better: Loop one by one for safety or chunk it.
                // Let's do one-by-one for maximum safety on Turso HTTP limits.
                for (const row of rows) {
                    const keys = Object.keys(row);
                    const vals = Object.values(row);
                    const qs = keys.map(() => '?').join(',');
                    await sql(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${qs})`, vals);
                }
            };

            await insertBatch("users", data.users);
            await insertBatch("settings", data.settings);
            await insertBatch("products", data.products);
            await insertBatch("canva_accounts", data.canva_accounts);
            await insertBatch("subscriptions", data.subscriptions); // Child of User & Product
            await insertBatch("transactions", data.transactions); // Child of User

            return { success: true, message: `Restored: ${data.users.length} Users, ${data.subscriptions.length} Subs.` };

        } catch (e: any) {
            console.error("Restore Error:", e);
            return { success: false, message: e.message };
        }
    }
}
