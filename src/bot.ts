import { Bot, Context, InlineKeyboard, Keyboard, InputFile, GrammyError, HttpError } from "grammy";
import { sql } from "../lib/db";
import { inviteUser, checkSlots, getAccountInfo } from "../lib/canva";
import dotenv from "dotenv";
import axios from "axios";
import { exec } from "child_process";

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
    .text("📖 Panduan").text("👨‍💻 Admin Panel").row()
    .text("📊 Cek Slot")
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
    const rawChannels = await getForceSubChannels();
    if (rawChannels.length === 0) return true;

    for (const raw of rawChannels) {
        // Support format: ID|Link or just ID
        // Example: "-1001234567|https://t.me/+AbCdEf" -> ID: -1001234567
        const chat = raw.split('|')[0].trim();

        try {
            // Support @username or ID
            const member = await ctx.api.getChatMember(chat, userId);
            if (member.status === 'left' || member.status === 'kicked') {
                return false;
            }
        } catch (e) {
            console.error(`Gagal cek member ${chat}:`, e);
            // Default: Asumsikan FALSE jika error (mungkin user belum join private channel)
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
        return ctx.reply("⚠️ <b>Format Salah!</b>\nContoh:\n1. <code>@channel1, @channel2</code> (Public)\n2. <code>-10012345|https://t.me/+Link, @channel2</code> (Private + Link)\n\nTips: Pisahkan dengan koma.", { parse_mode: "HTML" });
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

// STARTUP: Set Bot Commands (Menu Button)
bot.api.setMyCommands([
    { command: "start", description: "Mulai Bot / Restart" },
    { command: "aktivasi", description: "Aktivasi Akun via Email" },
    { command: "help", description: "Daftar Perintah Lengkap" },
]).catch(console.error);

// Handler: 📖 Panduan
bot.hears("📖 Panduan", async (ctx) => {
    const isAdm = isAdmin(ctx.from?.id || 0);

    let msg = `📖 <b>PANDUAN LENGKAP BOT</b>\n\n` +
        `<b>👤 Perintah User:</b>\n` +
        `• <b>/start</b> - Mulai ulang bot & cek menu.\n` +
        `• <b>/aktivasi [email]</b> - Aktivasi Canva Pro (setelah pilih paket).\n` +
        `  Contoh: <code>/aktivasi user@gmail.com</code>\n` +
        `• <b>🎁 Menu Paket</b> - Pilih durasi (1 Bulan Free / 6 Bulan Premium).\n` +
        `• <b>👤 Profil Saya</b> - Cek status langganan & poin referral.\n` +
        `• <b>📊 Cek Slot</b> - Cek ketersediaan slot tim.\n\n` +
        `ℹ️ <b>Tips:</b>\n` +
        `1. Join channel wajib agar bot bisa digunakan.\n` +
        `2. Undang teman untuk dapat poin (1 teman = 1 poin).\n` +
        `3. Paket 6 Bulan butuh 6 Poin.\n\n`;

    if (isAdm) {
        msg += `<b>👮 Perintah Admin:</b>\n` +
            `• <b>/admin</b> - Buka panel admin super.\n` +
            `• <b>/data</b> - Export laporan user (.txt).\n` +
            `• <b>/set_cookie [json]</b> - Set cookie Canva baru.\n` +
            `• <b>/test_invite [email]</b> - Tes invite manual.\n` +
            `• <b>/broadcast [pesan]</b> - Kirim pesan ke semua user.\n` +
            `• <b>/delete_user [email/id]</b> - Hapus user permanent.\n` +
            `• <b>/reset_email [email]</b> - Soft delete (Hapus langganan saja).\n` +
            `• <b>/forceexpire [email]</b> - Buat user expired (H-1).\n` +
            `• <b>/set_channels</b> - Atur channel force subscribe.\n` +
            `• <b>/channels</b> - Cek list channel aktif.\n`;
    }

    await ctx.reply(msg, { parse_mode: "HTML" });
});

// Admin Command: Set Cookie
bot.command("set_cookie", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    // 1. Cek jika ada file dokumen (JSON)
    if (ctx.message?.document) {
        const file = await ctx.getFile();
        const path = file.file_path;
        if (!path) return ctx.reply("❌ Gagal mengambil file.");

        // Download file content via URL
        const fileUrl = `https://api.telegram.org/file/bot${token}/${path}`;
        try {
            const { data } = await axios.get(fileUrl);
            const cookieStr = typeof data === 'string' ? data : JSON.stringify(data);

            // Validasi JSON minimal
            JSON.parse(cookieStr); // Check valid JSON

            // Simpan ke DB
            await sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('canva_cookie', ?)", [cookieStr]);
            await ctx.reply("✅ <b>Cookie Berhasil Disimpan!</b>\nBot dan GitHub Actions sekarang akan menggunakan cookie ini.", { parse_mode: "HTML" });
        } catch (e) {
            await ctx.reply("❌ Gagal parsing atau download cookie. Pastikan format JSON valid.");
        }
        return;
    }

    // 2. Cek jika input text langsung
    const text = ctx.match as string;
    if (text) {
        try {
            JSON.parse(text); // Validate
            await sql("INSERT OR REPLACE INTO settings (key, value) VALUES ('canva_cookie', ?)", [text]);
            await ctx.reply("✅ <b>Cookie Berhasil Disimpan!</b>", { parse_mode: "HTML" });
        } catch (e) {
            await ctx.reply("❌ Format JSON tidak valid. Gunakan file jika terlalu panjang.");
        }
        return;
    }

    await ctx.reply("ℹ️ <b>Cara Set Cookie:</b>\n1. Kirim file <code>cookies.json</code> dengan caption <code>/set_cookie</code>\n2. Atau ketik <code>/set_cookie [JSON_STRING]</code>", { parse_mode: "HTML" });
});

// Alias /help to Panduan
bot.command("help", async (ctx) => {
    // Re-use logic from Panduan
    const isAdm = isAdmin(ctx.from?.id || 0);
    let msg = `📖 <b>DAFTAR PERINTAH</b>\n\n` +
        `<b>/start</b> - Restart Bot\n` +
        `<b>/aktivasi</b> - Submit Email\n`;

    // Simple redirect to Panduan text logic (simplified here)
    // Better to just trigger same reply
    await ctx.reply("Silakan klik tombol <b>📖 Panduan</b> di menu bawah untuk info lengkap.", { parse_mode: "HTML" });
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
    // 2. Simpan/Update User ke Database (Upsert)
    // Force selected_product_id = NULL for new users to enforce selection
    await sql(
        `INSERT INTO users (id, username, first_name, selected_product_id, joined_at) VALUES (?, ?, ?, NULL, datetime('now'))
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
    const payload = ctx.match;

    // Debug Log untuk User
    if (payload && !isNewUser) {
        console.log(`[REFERRAL] Skip: User ${userId} (${firstName}) sudah ada di database.`);
    }

    if (isNewUser && payload && payload !== user.referral_code) {
        console.log(`[REFERRAL] Valid: User baru ${userId} dengan kode ${payload}`);
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

    // 5. Cek Force Subscribe
    const isJoined = await checkMember(userId, ctx);
    if (!isJoined) {
        const rawChannels = await getForceSubChannels();
        const keyboard = new InlineKeyboard();

        rawChannels.forEach((raw, i) => {
            const parts = raw.split('|');
            const chId = parts[0].trim();
            const chLink = parts[1] ? parts[1].trim() : "";

            let url = chLink;
            if (!url) {
                url = chId.startsWith("@") ? `https://t.me/${chId.replace("@", "")}` : `https://t.me/c/${chId.replace("-100", "")}/1`;
            }

            keyboard.url(`📢 Channel ${i + 1}`, url).row();
        });

        keyboard.text("✅ Sudah Bergabung", "check_join");

        return ctx.reply(
            `⛔ <b>Akses Terkunci!</b>\n\n` +
            `Halo ${firstName}, untuk menggunakan bot ini Anda <b>WAJIB JOIN</b> ke channel berikut:\n\n` +
            `⚠️ <b>PERINGATAN KERAS:</b>\n` +
            `Jika Anda keluar (leave) dari channel/grup ini, akun Canva Anda akan <b>OTOMATIS DI-KICK</b> oleh sistem kami!`,
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

// Helper: Check Team Limit & Next Slot
async function checkTeamLimit(): Promise<{ isFull: boolean, nextSlot: string | null }> {
    try {
        // 1. Get Current Count
        const countRes = await sql("SELECT value FROM settings WHERE key = 'team_member_count'");
        const count = countRes.rows.length > 0 ? parseInt(countRes.rows[0].value as string) : 0;

        if (count < 500) {
            return { isFull: false, nextSlot: null };
        }

        // 2. Get Next Available Slot (Earliest Expiring Subscription)
        // We look for the soonest end_date of an ACTIVE subscription
        const slotRes = await sql(`
            SELECT MIN(end_date) as next_slot 
            FROM subscriptions 
            WHERE status = 'active' AND end_date > datetime('now')
        `);

        let nextSlotStr = "Tidak diketahui";
        if (slotRes.rows.length > 0 && slotRes.rows[0].next_slot) {
            const date = new Date(slotRes.rows[0].next_slot as string);
            nextSlotStr = date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        }

        return { isFull: true, nextSlot: nextSlotStr };

    } catch (e) {
        console.error("Error checking team limit:", e);
        return { isFull: false, nextSlot: null }; // Fail safe open or closed? Open for now to avoid locking users on error.
    }
}

// User Command: Aktivasi (User Submit Email)
bot.command("aktivasi", async (ctx) => {
    const userId = ctx.from?.id;
    if (!userId) return;

    // Force Subscribe Check
    if (!(await checkMember(userId, ctx))) {
        return ctx.reply("⛔ <b>Akses Ditolak!</b>\n\nAnda belum join channel wajib.\nSilakan ketik /start untuk melihat list channel.\n\n⚠️ <i>Ingat: Keluar dari channel = Auto-Kick Canva!</i>", { parse_mode: "HTML" });
    }

    const email = ctx.match;
    if (!email || !email.includes("@")) {
        return ctx.reply("⚠️ <b>Format Salah!</b>\nContoh: <code>/aktivasi emailmu@gmail.com</code>", { parse_mode: "HTML" });
    }

    // NEW: Check Team Limit First
    const limitInfo = await checkTeamLimit();
    if (limitInfo.isFull) {
        return ctx.reply(
            `⛔ <b>Tim Canva Penuh!</b>\n\n` +
            `Maaf, saat ini slot tim sudah mencapai batas (500/500).\n` +
            `Sistem tidak dapat menerima anggota baru.\n\n` +
            `⏳ <b>Slot Berikutnya Tersedia:</b>\n` +
            `📅 <b>${limitInfo.nextSlot}</b>\n\n` +
            `<i>Silakan coba lagi pada waktu tersebut.</i>`,
            { parse_mode: "HTML" }
        );
    }

    try {
        // 0. Ambil Data User (Produk & Poin)
        const userRes = await sql("SELECT selected_product_id, referral_points FROM users WHERE id = ?", [userId]);
        const user = userRes.rows[0];
        const selectedProd = user.selected_product_id; // REMOVED fallback || 1

        // NEW: Enforce Product Selection
        if (!selectedProd) {
            return ctx.reply(
                `⛔ <b>Anda Belum Memilih Paket!</b>\n\n` +
                `Sebelum aktivasi, wajib memilih durasi di menu <b>🎁 Menu Paket</b> terlebih dahulu.\n` +
                `Silakan kembali ke menu utama dan pilih paket yang diinginkan.`,
                { parse_mode: "HTML" }
            );
        }

        const currentPoints = (user.referral_points as number) || 0;

        // 1. Ambil Subscription Aktif (Jika Ada)
        const subRes = await sql(
            `SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' AND end_date > datetime('now')`,
            [userId]
        );
        const activeSub = subRes.rows.length > 0 ? subRes.rows[0] : null;

        // ============================================================
        // CASE A: PAKET PREMIUM (6 BULAN) - ID 3
        // ============================================================
        if (selectedProd === 3) {
            // A.1 Cek Poin (Admin Bypass)
            if (currentPoints < 6 && !isAdmin(userId)) {
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

            // A.2 Logic Stacking / Extension (Jika sudah aktif)
            if (activeSub) {
                // Cek Max Horizon (400 Hari)
                const currentEndDate = new Date(activeSub.end_date as string);
                const maxDate = new Date();
                maxDate.setDate(maxDate.getDate() + 400);

                if (currentEndDate > maxDate) {
                    return ctx.reply(
                        `⛔ <b>Batas Maksimal Tercapai!</b>\n\n` +
                        `Anda sudah memiliki durasi aktif lebih dari 1 tahun.\n` +
                        `System membatasi penumpukan (stacking) maksimal 400 hari.\n` +
                        `Silakan tunggu sampai durasi berkurang.`,
                        { parse_mode: "HTML" }
                    );
                }

                // EKSEKUSI PERPANJANGAN (INSTANT)
                // 1. Potong Poin (Skip for Admin)
                if (!isAdmin(userId)) {
                    await sql("UPDATE users SET referral_points = referral_points - 6 WHERE id = ?", [userId]);
                }

                // 2. Extend DB (+180 Days)
                await sql(
                    `UPDATE subscriptions 
                     SET end_date = datetime(end_date, '+180 days') 
                     WHERE id = ?`,
                    [activeSub.id]
                );

                // 3. Get New Date
                const newSubRes = await sql("SELECT end_date FROM subscriptions WHERE id = ?", [activeSub.id]);
                const newEndDate = new Date(newSubRes.rows[0].end_date as string).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long' });

                return ctx.reply(
                    `✅ <b>Perpanjangan Berhasil! (Instant)</b>\n\n` +
                    `Paket: <b>6 Bulan Premium</b>\n` +
                    `Status: <b>Diperpanjang (+180 Hari)</b>\n` +
                    `Exp Baru: <b>${newEndDate}</b>\n\n` +
                    `<i>Poin Anda telah dipotong 6 poin. Tidak perlu invite ulang.</i>`,
                    { parse_mode: "HTML" }
                );
            }

            // A.3 User Baru / Tidak Aktif -> Lanjut ke Queue (Potong Poin Dulu)
            if (!isAdmin(userId)) {
                await sql("UPDATE users SET referral_points = referral_points - 6 WHERE id = ?", [userId]);
            }
        }

        // ============================================================
        // CASE B: PAKET FREE (1 BULAN) - ID 1
        // ============================================================
        else {
            // B.1 Strict Check: Tidak boleh ambil jika masih aktif
            if (activeSub) {
                const expDate = new Date(activeSub.end_date as string).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium' });
                return ctx.reply(
                    `⛔ <b>Akses Ditolak!</b>\n\n` +
                    `Anda masih memiliki paket aktif sampai <b>${expDate}</b>.\n\n` +
                    `Aturan Paket Free: Hanya bisa diklaim jika masa aktif sebelumnya sudah habis (Expired).\n` +
                    `<i>Silakan tunggu expired atau upgrade ke Premium (bisa ditumpuk).</i>`,
                    { parse_mode: "HTML" }
                );
            }
        }

        // ============================================================
        // FINAL: MASUK QUEUE (Hanya untuk New Invite)
        // ============================================================

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

// DELETE USER (Hard Delete) - Admin Only
bot.command("delete_user", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    const input = ctx.match?.trim();
    if (!input) {
        return ctx.reply(
            "⚠️ <b>Format Salah!</b>\n\n" +
            "Gunakan:\n" +
            "1. <code>/delete_user email@gmail.com</code>\n" +
            "2. <code>/delete_user 123456789</code> (ID Telegram)",
            { parse_mode: "HTML" }
        );
    }

    try {
        let user;
        // Cek input apakah Email atau ID
        if (input.includes("@")) {
            const res = await sql("SELECT * FROM users WHERE email = ?", [input]);
            user = res.rows[0];
        } else if (/^\d+$/.test(input)) {
            const res = await sql("SELECT * FROM users WHERE id = ?", [input]);
            user = res.rows[0];
        } else {
            return ctx.reply("❌ Input tidak valid (harus Email atau ID angka).");
        }

        if (!user) {
            return ctx.reply(`❌ User <code>${input}</code> tidak ditemukan.`, { parse_mode: "HTML" });
        }

        const userId = user.id;

        // EXECUTE DELETE
        // 1. Delete Subscriptions
        await sql("DELETE FROM subscriptions WHERE user_id = ?", [userId]);

        // 2. Delete User
        await sql("DELETE FROM users WHERE id = ?", [userId]);

        await ctx.reply(
            `✅ <b>User Berhasil Dihapus!</b>\n\n` +
            `👤 Nama: ${user.first_name}\n` +
            `📧 Email: ${user.email || "-"}\n` +
            `🆔 ID: <code>${userId}</code>\n\n` +
            `Data user telah dihapus permanen dari database.`,
            { parse_mode: "HTML" }
        );

    } catch (error: any) {
        await ctx.reply(`❌ Error: ${error.message}`);
    }
});

// Alias: /delete_email (Legacy Support)
bot.command("delete_email", async (ctx) => {
    // Redirect to /delete_user logic manually or just instruct
    // Re-using logic is complex due to context matching, better to just warn or copy-paste core logic.
    // Simplest: Just tell them to use new command
    await ctx.reply("⚠️ Command ini sudah diganti.\nSilakan gunakan: <code>/delete_user [email/id]</code>", { parse_mode: "HTML" });
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

    // ADMIN PANEL SUPER MENU
    const adminKeyboard = new InlineKeyboard()
        .text("📂 Export Data", "adm_export_data").text("⚙️ Cek Team ID", "adm_team_id").row()
        .text("🍪 Status Cookie", "adm_cookie").text("📢 Broadcast", "adm_help_bc").row()
        .text("🗑️ Menu Hapus", "adm_menu_del").text("💀 Force Expire", "adm_help_exp").row()
        .text("📋 List Channel", "adm_list_ch").text("➕ Set Channel", "adm_set_ch").row()
        .text("🚀 Test Auto-Invite", "test_invite").text("🦶 Test Auto-Kick", "test_kick");

    await ctx.reply(
        `<b>Panel Admin Super</b>\n\n` +
        `🆔 Team ID: <code>${teamId}</code>\n` +
        `📊 Status Slot: ${slotInfo}\n\n` +
        `Silakan pilih menu di bawah untuk aksi cepat atau panduan command.`,
        {
            parse_mode: "HTML",
            reply_markup: adminKeyboard
        }
    );
});

// Command: Soft Reset (Reset Email)
bot.command("reset_email", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    const input = ctx.match as string;
    if (!input) return ctx.reply("⚠️ Format: <code>/reset_email [email]</code>", { parse_mode: "HTML" });

    try {
        // 1. Cari User ID
        const userRes = await sql("SELECT id, first_name FROM users WHERE email = ?", [input]);
        if (userRes.rows.length === 0) return ctx.reply("❌ Email tidak ditemukan di database.");

        const userId = userRes.rows[0].id;
        const userName = userRes.rows[0].first_name;

        // 2. Soft Delete Logic
        // - Hapus Subscription
        await sql("DELETE FROM subscriptions WHERE user_id = ?", [userId]);
        // - Reset Email di table User (jadi NULL) -> agar bisa daftar lagi fresh
        await sql("UPDATE users SET email = NULL WHERE id = ?", [userId]);

        await ctx.reply(
            `♻️ <b>Soft Reset Berhasil!</b>\n\n` +
            `👤 Nama: ${userName}\n` +
            `📧 Email: ${input} (Direset)\n\n` +
            `✅ Langganan dihapus.\n` +
            `✅ Data Poin & History tetap AMAN.\n` +
            `User bisa mendaftar ulang dengan email baru/sama.`,
            { parse_mode: "HTML" }
        );

    } catch (e: any) {
        console.error(e);
        await ctx.reply(`❌ Gagal reset: ${e.message}`);
    }
});

// CALLBACK HANDLERS FOR ADMIN MENU

bot.callbackQuery("adm_export_data", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply("📂 <b>Proses Export Data...</b>\nSilakan ketik <code>/data</code> untuk mendapatkan file.", { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
});

// Delete Submenu Handler
bot.callbackQuery("adm_menu_del", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;

    const delKeyboard = new InlineKeyboard()
        .text("♻️ Soft Reset (Jaga Poin)", "adm_help_reset_email").row()
        .text("🔥 Hard Delete (Lenyap)", "adm_help_del").row()
        .text("🔙 Kembali", "adm_back_main");

    await ctx.editMessageText(
        `🗑️ <b>Menu Penghapusan User</b>\n\n` +
        `Pilih jenis penghapusan:\n` +
        `1. <b>Soft Reset</b>: Hanya hapus langganan & lepas email. Poin user aman.\n` +
        `2. <b>Hard Delete</b>: Hapus SEMUA data user permanen.\n\n` +
        `Silakan pilih panduan di bawah:`,
        { parse_mode: "HTML", reply_markup: delKeyboard }
    );
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_back_main", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.deleteMessage();
    await ctx.reply("🔄 Silakan ketik <code>/admin</code> untuk kembali ke menu utama.", { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_help_reset_email", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply(
        `♻️ <b>Soft Reset Email:</b>\n\n` +
        `Gunakan ini jika user ingin ganti email atau re-subscribe tanpa hilang poin.\n` +
        `Command: <code>/reset_email user@gmail.com</code>`,
        { parse_mode: "HTML" }
    );
    await ctx.answerCallbackQuery();
});

// 1. Cek Settings
bot.callbackQuery("adm_team_id", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const teamRes = await sql("SELECT value FROM settings WHERE key = 'canva_team_id'");
    const val = teamRes.rows.length > 0 ? teamRes.rows[0].value : "Belum diset";
    await ctx.reply(`🆔 <b>Team ID Saat Ini:</b>\n<code>${val}</code>\n\nCara ubah: <code>/set_team_id [ID_BARU]</code>`, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_cookie", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const cookieRes = await sql("SELECT value FROM settings WHERE key = 'canva_cookie'");
    const val = cookieRes.rows.length > 0 ? "✅ Tersimpan" : "❌ Kosong";
    await ctx.reply(`🍪 <b>Status Cookie:</b> ${val}\n\nCara ubah: Kirim file JSON cookie dengan caption <code>/set_cookie</code> atau ketik <code>/set_cookie [VALUE]</code>`, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
});

// Helper: Get Next Slot String
async function getNextSlotInfo(): Promise<string> {
    try {
        const slotRes = await sql(`
            SELECT MIN(end_date) as next_slot 
            FROM subscriptions 
            WHERE status = 'active' AND end_date > datetime('now')
        `);

        if (slotRes.rows.length > 0 && slotRes.rows[0].next_slot) {
            const date = new Date(slotRes.rows[0].next_slot as string);
            return date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
        }
        return "Tidak diketahui";
    } catch (e) {
        return "Error DB";
    }
}

bot.hears("📊 Cek Slot", async (ctx) => {
    // 1. Ambil Data Slot dari Settings
    const countRes = await sql("SELECT value FROM settings WHERE key = 'team_member_count'");
    const currentCount = countRes.rows.length > 0 ? parseInt(countRes.rows[0].value as string) : 0;
    const maxSlot = 500;
    const available = maxSlot - currentCount;
    const isFull = currentCount >= maxSlot;

    // 2. Format Pesan
    let msg = `📊 <b>Status Slot Tim Canva</b>\n\n`;
    msg += `👥 <b>Terisi:</b> ${currentCount} / ${maxSlot}\n`;
    msg += `🔓 <b>Tersedia:</b> ${available > 0 ? available : 0}\n\n`;

    if (isFull) {
        const nextSlot = await getNextSlotInfo();
        msg += `⛔ <b>STATUS: PENUH</b>\n`;
        msg += `⏳ <b>Slot Berikutnya:</b> ${nextSlot}\n\n`;
        msg += `<i>Silakan cek lagi nanti.</i>`;
    } else {
        msg += `✅ <b>STATUS: TERSEDIA</b>\n`;
        msg += `<i>Segera lakukan aktivasi sebelum penuh!</i>`;
    }

    await ctx.reply(msg, { parse_mode: "HTML" });
});

// 2. Help Guides
bot.callbackQuery("adm_help_bc", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply("📢 <b>Format Broadcast:</b>\n\nKetik: <code>/broadcast [Pesan Anda]</code>\nAtau reply gambar dengan command tersebut.", { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_help_del", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply(
        "🗑️ <b>Hapus User (Hard Delete):</b>\n\n" +
        "Menu ini akan menghapus user secara permanen dari database (termasuk history & poin).\n\n" +
        "Cara Pakai:\n" +
        "1. Via Email: <code>/delete_user email@gmail.com</code>\n" +
        "2. Via ID: <code>/delete_user 123456789</code>",
        { parse_mode: "HTML" }
    );
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_help_exp", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply("💀 <b>Force Expire User (Testing):</b>\n\nKetik: <code>/forceexpire user@gmail.com</code>\n(User akan dibuat expired H-1 agar kena auto-kick)", { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_list_ch", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const channels = await getForceSubChannels();
    await ctx.reply(`📋 <b>Channel Wajib Join:</b>\n${channels.join('\n')}\n\nUbah: <code>/set_channels ...</code>`, { parse_mode: "HTML" });
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("adm_set_ch", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply(
        `➕ <b>Edit Channel Wajib Join:</b>\n\n` +
        `Ketik: <code>/set_channels [DATA]</code>\n\n` +
        `📝 <b>Contoh Format:</b>\n` +
        `1. Public Channel:\n` +
        `   <code>@username1, @username2</code>\n` +
        `2. Private Channel (Pakai | Link):\n` +
        `   <code>-1001234567|https://t.me/+InvLnk, @public</code>\n\n` +
        `Pastikan bot sudah jadi ADMIN di channel tersebut!`,
        { parse_mode: "HTML" }
    );
    await ctx.answerCallbackQuery();
});

// Callback: Test Actions
bot.callbackQuery("test_invite", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply("🤖 Menjalankan <b>Auto-Invite</b> Queue... (Wait)", { parse_mode: "HTML" });

    // Serverless Mode: Cannot run exec. Insert fake "trigger" to queue logic if needed, or just tell user to wait for cron.
    await ctx.reply(
        "ℹ️ <b>Mode Serverless (Vercel):</b>\n" +
        "Auto-Invite berjalan otomatis setiap jam via GitHub Actions.\n\n" +
        "Tombol tes ini hanya berfungsi di Local Mode.",
        { parse_mode: "HTML" }
    );
    await ctx.answerCallbackQuery();
});

bot.callbackQuery("test_kick", async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await ctx.reply("🤖 Menjalankan <b>Auto-Kick</b> Job... (Wait)", { parse_mode: "HTML" });

    if (process.env.VERCEL) {
        await ctx.reply(
            "ℹ️ <b>Mode Serverless (Vercel):</b>\n" +
            "Auto-Kick berjalan otomatis setiap jam via GitHub Actions.\n\n" +
            "Tombol tes ini hanya berfungsi di Local Mode.",
            { parse_mode: "HTML" }
        );
    } else {
        await ctx.reply("🚀 <b>Local Mode Detected:</b> Executing `npm run auto-kick`...", { parse_mode: "HTML" });
        exec("npm run auto-kick", (error, stdout, stderr) => {
            if (error) {
                ctx.reply(`❌ <b>Error:</b>\n<pre>${error.message.substring(0, 200)}</pre>`, { parse_mode: "HTML" });
                return;
            }
            // Send truncated output
            const out = stdout.length > 500 ? stdout.substring(stdout.length - 500) : stdout;
            ctx.reply(`✅ <b>Done:</b>\n<pre>${out}</pre>`, { parse_mode: "HTML" });
        });
    }
    await ctx.answerCallbackQuery();
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

// ============================================================
// ADMIN DEBUGGING TOOLS (AUTO-KICK)
// ============================================================


// 1. Force Expire User (Simulasi Expired)
bot.command("forceexpire", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    const email = ctx.match as string;
    if (!email) return ctx.reply("❌ Format: /forceexpire <email>");

    try {
        // Cari ID user dulu berdasarkan email
        const userRes = await sql("SELECT id FROM users WHERE email = ?", [email]);
        if (userRes.rows.length === 0) return ctx.reply("❌ User tidak ditemukan di DB.");

        const userId = userRes.rows[0].id;

        // Update Subscription jadi Expired (H-1)
        await sql("UPDATE subscriptions SET end_date = datetime('now', '-1 day'), status = 'active' WHERE user_id = ?", [userId]);

        await ctx.reply(`✅ User <b>${email}</b> sekarang EXPIRED (H-1).\nSiap untuk dikick.`, { parse_mode: "HTML" });
    } catch (e: any) {
        await ctx.reply(`❌ Error DB: ${e.message}`);
    }
});

// 2. Run Auto-Kick Script (Trigger via Shell)
bot.command("testkick", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    await ctx.reply("🤖 Menjalankan Auto-Kick Script... (Mohon tunggu)");

    // Serverless Mode: Cannot run exec
    await ctx.reply(
        "ℹ️ <b>Mode Serverless (Vercel):</b>\n" +
        "Auto-Kick berjalan otomatis setiap jam via GitHub Actions.\n\n" +
        "Perintah tes ini hanya berfungsi di Local Mode.",
        { parse_mode: "HTML" }
    );
});

// Admin Command: Export Data (Laporan Lengkap)
bot.command("data", async (ctx) => {
    if (!isAdmin(ctx.from?.id || 0)) return;

    try {
        await ctx.reply("⏳ <b>Mengambil Data Laporan...</b>\nMohon tunggu sebentar.", { parse_mode: "HTML" });

        // 1. Query Data Lengkap (Join Users + Subscriptions + Products)
        const res = await sql(`
            SELECT 
                u.id, 
                u.username, 
                u.first_name, 
                u.email, 
                u.status as user_status, 
                u.referral_points,
                u.joined_at,
                s.status as sub_status,
                s.start_date,
                s.end_date,
                p.name as plan_name
            FROM users u
            LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
            LEFT JOIN products p ON s.product_id = p.id
            ORDER BY u.joined_at DESC
        `);

        if (res.rows.length === 0) {
            return ctx.reply("❌ Tidak ada data user di database.");
        }

        // 2. Format Header & Content
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const dateStr = `${day}-${month}-${year}`;
        const fileName = `data-${dateStr}.txt`;

        let content = `LAPORAN DATA BOT CANVA\n`;
        content += `Tanggal Generate: ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n`;
        content += `Total User: ${res.rows.length}\n`;
        content += `======================================================================================================================================================\n`;
        content += `ID         | USERNAME           | NAMA                 | EMAIL                            | PAKET           | EXPIRED      | POIN  | JOIN DATE   \n`;
        content += `======================================================================================================================================================\n`;

        for (const row of res.rows) { // MATCHED
            const id = String(row.id).padEnd(10);
            const username = String(row.username ? `@${row.username}` : "-").padEnd(18);
            const name = String(row.first_name || "No Name").substring(0, 20).padEnd(20);
            const email = String(row.email || "-").padEnd(32);
            // Consolidated status logic: Show Plan Name, or sub_status if plan unknown
            const plan = String(row.plan_name || (row.sub_status === 'active' ? 'Active' : '-')).padEnd(15);

            const expDateRaw = row.end_date ? new Date(row.end_date as string) : null;
            const expDate = expDateRaw ? String(expDateRaw.toISOString().split('T')[0]).padEnd(12) : "-           ";

            const points = String(row.referral_points || 0).padEnd(5);
            const joinDate = row.joined_at ? String(new Date(row.joined_at as string).toISOString().split('T')[0]) : "-";

            content += `${id} | ${username} | ${name} | ${email} | ${plan} | ${expDate} | ${points} | ${joinDate}\n`;
        }

        content += `====================================================================================================\n`;
        content += `End of Report.\n`;

        // 3. Send as Document (Virtual File)
        const buffer = Buffer.from(content, 'utf-8');

        // Grammy InputFile from Buffer
        const inputFile = new InputFile(buffer, fileName);

        await ctx.replyWithDocument(inputFile, {
            caption: `📊 <b>Laporan Data User</b>\n📅 Tanggal: ${dateStr}\n👤 Total: ${res.rows.length} User`,
            parse_mode: "HTML"
        });

    } catch (e: any) {
        console.error("Export Error:", e);
        await ctx.reply(`❌ Gagal export data: ${e.message}`);
    }
});

// Error handling basic
// ============================================================
// ERROR HANDLING
// ============================================================
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;

    if (e instanceof GrammyError) {
        console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
        console.error("Could not contact Telegram:", e);
    } else {
        console.error("Unknown error:", e);
    }
});
