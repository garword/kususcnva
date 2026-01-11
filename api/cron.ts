import { sql } from "../lib/db";
import { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

import { TimeUtils } from "../src/lib/time";

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        console.log(`[${TimeUtils.format()}] 🕒 CRON: Checking for expired subscriptions...`);

        // 1. Check for Expired Subs (Active & Past End Date)
        const result = await sql(`
            SELECT count(*) as count FROM subscriptions 
            WHERE status = 'active' AND end_date < datetime('now')
        `);

        const count = result.rows[0].count as number;

        if (count > 0) {
            console.log(`🚨 Found ${count} expired users. Triggering GitHub Action...`);

            // 2. Trigger GitHub Action
            const githubToken = process.env.GITHUB_TOKEN;
            const repo = process.env.GITHUB_REPO; // e.g. "username/repo"

            if (!githubToken || !repo) {
                console.error("❌ Missing GITHUB_TOKEN or GITHUB_REPO env vars!");
                return res.status(500).json({
                    success: false,
                    error: "Environment Variables GITHUB_TOKEN or GITHUB_REPO not set on Vercel."
                });
            }

            // Trigger 'process_queue' event
            await axios.post(
                `https://api.github.com/repos/${repo}/dispatches`,
                { event_type: 'process_queue' },
                {
                    headers: {
                        'Authorization': `Bearer ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            console.log("✅ GitHub Action Triggered successfully.");
            return res.status(200).json({
                success: true,
                message: `Triggered Kick Process for ${count} users.`,
                count: count
            });

        } else {
            console.log("✅ No expired users found.");

            // 3. PERIODIC CLEANUP CHECK (DISABLED - Controlled by Cloudflare Worker now)
            console.log("ℹ️ Periodic check skipped (Handled by Cloudflare Worker).");
            // if (minutes === 0 || minutes === 30 || minutes === 1 || minutes === 31) { ... }

            return res.status(200).json({ success: true, message: "No expired users", count: 0 });
        }

    } catch (e: any) {
        console.error("❌ Cron Error:", e.message);
        return res.status(500).json({ error: e.message });
    }
}
