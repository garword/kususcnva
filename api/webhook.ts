import { webhookCallback } from "grammy";
import { bot } from "../src/bot";

// Ekspor handler utama untuk Vercel Serverless Function
// Handler ini menghubungkan logika bot di src/bot.ts dengan request HTTP dari Telegram
// Custom Handler to merge Webhook + Keep-Alive
export default async (req: any, res: any) => {
    // 1. Handle Keep-Alive Ping (GET Request)
    if (req.method === 'GET') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CanvaBot Status</title>
            <style>
                body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; margin: 0; }
                .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
                .status { color: #10b981; font-weight: bold; font-size: 1.5rem; margin-bottom: 0.5rem; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="status">● System Operational</div>
                <div class="timestamp">Bot is warm and ready.</div>
            </div>
        </body>
        </html>
        `;
        return res.status(200).send(html);
    }

    // 2. Handle Telegram Webhook (POST Request)
    return webhookCallback(bot, "http")(req, res);
};
