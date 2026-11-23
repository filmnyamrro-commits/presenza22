import type {
  VoiceAnnouncementSettings,
  VoiceLanguage,
  VoicePresetId,
} from '../types';

export interface VoicePresetDefinition {
  id: Exclude<VoicePresetId, 'browser-custom'>;
  numberLabel: string;
  name: string;
  language: VoiceLanguage;
  languageLabel: string;
  gender: 'male' | 'female';
  description: string;
  geminiVoiceName: 'Charon' | 'Puck' | 'Kore' | 'Zephyr' | 'Fenrir';
  browserKeywords: string[];
}

export const VOICE_PRESETS: VoicePresetDefinition[] = [
  {
    id: 'en-prof-male',
    numberLabel: 'Voice 1',
    name: 'Professional Male',
    language: 'en-US',
    languageLabel: 'English',
    gender: 'male',
    description: 'Clear, authoritative male voice suited for formal conferences and seminars.',
    geminiVoiceName: 'Charon',
    browserKeywords: [
      'daniel',
      'david',
      'mark',
      'guy',
      'google uk english male',
      'microsoft david',
      'microsoft guy',
      'male',
    ],
  },
  {
    id: 'en-friendly-male',
    numberLabel: 'Voice 2',
    name: 'Friendly Male',
    language: 'en-US',
    languageLabel: 'English',
    gender: 'male',
    description: 'Warm, upbeat male host voice for teacher workshops and team sessions.',
    geminiVoiceName: 'Puck',
    browserKeywords: ['aaron', 'ryan', 'alex', 'google us english', 'male'],
  },
  {
    id: 'en-prof-female',
    numberLabel: 'Voice 3',
    name: 'Professional Female',
    language: 'en-US',
    languageLabel: 'English',
    gender: 'female',
    description: 'Poised, articulate female voice for official training and keynote check-ins.',
    geminiVoiceName: 'Kore',
    browserKeywords: [
      'samantha',
      'victoria',
      'zira',
      'aria',
      'jenny',
      'google uk english female',
      'microsoft zira',
      'female',
    ],
  },
  {
    id: 'en-friendly-female',
    numberLabel: 'Voice 4',
    name: 'Friendly Female',
    language: 'en-US',
    languageLabel: 'English',
    gender: 'female',
    description: 'Bright, welcoming female voice ideal for warm participant greetings.',
    geminiVoiceName: 'Zephyr',
    browserKeywords: [
      'ava',
      'emma',
      'sonia',
      'karen',
      'google us english',
      'female',
    ],
  },
  {
    id: 'id-male',
    numberLabel: 'Voice 5',
    name: 'Male Indonesian',
    language: 'id-ID',
    languageLabel: 'Bahasa Indonesia',
    gender: 'male',
    description: 'Natural, polite Indonesian male voice for local workshops and school events.',
    geminiVoiceName: 'Fenrir',
    browserKeywords: ['ardi', 'andika', 'indonesian', 'id-id', 'id_id'],
  },
  {
    id: 'id-female',
    numberLabel: 'Voice 6',
    name: 'Female Indonesian',
    language: 'id-ID',
    languageLabel: 'Bahasa Indonesia',
    gender: 'female',
    description: 'Clear, welcoming Indonesian female voice for participant check-in greetings.',
    geminiVoiceName: 'Kore',
    browserKeywords: [
      'gadis',
      'damayanti',
      'google bahasa indonesia',
      'indonesian',
      'id-id',
      'id_id',
    ],
  },
];

export const DEFAULT_ENGLISH_TEMPLATE =
  'Good morning! {name} has successfully checked in. Welcome!';

export const DEFAULT_INDONESIAN_TEMPLATE =
  'Selamat datang! {name} telah berhasil melakukan check-in.';

export const DEFAULT_VOICE_SETTINGS: VoiceAnnouncementSettings = {
  enabled: true,
  engineMode: 'auto',
  voiceId: 'en-prof-female',
  browserVoiceUri: '',
  language: 'en-US',
  speakingRate: 1.0,
  volume: 1.0,
  englishTemplate: DEFAULT_ENGLISH_TEMPLATE,
  indonesianTemplate: DEFAULT_INDONESIAN_TEMPLATE,
  announceOnDashboard: true,
  announceOnCheckIn: true,
  showReplayWelcomeOnCheckIn: true,
};

const VALID_VOICE_IDS = new Set<string>([
  'en-prof-male',
  'en-friendly-male',
  'en-prof-female',
  'en-friendly-female',
  'id-male',
  'id-female',
  'browser-custom',
]);

