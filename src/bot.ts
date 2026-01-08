import { Bot, Context, session, InlineKeyboard, Keyboard } from "grammy";
import { sql } from "../lib/db";
import { inviteUser, checkSlots, getAccountInfo } from "../lib/canva";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// Definisi Tipe Context Custom (jika perlu)
type MyContext = Context;

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN hilang!");

export const bot = new Bot<MyContext>(token);

// ============================================================
// MIDDLEWARE & UTILITAS
// ============================================================

// Cek apakah user Admin
const ADMIN_ID = parseInt(process.env.ADMIN_ID || "0");
const isAdmin = (id: number) => id === ADMIN_ID;

// ============================================================
// KEYBOARDS (ANTARMUKA)
// ============================================================

// Reply Keyboard (Menu Utama Tahan Lama)
const mainMenu = new Keyboard()
    .text("🎁 Menu Paket").text("👤 Profil Saya").row()
    .text("📖 Panduan").text("👨‍💻 Admin Panel")
    .resized();

// ============================================================
// COMMAND HANDLERS
// ============================================================

// Helper: Ambil List Channel (Prioritas DB -> Env)
async function getForceSubChannels(): Promise<string[]> {
    let raw = "";
    try {
        const res = await sql("SELECT value FROM settings WHERE key = 'force_sub_channels'");
        if (res.rows.length > 0) {
            raw = res.rows[0].value as string;
        }
    } catch (e) {
        console.error("DB Error get channels:", e);
    }

    if (!raw) {
        raw = process.env.FORCE_SUB_CHANNELS || "";
    }

    return raw.split(',').map(c => c.trim()).filter(c => c);
}

// Helper: Cek Membership
async function checkMember(userId: number, ctx: MyContext): Promise<boolean> {
    const channels = await getForceSubChannels();
    if (channels.length === 0) return true;

    for (const chat of channels) {
        try {
            // Support @username or ID (jika bot admin)
            const member = await ctx.api.getChatMember(chat, userId);
            if (member.status === 'left' || member.status === 'kicked') {
                return false;
            }
        } catch (e) {
            console.error(`Gagal cek member ${chat}:`, e);
            // Jika error (misal bot bukan admin), kita asumsikan FALSE agar admin sadar harus fix
            // Atau TRUE agar user tidak terblokir? 
            // Better FALSE + Log, karena ini fitur "Wajib Join".
            // Tapi kalau salah config, user macet. 
            // Kita return FALSE.
            return false;
        }
    }
    return true;
}

// Admin Commands for Channels
bot.command("set_channels", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const input = ctx.match;
    if (!input) {
        return ctx.reply("⚠️ <b>Format Salah!</b>\nContoh: <code>/set_channels @channel1, @channel2</code>\n\nTips: Pisahkan dengan koma.", { parse_mode: "HTML" });
    }

    try {
        await sql(
            `INSERT INTO settings (key, value) VALUES ('force_sub_channels', ?) 
             ON CONFLICT(key) DO UPDATE SET value = ?`,
            [input, input]
        );
        await ctx.reply(`✅ <b>Channel Berhasil Disimpan!</b>\nList: ${input}`, { parse_mode: "HTML" });
    } catch (e: any) {
        await ctx.reply(`❌ Error DB: ${e.message}`);
    }
});

bot.command("channels", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const channels = await getForceSubChannels();
    if (channels.length === 0) return ctx.reply("System menggunakan ENV (belum ada di DB).");
    await ctx.reply(`📢 <b>List Channel Aktif:</b>\n\n${channels.join('\n')}`, { parse_mode: "HTML" });
});

bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username || "Guest";
    const firstName = ctx.from?.first_name || "Guest";

    if (!userId) return;

    // 1. Cek apakah ini User Baru (untuk validasi Referral)
    const checkUser = await sql("SELECT id FROM users WHERE id = ?", [userId]);
    const isNewUser = checkUser.rows.length === 0;

    // 2. Simpan/Update User ke Database (Upsert)
    // Pastikan data tersimpan dulu (Sesuai request: "ketika data sudah terdaftar")
    await sql(
        `INSERT INTO users (id, username, first_name, joined_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET username = ?, first_name = ?`,
        [userId, username, firstName, username, firstName]
    );

    // 3. Cek/Generate Referral Code
    let userRes = await sql("SELECT * FROM users WHERE id = ?", [userId]);
    let user = userRes.rows[0];

    if (!user.referral_code) {
        const refCode = `ref${userId}`;
        await sql("UPDATE users SET referral_code = ? WHERE id = ?", [refCode, userId]);
        user.referral_code = refCode;
    }

    // 4. Proses Referral (HANYA JIKA USER BARU)
    // Poin masuk setelah user baru sukses terdaftar di DB
    const payload = ctx.match;
    if (isNewUser && payload && payload !== user.referral_code) {
        // Cari Referrer
        const uplineRes = await sql("SELECT id, referral_points FROM users WHERE referral_code = ?", [payload]);
        if (uplineRes.rows.length > 0) {
            const upline = uplineRes.rows[0];

            // Simpan Upline
            await sql("UPDATE users SET referred_by = ? WHERE id = ?", [upline.id, userId]);

            // Tambah Poin Upline
            await sql("UPDATE users SET referral_points = referral_points + 1 WHERE id = ?", [upline.id]);

            // Notifikasi Upline
            try {
                await ctx.api.sendMessage(
                    upline.id as number,
                    `🎉 <b>Referral Baru!</b>\n\n` +
                    `User <b>${firstName}</b> telah terdaftar di database.\n` +
                    `Total Poin: <b>${(upline.referral_points as number) + 1}</b>`,
                    { parse_mode: "HTML" }
                );
            } catch (ignore) { }
        }
    }

    // 4. Cek Force Subscribe
    const isJoined = await checkMember(userId, ctx);
    if (!isJoined) {
        const channels = await getForceSubChannels();
        const keyboard = new InlineKeyboard();

        channels.forEach((ch, i) => {
            let url = ch.startsWith("@") ? `https://t.me/${ch.replace("@", "")}` : `https://t.me/c/${ch.replace("-100", "")}/1`;
            keyboard.url(`📢 Channel ${i + 1}`, url).row();
        });

        keyboard.text("✅ Sudah Bergabung", "check_join");

        return ctx.reply(
            `⛔ <b>Akses Terkunci!</b>\n\n` +
            `Halo ${firstName}, untuk menggunakan bot ini Anda <b>WAJIB JOIN</b> ke channel berikut:`,
            { reply_markup: keyboard, parse_mode: "HTML" }
        );
    }

    await ctx.reply(
        `Halo ${firstName}! Selamat datang di <b>Canva Bot</b>.\n\n` +
        `Bot ini menyediakan akses Canva Pro/Edu dengan sistem Points.\n` +
        `Kumpulkan poin dengan mengundang teman untuk mendapatkan akses Premium!\n\n` +
        `🔗 <b>Link Referral Anda:</b>\n` +
        `https://t.me/${ctx.me.username}?start=${user.referral_code}\n\n` +
        `Silakan pilih menu di bawah ini.`,
        {
            reply_markup: mainMenu,
            parse_mode: "HTML"
        }
    );
});

// Callback: Cek Join
bot.callbackQuery("check_join", async (ctx) => {
    const userId = ctx.from.id;
    const isJoined = await checkMember(userId, ctx);

    if (isJoined) {
        await ctx.deleteMessage();
        await ctx.reply(
            `✅ <b>Terima Kasih!</b>\nAkses Anda telah dibuka.\nSelamat menggunakan bot.`,
            { reply_markup: mainMenu, parse_mode: "HTML" }
        );
    } else {
        await ctx.answerCallbackQuery("❌ Anda belum join semua channel!");
    }
});

