import axios from 'axios';

const WEBHOOK_URL = "https://kususcnva34.vercel.app/api/webhook";

async function testWebhook() {
    console.log(`🚀 Sending dummy update to: ${WEBHOOK_URL}`);

    try {
        const response = await axios.post(WEBHOOK_URL, {
            update_id: 999999999,
            message: {
                message_id: 1,
                from: { id: 123456, is_bot: false, first_name: "TestUser", username: "testuser" },
                chat: { id: 123456, first_name: "TestUser", username: "testuser", type: "private" },
                date: Math.floor(Date.now() / 1000),
                text: "/start"
            }
        });

        console.log(`✅ Status: ${response.status} ${response.statusText}`);
        console.log("👉 Data:", response.data);
    } catch (error: any) {
        console.error("❌ Request Failed!");
        if (error.response) {
            console.error(`Status: ${error.response.status} ${error.response.statusText}`);
            console.error("Data:", error.response.data);
        } else {
            console.error(error.message);
        }
    }
}

testWebhook();
