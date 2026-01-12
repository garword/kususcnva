import { VercelRequest, VercelResponse } from '@vercel/node';
import { Bot, InputFile } from "grammy";
import { BackupService } from '../src/lib/backup';
import { TimeUtils } from '../src/lib/time';

const bot = new Bot(process.env.BOT_TOKEN || "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Auth Check
    const secret = req.query.secret;
    const envSecret = process.env.CRON_SECRET;

    if (secret !== envSecret) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    try {
        console.log("🕰️ Starting Scheduled Backup...");

        // 2. Generate JSON
        const jsonContent = await BackupService.generate();
        const buffer = Buffer.from(jsonContent, 'utf-8');

        // 3. Prepare File
        const dateStr = TimeUtils.now().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const fileName = `backup-db-${dateStr}.json`;
        const inputFile = new InputFile(buffer, fileName);

        // 4. Send to Channel/Admin
        // Priority: BACKUP_CHANNEL_ID -> LOG_CHANNEL_ID -> ADMIN_ID
        const targetId = process.env.BACKUP_CHANNEL_ID || process.env.LOG_CHANNEL_ID || process.env.ADMIN_ID;

        if (!targetId) {
            return res.status(500).json({ error: "No BACKUP_CHANNEL_ID or ADMIN_ID configured." });
        }

        await bot.api.sendDocument(targetId, inputFile, {
            caption: `💾 <b>Auto Backup Database</b>\n📅 ${TimeUtils.format()}\n🤖 Trigger via Cloudflare Worker`,
            parse_mode: "HTML"
        });

        console.log("✅ Backup Sent!");
        return res.status(200).json({ status: "Backup Sent", to: targetId });

    } catch (e: any) {
        console.error("Backup Cron Error:", e);
        return res.status(500).json({ error: e.message });
    }
}