// Fungsi handler core untuk memproses cookie (dari teks atau file)
async function handleCookieProcess(ctx: MyContext, cookieRaw: string) {
    let cookie = cookieRaw;

    // Deteksi Format JSON (dari Extension)
    if (cookie.trim().startsWith("[") || cookie.trim().startsWith("{")) {
        try {
            const parsed = JSON.parse(cookie);
            let cookieList: any[] = [];

            if (Array.isArray(parsed)) {
                cookieList = parsed;
            } else if (parsed.cookies && Array.isArray(parsed.cookies)) {
                cookieList = parsed.cookies;
            }

            if (cookieList.length > 0) {
                // Convert to header format
                cookie = cookieList.map((c: any) => `${c.name}=${c.value}`).join("; ");
            }
        } catch (e) {
            return ctx.reply("❌ <b>Format JSON Salah!</b>\nJSON tidak valid.", { parse_mode: "HTML" });
        }
    }

    await ctx.reply("⏳ Memvalidasi cookie & mengambil info akun...", { parse_mode: "HTML" });

    try {
        const info = await getAccountInfo(cookie);

        await sql(
            `INSERT INTO settings (key, value) VALUES ('canva_cookie', ?) 
         ON CONFLICT(key) DO UPDATE SET value = ?`,
            [cookie, cookie]
        );

        if (info.defaultTeamId) {
            await sql(
                `INSERT INTO settings (key, value) VALUES ('canva_team_id', ?) 
             ON CONFLICT(key) DO UPDATE SET value = ?`,
                [info.defaultTeamId, info.defaultTeamId]
            );
        }

        const typeStr = info.isPro ? "✅ PRO/EDU" : "⚠️ FREE";

        await ctx.reply(
            `✅ <b>Cookie Valid & Tersimpan!</b>\n\n` +
            `👤 Nama: <b>${info.name}</b>\n` +
            `📧 Email: <b>${info.email}</b>\n` +
            `💎 Tipe: <b>${typeStr}</b>\n` +
            `🆔 Team ID: <code>${info.defaultTeamId || "Belum deteksi"}</code> (Auto-Set)\n\n` +
            `Sekarang coba tes invite dengan /test_invite [email]`,
            { parse_mode: "HTML" }
        );

    } catch (error: any) {
        let msg = error.message;
        if (msg.includes("XSRF-TOKEN")) {
            msg += "\n\n⚠️ <b>PENTING:</b> Cookie Anda tidak lengkap (Missing XSRF). Bot gagal auto-fetch. Coba ambil cookie via F12 Network Tab.";
        }
        await ctx.reply(`❌ <b>Cookie Gagal!</b>\nError: ${msg}`, { parse_mode: "HTML" });
    }
}

// Admin Command: Set Cookie (Text Mode)
bot.command("set_cookie", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;
    const cookie = ctx.match;
    if (!cookie) return ctx.reply("Format salah. Kirim JSON/Text atau Upload File .json/.txt dengan caption /set_cookie.", { parse_mode: "HTML" });
    await handleCookieProcess(ctx, cookie);
});

// Admin Command: Upload File Cookie (Document Mode)
bot.on("message:document", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    const doc = ctx.message.document;
    const fileName = doc.file_name?.toLowerCase() || "";

    // Hanya terima file .json atau .txt
    if (fileName.endsWith(".json") || fileName.endsWith(".txt")) {
        try {
            await ctx.reply("📂 File diterima. Mengunduh & Memproses...", { parse_mode: "HTML" });

            // 1. Dapatkan File Path dari Telegram
            const file = await ctx.api.getFile(doc.file_id);
            if (!file.file_path) throw new Error("File path tidak ditemukan.");

            // 2. Download File
            const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
            const response = await axios.get(fileUrl, { responseType: 'text' });
            const content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

            // 3. Proses Konten
            await handleCookieProcess(ctx, content);

        } catch (error: any) {
            await ctx.reply(`❌ Gagal memproses file: ${error.message}`);
        }
    }
});

// Helper: Trigger GitHub Action
async function triggerGithubAction() {
    const ghUser = process.env.GITHUB_USERNAME;
    const ghRepo = process.env.GITHUB_REPO;
    const ghToken = process.env.GITHUB_TOKEN;

    if (!ghUser || !ghRepo || !ghToken) {
        console.warn("⚠️ GitHub Actions credentials missing (GITHUB_USERNAME, GITHUB_REPO, GITHUB_TOKEN). Auto-trigger skipped.");
        return;
    }

    try {
        await axios.post(
            `https://api.github.com/repos/${ghUser}/${ghRepo}/dispatches`,
            { event_type: "process_queue" },
            {
                headers: {
                    Authorization: `Bearer ${ghToken}`,
                    Accept: "application/vnd.github.v3+json",
                },
            }
        );
        console.log("🚀 GitHub Action triggered successfully.");
    } catch (e: any) {
        console.error("❌ Failed to trigger GitHub Action:", e.response?.data || e.message);
    }
}

