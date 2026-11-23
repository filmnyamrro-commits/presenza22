import {
  Award,
  CalendarDays,
  Check,
  CheckSquare,
  Download,
  Eye,
  FileCheck2,
  Globe,
  ImagePlus,
  Languages,
  Loader2,
  Palette,
  PenTool,
  Printer,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Square,
  Users,
  X,
} from 'lucide-react';
import { type User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, handleFirestoreError } from '../firebase';
import {
  type AttendanceRecord,
  type CertificateSettings,
  type CertificateThemeId,
  type EventRecord,
  OperationType,
  type OrganizationBranding,
  type ParticipationCertificateRecord,
  type ParticipationLanguageFormat,
  type ParticipationTemplateConfig,
  type RecognitionFontFamily,
  type RecognitionTemplateConfig,
} from '../types';
import { formatLocalDateYmd } from '../utils/dateTime';
import {
  buildParticipationCertificateNumber,
  DEFAULT_PARTICIPATION_TEMPLATE,
  formatEventLocation,
  mergeParticipationTemplate,
  mergeRecognitionTemplate,
  PARTICIPATION_WORDING_PRESETS,
} from '../utils/feedbackAndRecognitionDefaults';
import {
  compressCertificateBackground,
  compressLogoFile,
  compressSignatureCanvas,
  compressSignatureFile,
} from '../utils/imageCompress';
import {
  CERTIFICATE_THEME_LIST,
  downloadParticipationCertificatesPdf,
  mergeCertificateSettings,
  printParticipationCertificatesPdf,
} from '../utils/pdfExport';
import ParticipationCertificateCanvas from './ParticipationCertificateCanvas';

interface AdminParticipationModuleProps {
  user: User;
  events: EventRecord[];
  attendances: AttendanceRecord[];
  branding?: OrganizationBranding | null;
  participationTemplate: ParticipationTemplateConfig;
  recognitionTemplate: RecognitionTemplateConfig;
  certificateSettings: CertificateSettings;
}

const STUDIO_COLOR_PRESETS: ReadonlyArray<{
  themeId: CertificateThemeId;
  name: string;
  primaryColor: string;
  accentColor: string;
  paperColor: string;
}> = CERTIFICATE_THEME_LIST.map((theme) => ({
  themeId: theme.id,
  name: theme.name,
  primaryColor: theme.outerBorderHex,
  accentColor: theme.innerBorderHex,
  paperColor: theme.paperHex,
}));

const PLACEHOLDER_TOKENS = [
  '{{participant}}',
  '{{event}}',
  '{{date}}',
  '{{venue}}',
  '{{topic}}',
  '{{facilitator}}',
  '{{organizer}}',
  '{{department}}',
];

const LANGUAGE_OPTIONS: ReadonlyArray<{
  value: ParticipationLanguageFormat;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    value: 'bilingual',
    label: 'Bilingual (English & Bahasa)',
    shortLabel: 'Bilingual (EN & ID)',
    description: 'Displays both English and Bahasa Indonesia together on every certificate.',
  },
  {
    value: 'english',
    label: 'English Only',
    shortLabel: 'English',
    description: 'Full English headings, dates, topic label, and wording.',
  },
  {
    value: 'bahasa',
    label: 'Bahasa Indonesia Only',
    shortLabel: 'Bahasa Indonesia',
    description: 'Indonesian headings, Indonesian months, topic label, and wording.',
  },
];

