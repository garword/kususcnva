
import { sql } from '../lib/db';
import fs from 'fs';
import path from 'path';

async function exportDb() {
    console.log("📊 Starting Database Export...");

    let markdown = "# 📂 Laporan Lengkap Database (Turso)\n";
    markdown += `**Tanggal Generate:** ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB\n\n`;

    const tables = [
        'canva_accounts',
        'users',
        'subscriptions',
        'products',
        'transactions',
        'settings'
    ];

    for (const table of tables) {
        try {
            console.log(`Reading table: ${table}...`);
            const res = await sql(`SELECT * FROM ${table}`);
            const rows = res.rows;

            markdown += `## 🗂️ Tabel: \`${table}\`\n`;

            if (rows.length === 0) {
                markdown += "_Tabel ini kosong._\n\n";
                continue;
            }

            // Get Headers
            const headers = Object.keys(rows[0]);

            // Header Row
            markdown += `| ${headers.join(' | ')} |\n`;
            // Separator Row
            markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

            // Data Rows
            for (const row of rows) {
                const values = headers.map(header => {
                    let val = (row as any)[header];
                    if (val === null || val === undefined) return 'NULL';
                    if (typeof val === 'object') val = JSON.stringify(val);
                    // sanitize newlines and pipes
                    return String(val).replace(/\n/g, '<br>').replace(/\|/g, '&#124;');
                });
                markdown += `| ${values.join(' | ')} |\n`;
            }
            markdown += `\n**Total Baris:** ${rows.length}\n\n---\n\n`;

        } catch (e: any) {
            console.error(`Error exporting table ${table}:`, e.message);
            markdown += `\n❌ **Error pada tabel ${table}:** ${e.message}\n\n`;
        }
    }

    const outputPath = path.resolve(__dirname, '../catatandb.md');
    fs.writeFileSync(outputPath, markdown, 'utf-8');
    console.log(`✅ Export Finished! Saved to: ${outputPath}`);
}

exportDb();
