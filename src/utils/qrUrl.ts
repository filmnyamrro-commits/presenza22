const EVENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export interface QrOriginResolution {
  origin: string;
  isPublic: boolean;
  source:
    | 'admin-configured'
    | 'env'
    | 'current-origin'
    | 'aistudio-dev-preview'
    | 'local';
  warning: string | null;
}

export function isPrivateAiStudioHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  return (
    lower.startsWith('ais-dev-') ||
    lower.includes('.ais-dev-') ||
    lower === 'aistudio.google.com'
  );
}

export function isLocalOrNonPublicHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  return (
    !lower ||
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower === '[::1]' ||
    lower.endsWith('.local')
  );
}

export function isPublicHttpsOrigin(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    if (isPrivateAiStudioHost(parsed.hostname)) return false;
    if (isLocalOrNonPublicHost(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizeAndValidatePublicUrl(
  rawInput: string
): { ok: true; origin: string } | { ok: false; error: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: true, origin: '' };
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return {
      ok: false,
      error:
        'Please enter a valid HTTPS production URL (for example: https://your-app.vercel.app).',
    };
  }

  if (parsed.protocol !== 'https:') {
    return {
      ok: false,
      error:
        'The public QR URL must start with https:// so iPhone, iPad, and Android cameras are allowed on all devices.',
    };
  }

  if (isLocalOrNonPublicHost(parsed.hostname)) {
    return {
      ok: false,
      error:
        'Localhost and private network addresses cannot be opened from participant phones. Enter your public Vercel or production domain.',
    };
  }

  if (isPrivateAiStudioHost(parsed.hostname)) {
    return {
      ok: false,
      error:
        'Google AI Studio preview URLs (ais-dev-*) require a Google developer login and fail when scanned by phones. Enter your public Vercel or production URL instead.',
    };
  }

  if (!parsed.hostname.includes('.')) {
    return {
      ok: false,
      error:
        'Please enter a complete public domain name (for example: https://your-app.vercel.app).',
    };
  }

  const normalized = parsed.origin;
  if (normalized.length > 250) {
    return {
      ok: false,
      error: 'Public QR URL must be 250 characters or fewer.',
    };
  }

  return { ok: true, origin: normalized };
}

export function resolveQrOrigin(
  configuredPublicUrl?: string | null
): QrOriginResolution {
  const cleanConfigured = (configuredPublicUrl || '').trim();
  if (cleanConfigured && isPublicHttpsOrigin(cleanConfigured)) {
    return {
      origin: new URL(cleanConfigured).origin,
      isPublic: true,
      source: 'admin-configured',
      warning: null,
    };
  }

  const envUrl =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_PUBLIC_APP_URL === 'string'
      ? import.meta.env.VITE_PUBLIC_APP_URL.trim()
      : '';
  if (envUrl && isPublicHttpsOrigin(envUrl)) {
    return {
      origin: new URL(envUrl).origin,
      isPublic: true,
      source: 'env',
      warning: null,
    };
  }

  if (typeof window === 'undefined') {
    return {
      origin: '',
      isPublic: false,
      source: 'local',
      warning: 'No public origin available outside browser context.',
    };
  }

  const currentOrigin = window.location.origin;
  const hostname = window.location.hostname;

  if (isPrivateAiStudioHost(hostname)) {
    return {
      origin: currentOrigin,
      isPublic: false,
      source: 'aistudio-dev-preview',
      warning:
        'This QR currently uses a private AI Studio preview URL (ais-dev-*), which redirects participant phones to Google Account Sign-In (HTTP 302). Enter your public Vercel production URL so QR scans open Check-In directly on all devices.',
    };
  }

  if (
    isLocalOrNonPublicHost(hostname) ||
    window.location.protocol !== 'https:'
  ) {
    return {
      origin: currentOrigin,
      isPublic: false,
      source: 'local',
      warning:
        'This QR currently uses a local or non-HTTPS address that participant phones cannot reach. Enter your public HTTPS Vercel URL.',
    };
  }

  return {
    origin: currentOrigin,
    isPublic: true,
    source: 'current-origin',
    warning: null,
  };
}

export function buildCheckInQrUrl(
  eventId: string | null | undefined,
  configuredPublicUrl?: string | null
): { url: string; resolution: QrOriginResolution } {
  const resolution = resolveQrOrigin(configuredPublicUrl);
  const cleanId = (eventId || '').trim();
  const url = cleanId
    ? `${resolution.origin}/?event=${encodeURIComponent(cleanId)}`
    : `${resolution.origin}/`;
  return { url, resolution };
}

export function buildFeedbackQrUrl(
  eventId: string,
  configuredPublicUrl?: string | null
): { url: string; resolution: QrOriginResolution } {
  const resolution = resolveQrOrigin(configuredPublicUrl);
  const cleanId = eventId.trim();
  const url = `${resolution.origin}/?view=feedback&event=${encodeURIComponent(cleanId)}`;
  return { url, resolution };
}

export function sanitizeEventIdParam(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\/+$/, '');
  return cleaned || null;
}

export function isValidEventIdParam(eventId: string | null | undefined): boolean {
  if (!eventId) return false;
  return EVENT_ID_PATTERN.test(eventId);
}
