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

  const candidate = (
    process.env.VITE_PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_URL ||
    ''
  ).trim();
  const isSafePublic =
    candidate.startsWith('https://') &&
    !candidate.includes('ais-dev-') &&
    !candidate.includes('localhost') &&
    !candidate.includes('127.0.0.1');

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      ok: true,
      publicAppUrl: isSafePublic ? candidate : '',
    })
  );
}
