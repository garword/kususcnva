import { sql } from "../lib/db";
import { removeUser } from "../lib/canva";
import { Bot } from "grammy";
import dotenv from "dotenv";

dotenv.config();

// Kita butuh instance bot baru atau import yang ada untuk kirim notif
const token = process.env.BOT_TOKEN;
const adminChannel = process.env.ADMIN_CHANNEL_ID; // ID Channel Laporan
const bot = new Bot(token || "");

export default async function handler(req: any, res: any) {
    // Verifikasi Signature Vercel Cron (Opsional tapi disarankan untuk keamanan)
    // const authHeader = req.headers.get('authorization');
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) { ... }

    try {
        console.log("Menjalankan CRON Cek Kedaluwarsa...");

        // 1. Cari user yang sudah expired tapi status masih aktif
        // Menggunakan syntax SQL standar (datetime comparison)
        const result = await sql(`
      SELECT s.id, s.user_id, u.email, u.username, s.end_date 
      FROM subscriptions s
      JOIN users u ON s.user_id = u.id
      WHERE s.end_date < datetime('now') AND s.status = 'active'
    `);

        const expiredSubs = result.rows;
        console.log(`Ditemukan ${expiredSubs.length} langganan kedaluwarsa.`);

        for (const sub of expiredSubs) {
            const email = sub.email as string;
            const subId = sub.id as string;
            const userId = sub.user_id as number;
            const username = sub.username as string;

            // 2. Lakukan Kick dari Canva
            const kickResult = await removeUser(email);

            if (kickResult.success) {
                // 3. Update status di Database
                await sql(`UPDATE subscriptions SET status = 'kicked' WHERE id = ?`, [subId]);

                // 4. Notifikasi ke User
                try {
                    await bot.api.sendMessage(userId, "Masa langganan Canva Anda telah habis. Akses telah dicabut. Silakan beli paket baru jika ingin lanjut.");
                } catch (e) {
                    console.log(`Gagal kirim pesan ke user ${userId} (Mungkin blokir bot).`);
                }

                // 5. Notifikasi ke Admin Channel
                if (adminChannel) {
                    await bot.api.sendMessage(adminChannel,
                        `🗑 **Auto-Kick Berhasil**\n` +
                        `User: ${username} (ID: ${userId})\n` +
                        `Email: ${email}\n` +
                        `Expired: ${sub.end_date}`
                    );
                }

            } else {
                console.error(`Gagal kick user ${email}: ${kickResult.message}`);
                // Log error di DB atau notif admin bisa ditambahkan disini
            }
        }

        res.status(200).json({ success: true, processed: expiredSubs.length });

    } catch (error: any) {
        console.error("Cron Error:", error);
        res.status(500).json({ error: error.message });
    }
}
