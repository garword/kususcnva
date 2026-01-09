import { sql } from '../lib/db';

async function trigger() {
    console.log("Setting user to EXPIRED state for kick test...");
    const email = "expired_user_" + Date.now() + "@mailinator.com";

    // 1. Create User
    await sql(`
        INSERT INTO users (id, username, email, status)
        VALUES (999999, 'ExpiredUser', ?, 'active')
    `, [email]);

    // 2. Create Expired Subscription (H-1)
    await sql(`
         INSERT INTO subscriptions (id, user_id, product_id, start_date, end_date, status)
         VALUES ('exp_sub_1', 999999, 1, datetime('now', '-35 days'), datetime('now', '-1 day'), 'active')
    `);

    console.log(`✅ User ${email} created with EXPIRED subscription.`);
    console.log("👉 Now run: npm run auto-kick");
}

trigger();
