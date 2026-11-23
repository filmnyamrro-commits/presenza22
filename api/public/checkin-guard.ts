import type { IncomingMessage, ServerResponse } from 'node:http';

const checkinRateWindowMs = 5 * 60 * 1000;
const checkinMaxPerIpWindow = 30;
const checkinDuplicateWindowMs = 90 * 1000;
const ipCheckinHistory = new Map<string, number[]>();
const recentCheckinFingerprints = new Map<string, number>();

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const preParsed = (req as IncomingMessage & { body?: unknown }).body;
  if (preParsed && typeof preParsed === 'object') {
    return preParsed as Record<string, unknown>;
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    total += buf.length;
    if (total > 64 * 1024) break;
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ allowed: false, error: 'Method not allowed.' }));
    return;
  }

  const body = await readJsonBody(req);
  const eventId = typeof body.eventId === 'string' ? body.eventId.trim() : '';
  const fullName =
    typeof body.fullName === 'string'
      ? body.fullName.trim().toLowerCase().replace(/\s+/g, ' ')
      : '';
  const classDept =
    typeof body.classDepartment === 'string'
      ? body.classDepartment.trim().toLowerCase().replace(/\s+/g, ' ')
      : '';

  if (
    !/^[a-zA-Z0-9_\-]{1,128}$/.test(eventId) ||
    fullName.length < 2 ||
    fullName.length > 100 ||
    classDept.length < 1 ||
    classDept.length > 100
  ) {
    res.statusCode = 400;
    res.end(
      JSON.stringify({
        allowed: false,
        error: 'Please enter a valid full name and class/department.',
      })
    );
    return;
  }

  const now = Date.now();
  const xff = req.headers['x-forwarded-for'];
  const rawIp = Array.isArray(xff)
    ? xff[0]
    : typeof xff === 'string'
    ? xff.split(',')[0]
    : req.socket?.remoteAddress;
  const ipKey = String(rawIp || 'unknown').trim().slice(0, 64);

  const recentIpTimes = (ipCheckinHistory.get(ipKey) ?? []).filter(
    (ts) => now - ts < checkinRateWindowMs
  );
  if (recentIpTimes.length >= checkinMaxPerIpWindow) {
    res.statusCode = 429;
    res.end(
      JSON.stringify({
        allowed: false,
        code: 'rate_limited',
        error:
          'Too many check-in submissions from this network in a short time. Please wait a minute and try again.',
      })
    );
    return;
  }

  for (const [fp, ts] of recentCheckinFingerprints.entries()) {
    if (now - ts >= checkinDuplicateWindowMs) {
      recentCheckinFingerprints.delete(fp);
    }
  }

  const fingerprint = `${eventId}::${fullName}::${classDept}`;
  const lastSubmittedAt = recentCheckinFingerprints.get(fingerprint);
  if (lastSubmittedAt && now - lastSubmittedAt < checkinDuplicateWindowMs) {
    res.statusCode = 409;
    res.end(
      JSON.stringify({
        allowed: false,
        code: 'duplicate_burst',
        error:
          'An attendance check-in with this name and class/department was just submitted for this session. Duplicate submission prevented.',
      })
    );
    return;
  }

  recentIpTimes.push(now);
  ipCheckinHistory.set(ipKey, recentIpTimes);
  recentCheckinFingerprints.set(fingerprint, now);

  res.statusCode = 200;
  res.end(JSON.stringify({ allowed: true }));
}