export function clampSpeakingRate(rate: unknown): number {
  const num = typeof rate === 'number' && Number.isFinite(rate) ? rate : 1.0;
  return Math.min(1.5, Math.max(0.6, Math.round(num * 100) / 100));
}

export function clampVolume(volume: unknown): number {
  const num = typeof volume === 'number' && Number.isFinite(volume) ? volume : 1.0;
  return Math.min(1, Math.max(0, Math.round(num * 100) / 100));
}

export function mergeVoiceSettings(
  partial?: Partial<VoiceAnnouncementSettings> | null
): VoiceAnnouncementSettings {
  if (!partial) return { ...DEFAULT_VOICE_SETTINGS };
  return {
    enabled:
      typeof partial.enabled === 'boolean'
        ? partial.enabled
        : DEFAULT_VOICE_SETTINGS.enabled,
    engineMode:
      partial.engineMode === 'auto' ||
      partial.engineMode === 'ai' ||
      partial.engineMode === 'browser'
        ? partial.engineMode
        : DEFAULT_VOICE_SETTINGS.engineMode,
    voiceId:
      typeof partial.voiceId === 'string' && VALID_VOICE_IDS.has(partial.voiceId)
        ? (partial.voiceId as VoicePresetId)
        : DEFAULT_VOICE_SETTINGS.voiceId,
    browserVoiceUri:
      typeof partial.browserVoiceUri === 'string'
        ? partial.browserVoiceUri.slice(0, 200)
        : '',
    language:
      partial.language === 'id-ID' || partial.language === 'en-US'
        ? partial.language
        : DEFAULT_VOICE_SETTINGS.language,
    speakingRate: clampSpeakingRate(partial.speakingRate),
    volume: clampVolume(partial.volume),
    englishTemplate:
      typeof partial.englishTemplate === 'string' &&
      partial.englishTemplate.trim().length >= 2
        ? partial.englishTemplate.slice(0, 300)
        : DEFAULT_ENGLISH_TEMPLATE,
    indonesianTemplate:
      typeof partial.indonesianTemplate === 'string' &&
      partial.indonesianTemplate.trim().length >= 2
        ? partial.indonesianTemplate.slice(0, 300)
        : DEFAULT_INDONESIAN_TEMPLATE,
    announceOnDashboard:
      typeof partial.announceOnDashboard === 'boolean'
        ? partial.announceOnDashboard
        : DEFAULT_VOICE_SETTINGS.announceOnDashboard,
    announceOnCheckIn:
      typeof partial.announceOnCheckIn === 'boolean'
        ? partial.announceOnCheckIn
        : DEFAULT_VOICE_SETTINGS.announceOnCheckIn,
    showReplayWelcomeOnCheckIn:
      typeof partial.showReplayWelcomeOnCheckIn === 'boolean'
        ? partial.showReplayWelcomeOnCheckIn
        : DEFAULT_VOICE_SETTINGS.showReplayWelcomeOnCheckIn,
  };
}

export function formatAnnouncementMessage(
  settings: VoiceAnnouncementSettings,
  participant: {
    name: string;
    department?: string;
    eventTitle?: string;
  }
): string {
  const cleanName = participant.name.trim();
  if (!cleanName) return '';

  const template =
    settings.language === 'id-ID'
      ? settings.indonesianTemplate || DEFAULT_INDONESIAN_TEMPLATE
      : settings.englishTemplate || DEFAULT_ENGLISH_TEMPLATE;

  const dept = (participant.department || '').trim();
  const evt = (participant.eventTitle || '').trim();

  const resolved = template
    .replace(/\{name\}/gi, cleanName)
    .replace(/\{department\}/gi, dept)
    .replace(/\{class\}/gi, dept)
    .replace(/\{event\}/gi, evt)
    .replace(/\s+/g, ' ')
    .trim();

  return resolved.slice(0, 480);
}

export function getPresetById(voiceId: VoicePresetId): VoicePresetDefinition {
  return (
    VOICE_PRESETS.find((v) => v.id === voiceId) ??
    VOICE_PRESETS[2]
  );
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function getDynamicBrowserVoices(): SpeechSynthesisVoice[] {
  if (!isSpeechSynthesisSupported()) return [];
  try {
    return window.speechSynthesis.getVoices() || [];
  } catch {
    return [];
  }
}

export function pickBestBrowserVoice(
  voices: SpeechSynthesisVoice[],
  language: VoiceLanguage,
  presetId: VoicePresetId,
  preferredUri?: string
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  if (preferredUri) {
    const exact = voices.find((v) => v.voiceURI === preferredUri);
    if (exact) return exact;
  }

  const targetPrefix = language === 'id-ID' ? 'id' : 'en';
  const langVoices = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(targetPrefix)
  );
  const pool = langVoices.length > 0 ? langVoices : voices;

  const preset = getPresetById(presetId);
  for (const kw of preset.browserKeywords) {
    const matched = pool.find((v) =>
      `${v.name} ${v.lang} ${v.voiceURI}`.toLowerCase().includes(kw)
    );
    if (matched) return matched;
  }

  const defaultLangVoice = pool.find((v) => v.default);
  return defaultLangVoice ?? pool[0] ?? null;
}

