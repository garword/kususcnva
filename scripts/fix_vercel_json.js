const fs = require('fs');
const content = {
    "outputDirectory": "public",
    "functions": {
        "api/**/*.ts": {
            "memory": 1024,
            "maxDuration": 60
        }
    },
    "rewrites": [
        {
            "source": "/api/webhook",
            "destination": "/api/webhook"
        }
    ]
};
fs.writeFileSync('vercel.json', JSON.stringify(content, null, 4));
console.log('vercel.json rewritten with clean UTF-8');
