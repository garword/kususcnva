import { webhookCallback } from "grammy";
import { bot } from "./bot";

export default {
    async fetch(request: Request, env: any, ctx: any) {
        // 1. Inject Token dari Environment Cloudflare ke instance Bot
        if (env.BOT_TOKEN) {
            // @ts-ignore - Token property write/hack
            bot.token = env.BOT_TOKEN;
            // @ts-ignore
            bot.api.token = env.BOT_TOKEN;
        }

        // 2. Handle Webhook
        // Gunakan adapter 'cloudflare-mod'
        return webhookCallback(bot, "cloudflare-mod")(request);
    }
};
