import { webhookCallback } from "grammy";
import { bot } from "../src/bot";

// Ekspor handler utama untuk Vercel Serverless Function
// Handler ini menghubungkan logika bot di src/bot.ts dengan request HTTP dari Telegram
export default webhookCallback(bot, "http");