export interface SpeakAnnouncementResult {
  spoken: boolean;
  engineUsed: 'ai' | 'browser' | 'none';
  voiceLabel: string;
  autoplayBlocked?: boolean;
  error?: string;
}

let activeAudioEl: HTMLAudioElement | null = null;

export function stopAllAnnouncements(): void {
  if (activeAudioEl) {
    try {
      activeAudioEl.pause();
      activeAudioEl.currentTime = 0;
    } catch {
      // ignore
    }
    activeAudioEl = null;
  }
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

export function unlockBrowserAudio(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.01);
      window.setTimeout(() => {
        void ctx.close().catch(() => undefined);
      }, 200);
    }
  } catch {
    // ignore
  }
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.resume();
    } catch {
      // ignore
    }
  }
}

async function playWavBase64(
  base64Audio: string,
  mimeType: string,
  rate: number,
  volume: number
): Promise<{ played: boolean; autoplayBlocked?: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(`data:${mimeType};base64,${base64Audio}`);
      audio.volume = clampVolume(volume);
      audio.playbackRate = clampSpeakingRate(rate);
      activeAudioEl = audio;

      let settled = false;
      const finish = (res: {
        played: boolean;
        autoplayBlocked?: boolean;
        error?: string;
      }) => {
        if (settled) return;
        settled = true;
        if (activeAudioEl === audio) {
          activeAudioEl = null;
        }
        resolve(res);
      };

      audio.onended = () => finish({ played: true });
      audio.onerror = () =>
        finish({ played: false, error: 'Audio playback error.' });

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.catch((err: unknown) => {
          const errName =
            err && typeof err === 'object' && 'name' in err
              ? String((err as { name?: unknown }).name)
              : '';
          const msg = err instanceof Error ? err.message : String(err);
          const blocked =
            errName === 'NotAllowedError' ||
            msg.toLowerCase().includes('notallowed') ||
            msg.toLowerCase().includes('user didn\'t interact');
          finish({
            played: false,
            autoplayBlocked: blocked,
            error: msg,
          });
        });
      }
    } catch (err) {
      resolve({
        played: false,
        error: err instanceof Error ? err.message : 'Unable to initialize audio.',
      });
    }
  });
}

async function speakWithBrowserSynthesis(
  text: string,
  settings: VoiceAnnouncementSettings,
  overridePresetId?: VoicePresetId,
  overrideBrowserVoiceUri?: string
): Promise<SpeakAnnouncementResult> {
  if (!isSpeechSynthesisSupported()) {
    return {
      spoken: false,
      engineUsed: 'none',
      voiceLabel: 'Unavailable',
      error: 'Speech synthesis is not supported in this browser.',
    };
  }

  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const targetPreset = overridePresetId ?? settings.voiceId;
      const targetLang =
        targetPreset === 'id-male' || targetPreset === 'id-female'
          ? 'id-ID'
          : targetPreset === 'browser-custom'
          ? settings.language
          : 'en-US';

      const voices = getDynamicBrowserVoices();
      const picked = pickBestBrowserVoice(
        voices,
        targetLang,
        targetPreset,
        overrideBrowserVoiceUri ?? settings.browserVoiceUri
      );

      if (picked) {
        utterance.voice = picked;
        utterance.lang = picked.lang;
      } else {
        utterance.lang = targetLang;
      }

      utterance.rate = clampSpeakingRate(settings.speakingRate);
      utterance.volume = clampVolume(settings.volume);
      utterance.pitch =
        targetPreset === 'en-friendly-female' || targetPreset === 'id-female'
          ? 1.06
          : targetPreset === 'en-prof-male'
          ? 0.96
          : 1.0;

      const label = picked ? `${picked.name} (${picked.lang})` : `Browser Default (${targetLang})`;

      let settled = false;
      const done = (result: SpeakAnnouncementResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const timeoutId = window.setTimeout(() => {
        done({
          spoken: true,
          engineUsed: 'browser',
          voiceLabel: label,
        });
      }, 10000);

      utterance.onend = () => {
        window.clearTimeout(timeoutId);
        done({
          spoken: true,
          engineUsed: 'browser',
          voiceLabel: label,
        });
      };

      utterance.onerror = (ev) => {
        window.clearTimeout(timeoutId);
        const errCode = ev.error || 'unknown';
        done({
          spoken: false,
          engineUsed: 'browser',
          voiceLabel: label,
          autoplayBlocked: errCode === 'not-allowed',
          error: `Browser voice error: ${errCode}`,
        });
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      resolve({
        spoken: false,
        engineUsed: 'none',
        voiceLabel: 'Error',
        error: err instanceof Error ? err.message : 'Browser speech failed.',
      });
    }
  });
}