// Admin Command: Test Invite (Queue Version)
bot.command("test_invite", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    const email = ctx.match;
    if (!email) return ctx.reply("Format salah. Gunakan: <code>/test_invite [email_tujuan]</code>", { parse_mode: "HTML" });

    // 1. Simpan ke Database sebagai Queue
    try {
        await ctx.reply(`⏳ Menambahkan <b>${email}</b> ke antrian invite...`, { parse_mode: "HTML" });
        await sql(
            `INSERT INTO users (id, email, status, role, first_name) VALUES (?, ?, 'pending_invite', 'free', 'Test User')
             ON CONFLICT(email) DO UPDATE SET status = 'pending_invite'`,
            [Math.floor(Math.random() * -100000), email] // Dummy ID for test
        );

        // 2. Trigger GitHub Action
        triggerGithubAction();

        await ctx.reply(
            `✅ <b>Masuk Antrian!</b>\n` +
            `Sistem akan memproses invite dalam 1-5 menit via GitHub Action.\n` +
            `Bot akan mengirim notifikasi jika sudah berhasil.`,
            { parse_mode: "HTML" }
        );

    } catch (error: any) {
        await ctx.reply(`❌ <b>Gagal Queue!</b>\nError: ${error.message}`, { parse_mode: "HTML" });
    }
});

// User Command: Aktivasi (User Submit Email)
bot.command("aktivasi", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Force Subscribe Check
    if (!(await checkMember(userId, ctx))) {
        return ctx.reply("⛔ <b>Akses Ditolak!</b>\nAnda belum join channel wajib.\nSilakan ketik /start untuk melihat list channel.", { parse_mode: "HTML" });
    }

    const email = ctx.match;
    if (!email || !email.includes("@")) {
        return ctx.reply("⚠️ <b>Format Salah!</b>\nContoh: <code>/aktivasi emailmu@gmail.com</code>", { parse_mode: "HTML" });
    }

    try {
        // 0. Ambil Data User (Produk & Poin)
        const userRes = await sql("SELECT selected_product_id, referral_points FROM users WHERE id = ?", [userId]);
        const user = userRes.rows[0];
        const selectedProd = user.selected_product_id || 1;
        const currentPoints = (user.referral_points as number) || 0;

        // 1. Logic Premium (6 Bulan) - Pay as you go (Bayar Pakai Poin)
        if (selectedProd === 3) {
            if (currentPoints < 6) {
                return ctx.reply(
                    `⛔ <b>Poin Tidak Cukup!</b>\n\n` +
                    `Paket 6 Bulan membutuhkan <b>6 Poin Referral</b>.\n` +
                    `Sisa Poin Anda: <b>${currentPoints}</b>\n\n` +
                    `💡 <b>Solusi:</b>\n` +
                    `1. Undang teman lagi (share link referral).\n` +
                    `2. Atau ganti ke Paket Free di tombol "Menu Paket".`,
                    { parse_mode: "HTML" }
                );
            }
            // POTONG POIN SEKARANG!
            await sql("UPDATE users SET referral_points = referral_points - 6 WHERE id = ?", [userId]);
        }

        // 2. Logic Free (1 Bulan / Lainnya) - Cek Limit Akun
        else {
            const activeSub = await sql(
                `SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' AND end_date > datetime('now')`,
                [userId]
            );

            if (activeSub.rows.length > 0) {
                const sub = activeSub.rows[0];
                const endDate = new Date(sub.end_date as string).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
                return ctx.reply(
                    `⛔ <b>Akses Ditolak!</b>\n\n` +
                    `Anda masih memiliki akun aktif sampai: <b>${endDate}</b>.\n` +
                    `Untuk Paket Free, maksimal 1 akun aktif.\n\n` +
                    `💡 <b>Ingin Invite Lagi?</b>\n` +
                    `Gunakan Paket 6 Bulan (Premium) dengan menukar poin referral.`,
                    { parse_mode: "HTML" }
                );
            }
        }

        // 3. Simpan Email & Masukkan Antrian Invite
        await sql(
            `UPDATE users SET email = ?, status = 'pending_invite' WHERE id = ?`,
            [email, userId]
        );

        // 4. Trigger Action
        triggerGithubAction();

        await ctx.reply(
            `✅ <b>Permintaan Diterima!</b>\n\n` +
            `Email: <code>${email}</code>\n` +
            `Paket: <b>${selectedProd === 3 ? "6 Bulan Premium" : "1 Bulan Free"}</b>\n` +
            `Status: <b>Masuk Antrian Invite</b>\n\n` +
            `Bot akan mengirim notifikasi saat invite berhasil dikirim (est. 1-5 menit).`,
            { parse_mode: "HTML" }
        );

    } catch (error: any) {
        await ctx.reply(`❌ Error System: ${error.message}`);
    }
});

