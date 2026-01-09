import { sql } from '../lib/db';

async function trigger() {
    console.log("Adding test user to queue...");
    const email = "test_invite_" + Date.now() + "@mailinator.com";

    // Insert or Update a dummy user
    const id = Date.now();
    await sql(`
        INSERT OR REPLACE INTO users (id, telegram_id, username, email, status)
        VALUES (?, 1860269566, 'TestUser', ?, 'pending_invite')
    `, [id, email]);

    console.log(`✅ Added ${email} to pending_invite queue.`);
}

trigger();