export async function speakAnnouncement(
  text: string,
  settings: VoiceAnnouncementSettings,
  options?: {
    overrideVoiceId?: VoicePresetId;
    overrideBrowserVoiceUri?: string;
    forceBrowserOnly?: boolean;
  }
): Promise<SpeakAnnouncementResult> {
  const cleanText = text.trim();
  if (!cleanText) {
    return { spoken: false, engineUsed: 'none', voiceLabel: '' };
  }

  const voiceId = options?.overrideVoiceId ?? settings.voiceId;
  const shouldUseBrowserOnly =
    options?.forceBrowserOnly ||
    settings.engineMode === 'browser' ||
    voiceId === 'browser-custom';

  if (!shouldUseBrowserOnly) {
    const preset = getPresetById(voiceId);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    try {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voiceId: preset.id,
          language: preset.language,
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (
        resp.ok &&
        resp.headers.get('content-type')?.toLowerCase().includes('application/json')
      ) {
        const data = (await resp.json()) as {
          audioBase64?: string;
          mimeType?: string;
          voiceName?: string;
        };
        if (data.audioBase64) {
          const playRes = await playWavBase64(
            data.audioBase64,
            data.mimeType || 'audio/wav',
            settings.speakingRate,
            settings.volume
          );
          if (playRes.played) {
            return {
              spoken: true,
              engineUsed: 'ai',
              voiceLabel: `${preset.name} (Gemini AI · ${data.voiceName || preset.geminiVoiceName})`,
            };
          }
          if (playRes.autoplayBlocked) {
            return {
              spoken: false,
              engineUsed: 'ai',
              voiceLabel: `${preset.name} (Gemini AI)`,
              autoplayBlocked: true,
              error: playRes.error,
            };
          }
        }
      }
    } catch {
      window.clearTimeout(timeout);
      // Gracefully fall back to browser speech synthesis below
    }
  }

  return speakWithBrowserSynthesis(
    cleanText,
    settings,
    voiceId,
    options?.overrideBrowserVoiceUri
  );
}

export interface QueuedAnnouncementItem {
  id: string;
  participantName: string;
  department?: string;
  eventTitle?: string;
}

export class AnnouncementQueue {
  private queue: QueuedAnnouncementItem[] = [];
  private processing = false;
  private getSettings: () => VoiceAnnouncementSettings;
  private onStatusChange?: (state: {
    speakingName: string | null;
    autoplayBlocked: boolean;
  }) => void;
  private lastBlockedItem: QueuedAnnouncementItem | null = null;

  constructor(
    getSettings: () => VoiceAnnouncementSettings,
    onStatusChange?: (state: {
      speakingName: string | null;
      autoplayBlocked: boolean;
    }) => void
  ) {
    this.getSettings = getSettings;
    this.onStatusChange = onStatusChange;
  }

  enqueue(item: QueuedAnnouncementItem): void {
    if (!item.participantName.trim()) return;
    if (this.queue.some((q) => q.id === item.id)) return;
    this.queue.push(item);
    void this.drain();
  }

  replayBlocked(): void {
    if (!this.lastBlockedItem) return;
    const item = this.lastBlockedItem;
    this.lastBlockedItem = null;
    this.queue.unshift(item);
    void this.drain();
  }

  clear(): void {
    this.queue = [];
    this.lastBlockedItem = null;
    stopAllAnnouncements();
    this.onStatusChange?.({ speakingName: null, autoplayBlocked: false });
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      const settings = this.getSettings();
      if (!settings.enabled) {
        continue;
      }

      const message = formatAnnouncementMessage(settings, {
        name: next.participantName,
        department: next.department,
        eventTitle: next.eventTitle,
      });

      if (!message) continue;

      this.onStatusChange?.({
        speakingName: next.participantName,
        autoplayBlocked: false,
      });

      const result = await speakAnnouncement(message, settings);
      if (result.autoplayBlocked) {
        this.lastBlockedItem = next;
        this.onStatusChange?.({
          speakingName: null,
          autoplayBlocked: true,
        });
        break;
      }
    }

    this.processing = false;
    if (!this.lastBlockedItem) {
      this.onStatusChange?.({ speakingName: null, autoplayBlocked: false });
    }
  }
}
