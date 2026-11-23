import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  ImagePlus,
  Loader2,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  MonitorPlay,
  Paperclip,
  PauseCircle,
  Pin,
  PlayCircle,
  Printer,
  Sparkles,
  Star,
  ThumbsUp,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  AttendanceRecord,
  EventRecord,
  FeedbackConfig,
  FeedbackSubmissionRecord,
  OrganizationBranding,
} from '../types';
import {
  evaluateFeedbackSchedule,
  formatEventLocation,
  formatScheduleDateTime,
  mergeFeedbackConfig,
} from '../utils/feedbackAndRecognitionDefaults';
import {
  downloadFeedbackReportPdf,
  downloadRecapitulationPdf,
} from '../utils/pdfExport';
import {
  buildCheckInQrUrl,
  buildFeedbackQrUrl,
  normalizeAndValidatePublicUrl,
} from '../utils/qrUrl';

interface QrPosterModalProps {
  event: EventRecord;
  eventAttendances: AttendanceRecord[];
  eventFeedbackSubmissions?: FeedbackSubmissionRecord[];
  feedbackConfig?: FeedbackConfig | null;
  onClose: () => void;
  onOpenCheckIn: (eventId: string) => void;
  onOpenFeedback?: (eventId: string) => void;
  onOpenFeedbackAnalytics?: (eventId: string) => void;
  onLaunchProjector?: (eventId: string) => void;
  onToggleEventStatus?: (event: EventRecord) => Promise<void>;
  onToggleFeedbackActive?: (event: EventRecord) => Promise<void>;
  togglingFeedback?: boolean;
  onPreviewPhoto: (record: AttendanceRecord) => void;
  dashboardBgUrl?: string | null;
  dashboardBgOpacity?: number;
  savingBg?: boolean;
  bgError?: string | null;
  onUploadBackground?: (file: File) => Promise<void>;
  onChangeBackgroundOpacity?: (opacity: number) => void;
  onRemoveBackground?: () => Promise<void>;
  branding?: OrganizationBranding | null;
  onSavePublicAppUrl?: (nextUrl: string) => Promise<void>;
}