export default function AdminParticipationModule({
  user,
  events,
  attendances,
  branding,
  participationTemplate,
  recognitionTemplate,
  certificateSettings,
}: AdminParticipationModuleProps) {
  const [innerTab, setInnerTab] = useState<'roster' | 'customize'>('roster');
  const [studioSection, setStudioSection] = useState<
    'format' | 'wording' | 'design'
  >('format');

  // Roster / Download All state
  const [selectedEventId, setSelectedEventId] = useState<string>(
    () => events[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [overrideLang, setOverrideLang] = useState<
    'template' | ParticipationLanguageFormat
  >('template');
  const [previewRecord, setPreviewRecord] =
    useState<ParticipationCertificateRecord | null>(null);

  // Template customizer draft state
  const [draft, setDraft] = useState<ParticipationTemplateConfig>(() =>
    mergeParticipationTemplate(participationTemplate)
  );
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [processingAsset, setProcessingAsset] = useState(false);

  const logoUploadRef = useRef<HTMLInputElement | null>(null);
  const bgUploadRef = useRef<HTMLInputElement | null>(null);
  const picPdSigUploadRef = useRef<HTMLInputElement | null>(null);
  const principalSigUploadRef = useRef<HTMLInputElement | null>(null);

  // Signature Draw Pad
  const [drawingRole, setDrawingRole] = useState<'picPd' | 'principal' | null>(
    null
  );
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef(false);

  useEffect(() => {
    setDraft(mergeParticipationTemplate(participationTemplate));
  }, [participationTemplate]);

  useEffect(() => {
    if (events.length > 0 && !events.some((e) => e.id === selectedEventId)) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const organizerName = branding?.organizationName?.trim() || 'PRESENZA';

  // Automatically generate ParticipationCertificateRecord for every checked-in participant of the selected event
  const allEventParticipationCerts = useMemo<
    ParticipationCertificateRecord[]
  >(() => {
    if (!selectedEvent) return [];
    const recs = attendances.filter((a) => a.eventId === selectedEvent.id);
    const todayYmd = formatLocalDateYmd(new Date());
    const evDate = /^\d{4}-\d{2}-\d{2}$/.test(selectedEvent.eventDate)
      ? selectedEvent.eventDate
      : todayYmd;

    return recs.map((rec) => ({
      certificateNumber: buildParticipationCertificateNumber(
        selectedEvent.id,
        rec.id,
        evDate
      ),
      attendanceId: rec.id,
      eventId: selectedEvent.id,
      eventTitle: selectedEvent.title,
      eventDate: evDate,
      eventVenue: selectedEvent.venue || '',
      cityName:
        selectedEvent.city?.trim() ||
        participationTemplate.cityName?.trim() ||
        'Jakarta',
      picPdTitle:
        selectedEvent.picTitle?.trim() ||
        participationTemplate.picPdTitle?.trim() ||
        'PIC of Professional Development',
      picPdName:
        selectedEvent.picName?.trim() ||
        participationTemplate.picPdName?.trim() ||
        '',
      principalName:
        selectedEvent.principalName?.trim() ||
        participationTemplate.principalName?.trim() ||
        '',
      eventTopic: selectedEvent.topic?.trim() || selectedEvent.category || '',
      facilitators: selectedEvent.facilitators?.trim() || '',
      organizerName,
      participantName: rec.fullName,
      participantDepartment: rec.classDepartment || '',
      participantEmail: rec.participantEmail || '',
      checkInTime: rec.checkInTime || '',
      attendanceStatus: rec.status,
      issueDate: /^\d{4}-\d{2}-\d{2}$/.test(rec.attendanceDate)
        ? rec.attendanceDate
        : evDate,
    }));
  }, [selectedEvent, attendances, organizerName, participationTemplate]);

  const filteredCerts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allEventParticipationCerts;
    return allEventParticipationCerts.filter((c) => {
      const hay =
        `${c.participantName} ${c.participantDepartment} ${c.participantEmail} ${c.certificateNumber}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allEventParticipationCerts, searchQuery]);

  const targetDownloadCerts = useMemo(() => {
    if (selectedIds.size === 0) return filteredCerts;
    return filteredCerts.filter((c) => selectedIds.has(c.attendanceId));
  }, [filteredCerts, selectedIds]);

  const activeDownloadLanguage: ParticipationLanguageFormat | undefined =
    overrideLang === 'template' ? undefined : overrideLang;

  const effectiveLanguageLabel = useMemo(() => {
    const lang =
      overrideLang === 'template' ? participationTemplate.languageFormat : overrideLang;
    return (
      LANGUAGE_OPTIONS.find((opt) => opt.value === lang)?.shortLabel ||
      'Bilingual'
    );
  }, [overrideLang, participationTemplate.languageFormat]);

  const togglePickRow = (attendanceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(attendanceId)) next.delete(attendanceId);
      else next.add(attendanceId);
      return next;
    });
  };

  const handleToggleSelectAllFiltered = () => {
    if (
      filteredCerts.length > 0 &&
      filteredCerts.every((c) => selectedIds.has(c.attendanceId))
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCerts.map((c) => c.attendanceId)));
    }
  };

  // Studio asset upload handlers
  const handleUploadCustomLogo = async (file: File) => {
    setTemplateError(null);
    setProcessingAsset(true);
    try {
      const dataUrl = await compressLogoFile(file);
      if (dataUrl.length > 320_000) {
        setTemplateError('Compressed logo is still too large. Please pick a smaller image.');
        return;
      }
      setDraft((prev) => ({ ...prev, customLogoDataUrl: dataUrl }));
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : 'Failed to process logo file.'
      );
    } finally {
      setProcessingAsset(false);
    }
  };

  const handleUploadBgPhoto = async (file: File) => {
    setTemplateError(null);
    setProcessingAsset(true);
    try {
      const dataUrl = await compressCertificateBackground(file);
      setDraft((prev) => ({ ...prev, backgroundDataUrl: dataUrl }));
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : 'Failed to process background photo.'
      );
    } finally {
      setProcessingAsset(false);
    }
  };

  const handleUploadSignature = async (
    role: 'picPd' | 'principal',
    file: File
  ) => {
    setTemplateError(null);
    setProcessingAsset(true);
    try {
      const dataUrl = await compressSignatureFile(file);
      setDraft((prev) => ({
        ...prev,
        ...(role === 'picPd'
          ? { picPdSignatureDataUrl: dataUrl }
          : { principalSignatureDataUrl: dataUrl }),
      }));
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : 'Failed to process signature image.'
      );
    } finally {
      setProcessingAsset(false);
    }
  };

  const handleStartDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    isDrawingRef.current = true;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height
    );
  };

  const handleMoveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(
      ((e.clientX - rect.left) / rect.width) * canvas.width,
      ((e.clientY - rect.top) / rect.height) * canvas.height
    );
    ctx.stroke();
  };

  const handleEndDraw = () => {
    isDrawingRef.current = false;
  };

  const handleClearDrawCanvas = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleApplyDrawnSignature = () => {
    const canvas = drawCanvasRef.current;
    if (!canvas || !drawingRole) return;
    setTemplateError(null);
    try {
      const dataUrl = compressSignatureCanvas(canvas);
      setDraft((prev) => ({
        ...prev,
        ...(drawingRole === 'picPd'
          ? { picPdSignatureDataUrl: dataUrl }
          : { principalSignatureDataUrl: dataUrl }),
      }));
      setDrawingRole(null);
    } catch (err) {
      setTemplateError(
        err instanceof Error ? err.message : 'Please draw a signature first.'
      );
    }
  };

  const handleCopyFromRecognitionStudio = () => {
    setDraft((prev) => ({
      ...prev,
      orientation: recognitionTemplate.orientation,
      fontFamily: recognitionTemplate.fontFamily,
      primaryColor: recognitionTemplate.primaryColor,
      accentColor: recognitionTemplate.accentColor,
      paperColor: recognitionTemplate.paperColor,
      customLogoDataUrl: recognitionTemplate.customLogoDataUrl || prev.customLogoDataUrl,
      backgroundDataUrl: certificateSettings.backgroundDataUrl || prev.backgroundDataUrl,
      backgroundOpacity:
        typeof certificateSettings.backgroundOpacity === 'number'
          ? certificateSettings.backgroundOpacity
          : prev.backgroundOpacity,
      cityName:
        recognitionTemplate.cityName ||
        certificateSettings.cityName ||
        prev.cityName,
      picPdName: recognitionTemplate.picPdName || certificateSettings.picPdName || prev.picPdName,
      picPdTitle:
        recognitionTemplate.picPdTitle ||
        certificateSettings.picPdTitle ||
        prev.picPdTitle,
      picPdSignatureDataUrl:
        recognitionTemplate.picPdSignatureDataUrl ||
        certificateSettings.facilitatorSignatureDataUrl ||
        prev.picPdSignatureDataUrl,
      principalName:
        recognitionTemplate.principalName ||
        certificateSettings.principalName ||
        prev.principalName,
      principalTitle:
        recognitionTemplate.principalTitle ||
        certificateSettings.principalTitle ||
        prev.principalTitle,
      principalSignatureDataUrl:
        recognitionTemplate.principalSignatureDataUrl ||
        certificateSettings.principalSignatureDataUrl ||
        prev.principalSignatureDataUrl,
    }));
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTemplateError(null);
    setTemplateSaved(false);

    const normalized = mergeParticipationTemplate(draft);
    if (normalized.titleEn.trim().length < 2 || normalized.titleId.trim().length < 2) {
      setTemplateError('Both English and Bahasa certificate titles must be at least 2 characters.');
      return;
    }
    if (normalized.wordingEn.trim().length < 5 || normalized.wordingId.trim().length < 5) {
      setTemplateError('Both English and Bahasa wording templates must be at least 5 characters.');
      return;
    }

    setSavingTemplate(true);
    try {
      await setDoc(doc(db, 'participationTemplates', 'default'), {
        languageFormat: normalized.languageFormat,
        orientation: normalized.orientation,
        fontFamily: normalized.fontFamily,
        primaryColor: normalized.primaryColor,
        accentColor: normalized.accentColor,
        paperColor: normalized.paperColor,
        titleEn: normalized.titleEn.trim().slice(0, 120),
        titleId: normalized.titleId.trim().slice(0, 120),
        subtitleEn: normalized.subtitleEn.trim().slice(0, 140),
        subtitleId: normalized.subtitleId.trim().slice(0, 140),
        wordingEn: normalized.wordingEn.trim().slice(0, 600),
        wordingId: normalized.wordingId.trim().slice(0, 600),
        cityName: normalized.cityName.trim().slice(0, 80) || 'Jakarta',
        customLogoDataUrl: normalized.customLogoDataUrl || '',
        backgroundDataUrl: normalized.backgroundDataUrl || '',
        backgroundOpacity: normalized.backgroundOpacity,
        picPdName: normalized.picPdName.trim().slice(0, 120),
        picPdTitle:
          normalized.picPdTitle.trim().slice(0, 120) ||
          'PIC of Professional Development',
        picPdSignatureDataUrl: normalized.picPdSignatureDataUrl || '',
        principalName: normalized.principalName.trim().slice(0, 120),
        principalTitle:
          normalized.principalTitle.trim().slice(0, 120) || 'Principal',
        principalSignatureDataUrl: normalized.principalSignatureDataUrl || '',
        showTopic: Boolean(normalized.showTopic),
        showCertificateId: Boolean(normalized.showCertificateId),
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });

      // Synchronize City & Signatories across Big 5 & Recognition Certificate Templates
      const cleanCity = normalized.cityName.trim().slice(0, 80) || 'Jakarta';
      const cleanPicName = normalized.picPdName.trim().slice(0, 120);
      const cleanPicTitle =
        normalized.picPdTitle.trim().slice(0, 120) ||
        'PIC of Professional Development';
      const cleanPrincipalName = normalized.principalName.trim().slice(0, 120);
      const cleanPrincipalTitle =
        normalized.principalTitle.trim().slice(0, 120) || 'Principal';

      const syncedBig5 = mergeCertificateSettings({
        ...certificateSettings,
        cityName: cleanCity,
        picPdName: cleanPicName,
        picPdTitle: cleanPicTitle,
        principalName: cleanPrincipalName,
        principalTitle: cleanPrincipalTitle,
        facilitatorSignatureDataUrl: normalized.picPdSignatureDataUrl || '',
        principalSignatureDataUrl: normalized.principalSignatureDataUrl || '',
      });
      const syncedRecognition = mergeRecognitionTemplate({
        ...recognitionTemplate,
        cityName: cleanCity,
        picPdName: cleanPicName,
        picPdTitle: cleanPicTitle,
        signatoryLabel: cleanPicTitle,
        picPdSignatureDataUrl: normalized.picPdSignatureDataUrl || '',
        principalName: cleanPrincipalName,
        principalTitle: cleanPrincipalTitle,
        principalSignatureDataUrl: normalized.principalSignatureDataUrl || '',
      });

      await Promise.all([
        setDoc(doc(db, 'certificateSettings', 'default'), {
          ...syncedBig5,
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        }),
        setDoc(doc(db, 'recognitionTemplates', 'default'), {
          ...syncedRecognition,
          signatureDataUrl: '',
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        }),
      ]);

      setTemplateSaved(true);
      window.setTimeout(() => setTemplateSaved(false), 3000);
    } catch (error) {
      setTemplateError(
        'Could not save Participation Certificate template. Check permissions or image sizes.'
      );
      handleFirestoreError(
        error,
        OperationType.WRITE,
        'participationTemplates/default'
      );
    } finally {
      setSavingTemplate(false);
    }
  };

  // Sample record for Studio live preview
  const samplePreviewCert: ParticipationCertificateRecord = useMemo(() => {
    if (allEventParticipationCerts[0]) return allEventParticipationCerts[0];
    const ev = selectedEvent ?? events[0];
    const todayYmd = formatLocalDateYmd(new Date());
    return {
      certificateNumber: buildParticipationCertificateNumber(
        ev?.id || 'sample-event',
        'sample-att',
        ev?.eventDate || todayYmd
      ),
      attendanceId: 'sample-att',
      eventId: ev?.id || 'sample-event',
      eventTitle: ev?.title || 'Teacher Professional Development Workshop',
      eventDate: ev?.eventDate || todayYmd,
      eventVenue: ev?.venue || 'Main Conference Hall',
      cityName: ev?.city?.trim() || draft.cityName?.trim() || 'Jakarta',
      picPdTitle:
        ev?.picTitle?.trim() ||
        draft.picPdTitle?.trim() ||
        'PIC of Professional Development',
      picPdName: ev?.picName?.trim() || draft.picPdName?.trim() || '',
      principalName:
        ev?.principalName?.trim() || draft.principalName?.trim() || '',
      eventTopic:
        ev?.topic?.trim() || ev?.category || 'Instructional Leadership',
      facilitators: ev?.facilitators?.trim() || 'Ms. Elena Vance',
      organizerName,
      participantName: 'Sarah Jenkins, M.Pd.',
      participantDepartment: 'Grade 4 Homeroom',
      participantEmail: '',
      checkInTime: '07:45:00',
      attendanceStatus: 'On Time',
      issueDate: ev?.eventDate || todayYmd,
    };
  }, [
    allEventParticipationCerts,
    selectedEvent,
    events,
    organizerName,
    draft.cityName,
    draft.picPdTitle,
    draft.picPdName,
    draft.principalName,
  ]);

  return (
    <div className="space-y-6">
      {/* Sub-navigation bar inside Participation Certificates */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              Certificate of Participation (Automatic for All Participants)
            </h3>
            <span className="text-xs font-semibold text-blue-700">
              ·{' '}
              {LANGUAGE_OPTIONS.find(
                (o) => o.value === participationTemplate.languageFormat
              )?.shortLabel || 'Bilingual'}
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">
            Every checked-in participant automatically receives a Certificate of Participation right after check-in, and admins can download all participants&rsquo; certificates in one PDF.
          </p>
        </div>

        <div
          className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1 self-start lg:self-auto shrink-0"
          role="tablist"
          aria-label="Participation certificate sub-views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={innerTab === 'roster'}
            onClick={() => setInnerTab('roster')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              innerTab === 'roster'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-blue-700" />
            <span>Download All Participants</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={innerTab === 'customize'}
            onClick={() => setInnerTab('customize')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              innerTab === 'customize'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-amber-700" />
            <span>Customize EN / Bahasa Template</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: DOWNLOAD ALL PARTICIPANTS' CERTIFICATES */}
      {innerTab === 'roster' && (
        <div className="space-y-5">
          {/* Event Selector & Batch Actions */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              <div className="lg:col-span-5">
                <label
                  htmlFor="part-event-select"
                  className="block text-xs font-bold uppercase tracking-wider text-blue-700 mb-1.5"
                >
                  Choose Event (Ongoing &amp; Ended)
                </label>
                <select
                  id="part-event-select"
                  value={selectedEventId}
                  onChange={(e) => {
                    setSelectedEventId(e.target.value);
                    setSelectedIds(new Set());
                    setSearchQuery('');
                  }}
                  className="w-full min-h-[42px] px-3.5 py-2 text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {events.length === 0 && (
                    <option value="">No events created yet</option>
                  )}
                  {events.map((ev) => {
                    const count = attendances.filter(
                      (a) => a.eventId === ev.id
                    ).length;
                    return (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.eventDate}) · {count} participant
                        {count === 1 ? '' : 's'}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="lg:col-span-3">
                <label
                  htmlFor="part-lang-override"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  PDF Language Format
                </label>
                <select
                  id="part-lang-override"
                  value={overrideLang}
                  onChange={(e) =>
                    setOverrideLang(
                      e.target.value as 'template' | ParticipationLanguageFormat
                    )
                  }
                  className="w-full min-h-[42px] px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="template">
                    Template Default (
                    {LANGUAGE_OPTIONS.find(
                      (o) => o.value === participationTemplate.languageFormat
                    )?.shortLabel || 'Bilingual'}
                    )
                  </option>
                  <option value="bilingual">Bilingual (English &amp; Bahasa)</option>
                  <option value="english">English Only</option>
                  <option value="bahasa">Bahasa Indonesia Only</option>
                </select>
              </div>

              <div className="lg:col-span-4 flex flex-wrap items-center lg:justify-end gap-2">
                <button
                  type="button"
                  disabled={targetDownloadCerts.length === 0}
                  onClick={() =>
                    downloadParticipationCertificatesPdf(
                      targetDownloadCerts,
                      participationTemplate,
                      branding,
                      selectedEvent?.title,
                      activeDownloadLanguage
                    )
                  }
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-45"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {selectedIds.size > 0
                      ? `Download Selected (${targetDownloadCerts.length}) PDF`
                      : `Download All (${targetDownloadCerts.length}) PDF`}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={targetDownloadCerts.length === 0}
                  onClick={() =>
                    printParticipationCertificatesPdf(
                      targetDownloadCerts,
                      participationTemplate,
                      branding,
                      activeDownloadLanguage
                    )
                  }
                  className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-45"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print All</span>
                </button>
              </div>
            </div>

            {selectedEvent && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div>
                  <div className="text-slate-500 font-medium">Event Date</div>
                  <div className="font-mono-tabular font-bold text-slate-900 mt-0.5">
                    {selectedEvent.eventDate}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-medium">Location</div>
                  <div className="font-bold text-slate-900 truncate mt-0.5">
                    {formatEventLocation(selectedEvent.venue, selectedEvent.city)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-medium">Topic</div>
                  <div className="font-bold text-slate-900 truncate mt-0.5">
                    {selectedEvent.topic?.trim() || selectedEvent.category}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-medium">Format</div>
                  <div className="font-bold text-blue-800 truncate mt-0.5">
                    {effectiveLanguageLabel}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500 font-medium">
                    Auto-Ready Certificates
                  </div>
                  <div className="font-mono-tabular font-bold text-emerald-700 mt-0.5">
                    {allEventParticipationCerts.length} participant
                    {allEventParticipationCerts.length === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Participant Auto-Certificate Table */}
          {selectedEvent ? (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter checked-in participants by name, class, or certificate no..."
                    className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    disabled={filteredCerts.length === 0}
                    onClick={handleToggleSelectAllFiltered}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 disabled:opacity-45"
                  >
                    {filteredCerts.length > 0 &&
                    filteredCerts.every((c) => selectedIds.has(c.attendanceId))
                      ? 'Deselect All'
                      : `Select All (${filteredCerts.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInnerTab('customize')}
                    className="min-h-[34px] px-3 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 font-semibold text-amber-900 inline-flex items-center gap-1"
                  >
                    <Languages className="w-3.5 h-3.5" />
                    <span>Edit EN / Bahasa Template</span>
                  </button>
                </div>
              </div>

              {filteredCerts.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <Award className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-sm font-semibold text-slate-900">
                    {allEventParticipationCerts.length === 0
                      ? `No participants have checked in for "${selectedEvent.title}" yet`
                      : 'No participants match your search filter'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Once participants scan the check-in QR code, their Certificates of Participation are generated automatically here and on their check-in receipt.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4 w-10">Pick</th>
                        <th className="py-3 px-4">Certificate No.</th>
                        <th className="py-3 px-4">Participant</th>
                        <th className="py-3 px-4">
                          {selectedEvent.departmentLabel?.trim() ||
                            'Class / Dept / School / City'}
                        </th>
                        <th className="py-3 px-4">Check-In</th>
                        <th className="py-3 px-4 text-right">Certificate Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCerts.map((cert) => {
                        const checked = selectedIds.has(cert.attendanceId);
                        return (
                          <tr
                            key={cert.attendanceId}
                            className={`transition-colors ${
                              checked ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'
                            }`}
                          >
                            <td className="py-2.5 px-4">
                              <button
                                type="button"
                                onClick={() => togglePickRow(cert.attendanceId)}
                                aria-label={`Select ${cert.participantName}`}
                                className="text-slate-500 hover:text-blue-700"
                              >
                                {checked ? (
                                  <CheckSquare className="w-4 h-4 text-blue-700" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td className="py-2.5 px-4 font-mono-tabular text-xs font-bold text-slate-800 whitespace-nowrap">
                              {cert.certificateNumber}
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="font-semibold text-slate-900">
                                {cert.participantName}
                              </div>
                              {cert.participantEmail && (
                                <div className="text-[11px] text-slate-500">
                                  {cert.participantEmail}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-700">
                              {cert.participantDepartment || '—'}
                            </td>
                            <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                              <span
                                className={`font-semibold ${
                                  cert.attendanceStatus === 'On Time'
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {cert.attendanceStatus}
                              </span>
                              <span aria-hidden="true" className="mx-1.5 text-slate-300">
                                ·
                              </span>
                              <span className="font-mono-tabular text-slate-500">
                                {cert.checkInTime}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setPreviewRecord(cert)}
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1"
                                >
                                  <Eye className="w-3.5 h-3.5 text-blue-700" />
                                  <span>Preview</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadParticipationCertificatesPdf(
                                      [cert],
                                      participationTemplate,
                                      branding,
                                      undefined,
                                      activeDownloadLanguage
                                    )
                                  }
                                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>PDF</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    printParticipationCertificatesPdf(
                                      [cert],
                                      participationTemplate,
                                      branding,
                                      activeDownloadLanguage
                                    )
                                  }
                                  className="min-h-[34px] min-w-[34px] rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 inline-flex items-center justify-center"
                                  aria-label={`Print certificate ${cert.certificateNumber}`}
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <section className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
              <CalendarDays className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">
                No Events Created Yet
              </p>
              <p className="text-xs text-slate-500">
                Create an event session first; checked-in participants will automatically appear here with ready-to-download Certificates of Participation.
              </p>
            </section>
          )}
        </div>
      )}

      {/* VIEW 2: CUSTOMIZE PARTICIPATION TEMPLATE (ENGLISH / BAHASA / BILINGUAL) */}
      {innerTab === 'customize' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Controls */}
          <form
            onSubmit={handleSaveTemplate}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5"
          >
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  Participation Template Studio
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Saved changes apply immediately to all participants&rsquo; auto-certificates and batch PDFs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraft({ ...DEFAULT_PARTICIPATION_TEMPLATE })}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            </div>

            {/* Section Tabs */}
            <div
              className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl"
              role="group"
              aria-label="Participation studio sections"
            >
              {(
                [
                  { id: 'format', label: 'Language & Format' },
                  { id: 'wording', label: 'EN & Bahasa Text' },
                  { id: 'design', label: 'Design & Signatories' },
                ] as const
              ).map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setStudioSection(sec.id)}
                  className={`min-h-[36px] px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap ${
                    studioSection === sec.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </div>

            {/* Section 1: Language Format + Layout */}
            {studioSection === 'format' && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-bold text-slate-800 mb-2 inline-flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-700" />
                    <span>Default Certificate Language Format</span>
                  </div>
                  <div className="space-y-2">
                    {LANGUAGE_OPTIONS.map((opt) => {
                      const active = draft.languageFormat === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              languageFormat: opt.value,
                            }))
                          }
                          aria-pressed={active}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50/70'
                              : 'border-slate-200 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {opt.label}
                            </span>
                            {active && (
                              <Check className="w-4 h-4 text-blue-700 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {opt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                  <div>
                    <div className="text-xs font-semibold text-slate-700 mb-1.5">
                      Page Orientation
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                      {(['landscape', 'portrait'] as const).map((orient) => (
                        <button
                          key={orient}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              orientation: orient,
                            }))
                          }
                          className={`min-h-[34px] rounded-lg text-xs font-semibold capitalize transition-colors ${
                            draft.orientation === orient
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {orient}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="part-font-select"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Typography Font
                    </label>
                    <select
                      id="part-font-select"
                      value={draft.fontFamily}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          fontFamily: e.target.value as RecognitionFontFamily,
                        }))
                      }
                      className="w-full min-h-[40px] px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-900"
                    >
                      <option value="times">Classic Serif (Times)</option>
                      <option value="helvetica">Clean Sans (Helvetica)</option>
                      <option value="courier">Archival Mono (Courier)</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-4 text-xs font-medium text-slate-700">
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={draft.showTopic}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          showTopic: e.target.checked,
                        }))
                      }
                    />
                    <span>Show Topic / Topik</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={draft.showCertificateId}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          showCertificateId: e.target.checked,
                        }))
                      }
                    />
                    <span>Show Certificate No. &amp; Issued Date</span>
                  </label>
                </div>
              </div>
            )}

            {/* Section 2: 6 Wording Presets + English & Bahasa Headings/Body */}
            {studioSection === 'wording' && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-bold text-slate-800 mb-1">
                    6 Bilingual Wording Presets (English &amp; Bahasa)
                  </div>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Pick a preset to update both English and Bahasa paragraphs at once, then customize freely below.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {PARTICIPATION_WORDING_PRESETS.map((preset) => {
                      const active =
                        draft.wordingEn.trim() === preset.wordingEn.trim() &&
                        draft.wordingId.trim() === preset.wordingId.trim();
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              wordingEn: preset.wordingEn,
                              wordingId: preset.wordingId,
                            }))
                          }
                          aria-pressed={active}
                          className={`text-left px-2.5 py-2 rounded-lg border transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50/70 text-blue-950'
                              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="text-[11px] font-semibold leading-tight truncate">
                            {preset.label}
                          </div>
                          <div className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-1">
                            {preset.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* English Fields */}
                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <div className="text-xs font-bold text-blue-800">
                    English Version
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="part-title-en"
                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                      >
                        Title (EN)
                      </label>
                      <input
                        id="part-title-en"
                        type="text"
                        maxLength={120}
                        value={draft.titleEn}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, titleEn: e.target.value }))
                        }
                        className="w-full min-h-[36px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="part-subtitle-en"
                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                      >
                        Subtitle (EN)
                      </label>
                      <input
                        id="part-subtitle-en"
                        type="text"
                        maxLength={140}
                        value={draft.subtitleEn}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            subtitleEn: e.target.value,
                          }))
                        }
                        className="w-full min-h-[36px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="part-wording-en"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Body Wording (EN)
                    </label>
                    <textarea
                      id="part-wording-en"
                      rows={2}
                      maxLength={600}
                      value={draft.wordingEn}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          wordingEn: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <div className="mt-1 flex flex-wrap gap-1">
                      {PLACEHOLDER_TOKENS.map((tok) => (
                        <button
                          key={`en-${tok}`}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              wordingEn: `${prev.wordingEn} ${tok}`.slice(0, 600),
                            }))
                          }
                          className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                        >
                          +{tok}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bahasa Indonesia Fields */}
                <div className="pt-3 border-t border-slate-200 space-y-2.5">
                  <div className="text-xs font-bold text-amber-800">
                    Bahasa Indonesia Version
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="part-title-id"
                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                      >
                        Judul Sertifikat (ID)
                      </label>
                      <input
                        id="part-title-id"
                        type="text"
                        maxLength={120}
                        value={draft.titleId}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, titleId: e.target.value }))
                        }
                        className="w-full min-h-[36px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="part-subtitle-id"
                        className="block text-[11px] font-semibold text-slate-700 mb-1"
                      >
                        Subjudul (ID)
                      </label>
                      <input
                        id="part-subtitle-id"
                        type="text"
                        maxLength={140}
                        value={draft.subtitleId}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            subtitleId: e.target.value,
                          }))
                        }
                        className="w-full min-h-[36px] px-2.5 py-1 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="part-wording-id"
                      className="block text-[11px] font-semibold text-slate-700 mb-1"
                    >
                      Teks Sertifikat (ID)
                    </label>
                    <textarea
                      id="part-wording-id"
                      rows={2}
                      maxLength={600}
                      value={draft.wordingId}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          wordingId: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                    <div className="mt-1 flex flex-wrap gap-1">
                      {PLACEHOLDER_TOKENS.map((tok) => (
                        <button
                          key={`id-${tok}`}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              wordingId: `${prev.wordingId} ${tok}`.slice(0, 600),
                            }))
                          }
                          className="text-[10px] font-mono-tabular px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                        >
                          +{tok}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Colors, Background, Logo, City & Signatories */}
            {studioSection === 'design' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <span className="text-xs font-semibold text-slate-700">
                    Match Recognition Studio Style
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyFromRecognitionStudio}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-[11px] font-semibold text-blue-800 inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Copy Theme, Logo &amp; Signatories</span>
                  </button>
                </div>

                {/* Theme Presets & Color Pickers */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700">
                    Theme Presets &amp; Colors
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STUDIO_COLOR_PRESETS.map((preset) => {
                      const active =
                        draft.primaryColor.toLowerCase() ===
                          preset.primaryColor.toLowerCase() &&
                        draft.accentColor.toLowerCase() ===
                          preset.accentColor.toLowerCase();
                      return (
                        <button
                          key={preset.themeId}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              primaryColor: preset.primaryColor,
                              accentColor: preset.accentColor,
                              paperColor: preset.paperColor,
                            }))
                          }
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 ${
                            active
                              ? 'border-blue-600 bg-blue-50 text-blue-900'
                              : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-slate-300 shrink-0"
                            style={{ backgroundColor: preset.primaryColor }}
                          />
                          <span>{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <label className="text-[11px] text-slate-600 font-medium space-y-1">
                      <span>Primary</span>
                      <input
                        type="color"
                        value={draft.primaryColor}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            primaryColor: e.target.value,
                          }))
                        }
                        className="w-full h-9 rounded-lg border border-slate-300 cursor-pointer"
                      />
                    </label>
                    <label className="text-[11px] text-slate-600 font-medium space-y-1">
                      <span>Accent</span>
                      <input
                        type="color"
                        value={draft.accentColor}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            accentColor: e.target.value,
                          }))
                        }
                        className="w-full h-9 rounded-lg border border-slate-300 cursor-pointer"
                      />
                    </label>
                    <label className="text-[11px] text-slate-600 font-medium space-y-1">
                      <span>Paper</span>
                      <input
                        type="color"
                        value={draft.paperColor}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            paperColor: e.target.value,
                          }))
                        }
                        className="w-full h-9 rounded-lg border border-slate-300 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {/* Hidden asset file inputs */}
                <input
                  ref={logoUploadRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleUploadCustomLogo(file);
                  }}
                  className="hidden"
                />
                <input
                  ref={bgUploadRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleUploadBgPhoto(file);
                  }}
                  className="hidden"
                />
                <input
                  ref={picPdSigUploadRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleUploadSignature('picPd', file);
                  }}
                  className="hidden"
                />
                <input
                  ref={principalSigUploadRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleUploadSignature('principal', file);
                  }}
                  className="hidden"
                />

                {/* Logo & Watermark */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Institution Logo
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={processingAsset}
                        onClick={() => logoUploadRef.current?.click()}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-blue-700" />
                        <span>
                          {draft.customLogoDataUrl ? 'Change Logo' : 'Upload Logo'}
                        </span>
                      </button>
                      {draft.customLogoDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              customLogoDataUrl: '',
                            }))
                          }
                          className="min-h-[32px] px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700"
                        >
                          Use Default
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Background Photo / Watermark
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={processingAsset}
                        onClick={() => bgUploadRef.current?.click()}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"
                      >
                        <ImagePlus className="w-3.5 h-3.5 text-blue-700" />
                        <span>
                          {draft.backgroundDataUrl ? 'Change Photo' : 'Upload Photo'}
                        </span>
                      </button>
                      {draft.backgroundDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              backgroundDataUrl: '',
                            }))
                          }
                          className="min-h-[32px] px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {draft.backgroundDataUrl && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                        <span>Background Opacity</span>
                        <span className="font-mono-tabular font-bold">
                          {draft.backgroundOpacity}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={85}
                        value={draft.backgroundOpacity}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            backgroundOpacity: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-blue-700"
                      />
                    </div>
                  )}
                </div>

                {/* City & Signatories */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div>
                    <label
                      htmlFor="part-city-input"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      City Above Principal Signature
                    </label>
                    <input
                      id="part-city-input"
                      type="text"
                      maxLength={80}
                      value={draft.cityName}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, cityName: e.target.value }))
                      }
                      placeholder="Jakarta"
                      className="w-full min-h-[36px] px-3 py-1.5 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>

                  {(
                    [
                      {
                        role: 'picPd' as const,
                        heading: '1. PIC of Professional Development',
                        nameValue: draft.picPdName,
                        titleValue: draft.picPdTitle,
                        sigUrl: draft.picPdSignatureDataUrl,
                        uploadRef: picPdSigUploadRef,
                        onName: (v: string) =>
                          setDraft((p) => ({ ...p, picPdName: v })),
                        onTitle: (v: string) =>
                          setDraft((p) => ({ ...p, picPdTitle: v })),
                        onClear: () =>
                          setDraft((p) => ({ ...p, picPdSignatureDataUrl: '' })),
                      },
                      {
                        role: 'principal' as const,
                        heading: '2. Principal',
                        nameValue: draft.principalName,
                        titleValue: draft.principalTitle,
                        sigUrl: draft.principalSignatureDataUrl,
                        uploadRef: principalSigUploadRef,
                        onName: (v: string) =>
                          setDraft((p) => ({ ...p, principalName: v })),
                        onTitle: (v: string) =>
                          setDraft((p) => ({ ...p, principalTitle: v })),
                        onClear: () =>
                          setDraft((p) => ({
                            ...p,
                            principalSignatureDataUrl: '',
                          })),
                      },
                    ] as const
                  ).map((sig) => (
                    <div
                      key={sig.role}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          {sig.heading}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => sig.uploadRef.current?.click()}
                            className="min-h-[30px] px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1"
                          >
                            <ImagePlus className="w-3 h-3 text-blue-700" />
                            <span>Upload</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDrawingRole((prev) =>
                                prev === sig.role ? null : sig.role
                              );
                              window.setTimeout(() => handleClearDrawCanvas(), 0);
                            }}
                            className="min-h-[30px] px-2 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1"
                          >
                            <PenTool className="w-3 h-3 text-blue-700" />
                            <span>Draw</span>
                          </button>
                          {sig.sigUrl && (
                            <button
                              type="button"
                              onClick={sig.onClear}
                              className="min-h-[30px] px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-700"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>

                      {sig.sigUrl && (
                        <div className="h-12 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center p-1 overflow-hidden">
                          <img
                            src={sig.sigUrl}
                            alt={`${sig.heading} signature`}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      )}

                      {drawingRole === sig.role && (
                        <div className="rounded-lg border border-blue-200 bg-white p-2 space-y-2">
                          <canvas
                            ref={drawCanvasRef}
                            width={360}
                            height={110}
                            onPointerDown={handleStartDraw}
                            onPointerMove={handleMoveDraw}
                            onPointerUp={handleEndDraw}
                            onPointerLeave={handleEndDraw}
                            className="w-full h-24 bg-slate-50 border border-slate-300 rounded-md touch-none cursor-crosshair"
                          />
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setDrawingRole(null)}
                              className="text-[11px] font-semibold text-slate-500 hover:text-slate-900"
                            >
                              Cancel
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={handleClearDrawCanvas}
                                className="min-h-[28px] px-2 py-1 rounded-md border border-slate-300 text-[11px] font-semibold text-slate-700"
                              >
                                Clear
                              </button>
                              <button
                                type="button"
                                onClick={handleApplyDrawnSignature}
                                className="min-h-[28px] px-2.5 py-1 rounded-md bg-blue-700 text-white text-[11px] font-semibold"
                              >
                                Apply Signature
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          maxLength={120}
                          value={sig.nameValue}
                          onChange={(e) => sig.onName(e.target.value)}
                          placeholder="Signatory full name"
                          className="min-h-[34px] px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                        <input
                          type="text"
                          maxLength={120}
                          value={sig.titleValue}
                          onChange={(e) => sig.onTitle(e.target.value)}
                          placeholder="Role title"
                          className="min-h-[34px] px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {templateError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
                {templateError}
              </div>
            )}
            {templateSaved && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 font-semibold flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4" />
                <span>
                  Participation template saved &amp; synced to all participants.
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={savingTemplate || processingAsset}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {savingTemplate ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>
                {savingTemplate ? 'Saving Template...' : 'Save Participation Template'}
              </span>
            </button>
          </form>

          {/* Right Live Preview */}
          <div className="lg:col-span-7 bg-slate-100 border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4 lg:sticky lg:top-20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Live Participation Preview ({draft.orientation.toUpperCase()} ·{' '}
                {LANGUAGE_OPTIONS.find((o) => o.value === draft.languageFormat)
                  ?.shortLabel || 'Bilingual'}
                )
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadParticipationCertificatesPdf(
                    [samplePreviewCert],
                    draft,
                    branding,
                    'sample-preview'
                  )
                }
                className="min-h-[32px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-blue-700" />
                <span>Test Sample PDF</span>
              </button>
            </div>

            <ParticipationCertificateCanvas
              template={draft}
              branding={branding}
              participantName={samplePreviewCert.participantName}
              participantDepartment={samplePreviewCert.participantDepartment}
              eventTitle={samplePreviewCert.eventTitle}
              eventDate={samplePreviewCert.eventDate}
              eventVenue={samplePreviewCert.eventVenue}
              eventTopic={samplePreviewCert.eventTopic}
              facilitators={samplePreviewCert.facilitators}
              certificateNumber={samplePreviewCert.certificateNumber}
              issueDate={samplePreviewCert.issueDate}
              cityName={draft.cityName}
              overridePicPdName={draft.picPdName}
              overridePicPdTitle={draft.picPdTitle}
              overridePrincipalName={draft.principalName}
            />
          </div>
        </div>
      )}

      {/* Individual Certificate Preview Modal */}
      {previewRecord && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Certificate of Participation Preview"
        >
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl my-auto">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate">
                  {previewRecord.participantName}
                </div>
                <div className="text-xs font-mono-tabular text-slate-500">
                  {previewRecord.certificateNumber} · {previewRecord.eventTitle}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                aria-label="Close certificate preview"
                className="min-h-[36px] min-w-[36px] rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 sm:p-6 bg-slate-100">
              <ParticipationCertificateCanvas
                template={participationTemplate}
                branding={branding}
                participantName={previewRecord.participantName}
                participantDepartment={previewRecord.participantDepartment}
                eventTitle={previewRecord.eventTitle}
                eventDate={previewRecord.eventDate}
                eventVenue={previewRecord.eventVenue}
                eventTopic={previewRecord.eventTopic}
                facilitators={previewRecord.facilitators}
                certificateNumber={previewRecord.certificateNumber}
                issueDate={previewRecord.issueDate}
                overrideLanguage={activeDownloadLanguage}
                cityName={previewRecord.cityName}
                overridePicPdName={previewRecord.picPdName}
                overridePicPdTitle={previewRecord.picPdTitle}
                overridePrincipalName={previewRecord.principalName}
              />
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  printParticipationCertificatesPdf(
                    [previewRecord],
                    participationTemplate,
                    branding,
                    activeDownloadLanguage
                  )
                }
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadParticipationCertificatesPdf(
                    [previewRecord],
                    participationTemplate,
                    branding,
                    undefined,
                    activeDownloadLanguage
                  )
                }
                className="min-h-[38px] px-4 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
