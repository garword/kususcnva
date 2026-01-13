import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Set Headers to mimic a real page response
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // 2. Return HTML instead of JSON
    // This makes the request look like a normal page load in analytics
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>CanvaBot Status</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; margin: 0; }
            .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
            .status { color: #10b981; font-weight: bold; font-size: 1.5rem; margin-bottom: 0.5rem; }
            .timestamp { color: #6b7280; font-size: 0.875rem; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="status">● System Operational</div>
            <div class="timestamp">Server is warm and ready.</div>
            <!-- Bot Keep-Alive Beacon -->
        </div>
    </body>
    </html>
    `;

    res.status(200).send(html);
}