export default function QrPosterModal({
  event,
  eventAttendances,
  eventFeedbackSubmissions = [],
  feedbackConfig,
  onClose,
  onOpenCheckIn,
  onOpenFeedback,
  onOpenFeedbackAnalytics,
  onLaunchProjector,
  onToggleEventStatus,
  onToggleFeedbackActive,
  togglingFeedback = false,
  onPreviewPhoto,
  dashboardBgUrl,
  dashboardBgOpacity = 25,
  savingBg = false,
  bgError,
  onUploadBackground,
  onChangeBackgroundOpacity,
  onRemoveBackground,
  branding,
  onSavePublicAppUrl,
}: QrPosterModalProps) {
  const [qrMode, setQrMode] = useState<'checkin' | 'feedback'>('checkin');
  const [rightView, setRightView] = useState<'checkin' | 'feedback'>('checkin');
  const [recapStatusFilter, setRecapStatusFilter] = useState<
    'all' | 'On Time' | 'Late'
  >('all');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [publicUrlDraft, setPublicUrlDraft] = useState(
    () => branding?.publicAppUrl || ''
  );
  const [savingPublicUrl, setSavingPublicUrl] = useState(false);
  const [publicUrlError, setPublicUrlError] = useState<string | null>(null);
  const [editingPublicUrl, setEditingPublicUrl] = useState(false);
  const [popupQueue, setPopupQueue] = useState<AttendanceRecord[]>([]);
  const [popupPinned, setPopupPinned] = useState(false);
  const [togglingCheckIn, setTogglingCheckIn] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const bgFileInputRef = useRef<HTMLInputElement | null>(null);
  const baselineIdsRef = useRef<Set<string>>(new Set());
  const baselineEventIdRef = useRef<string>('');

  useEffect(() => {
    setPublicUrlDraft(branding?.publicAppUrl || '');
  }, [branding?.publicAppUrl]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => window.clearInterval(timer);
  }, []);

  // Escape key returns cleanly to Admin Console
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Track newly checked-in participants arriving while QrPosterModal is open
  useEffect(() => {
    if (baselineEventIdRef.current !== event.id) {
      baselineEventIdRef.current = event.id;
      baselineIdsRef.current = new Set(eventAttendances.map((a) => a.id));
      setPopupQueue([]);
      setPopupPinned(false);
      return;
    }

    const newlyArrived: AttendanceRecord[] = [];
    for (const rec of eventAttendances) {
      if (!baselineIdsRef.current.has(rec.id)) {
        baselineIdsRef.current.add(rec.id);
        newlyArrived.push(rec);
      }
    }

    if (newlyArrived.length > 0) {
      setPopupQueue((prev) => {
        const existing = new Set(prev.map((item) => item.id));
        const additions = newlyArrived.filter((item) => !existing.has(item.id));
        return additions.length > 0 ? [...prev, ...additions] : prev;
      });
    }
  }, [event.id, eventAttendances]);

  useEffect(() => {
    if (popupQueue.length === 0 || popupPinned) return;
    const timer = window.setTimeout(() => {
      setPopupQueue((prev) => prev.slice(1));
    }, 8500);
    return () => window.clearTimeout(timer);
  }, [popupQueue, popupPinned]);

  const activePopup = popupQueue[0] ?? null;
  const activePopupRank = useMemo(() => {
    if (!activePopup) return null;
    const idx = eventAttendances.findIndex((a) => a.id === activePopup.id);
    return idx >= 0 ? idx + 1 : null;
  }, [activePopup, eventAttendances]);

  const checkInInfo = buildCheckInQrUrl(event.id, branding?.publicAppUrl);
  const feedbackInfo = buildFeedbackQrUrl(event.id, branding?.publicAppUrl);
  const activeInfo = qrMode === 'feedback' ? feedbackInfo : checkInInfo;
  const activeQrUrl = activeInfo.url;
  const qrResolution = activeInfo.resolution;

  const handleSavePublicUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSavePublicAppUrl) return;
    setPublicUrlError(null);
    const check = normalizeAndValidatePublicUrl(publicUrlDraft);
    if (!check.ok) {
      setPublicUrlError(check.error);
      return;
    }
    setSavingPublicUrl(true);
    try {
      await onSavePublicAppUrl(check.origin);
      setEditingPublicUrl(false);
    } catch (err) {
      setPublicUrlError(
        err instanceof Error ? err.message : 'Unable to save public QR URL.'
      );
    } finally {
      setSavingPublicUrl(false);
    }
  };

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(activeQrUrl, {
      width: 640,
      margin: 2,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('QR generation error:', err);
      });
    return () => {
      active = false;
    };
  }, [activeQrUrl]);

  const counts = useMemo(() => {
    const total = eventAttendances.length;
    const onTime = eventAttendances.filter((a) => a.status === 'On Time').length;
    const late = eventAttendances.filter((a) => a.status === 'Late').length;
    return { total, onTime, late };
  }, [eventAttendances]);

  const filteredAttendances = useMemo(() => {
    if (recapStatusFilter === 'all') return eventAttendances;
    return eventAttendances.filter((a) => a.status === recapStatusFilter);
  }, [eventAttendances, recapStatusFilter]);

  // Real-time Participant Feedback & Evaluation summary for this ongoing event
  const feedbackSummary = useMemo(() => {
    const total = eventFeedbackSubmissions.length;
    const rated = eventFeedbackSubmissions.filter((s) => s.averageRating > 0);
    const avgRating =
      rated.length > 0
        ? rated.reduce((sum, s) => sum + s.averageRating, 0) / rated.length
        : 0;
    const commentCount = eventFeedbackSubmissions.filter(
      (s) => s.writtenComment.trim().length > 0
    ).length;
    const attachmentCount = eventFeedbackSubmissions.filter((s) =>
      Boolean(s.attachment)
    ).length;

    const criterionMap = new Map<
      string,
      { label: string; sum: number; count: number }
    >();
    const positiveCounts = new Map<string, { text: string; count: number }>();
    const improvementCounts = new Map<string, { text: string; count: number }>();
    let positiveSelectionsTotal = 0;
    let improvementSelectionsTotal = 0;

    for (const sub of eventFeedbackSubmissions) {
      for (const r of sub.ratings) {
        const entry = criterionMap.get(r.criterionId) ?? {
          label: r.label,
          sum: 0,
          count: 0,
        };
        entry.sum += r.score;
        entry.count += 1;
        criterionMap.set(r.criterionId, entry);
      }

      for (const st of sub.selectedStatements) {
        if (st.sentiment === 'improvement') {
          improvementSelectionsTotal += 1;
          const prev = improvementCounts.get(st.statementId) ?? {
            text: st.text,
            count: 0,
          };
          prev.count += 1;
          improvementCounts.set(st.statementId, prev);
        } else {
          positiveSelectionsTotal += 1;
          const prev = positiveCounts.get(st.statementId) ?? {
            text: st.text,
            count: 0,
          };
          prev.count += 1;
          positiveCounts.set(st.statementId, prev);
        }
      }
    }

    const criterionAverages = Array.from(criterionMap.values()).map((c) => ({
      label: c.label,
      avg: c.count > 0 ? c.sum / c.count : 0,
      count: c.count,
    }));

    const topPositive = Array.from(positiveCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topImprovements = Array.from(improvementCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const sortedSubmissions = [...eventFeedbackSubmissions].sort((a, b) => {
      const ams = a.serverTimestamp?.toMillis?.() ?? 0;
      const bms = b.serverTimestamp?.toMillis?.() ?? 0;
      return bms - ams;
    });

    return {
      total,
      avgRating,
      commentCount,
      attachmentCount,
      positiveSelectionsTotal,
      improvementSelectionsTotal,
      criterionAverages,
      topPositive,
      topImprovements,
      sortedSubmissions,
    };
  }, [eventFeedbackSubmissions]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeQrUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const handleDownloadPng = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.href = qrDataUrl;
    const suffix = qrMode === 'feedback' ? 'feedback-qr' : 'checkin-qr';
    link.download = `${event.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const eventsByIdForPdf = useMemo(() => new Map([[event.id, event]]), [event]);

  const isCheckInOpen = event.status === 'active';
  const resolvedFeedbackConfig = useMemo(
    () => mergeFeedbackConfig(feedbackConfig ?? null, event.id),
    [feedbackConfig, event.id]
  );
  const feedbackEval = useMemo(
    () => evaluateFeedbackSchedule(resolvedFeedbackConfig, nowMs),
    [resolvedFeedbackConfig, nowMs]
  );

  const feedbackStatusDisplay = useMemo(() => {
    if (!isCheckInOpen) {
      return {
        state: 'ended' as const,
        label: 'Ended',
        detail:
          feedbackEval.status === 'closed' && resolvedFeedbackConfig.closeAtIso
            ? `Event ended · Window closed ${formatScheduleDateTime(resolvedFeedbackConfig.closeAtIso)}`
            : 'Event ended · Feedback form is closed',
      };
    }
    if (resolvedFeedbackConfig.feedbackActive === false) {
      return {
        state: 'paused' as const,
        label: 'Paused / Closed',
        detail: 'Deactivated by administrator · Not accepting responses',
      };
    }
    if (feedbackEval.status === 'closed') {
      return {
        state: 'ended' as const,
        label: 'Ended',
        detail: resolvedFeedbackConfig.closeAtIso
          ? `Feedback window closed ${formatScheduleDateTime(resolvedFeedbackConfig.closeAtIso)}`
          : 'Scheduled feedback window has ended',
      };
    }
    if (feedbackEval.status === 'before-open') {
      return {
        state: 'scheduled' as const,
        label: 'Scheduled (Not Open Yet)',
        detail: resolvedFeedbackConfig.openAtIso
          ? `Opens ${formatScheduleDateTime(resolvedFeedbackConfig.openAtIso)}`
          : 'Waiting for scheduled open time',
      };
    }
    if (feedbackEval.status === 'open') {
      return {
        state: 'open' as const,
        label: 'Open / Active',
        detail: resolvedFeedbackConfig.closeAtIso
          ? `Active until ${formatScheduleDateTime(resolvedFeedbackConfig.closeAtIso)}`
          : 'Accepting participant feedback & evaluations',
      };
    }
    return {
      state: 'open' as const,
      label: 'Open / Active',
      detail: 'Accepting participant feedback & evaluations',
    };
  }, [isCheckInOpen, feedbackEval.status, resolvedFeedbackConfig]);

  const handleQuickToggleCheckIn = async () => {
    if (!onToggleEventStatus || togglingCheckIn) return;
    setTogglingCheckIn(true);
    try {
      await onToggleEventStatus(event);
    } finally {
      setTogglingCheckIn(false);
    }
  };

  const modalNode = (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
    >
      <div
        className={`w-full bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col transition-all ${
          expanded
            ? 'max-w-[97vw] h-[95dvh] rounded-2xl'
            : 'max-w-6xl h-[94dvh] max-h-[94dvh] rounded-2xl'
        }`}
      >
        {/* Top Row 1: Ongoing Event Identity & Expand Toggle */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 bg-white shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {branding?.logoDataUrl && (
              <img
                src={branding.logoDataUrl}
                alt={
                  branding.organizationName
                    ? `${branding.organizationName} logo`
                    : 'Organization logo'
                }
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shrink-0"
              />
            )}
            <div className="min-w-0">
              {branding?.organizationName && (
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700 truncate">
                  {branding.organizationName} · PRESENZA
                </div>
              )}
              <h2
                id="qr-modal-title"
                className="text-base sm:text-lg font-bold text-slate-900 truncate"
              >
                {event.title}
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span>{event.category}</span>
                <span aria-hidden="true">·</span>
                <span>{formatEventLocation(event.venue, event.city)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">{event.eventDate}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  Start {event.startTime} (Cutoff {event.lateCutoffTime})
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap"
              aria-label={expanded ? 'Exit expanded view' : 'Expand view'}
            >
              {expanded ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Compact</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Expand</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Top Row 2: Requested Navigation Menu Bar */}
        <nav
          aria-label="Ongoing Event Scan to Clock In Menu"
          className="px-4 sm:px-6 py-2.5 border-b border-slate-200 bg-slate-50/90 flex flex-wrap items-center justify-between gap-2 shrink-0"
        >
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Projector Board focused strictly on THIS ongoing event */}
            {onLaunchProjector && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLaunchProjector(event.id);
                }}
                title={`Launch Projector Board focused on "${event.title}"`}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <MonitorPlay className="w-4 h-4 shrink-0" />
                <span>Projector Board</span>
                <span className="hidden md:inline text-[11px] font-normal text-slate-300">
                  · {isCheckInOpen ? 'Ongoing Event' : 'Ended Event'}
                </span>
              </button>
            )}

            {/* 2. Participant Feedback & Evaluation Summary (right next to Projector Board) */}
            <button
              type="button"
              onClick={() => setRightView('feedback')}
              aria-pressed={rightView === 'feedback'}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                rightView === 'feedback'
                  ? 'border-blue-600 bg-blue-50 text-blue-900'
                  : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-blue-700 shrink-0" />
              <span>Feedback &amp; Evaluation Summary</span>
              <span className="font-mono-tabular text-slate-600">
                ({feedbackSummary.total}
                {feedbackSummary.avgRating > 0
                  ? ` · ${feedbackSummary.avgRating.toFixed(1)}★`
                  : ''}
                )
              </span>
            </button>

            {/* 3. Current Check-In Recap (Total · On Time · Late) */}
            <button
              type="button"
              onClick={() => setRightView('checkin')}
              aria-pressed={rightView === 'checkin'}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 ${
                rightView === 'checkin'
                  ? 'border-emerald-600 bg-emerald-50/70 text-slate-900'
                  : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
              }`}
            >
              <Users className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Check-In Recap:</span>
              <span className="font-mono-tabular font-bold text-slate-900">
                {counts.total} Total
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-mono-tabular font-bold text-emerald-700">
                {counts.onTime} On Time
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-mono-tabular font-bold text-amber-700">
                {counts.late} Late
              </span>
            </button>
          </div>

          {/* 4. Go Back to Admin Console */}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Go Back to Admin Console</span>
          </button>
        </nav>

        {/* Check-In & Feedback Live Status Bar inside Clicked Event */}
        <div
          aria-label="Event Check-In and Feedback Status"
          className="px-4 sm:px-6 py-2.5 border-b border-slate-200 bg-white grid grid-cols-1 md:grid-cols-2 gap-2.5 shrink-0"
        >
          {/* Check-In Status */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {isCheckInOpen ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <Lock className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-slate-600">Check-In Status:</span>
                  <span
                    className={`font-bold ${
                      isCheckInOpen ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {isCheckInOpen ? 'Open / Active' : 'Ended'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {isCheckInOpen
                    ? `Accepting participant check-ins · Cutoff ${event.lateCutoffTime}`
                    : 'Event ended · Check-in form is closed to new submissions'}
                </p>
              </div>
            </div>

            {onToggleEventStatus && (
              <button
                type="button"
                disabled={togglingCheckIn}
                onClick={() => void handleQuickToggleCheckIn()}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                  isCheckInOpen
                    ? 'border-slate-300 bg-white hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 text-slate-700'
                    : 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                }`}
              >
                {togglingCheckIn
                  ? 'Updating...'
                  : isCheckInOpen
                  ? 'End Event'
                  : 'Reopen Event'}
              </button>
            )}
          </div>

          {/* Feedback Status */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {feedbackStatusDisplay.state === 'open' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : feedbackStatusDisplay.state === 'scheduled' ? (
                <CalendarClock className="w-4 h-4 text-blue-600 shrink-0" />
              ) : feedbackStatusDisplay.state === 'paused' ? (
                <PauseCircle className="w-4 h-4 text-amber-600 shrink-0" />
              ) : (
                <Lock className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-semibold text-slate-600">Feedback Status:</span>
                  <span
                    className={`font-bold ${
                      feedbackStatusDisplay.state === 'open'
                        ? 'text-emerald-700'
                        : feedbackStatusDisplay.state === 'scheduled'
                        ? 'text-blue-700'
                        : feedbackStatusDisplay.state === 'paused'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {feedbackStatusDisplay.label}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {feedbackStatusDisplay.detail}
                </p>
              </div>
            </div>

            {isCheckInOpen && onToggleFeedbackActive && (
              <button
                type="button"
                disabled={togglingFeedback}
                onClick={() => void onToggleFeedbackActive(event)}
                className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-60 ${
                  resolvedFeedbackConfig.feedbackActive === false
                    ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                    : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                }`}
              >
                {togglingFeedback ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : resolvedFeedbackConfig.feedbackActive === false ? (
                  <PlayCircle className="w-3 h-3" />
                ) : (
                  <PauseCircle className="w-3 h-3" />
                )}
                <span>
                  {resolvedFeedbackConfig.feedbackActive === false
                    ? 'Activate'
                    : 'Pause'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Side-by-Side Split: Left QR Code Poster | Right Check-In Recap or Feedback Summary */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
          {/* Left Column: QR Code & Sharing Actions */}
          <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between bg-slate-50/50">
            <div className="px-5 pt-4 flex justify-center">
              <div
                className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1"
                role="tablist"
                aria-label="QR Code Mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={qrMode === 'checkin'}
                  onClick={() => setQrMode('checkin')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    qrMode === 'checkin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Check-In QR
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={qrMode === 'feedback'}
                  onClick={() => setQrMode('feedback')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    qrMode === 'feedback'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Feedback QR
                </button>
              </div>
            </div>

            <div
              id="qr-print-sheet"
              className="px-6 py-4 flex flex-col items-center text-center"
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                {branding?.organizationName
                  ? `${branding.organizationName} · PRESENZA`
                  : 'PRESENZA'}
              </div>
              <h3 className="mt-1 text-lg font-bold text-slate-900 text-balance max-w-sm">
                {qrMode === 'feedback'
                  ? 'Scan to Submit Feedback & Evaluation'
                  : 'Scan to Clock In'}
              </h3>

              <div className="mt-3 p-3.5 rounded-2xl border border-slate-200 bg-white shadow-sm">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`${qrMode === 'feedback' ? 'Feedback' : 'Check-in'} QR Code for ${event.title}`}
                    className="w-44 h-44 sm:w-48 sm:h-48 object-contain"
                  />
                ) : (
                  <div className="w-44 h-44 sm:w-48 sm:h-48 flex items-center justify-center bg-slate-50 text-xs text-slate-400">
                    Generating QR code...
                  </div>
                )}
              </div>

              <p className="mt-3 text-xs text-slate-600 max-w-xs leading-relaxed">
                {qrMode === 'feedback'
                  ? 'No login needed. Participants rate the session, tick quick feedback statements, attach supporting files, and submit.'
                  : 'No login or account needed. Scan with your phone camera, fill in your name and department, and submit.'}
              </p>
            </div>

            <div className="px-5 py-3.5 bg-white border-t border-slate-200 space-y-2.5">
              {!qrResolution.isPublic && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <span className="font-bold">Private Preview URL Detected: </span>
                      <span>{qrResolution.warning}</span>
                    </div>
                  </div>
                  {onSavePublicAppUrl && (
                    <form
                      onSubmit={(e) => void handleSavePublicUrlSubmit(e)}
                      className="flex flex-col sm:flex-row gap-1.5"
                    >
                      <input
                        type="url"
                        value={publicUrlDraft}
                        onChange={(e) => setPublicUrlDraft(e.target.value)}
                        placeholder="https://your-app.vercel.app"
                        aria-label="Public Vercel production URL for QR codes"
                        className="flex-1 min-w-0 min-h-[34px] px-2.5 py-1 text-xs font-mono-tabular bg-white border border-amber-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        type="submit"
                        disabled={savingPublicUrl}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                      >
                        {savingPublicUrl ? 'Saving...' : 'Save Public URL'}
                      </button>
                    </form>
                  )}
                  {publicUrlError && (
                    <p className="text-[11px] text-rose-700 font-medium">
                      {publicUrlError}
                    </p>
                  )}
                </div>
              )}

              {qrResolution.isPublic && onSavePublicAppUrl && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                  <span className="inline-flex items-center gap-1.5 font-medium truncate">
                    <Globe className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="truncate">
                      Public QR Host:{' '}
                      <strong className="font-mono-tabular">
                        {qrResolution.origin}
                      </strong>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingPublicUrl((v) => !v)}
                    className="text-emerald-900 font-semibold hover:underline shrink-0"
                  >
                    {editingPublicUrl ? 'Cancel' : 'Change'}
                  </button>
                </div>
              )}

              {qrResolution.isPublic && editingPublicUrl && onSavePublicAppUrl && (
                <form
                  onSubmit={(e) => void handleSavePublicUrlSubmit(e)}
                  className="space-y-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      value={publicUrlDraft}
                      onChange={(e) => setPublicUrlDraft(e.target.value)}
                      placeholder="https://your-app.vercel.app (leave blank for auto)"
                      aria-label="Edit public QR domain URL"
                      className="flex-1 min-w-0 min-h-[34px] px-2.5 py-1 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
                    />
                    <button
                      type="submit"
                      disabled={savingPublicUrl}
                      className="min-h-[34px] px-3 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold whitespace-nowrap disabled:opacity-50"
                    >
                      {savingPublicUrl ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                  {publicUrlError && (
                    <p className="text-[11px] text-rose-700 font-medium">
                      {publicUrlError}
                    </p>
                  )}
                </form>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={activeQrUrl}
                  aria-label="Direct QR URL"
                  className="flex-1 min-w-0 px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPng}
                  disabled={!qrDataUrl}
                  className="min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save PNG</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="min-h-[40px] px-2.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    if (qrMode === 'feedback' && onOpenFeedback) {
                      onOpenFeedback(event.id);
                    } else {
                      onOpenCheckIn(event.id);
                    }
                  }}
                  className="min-h-[40px] px-2.5 py-2 rounded-xl bg-blue-700 text-xs font-semibold text-white hover:bg-blue-800 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Form</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Switches between Live Check-In Recap and Participant Feedback & Evaluation Summary */}
          <div className="lg:col-span-7 relative flex flex-col min-h-[340px] lg:min-h-0 bg-white overflow-hidden">
            {rightView === 'checkin' && dashboardBgUrl && (
              <img
                src={dashboardBgUrl}
                alt=""
                aria-hidden="true"
                style={{
                  opacity: Math.min(1, Math.max(0, dashboardBgOpacity / 100)),
                }}
                className="absolute inset-0 w-full h-full object-cover object-top pointer-events-none select-none transition-opacity duration-150"
              />
            )}

            {onUploadBackground && (
              <input
                ref={bgFileInputRef}
                type="file"
                accept="image/jpeg,.jpg,.jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void onUploadBackground(file);
                }}
                className="hidden"
                aria-label="Upload JPEG portrait background"
              />
            )}

            {rightView === 'checkin' ? (
              <div className="relative z-10 flex flex-col flex-1 min-h-0">
                <div
                  className={`px-5 sm:px-6 py-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shrink-0 ${
                    dashboardBgUrl ? 'bg-white/85 backdrop-blur-[2px]' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        Live Clock-In &amp; Check-In Recap
                      </h3>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                        <span
                          className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                          aria-hidden="true"
                        />
                        <span>Live</span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Current check-ins for this event · On Time vs. Late status
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Interactive Recap Filter (All / On Time / Late) */}
                    <div
                      className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 border border-slate-200 text-xs"
                      role="group"
                      aria-label="Filter current check-in recap by status"
                    >
                      <button
                        type="button"
                        onClick={() => setRecapStatusFilter('all')}
                        className={`px-2.5 py-1 rounded-md font-mono-tabular font-semibold transition-colors whitespace-nowrap ${
                          recapStatusFilter === 'all'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        All ({counts.total})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecapStatusFilter('On Time')}
                        className={`px-2.5 py-1 rounded-md font-mono-tabular font-semibold transition-colors whitespace-nowrap ${
                          recapStatusFilter === 'On Time'
                            ? 'bg-white text-emerald-800 shadow-xs'
                            : 'text-emerald-700 hover:bg-white/60'
                        }`}
                      >
                        On Time ({counts.onTime})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecapStatusFilter('Late')}
                        className={`px-2.5 py-1 rounded-md font-mono-tabular font-semibold transition-colors whitespace-nowrap ${
                          recapStatusFilter === 'Late'
                            ? 'bg-white text-amber-800 shadow-xs'
                            : 'text-amber-700 hover:bg-white/60'
                        }`}
                      >
                        Late ({counts.late})
                      </button>
                    </div>

                    {eventAttendances.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadRecapitulationPdf(
                            eventAttendances,
                            event,
                            eventsByIdForPdf,
                            branding
                          )
                        }
                        className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Recap PDF</span>
                      </button>
                    )}

                    {onUploadBackground && (
                      <button
                        type="button"
                        disabled={savingBg}
                        onClick={() => bgFileInputRef.current?.click()}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                      >
                        {savingBg ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ImagePlus className="w-3.5 h-3.5 text-blue-700" />
                        )}
                        <span>
                          {dashboardBgUrl ? 'Change JPEG Bg' : 'JPEG Portrait Bg'}
                        </span>
                      </button>
                    )}
                    {dashboardBgUrl && onChangeBackgroundOpacity && (
                      <label className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 inline-flex items-center gap-2">
                        <span>Opacity</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={dashboardBgOpacity}
                          onChange={(e) =>
                            onChangeBackgroundOpacity(Number(e.target.value))
                          }
                          aria-label="Live dashboard background photo opacity"
                          className="w-16 accent-blue-700 cursor-pointer"
                        />
                        <span className="font-mono-tabular w-8 text-right">
                          {dashboardBgOpacity}%
                        </span>
                      </label>
                    )}
                    {dashboardBgUrl && onRemoveBackground && (
                      <button
                        type="button"
                        disabled={savingBg}
                        onClick={() => void onRemoveBackground()}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        Clear Bg
                      </button>
                    )}
                  </div>
                </div>

                {bgError && (
                  <div className="px-5 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-200">
                    {bgError}
                  </div>
                )}

                {filteredAttendances.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-12 h-12 rounded-xl bg-white/90 border border-slate-200 text-slate-500 flex items-center justify-center mb-3">
                      <Users className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {eventAttendances.length === 0
                        ? 'Waiting for participants to clock in'
                        : `No ${recapStatusFilter} check-ins recorded yet`}
                    </p>
                    <p className="text-xs text-slate-600 mt-1 max-w-xs">
                      {eventAttendances.length === 0
                        ? 'When someone scans the QR code on the left and submits attendance, their name, class, time, and On Time / Late status will appear here instantly.'
                        : 'Switch back to All check-ins above to view every participant.'}
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-200/70">
                    <AnimatePresence initial={false}>
                      {filteredAttendances.map((rec) => {
                        const originalRank =
                          eventAttendances.findIndex((a) => a.id === rec.id) + 1;
                        const serverMs = rec.serverTimestamp?.toMillis?.() ?? 0;
                        const isRecent =
                          serverMs > 0 && Date.now() - serverMs < 120_000;
                        return (
                          <motion.div
                            key={rec.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className={`px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4 ${
                              isRecent
                                ? 'bg-blue-50/75'
                                : dashboardBgUrl
                                ? 'bg-white/55 hover:bg-white/80'
                                : 'hover:bg-slate-50/70'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-7 text-xs font-mono-tabular font-semibold text-slate-400 shrink-0">
                                #{originalRank}
                              </span>
                              <button
                                type="button"
                                onClick={() => onPreviewPhoto(rec)}
                                className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 hover:ring-2 hover:ring-blue-600 transition-all"
                                aria-label={`View photo of ${rec.fullName}`}
                              >
                                <img
                                  src={rec.photoDataUrl}
                                  alt={rec.fullName}
                                  className="w-full h-full object-cover"
                                />
                              </button>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-slate-900 truncate">
                                    {rec.fullName}
                                  </span>
                                  {isRecent && (
                                    <span className="text-[11px] font-semibold text-blue-700 shrink-0">
                                      New
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-600 truncate mt-0.5">
                                  {rec.classDepartment}
                                </div>
                                {rec.status === 'Late' && rec.lateExcuse && (
                                  <div className="text-xs text-amber-800 mt-0.5 line-clamp-2">
                                    Excuse: {rec.lateExcuse}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-4 shrink-0">
                              <div className="text-right">
                                <div className="font-mono-tabular text-xs font-semibold text-slate-900">
                                  {rec.checkInTime}
                                </div>
                                <div className="font-mono-tabular text-[11px] text-slate-500">
                                  {rec.attendanceDate}
                                </div>
                              </div>

                              <span
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border whitespace-nowrap ${
                                  rec.status === 'On Time'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                }`}
                              >
                                {rec.status === 'On Time' ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                ) : (
                                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                                )}
                                <span>{rec.status}</span>
                              </span>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ) : (
              /* Participant Feedback & Evaluation Summary Panel for THIS Ongoing Event */
              <div className="relative z-10 flex flex-col flex-1 min-h-0 bg-white">
                <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Participant Feedback &amp; Evaluation Summary
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Real-time evaluation responses for{' '}
                      <strong className="text-slate-800">{event.title}</strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQrMode('feedback')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 whitespace-nowrap"
                    >
                      Show Feedback QR
                    </button>
                    {feedbackSummary.total > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          downloadFeedbackReportPdf(eventFeedbackSubmissions, {
                            selectedEvent: event,
                            eventsById: eventsByIdForPdf,
                            branding,
                            filenamePrefix: event.title || 'feedback-report',
                          })
                        }
                        className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Download Feedback PDF</span>
                      </button>
                    )}
                    {onOpenFeedbackAnalytics && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenFeedbackAnalytics(event.id);
                        }}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Full Analytics</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Single-Elevation KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-200 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50/70 shrink-0">
                  <div className="px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Responses
                    </div>
                    <div className="mt-0.5 text-xl font-bold font-mono-tabular text-slate-900">
                      {feedbackSummary.total}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Average Rating
                    </div>
                    <div className="mt-0.5 text-xl font-bold font-mono-tabular text-amber-700 inline-flex items-center gap-1">
                      <span>
                        {feedbackSummary.avgRating > 0
                          ? feedbackSummary.avgRating.toFixed(2)
                          : '—'}
                      </span>
                      <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Positive Picks
                    </div>
                    <div className="mt-0.5 text-xl font-bold font-mono-tabular text-emerald-700">
                      {feedbackSummary.positiveSelectionsTotal}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Written Notes
                    </div>
                    <div className="mt-0.5 text-xl font-bold font-mono-tabular text-blue-700">
                      {feedbackSummary.commentCount}
                    </div>
                  </div>
                </div>

                {feedbackSummary.total === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center mb-3">
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      No participant feedback submitted yet for this event
                    </p>
                    <p className="text-xs text-slate-600 mt-1 max-w-sm">
                      Share the Feedback QR code on the left or open the Feedback &amp; Evaluation form. Participant ratings, highlights, and comments will appear here live.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQrMode('feedback')}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800"
                      >
                        Display Feedback QR
                      </button>
                      {onOpenFeedback && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenFeedback(event.id);
                          }}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold"
                        >
                          Open Feedback Form
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
                    {/* Criterion Averages */}
                    {feedbackSummary.criterionAverages.length > 0 && (
                      <section className="space-y-2.5">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Rating Breakdown by Criterion
                        </h4>
                        <div className="space-y-2">
                          {feedbackSummary.criterionAverages.map((crit) => (
                            <div key={crit.label} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-800 truncate pr-3">
                                  {crit.label}
                                </span>
                                <span className="font-mono-tabular font-bold text-slate-900 shrink-0">
                                  {crit.avg.toFixed(2)} / 5.0
                                </span>
                              </div>
                              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-amber-500"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, (crit.avg / 5) * 100))}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Top Positive Highlights & Suggestions */}
                    {(feedbackSummary.topPositive.length > 0 ||
                      feedbackSummary.topImprovements.length > 0) && (
                      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 inline-flex items-center gap-1.5">
                            <ThumbsUp className="w-3.5 h-3.5" />
                            <span>Top Strengths</span>
                          </h4>
                          {feedbackSummary.topPositive.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No positive checklist items selected yet.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {feedbackSummary.topPositive.map((item) => (
                                <li
                                  key={item.text}
                                  className="flex items-start justify-between gap-2 text-xs text-slate-700 bg-emerald-50/50 border border-emerald-100 rounded-lg px-2.5 py-1.5"
                                >
                                  <span>{item.text}</span>
                                  <span className="font-mono-tabular font-bold text-emerald-800 shrink-0">
                                    {item.count}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="space-y-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 inline-flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>Areas to Improve</span>
                          </h4>
                          {feedbackSummary.topImprovements.length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No improvement items flagged yet.
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {feedbackSummary.topImprovements.map((item) => (
                                <li
                                  key={item.text}
                                  className="flex items-start justify-between gap-2 text-xs text-slate-700 bg-amber-50/50 border border-amber-100 rounded-lg px-2.5 py-1.5"
                                >
                                  <span>{item.text}</span>
                                  <span className="font-mono-tabular font-bold text-amber-800 shrink-0">
                                    {item.count}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </section>
                    )}

                    {/* Individual Participant Responses */}
                    <section className="space-y-2.5 pt-2 border-t border-slate-200">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Participant Submissions ({feedbackSummary.total})
                      </h4>
                      <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                        {feedbackSummary.sortedSubmissions.map((sub) => (
                          <div key={sub.id} className="p-3.5 space-y-1.5 bg-white">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="font-bold text-slate-900">
                                {sub.participantName?.trim() || 'Anonymous Participant'}
                                {sub.participantDepartment?.trim() && (
                                  <span className="font-normal text-slate-500">
                                    {' '}
                                    · {sub.participantDepartment}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 font-mono-tabular">
                                {sub.averageRating > 0 && (
                                  <span className="font-bold text-amber-700 inline-flex items-center gap-1">
                                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                    {sub.averageRating.toFixed(1)}
                                  </span>
                                )}
                                {sub.attachment && (
                                  <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                                    <Paperclip className="w-3 h-3" />
                                    <span>{sub.attachment.fileName}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {sub.selectedStatements.length > 0 && (
                              <div className="text-[11px] text-slate-600">
                                {sub.selectedStatements
                                  .map((st) => st.text)
                                  .join(' · ')}
                              </div>
                            )}

                            {sub.writtenComment.trim() && (
                              <p className="text-xs text-slate-800 bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 leading-relaxed">
                                {sub.writtenComment}
                              </p>
                            )}

                            {sub.customAnswers &&
                              sub.customAnswers.filter((ca) => ca.answer.trim())
                                .length > 0 && (
                                <div className="space-y-1 pt-0.5">
                                  {sub.customAnswers
                                    .filter((ca) => ca.answer.trim())
                                    .map((ca) => (
                                      <div
                                        key={ca.questionId}
                                        className="text-xs text-slate-700"
                                      >
                                        <span className="font-semibold text-slate-900">
                                          {ca.prompt}:{' '}
                                        </span>
                                        <span>{ca.answer}</span>
                                      </div>
                                    ))}
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}
              </div>
            )}

            {/* Live Pop-Up Photo Spotlight over right column when in Check-In view */}
            {rightView === 'checkin' && (
              <AnimatePresence mode="wait">
                {activePopup && (
                  <motion.div
                    key={`poster-popup-${activePopup.id}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                    className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4"
                    aria-live="polite"
                  >
                    <div className="w-full max-w-sm rounded-2xl border-2 border-emerald-400 bg-white p-5 shadow-2xl flex flex-col items-center text-center space-y-3">
                      <div className="w-full flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold uppercase tracking-wider">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Just Checked In</span>
                        </span>

                        <div className="flex items-center gap-1.5">
                          {activePopupRank && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-xs font-mono-tabular font-bold">
                              Rank #{activePopupRank}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setPopupPinned((p) => !p)}
                            aria-pressed={popupPinned}
                            title={
                              popupPinned ? 'Resume auto-hide' : 'Pin photo card'
                            }
                            className={`min-h-[28px] px-2 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 ${
                              popupPinned
                                ? 'border-blue-600 bg-blue-50 text-blue-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPopupQueue((prev) => prev.slice(1))
                            }
                            aria-label="Dismiss check-in photo pop-up"
                            className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onPreviewPhoto(activePopup)}
                        className="w-44 h-44 sm:w-48 sm:h-48 rounded-2xl overflow-hidden border-2 border-emerald-300 bg-slate-100 shadow-md hover:ring-4 hover:ring-emerald-200 transition-all shrink-0"
                        aria-label={`View photo of ${activePopup.fullName}`}
                      >
                        <img
                          src={activePopup.photoDataUrl}
                          alt={activePopup.fullName}
                          className="w-full h-full object-cover"
                        />
                      </button>

                      <div className="space-y-0.5 min-w-0 w-full">
                        <h4 className="text-xl font-display font-extrabold text-slate-900 truncate">
                          {activePopup.fullName}
                        </h4>
                        <p className="text-sm font-medium text-slate-600 truncate">
                          {activePopup.classDepartment}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono-tabular font-semibold text-slate-800">
                          {activePopup.checkInTime}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            activePopup.status === 'On Time'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {activePopup.status === 'On Time' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-amber-700" />
                          )}
                          <span>{activePopup.status}</span>
                        </span>
                      </div>

                      {popupQueue.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPopupQueue((prev) => prev.slice(1))
                          }
                          className="text-xs font-bold text-blue-700 hover:underline pt-1"
                        >
                          Show next check-in ({popupQueue.length - 1} waiting)
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalNode;
  }

  return createPortal(modalNode, document.body);
}