// Admin Command: Help Cookie
bot.command("help_cookie", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    await ctx.reply(
        "<b>Cara Mengambil Cookie Canva:</b>\n\n" +
        "1. Login Canva.com di PC (Chrome).\n" +
        "2. Tekan F12 -> Tab Network.\n" +
        "3. Refresh page.\n" +
        "4. Klik request teratas -> Tab Headers -> Copy value 'Cookie'.\n" +
        "5. Kirim ke bot: <code>/set_cookie [paste_disini]</code>",
        { parse_mode: "HTML" }
    );
});

// Admin Command: Broadcast
bot.command("broadcast", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    const message = ctx.match;
    const replyMsg = ctx.msg.reply_to_message;

    if (!message && !replyMsg) {
        return ctx.reply(
            "⚠️ <b>Format Salah!</b>\n\n" +
            "Caranya:\n" +
            "1. <code>/broadcast [pesan]</code> (Kirim Teks)\n" +
            "2. Reply pesan dengan <code>/broadcast</code> (Kirim Gambar/File/dll)",
            { parse_mode: "HTML" }
        );
    }

    try {
        const users = await sql("SELECT id FROM users");
        const totalUsers = users.rows.length;

        if (totalUsers === 0) return ctx.reply("❌ Belum ada user di database.");

        const statusMsg = await ctx.reply(`⏳ <b>Memulai Broadcast ke ${totalUsers} user...</b>`, { parse_mode: "HTML" });

        let success = 0;
        let blocked = 0;
        let failed = 0;

        for (const user of users.rows) {
            try {
                if (replyMsg) {
                    await ctx.api.copyMessage(user.id as number, ctx.chat.id, replyMsg.message_id);
                } else {
                    await ctx.api.sendMessage(user.id as number, message as string);
                }
                success++;
            } catch (e: any) {
                if (e.description?.includes("blocked")) {
                    blocked++;
                } else {
                    failed++;
                }
            }
            // Anti-Flood: Delay 30ms (Max 30 msg/sec)
            await new Promise(r => setTimeout(r, 50));
        }

        await ctx.api.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            `✅ <b>Broadcast Selesai!</b>\n\n` +
            `📨 Total Dikirim: <b>${success}</b>\n` +
            `⛔ User Blokir: <b>${blocked}</b>\n` +
            `❌ Gagal Lainnya: <b>${failed}</b>`,
            { parse_mode: "HTML" }
        );

    } catch (error: any) {
        await ctx.reply(`❌ Error System: ${error.message}`);
    }
});

// DELETE EMAIL (Admin Only)
bot.command("delete_email", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    const email = ctx.match?.trim();
    if (!email) {
        return ctx.reply(
            "⚠️ <b>Format Salah!</b>\n\n" +
            "Caranya:\n" +
            "<code>/delete_email user@example.com</code>",
            { parse_mode: "HTML" }
        );
    }

    try {
        // Check if email exists
        const userCheck = await sql("SELECT id, email, username, first_name FROM users WHERE email = ?", [email]);
        if (userCheck.rows.length === 0) {
            return ctx.reply(`❌ Email <code>${email}</code> tidak ditemukan di database.`, { parse_mode: "HTML" });
        }

        const user = userCheck.rows[0];
        const userId = user.id;
        const userName = user.username ? `@${user.username}` : user.first_name || "Unknown";

        // Delete subscriptions
        await sql("DELETE FROM subscriptions WHERE user_id = ?", [userId]);

        // Clear email from user record (keep user for history)
        await sql("UPDATE users SET email = NULL, status = 'active' WHERE id = ?", [userId]);

        await ctx.reply(
            `✅ <b>Email Berhasil Dihapus!</b>\n\n` +
            `👤 User: ${userName} (ID: <code>${userId}</code>)\n` +
            `📧 Email: <code>${email}</code>\n\n` +
            `User ini sekarang bisa aktivasi lagi dengan email baru.`,
            { parse_mode: "HTML" }
        );

    } catch (error: any) {
        await ctx.reply(`❌ Error: ${error.message}`);
    }
});

// ============================================================
// MENU HANDLERS (TEXT INPUT DARI KEYBOARD)
// ============================================================

bot.hears("🎁 Menu Paket", async (ctx) => {
    // Menu Varian Paket
    const keyboard = new InlineKeyboard()
        .text("🌟 1 Bulan (Free)", "buy_1_month").row()
        .text("💎 6 Bulan (6 Poin)", "buy_6_month").row();

    await ctx.reply(
        `<b>🎁 Pilih Paket Canva</b>\n\n` +
        `1. <b>1 Bulan Free</b>\n` +
        `   - Gratis tanpa syarat invite.\n` +
        `   - Hanya bisa 1x klaim (harus tunggu expired).\n\n` +
        `2. <b>6 Bulan Premium</b>\n` +
        `   - Syarat: Undang 6 Teman.\n` +
        `   - Durasi lebih lama.\n\n` +
        `Silakan pilih varian di bawah:`,
        { reply_markup: keyboard, parse_mode: "HTML" }
    );
});

