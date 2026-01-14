export default {
    async fetch(request, env, ctx) {
        return new Response("Auto-Delete Worker is Running. Use Cron Trigger.", { status: 200 });
    },

    async scheduled(event, env, ctx) {
        console.log("⏰ Cron Triggered: Checking for expired messages...");

        // Run immediately
        await checkAndDelete(env);

        // Wait 30 seconds and run again (Simulating 2x per minute)
        // Note: This relies on the worker staying alive. If it terminates early, the second run might be skipped.
        // But for lightweight cleanup, it usually works.
        await delay(30000);

        console.log("⏰ Second Run (30s later)...");
        await checkAndDelete(env);
    }
};

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkAndDelete(env) {
    const TURSO_URL = env.TURSO_DATABASE_URL;
    const TURSO_TOKEN = env.TURSO_AUTH_TOKEN;
    const BOT_TOKEN = env.BOT_TOKEN;

    if (!TURSO_URL || !TURSO_TOKEN || !BOT_TOKEN) {
        console.error("❌ Missing Environment Variables (TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, BOT_TOKEN)");
        return;
    }

    // 1. Convert "libsql://" to "https://" for HTTP API usage if needed
    // Turso HTTP endpoint: https://DB_NAME-ORG.turso.io/v2/pipeline (or /v1/statements)
    // We'll use the simple /v2/pipeline for Execute
    let httpUrl = TURSO_URL.replace("libsql://", "https://");
    if (!httpUrl.startsWith("https://")) httpUrl = "https://" + httpUrl;

    // Construct Pipeline URL
    const dbEndpoint = `${httpUrl}/v2/pipeline`;

    try {
        // Query: Select expired messages
        // Logic: delete_at < datetime('now', '+7 hours') -> handled by DB engine naturally?
        // Wait, Turso/SQLite over HTTP handles 'now' on the SERVER side. 
        // If Turso server is UTC, 'now' is UTC.
        // We stick to the logic: delete_at is WIB. So compare db_now + 7h.
        // LIMIT 50: Prevent Worker Timeout if there are too many messages (Batch Processing)
        const sqlQuery = "SELECT * FROM message_queue WHERE delete_at < datetime('now', '+7 hours') LIMIT 50";

        const queryResp = await fetch(dbEndpoint, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${TURSO_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                requests: [
                    { type: "execute", stmt: { sql: sqlQuery } },
                    { type: "close" }
                ]
            })
        });

        const queryData = await queryResp.json();

        // Parse Results (Turso v2 pipeline format)
        // results[0].response.result.rows
        if (!queryData.results || !queryData.results[0]?.response?.result) {
            // console.log("Empty or Error response from DB", JSON.stringify(queryData));
            return;
        }

        const rows = queryData.results[0].response.result.rows; // Array of rows
        const cols = queryData.results[0].response.result.cols; // Array of col names

        if (rows.length > 0) {
            console.log(`🗑️ Found ${rows.length} expired messages.`);

            // Map rows to objects based on columns
            const messages = rows.map(row => {
                const obj = {};
                cols.forEach((col, idx) => {
                    // row[idx] might be { type: "text", value: "..." } or just value depending on API version
                    // Turso v2 usually returns raw values or typed. Let's handle generic.
                    let val = row[idx];
                    if (val && typeof val === 'object' && 'value' in val) val = val.value;
                    obj[col.name] = val;
                });
                return obj;
            });

            for (const msg of messages) {
                // DELETE FROM TELEGRAM
                const delResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: msg.chat_id,
                        message_id: msg.message_id
                    })
                });

                // Check result (or just assume success/already deleted)
                // DELETE FROM DB (Independent of Telegram result to avoid loop)
                const delSql = "DELETE FROM message_queue WHERE id = ?";
                // For parameterized query in pipeline
                await fetch(dbEndpoint, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${TURSO_TOKEN}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        requests: [
                            {
                                type: "execute",
                                stmt: {
                                    sql: delSql,
                                    args: [{ type: "integer", value: msg.id.toString() }] /* Try treating ID as string or integer safe */
                                }
                            },
                            { type: "close" }
                        ]
                    })
                });
                console.log(`   -> Deleted Msg ${msg.message_id} (User ${msg.chat_id})`);
            }
        } else {
            // console.log("   ✅ No expired messages.");
        }

    } catch (e) {
        console.error("Worker Error:", e);
    }
}
