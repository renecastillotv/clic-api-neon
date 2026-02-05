// server.ts - Standalone Node.js HTTP server for Coolify/Docker deployment
// Wraps the Vercel Edge Function handler into a standard HTTP server

import { createServer } from 'node:http';
import 'dotenv/config';
import handler from './api/index.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

const server = createServer(async (req, res) => {
  try {
    // Build full URL from Node.js request
    const url = new URL(req.url || '/', `http://${req.headers.host || `localhost:${PORT}`}`);

    // Convert Node.js headers to Web API Headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    // Read body for non-GET/HEAD methods
    let body: string | undefined;
    if (req.method && !['GET', 'HEAD'].includes(req.method)) {
      body = await new Promise<string>((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: Buffer) => (data += chunk.toString()));
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });
    }

    // Create Web API Request
    const request = new Request(url.toString(), {
      method: req.method || 'GET',
      headers,
      body: body || undefined,
    });

    // Call the Vercel Edge Function handler
    const response = await handler(request);

    // Write Web API Response back to Node.js response
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value: string, key: string) => {
      responseHeaders[key] = value;
    });
    res.writeHead(response.status, responseHeaders);
    const responseBody = await response.text();
    res.end(responseBody);
  } catch (error) {
    console.error('[Server] Unhandled error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`clic-api-neon running on http://${HOST}:${PORT}`);
});