bot.hears("👤 Profil Saya", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Get User & Sub Data
    const userRes = await sql("SELECT * FROM users WHERE id = ?", [userId]);
    const subRes = await sql(
        `SELECT s.*, p.name as plan_name 
         FROM subscriptions s 
         JOIN products p ON s.product_id = p.id 
         WHERE s.user_id = ? AND s.status = 'active'`,
        [userId]
    );

    const user = userRes.rows[0];
    const sub = subRes.rows[0]; // Ambil yang pertama jika ada (Single Active Sub rule)

    const status = sub ? "✅ Premium Active" : "❌ Free / Inactive";
    const plan = sub ? sub.plan_name : "-";
    const expDate = sub ? new Date(sub.end_date as string).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : "-";
    const points = user.referral_points || 0;
    const refLink = `https://t.me/${ctx.me.username}?start=${user.referral_code}`;

    await ctx.reply(
        `👤 <b>Profil Pengguna</b>\n\n` +
        `🆔 ID: <code>${userId}</code>\n` +
        `👤 Nama: <b>${user.first_name}</b>\n\n` +
        `📊 <b>Status Akun:</b>\n` +
        `• Status: ${status}\n` +
        `• Paket: ${plan}\n` +
        `• Expired: ${expDate}\n\n` +
        `🤝 <b>Referral Info:</b>\n` +
        `• Poin: <b>${points}</b>\n` +
        `• Link: <code>${refLink}</code>\n\n` +
        `<i>Bagikan link untuk dapat poin!</i>`,
        { parse_mode: "HTML" }
    );
});

bot.hears("👨‍💻 Admin Panel", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return ctx.reply("⛔ Menu ini khusus Admin.");

    // Menu Admin
    const slotInfo = await checkSlots();

    // Ambil Team ID dari DB
    const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
    const teamId = teamRes.rows.length > 0 ? teamRes.rows[0].value : "Belum diset";

    await ctx.reply(
        `<b>Panel Admin</b>\n\n` +
        `🆔 Team ID: <code>${teamId}</code>\n` +
        `📊 Status Slot: ${slotInfo}\n` +
        `\nGunakan perintah:\n` +
        `/set_team_id - Set ID Tim\n` +
        `/set_cookie - Update Cookie\n` +
        `/help_cookie - Tutorial Cookie`,
        { parse_mode: "HTML" }
    );
});

// ============================================================
// ACTION HANDLERS (CALLBACK BUTTONS)
// ============================================================

// Callback: Buy / Pilih Paket
bot.callbackQuery(/buy_(.+)/, async (ctx) => {
    const item = ctx.match?.[1];
    const userId = ctx.from.id;

    try {
        let productId = 1;
        let costCost = 0;
        let productName = "";

        if (item === "6_month") {
            productId = 3; // 6 Bulan
            costCost = 6;
            productName = "6 Bulan Premium";
        } else if (item === "1_month") {
            productId = 1;
            costCost = 0;
            productName = "1 Bulan Free";
        } else {
            return ctx.answerCallbackQuery("Paket tidak valid.");
        }

        // Simpan Pilihan (Tanpa Potong Poin Dulu - Pay as you go)
        await sql("UPDATE users SET selected_product_id = ? WHERE id = ?", [productId, userId]);

        await ctx.deleteMessage();
        await ctx.reply(
            `✅ <b>Paket Dipilih!</b>\n` +
            `📦 Opsi: <b>${productName}</b>\n` +
            `💎 Biaya: <b>${costCost} Poin</b> (Akan dipotong saat aktivasi)\n\n` +
            `Silakan ketik: <code>/aktivasi emailmu@gmail.com</code>\n` +
            `Bot akan otomatis cek poin Anda saat aktivasi.`,
            { parse_mode: "HTML" }
        );

    } catch (e: any) {
        console.error("Error buy callback:", e);
        try { await ctx.answerCallbackQuery("Gagal menyimpan pilihan."); } catch { }
    }

    try { await ctx.answerCallbackQuery(); } catch { }
});

// Error handling basic
bot.catch((err) => {
    console.error("Error di bot:", err);
});
