import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      ok: true,
      ttsAvailable: Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY'),
    })
  );
}
