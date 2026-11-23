import type { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  Check,
  Globe,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { db, handleFirestoreError } from '../firebase';
import {
  OperationType,
  type VoiceAnnouncementSettings,
  type VoiceEngineMode,
  type VoiceLanguage,
  type VoicePresetId,
} from '../types';
import {
  clampSpeakingRate,
  clampVolume,
  DEFAULT_ENGLISH_TEMPLATE,
  DEFAULT_INDONESIAN_TEMPLATE,
  DEFAULT_VOICE_SETTINGS,
  formatAnnouncementMessage,
  getDynamicBrowserVoices,
  isSpeechSynthesisSupported,
  mergeVoiceSettings,
  pickBestBrowserVoice,
  speakAnnouncement,
  stopAllAnnouncements,
  unlockBrowserAudio,
  VOICE_PRESETS,
} from '../utils/voiceAnnouncement';

interface AdminVoiceSettingsModuleProps {
  user: User;
  savedSettings: VoiceAnnouncementSettings;
}

export default function AdminVoiceSettingsModule({
  user,
  savedSettings,
}: AdminVoiceSettingsModuleProps) {
  const [draft, setDraft] = useState<VoiceAnnouncementSettings>(() =>
    mergeVoiceSettings(savedSettings)
  );
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>(() =>
    getDynamicBrowserVoices()
  );
  const [serverTtsAvailable, setServerTtsAvailable] = useState<boolean | null>(null);

  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [previewFeedback, setPreviewFeedback] = useState<string | null>(null);
  const [sampleName, setSampleName] = useState('Jonathan Alexander');
  const [sampleDept, setSampleDept] = useState('Primary School');

  useEffect(() => {
    setDraft(mergeVoiceSettings(savedSettings));
  }, [savedSettings]);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ttsAvailable?: boolean } | null) => {
        if (active && data && typeof data.ttsAvailable === 'boolean') {
          setServerTtsAvailable(data.ttsAvailable);
        } else if (active) {
          setServerTtsAvailable(false);
        }
      })
      .catch(() => {
        if (active) setServerTtsAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;
    const refresh = () => {
      setBrowserVoices(getDynamicBrowserVoices());
    };
    refresh();
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', refresh);
    };
  }, []);

  const hasUnsavedChanges = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(mergeVoiceSettings(savedSettings));
  }, [draft, savedSettings]);

  const englishPresets = useMemo(
    () => VOICE_PRESETS.filter((v) => v.language === 'en-US'),
    []
  );
  const indonesianPresets = useMemo(
    () => VOICE_PRESETS.filter((v) => v.language === 'id-ID'),
    []
  );

  const relevantBrowserVoices = useMemo(() => {
    const sorted = [...browserVoices].sort((a, b) => {
      const aMatch = a.lang.toLowerCase().startsWith(draft.language === 'id-ID' ? 'id' : 'en');
      const bMatch = b.lang.toLowerCase().startsWith(draft.language === 'id-ID' ? 'id' : 'en');
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [browserVoices, draft.language]);

  const activeTemplatePreview = useMemo(() => {
    return formatAnnouncementMessage(draft, {
      name: sampleName.trim() || 'Jonathan Alexander',
      department: sampleDept.trim() || 'Primary School',
      eventTitle: 'Teacher Workshop',
    });
  }, [draft, sampleName, sampleDept]);

  const handleSelectLanguage = (lang: VoiceLanguage) => {
    setDraft((prev) => {
      let nextVoiceId = prev.voiceId;
      if (lang === 'id-ID' && prev.voiceId.startsWith('en-')) {
        nextVoiceId = 'id-female';
      } else if (lang === 'en-US' && prev.voiceId.startsWith('id-')) {
        nextVoiceId = 'en-prof-female';
      }
      return {
        ...prev,
        language: lang,
        voiceId: nextVoiceId,
      };
    });
  };

  const handlePreviewVoice = async (
    key: string,
    options?: {
      voiceId?: VoicePresetId;
      browserVoiceUri?: string;
      languageOverride?: VoiceLanguage;
      forceBrowserOnly?: boolean;
    }
  ) => {
    if (previewingKey === key) {
      stopAllAnnouncements();
      setPreviewingKey(null);
      return;
    }

    unlockBrowserAudio();
    stopAllAnnouncements();
    setPreviewingKey(key);
    setPreviewFeedback(null);

    const previewLang = options?.languageOverride ?? draft.language;
    const tempSettings: VoiceAnnouncementSettings = {
      ...draft,
      language: previewLang,
      voiceId: options?.voiceId ?? draft.voiceId,
      browserVoiceUri: options?.browserVoiceUri ?? draft.browserVoiceUri,
    };

    const text = formatAnnouncementMessage(tempSettings, {
      name: sampleName.trim() || 'Jonathan Alexander',
      department: sampleDept.trim() || 'Primary School',
      eventTitle: 'Teacher Workshop',
    });

    const result = await speakAnnouncement(text, tempSettings, {
      overrideVoiceId: options?.voiceId,
      overrideBrowserVoiceUri: options?.browserVoiceUri,
      forceBrowserOnly: options?.forceBrowserOnly,
    });

    setPreviewingKey(null);
    if (result.spoken) {
      setPreviewFeedback(
        `Played via ${result.engineUsed === 'ai' ? 'Gemini AI Voice' : 'Device Speech Fallback'} — ${result.voiceLabel}`
      );
    } else {
      setPreviewFeedback(
        result.error || 'Could not play preview on this device.'
      );
    }
  };

  const handleInsertPlaceholder = (token: string) => {
    setDraft((prev) => {
      const field =
        prev.language === 'id-ID' ? 'indonesianTemplate' : 'englishTemplate';
      const current = prev[field];
      const next = current.endsWith(' ') || current.length === 0
        ? `${current}${token}`
        : `${current} ${token}`;
      return {
        ...prev,
        [field]: next.slice(0, 300),
      };
    });
  };

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(false);

    const cleanEnglish = draft.englishTemplate.trim();
    const cleanIndonesian = draft.indonesianTemplate.trim();
    if (cleanEnglish.length < 2 || cleanIndonesian.length < 2) {
      setSaveError('Both English and Indonesian message templates must be at least 2 characters.');
      return;
    }

    const normalized = mergeVoiceSettings({
      ...draft,
      englishTemplate: cleanEnglish,
      indonesianTemplate: cleanIndonesian,
      speakingRate: clampSpeakingRate(draft.speakingRate),
      volume: clampVolume(draft.volume),
    });

    setSaving(true);
    try {
      await setDoc(doc(db, 'voiceSettings', 'default'), {
        ...normalized,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      setDraft(normalized);
      setSaveSuccess(true);
      window.setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError('Unable to save voice announcement settings. Please try again.');
      handleFirestoreError(error, OperationType.WRITE, 'voiceSettings/default');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Status & Save Banner */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                draft.enabled
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
            >
              {draft.enabled ? (
                <Volume2 className="w-6 h-6" />
              ) : (
                <VolumeX className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                  Voice Announcement Settings
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                    draft.enabled
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {draft.enabled ? 'Active' : 'Turned Off'}
                </span>
                {serverTtsAvailable !== null && (
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                      serverTtsAvailable
                        ? 'bg-violet-50 text-violet-800 border-violet-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>
                      {serverTtsAvailable
                        ? 'Gemini AI Voice Ready'
                        : 'Device Voice Fallback Mode'}
                    </span>
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Automatically welcome participants by name using AI-generated speech as soon as they scan a QR code and complete check-in.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={draft.enabled}
              onClick={() =>
                setDraft((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              className={`min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                draft.enabled
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                  : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
              }`}
            >
              {draft.enabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
              <span>
                {draft.enabled
                  ? 'Voice Announcements: ON'
                  : 'Voice Announcements: OFF'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saveSuccess ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {saving
                  ? 'Saving...'
                  : saveSuccess
                  ? 'Settings Saved'
                  : hasUnsavedChanges
                  ? 'Save Settings*'
                  : 'Save Settings'}
              </span>
            </button>
          </div>
        </div>

        {saveError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800">
            {saveError}
          </div>
        )}

        {/* Delivery Targets & Speech Engine */}
        <div className="mt-5 pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={draft.announceOnDashboard}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  announceOnDashboard: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">
                Announce on Live Admin Dashboard
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Speaks each newly checked-in participant as they appear in the Real-Time Arrival Feed.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={draft.announceOnCheckIn}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  announceOnCheckIn: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">
                Announce on Participant Check-In Device
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Plays the welcome announcement automatically on the participant screen upon submission.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 cursor-pointer hover:bg-slate-50">
            <input
              type="checkbox"
              checked={draft.showReplayWelcomeOnCheckIn}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  showReplayWelcomeOnCheckIn: e.target.checked,
                }))
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <div>
              <div className="text-xs font-bold text-slate-900">
                Show &ldquo;Replay Welcome Voice&rdquo; on Check-In Page
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {draft.enabled
                  ? 'Displays or hides the Replay Welcome Voice button on the participant check-in receipt.'
                  : 'Turn Master Voice Announcements ON above to enable replay on check-in.'}
              </p>
            </div>
          </label>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <label
              htmlFor="voice-engine-mode"
              className="block text-xs font-bold text-slate-900 mb-1"
            >
              Voice Synthesis Engine
            </label>
            <select
              id="voice-engine-mode"
              value={draft.engineMode}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  engineMode: e.target.value as VoiceEngineMode,
                }))
              }
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="auto">Auto (Gemini AI Voice + Browser Fallback)</option>
              <option value="ai">Gemini AI Voice Preferred</option>
              <option value="browser">Browser Speech Engine Only</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Automatically falls back to device voices if AI TTS is unreachable.
            </p>
          </div>
        </div>
      </section>

      {/* Language, Speed, & Volume Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-700" />
            <h3 className="text-base font-bold text-slate-900">
              Language, Speed &amp; Volume
            </h3>
          </div>

          {/* Language Selection */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Announcement Language
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleSelectLanguage('en-US')}
                className={`min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                  draft.language === 'en-US'
                    ? 'border-blue-600 bg-blue-50 text-blue-950 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className="text-xs font-bold">English (US/Intl)</div>
                <div className="text-[11px] text-slate-500">en-US</div>
              </button>
              <button
                type="button"
                onClick={() => handleSelectLanguage('id-ID')}
                className={`min-h-[46px] px-3.5 py-2.5 rounded-xl border text-left transition-colors ${
                  draft.language === 'id-ID'
                    ? 'border-blue-600 bg-blue-50 text-blue-950 ring-1 ring-blue-600'
                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className="text-xs font-bold">Indonesian</div>
                <div className="text-[11px] text-slate-500">Bahasa Indonesia (id-ID)</div>
              </button>
            </div>
          </div>

          {/* Speaking Speed */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 inline-flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                Speaking Speed
              </span>
              <span className="font-mono-tabular font-bold text-slate-900">
                {draft.speakingRate.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.6}
              max={1.5}
              step={0.05}
              value={draft.speakingRate}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  speakingRate: clampSpeakingRate(Number(e.target.value)),
                }))
              }
              aria-label="Speaking speed"
              className="w-full accent-blue-700 cursor-pointer"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: '0.85x Calm', val: 0.85 },
                { label: '1.0x Normal', val: 1.0 },
                { label: '1.15x Crisp', val: 1.15 },
                { label: '1.3x Fast', val: 1.3 },
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, speakingRate: preset.val }))
                  }
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors ${
                    Math.abs(draft.speakingRate - preset.val) < 0.03
                      ? 'border-blue-600 bg-blue-50 text-blue-800'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Volume */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 inline-flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                Announcement Volume
              </span>
              <span className="font-mono-tabular font-bold text-slate-900">
                {Math.round(draft.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.volume}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  volume: clampVolume(Number(e.target.value)),
                }))
              }
              aria-label="Announcement volume"
              className="w-full accent-blue-700 cursor-pointer"
            />
          </div>
        </section>

        {/* Customizable Announcement Messages & Live Test */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Customizable Announcement Messages
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                The participant&apos;s submitted name dynamically replaces <code className="px-1 py-0.5 rounded bg-slate-100 text-slate-900 font-mono-tabular">{'{name}'}</code> on every check-in.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {['{name}', '{department}', '{event}'].map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => handleInsertPlaceholder(token)}
                  className="px-2 py-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-[11px] font-mono-tabular font-semibold text-slate-700 transition-colors"
                >
                  + {token}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="english-template-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  English Announcement Message{' '}
                  {draft.language === 'en-US' && (
                    <span className="text-blue-700 font-bold">(Active)</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      englishTemplate: DEFAULT_ENGLISH_TEMPLATE,
                    }))
                  }
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Default</span>
                </button>
              </div>
              <textarea
                id="english-template-input"
                rows={2}
                maxLength={300}
                value={draft.englishTemplate}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    englishTemplate: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="indonesian-template-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Indonesian Announcement Message{' '}
                  {draft.language === 'id-ID' && (
                    <span className="text-blue-700 font-bold">(Active)</span>
                  )}
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      indonesianTemplate: DEFAULT_INDONESIAN_TEMPLATE,
                    }))
                  }
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Default</span>
                </button>
              </div>
              <textarea
                id="indonesian-template-input"
                rows={2}
                maxLength={300}
                value={draft.indonesianTemplate}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    indonesianTemplate: e.target.value,
                  }))
                }
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Live Test Bar */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="voice-test-name"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Test Participant Name (Preview Only)
                </label>
                <input
                  id="voice-test-name"
                  type="text"
                  value={sampleName}
                  onChange={(e) => setSampleName(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="voice-test-dept"
                  className="block text-[11px] font-semibold text-slate-600 mb-1"
                >
                  Test Class / Department (Preview Only)
                </label>
                <input
                  id="voice-test-dept"
                  type="text"
                  value={sampleDept}
                  onChange={(e) => setSampleDept(e.target.value)}
                  className="w-full min-h-[38px] px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg text-slate-900"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-800 italic">
                &ldquo;{activeTemplatePreview}&rdquo;
              </p>
              <button
                type="button"
                onClick={() => void handlePreviewVoice('live-test')}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {previewingKey === 'live-test' ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Preview</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Preview Selected Voice</span>
                  </>
                )}
              </button>
            </div>

            {previewFeedback && (
              <p className="text-[11px] font-medium text-blue-900">
                {previewFeedback}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* AI Voice Presets (English & Indonesian) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            AI Voice Profiles (with Automatic Device Fallback)
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Preview any voice before selecting it. When AI synthesis is active, PRESENZA generates natural WAV speech via Gemini TTS and automatically falls back to the best matching device voice if unavailable.
          </p>
        </div>

        {/* English Voices */}
        <div className="space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            English Voices
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {englishPresets.map((preset) => {
              const isSelected = draft.voiceId === preset.id;
              const isPreviewing = previewingKey === preset.id;
              const fallbackVoice = pickBestBrowserVoice(
                browserVoices,
                preset.language,
                preset.id
              );
              return (
                <div
                  key={preset.id}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      voiceId: preset.id,
                      language: preset.language,
                    }))
                  }
                  className={`rounded-xl border p-4 flex flex-col justify-between gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                        {preset.numberLabel}
                      </span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-700 text-white text-[10px] font-bold">
                          <Check className="w-3 h-3" />
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {preset.name}
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {preset.description}
                    </p>
                    <div className="pt-1 text-[11px] text-slate-500 space-y-0.5">
                      <div>AI Voice: {preset.geminiVoiceName}</div>
                      <div className="truncate">
                        Fallback: {fallbackVoice ? fallbackVoice.name : 'Default System Voice'}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handlePreviewVoice(preset.id, {
                        voiceId: preset.id,
                        languageOverride: preset.language,
                      });
                    }}
                    className={`w-full min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                      isPreviewing
                        ? 'border-rose-300 bg-rose-50 text-rose-700'
                        : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    {isPreviewing ? (
                      <>
                        <Square className="w-3 h-3 fill-current" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>Preview Voice</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Indonesian Voices */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Indonesian Voices (Bahasa Indonesia)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {indonesianPresets.map((preset) => {
              const isSelected = draft.voiceId === preset.id;
              const isPreviewing = previewingKey === preset.id;
              const fallbackVoice = pickBestBrowserVoice(
                browserVoices,
                preset.language,
                preset.id
              );
              return (
                <div
                  key={preset.id}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      voiceId: preset.id,
                      language: preset.language,
                    }))
                  }
                  className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                        {preset.numberLabel}
                      </span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-700 text-white text-[10px] font-bold">
                          <Check className="w-3 h-3" />
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      {preset.name}
                    </div>
                    <p className="text-xs text-slate-600">
                      {preset.description}
                    </p>
                    <div className="text-[11px] text-slate-500">
                      AI Voice: {preset.geminiVoiceName} · Fallback:{' '}
                      {fallbackVoice ? fallbackVoice.name : 'Default System Voice'}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handlePreviewVoice(preset.id, {
                        voiceId: preset.id,
                        languageOverride: preset.language,
                      });
                    }}
                    className={`min-h-[38px] px-4 py-1.5 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                      isPreviewing
                        ? 'border-rose-300 bg-rose-50 text-rose-700'
                        : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    {isPreviewing ? (
                      <>
                        <Square className="w-3 h-3 fill-current" />
                        <span>Stop</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>Preview Voice</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Dynamic Browser Speech Synthesis Voices */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Detected Browser Speech Voices ({browserVoices.length})
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Dynamically discovered from this device&apos;s speech engine. Select one for direct browser-voice announcements or keep an AI Voice Profile above with automatic fallback.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBrowserVoices(getDynamicBrowserVoices())}
            className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Device Voices</span>
          </button>
        </div>

        {relevantBrowserVoices.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-xs text-slate-600">
            No device speech synthesis voices were reported yet by this browser. Gemini AI Voice will handle speech generation when online, and the browser&apos;s default voice will be used as fallback.
          </div>
        ) : (
          <div className="max-h-[280px] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {relevantBrowserVoices.slice(0, 30).map((voice) => {
              const isCustomSelected =
                draft.voiceId === 'browser-custom' &&
                draft.browserVoiceUri === voice.voiceURI;
              const previewKey = `browser-${voice.voiceURI}`;
              return (
                <div
                  key={voice.voiceURI}
                  className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    isCustomSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {voice.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-mono-tabular font-semibold text-slate-700">
                        {voice.lang}
                      </span>
                      {voice.localService && (
                        <span className="text-[10px] font-medium text-emerald-700">
                          Offline Ready
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        void handlePreviewVoice(previewKey, {
                          voiceId: 'browser-custom',
                          browserVoiceUri: voice.voiceURI,
                          languageOverride: voice.lang
                            .toLowerCase()
                            .startsWith('id')
                            ? 'id-ID'
                            : 'en-US',
                          forceBrowserOnly: true,
                        })
                      }
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1"
                    >
                      {previewingKey === previewKey ? (
                        <>
                          <Square className="w-3 h-3 fill-current text-rose-600" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-current" />
                          <span>Preview</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          voiceId: 'browser-custom',
                          browserVoiceUri: voice.voiceURI,
                          language: voice.lang.toLowerCase().startsWith('id')
                            ? 'id-ID'
                            : 'en-US',
                        }))
                      }
                      className={`min-h-[32px] px-3 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                        isCustomSelected
                          ? 'border-blue-600 bg-blue-700 text-white'
                          : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      {isCustomSelected ? 'Selected' : 'Use Voice'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
