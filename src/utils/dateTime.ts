import type { AttendanceStatus } from '../types';

export function formatLocalDateYmd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export function formatTime24h(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function parse24hParts(time24: string): { hour24: number; minute: number } {
  const [rawH, rawM] = time24.split(':').map(Number);
  const hour24 = Number.isFinite(rawH) ? Math.min(23, Math.max(0, rawH)) : 0;
  const minute = Number.isFinite(rawM) ? Math.min(59, Math.max(0, rawM)) : 0;
  return { hour24, minute };
}

export function parse24hTo12h(time24: string): {
  hour12: number;
  minute: number;
  period: 'AM' | 'PM';
} {
  const { hour24, minute } = parse24hParts(time24);
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, period };
}

export function format12hTo24h(
  hour12: number,
  minute: number,
  period: 'AM' | 'PM'
): string {
  const safeH12 = Math.min(12, Math.max(1, hour12));
  const safeMin = Math.min(59, Math.max(0, minute));
  let hour24 = safeH12 % 12;
  if (period === 'PM') {
    hour24 += 12;
  }
  return `${String(hour24).padStart(2, '0')}:${String(safeMin).padStart(2, '0')}`;
}

export function format24hPartsToString(hour24: number, minute: number): string {
  const safeH = Math.min(23, Math.max(0, hour24));
  const safeM = Math.min(59, Math.max(0, minute));
  return `${String(safeH).padStart(2, '0')}:${String(safeM).padStart(2, '0')}`;
}

export function buildCutoffDate(eventDate: string, lateCutoffTime: string): Date {
  const [y, m, d] = eventDate.split('-').map(Number);
  const [hh, mm] = lateCutoffTime.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 59, 999);
}

export function evaluateAttendanceStatus(
  now: Date,
  cutoffDate: Date
): AttendanceStatus {
  return now.getTime() <= cutoffDate.getTime() ? 'On Time' : 'Late';
}

export function generateSafeId(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^a-zA-Z0-9_-]/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`.slice(0, 120);
}

export function formatCertificateIssueDate(ymdOrIso?: string): string {
  const trimmed = (ymdOrIso || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const localDate = new Date(y, (m || 1) - 1, d || 1);
    if (!Number.isNaN(localDate.getTime())) {
      return localDate.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  }
  const parsed = trimmed ? new Date(trimmed) : new Date();
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  return safeDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
