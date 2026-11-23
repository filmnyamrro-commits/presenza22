import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CalendarClock,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Film,
  Filter,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  Radio,
  RotateCcw,
  Save,
  Settings2,
  Star,
  ThumbsUp,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react';
import { type User } from 'firebase/auth';
import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { db, handleFirestoreError, reportFirestoreError } from '../firebase';
import {
  type EventRecord,
  type FeedbackConfig,
  type FeedbackSubmissionRecord,
  OperationType,
  type OrganizationBranding,
} from '../types';
import { exportFeedbackCsv } from '../utils/csvExport';
import {
  format12hTo24h,
  format24hPartsToString,
  formatLocalDateYmd,
  generateSafeId,
  parse24hParts,
  parse24hTo12h,
} from '../utils/dateTime';
import {
  buildDefaultFeedbackConfig,
  buildFeedbackConfigWritePayload,
  evaluateFeedbackSchedule,
  formatScheduleCountdown,
  formatScheduleDateTime,
  isoToLocalDateAndTime,
  localDateAndTimeToIso,
  mergeFeedbackConfig,
  parseIsoTimestampMs,
} from '../utils/feedbackAndRecognitionDefaults';
import { downloadFeedbackReportPdf } from '../utils/pdfExport';
import { buildFeedbackQrUrl } from '../utils/qrUrl';
import {
  deleteFeedbackAttachmentRecord,
  fetchFeedbackAttachmentBlobUrl,
  formatAttachmentBytes,
} from '../utils/feedbackAttachment';

interface AdminFeedbackModuleProps {
  user: User;
  events: EventRecord[];
  branding?: OrganizationBranding | null;
  feedbackConfigsById: Map<string, FeedbackConfig>;
  feedbackSubmissions: FeedbackSubmissionRecord[];
  onOpenFeedbackForm: (eventId: string) => void;
  initialCustomizeEventId?: string | null;
  customizeRequestNonce?: number;
}

export default function AdminFeedbackModule({
  user,
  events,
  branding,
  feedbackConfigsById,
  feedbackSubmissions,
  onOpenFeedbackForm,
  initialCustomizeEventId,
  customizeRequestNonce,
}: AdminFeedbackModuleProps) {
  const [subTab, setSubTab] = useState<'analytics' | 'customize'>('analytics');

  // Analytics Filters
  const [filterEventId, setFilterEventId] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [filterFacilitator, setFilterFacilitator] = useState<string>('all');
  const [filterTopic, setFilterTopic] = useState<string>('all');

  // Feedback QR Share state
  const [qrTargetEventId, setQrTargetEventId] = useState<string>(
    () => events.find((e) => e.status === 'active')?.id || events[0]?.id || ''
  );
  const [feedbackQrDataUrl, setFeedbackQrDataUrl] = useState<string>('');
  const [copiedQrUrl, setCopiedQrUrl] = useState(false);

  // Deleting a single feedback response
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(
    null
  );

  // Attachment Preview Modal state
  const [previewingSub, setPreviewingSub] =
    useState<FeedbackSubmissionRecord | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewRevokeFn, setPreviewRevokeFn] = useState<(() => void) | null>(
    null
  );
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Form Customizer State
  const [configTargetId, setConfigTargetId] = useState<string>('default');
  const [draftConfig, setDraftConfig] = useState<FeedbackConfig>(() =>
    mergeFeedbackConfig(feedbackConfigsById.get('default'), 'default')
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [togglingActiveEventId, setTogglingActiveEventId] = useState<string | null>(
    null
  );
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);
  const [scheduleTimeFormat, setScheduleTimeFormat] = useState<'12h' | '24h'>(
    '12h'
  );

  // New inputs in Form Customizer
  const [newCriterionLabel, setNewCriterionLabel] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategorySentiment, setNewCategorySentiment] = useState<
    'positive' | 'improvement'
  >('positive');
  const [newStatementCategory, setNewStatementCategory] =
    useState<string>('cat_positive');
  const [newStatementText, setNewStatementText] = useState('');
  const [newCustomQuestionPrompt, setNewCustomQuestionPrompt] = useState('');
  const [newCustomQuestionPlaceholder, setNewCustomQuestionPlaceholder] =
    useState('');

  // Keep QR target valid when events update
  useEffect(() => {
    if (events.length === 0) {
      setQrTargetEventId('');
      return;
    }
    if (!events.some((e) => e.id === qrTargetEventId)) {
      setQrTargetEventId(
        events.find((e) => e.status === 'active')?.id || events[0].id
      );
    }
  }, [events, qrTargetEventId]);

  // Jump directly to Customize Questions & Schedule for an event when requested from AdminConsole
  useEffect(() => {
    if (!customizeRequestNonce || !initialCustomizeEventId) return;
    setConfigTargetId(initialCustomizeEventId);
    setSubTab('customize');
    setConfigSaved(false);
    setConfigError(null);
  }, [customizeRequestNonce, initialCustomizeEventId]);

  // Sync draftConfig whenever target scope or remote configs change cleanly
  useEffect(() => {
    const specific = feedbackConfigsById.get(configTargetId);
    const fallbackDefault = feedbackConfigsById.get('default');
    const merged = mergeFeedbackConfig(
      specific ?? fallbackDefault ?? null,
      configTargetId
    );
    setDraftConfig(merged);
    if (
      merged.categories.length > 0 &&
      !merged.categories.some((c) => c.id === newStatementCategory)
    ) {
      setNewStatementCategory(merged.categories[0].id);
    }
  }, [configTargetId, feedbackConfigsById]);

  const feedbackQrInfo = qrTargetEventId
    ? buildFeedbackQrUrl(qrTargetEventId, branding?.publicAppUrl)
    : null;
  const feedbackQrUrl = feedbackQrInfo?.url || '';
  const feedbackQrIsPublic = feedbackQrInfo?.resolution.isPublic ?? true;

  const qrEventEffectiveConfig = useMemo(() => {
    const specific = qrTargetEventId
      ? feedbackConfigsById.get(qrTargetEventId)
      : undefined;
    const globalDef = feedbackConfigsById.get('default');
    return mergeFeedbackConfig(
      specific ?? globalDef ?? null,
      qrTargetEventId || 'default'
    );
  }, [qrTargetEventId, feedbackConfigsById]);

  const qrEventSchedule = useMemo(
    () => evaluateFeedbackSchedule(qrEventEffectiveConfig),
    [qrEventEffectiveConfig]
  );

  const localTimeZoneName = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
    } catch {
      return 'Local Time';
    }
  }, []);

  useEffect(() => {
    if (!feedbackQrUrl) {
      setFeedbackQrDataUrl('');
      return;
    }
    let active = true;
    QRCode.toDataURL(feedbackQrUrl, {
      width: 480,
      margin: 2,
      color: { dark: '#0F172A', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (active) setFeedbackQrDataUrl(url);
      })
      .catch(() => {
        if (active) setFeedbackQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [feedbackQrUrl]);

  const submissionCountByEventId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sub of feedbackSubmissions) {
      counts.set(sub.eventId, (counts.get(sub.eventId) ?? 0) + 1);
    }
    return counts;
  }, [feedbackSubmissions]);

  const selectedRecapEvent = useMemo(
    () =>
      filterEventId !== 'all'
        ? events.find((e) => e.id === filterEventId) ?? null
        : null,
    [events, filterEventId]
  );

  // Filter options derived from submissions + events
  const filterOptions = useMemo(() => {
    const dates = Array.from(
      new Set(feedbackSubmissions.map((s) => s.eventDate).filter(Boolean))
    ).sort((a, b) => b.localeCompare(a));

    const facilitators = Array.from(
      new Set(
        feedbackSubmissions.map((s) => s.facilitatorName.trim()).filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    const topics = Array.from(
      new Set(
        feedbackSubmissions.map((s) => s.sessionTopic.trim()).filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    return { dates, facilitators, topics };
  }, [feedbackSubmissions]);

  const filteredSubmissions = useMemo(() => {
    return feedbackSubmissions.filter((sub) => {
      if (filterEventId !== 'all' && sub.eventId !== filterEventId) {
        return false;
      }
      if (filterDate !== 'all' && sub.eventDate !== filterDate) {
        return false;
      }
      if (
        filterFacilitator !== 'all' &&
        sub.facilitatorName.trim() !== filterFacilitator
      ) {
        return false;
      }
      if (filterTopic !== 'all' && sub.sessionTopic.trim() !== filterTopic) {
        return false;
      }
      return true;
    });
  }, [
    feedbackSubmissions,
    filterEventId,
    filterDate,
    filterFacilitator,
    filterTopic,
  ]);

  // Computed Analytics
  const analytics = useMemo(() => {
    const total = filteredSubmissions.length;
    const ratedSubs = filteredSubmissions.filter((s) => s.averageRating > 0);
    const overallAverage =
      ratedSubs.length > 0
        ? ratedSubs.reduce((acc, s) => acc + s.averageRating, 0) /
          ratedSubs.length
        : 0;

    // 1..5 Star Distribution across all individual criterion scores
    const starCounts: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let totalStarVotes = 0;

    // Average per Criterion
    const criterionAgg = new Map<
      string,
      { label: string; sum: number; count: number }
    >();

    // Frequency of positive & improvement statements
    const positiveCounts = new Map<string, number>();
    const improvementCounts = new Map<string, number>();
    let totalPositiveTicks = 0;
    let totalImprovementTicks = 0;

    // Breakdown by Event + Facilitator + Topic
    const groupMap = new Map<
      string,
      {
        eventId: string;
        eventTitle: string;
        eventDate: string;
        facilitatorName: string;
        sessionTopic: string;
        responses: number;
        ratingSum: number;
        ratedCount: number;
        commentsCount: number;
      }
    >();

    for (const sub of filteredSubmissions) {
      for (const r of sub.ratings) {
        const rounded = Math.min(5, Math.max(1, Math.round(r.score))) as
          | 1
          | 2
          | 3
          | 4
          | 5;
        starCounts[rounded] += 1;
        totalStarVotes += 1;

        const key = r.label || r.criterionId;
        const curr = criterionAgg.get(key) || {
          label: r.label,
          sum: 0,
          count: 0,
        };
        curr.sum += r.score;
        curr.count += 1;
        criterionAgg.set(key, curr);
      }

      for (const st of sub.selectedStatements) {
        if (st.sentiment === 'improvement') {
          improvementCounts.set(st.text, (improvementCounts.get(st.text) ?? 0) + 1);
          totalImprovementTicks += 1;
        } else {
          positiveCounts.set(st.text, (positiveCounts.get(st.text) ?? 0) + 1);
          totalPositiveTicks += 1;
        }
      }

      const gKey = `${sub.eventId}::${sub.facilitatorName}::${sub.sessionTopic}`;
      const g = groupMap.get(gKey) || {
        eventId: sub.eventId,
        eventTitle: sub.eventTitle,
        eventDate: sub.eventDate,
        facilitatorName: sub.facilitatorName || 'Session Facilitator',
        sessionTopic: sub.sessionTopic || 'General',
        responses: 0,
        ratingSum: 0,
        ratedCount: 0,
        commentsCount: 0,
      };
      g.responses += 1;
      if (sub.averageRating > 0) {
        g.ratingSum += sub.averageRating;
        g.ratedCount += 1;
      }
      if (sub.writtenComment.trim().length > 0) {
        g.commentsCount += 1;
      }
      groupMap.set(gKey, g);
    }

    const criterionAverages = Array.from(criterionAgg.values())
      .map((item) => ({
        label: item.label,
        average: item.count > 0 ? item.sum / item.count : 0,
        count: item.count,
      }))
      .sort((a, b) => b.average - a.average);

    const topPositive = Array.from(positiveCounts.entries())
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);

    const topImprovements = Array.from(improvementCounts.entries())
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count);

    const groupedBreakdown = Array.from(groupMap.values()).sort((a, b) =>
      b.eventDate.localeCompare(a.eventDate)
    );

    const commentsList = filteredSubmissions.filter(
      (s) => s.writtenComment.trim().length > 0
    );

    const eventsCoveredCount = new Set(
      filteredSubmissions.map((s) => s.eventId)
    ).size;

    return {
      total,
      overallAverage,
      starCounts,
      totalStarVotes,
      criterionAverages,
      topPositive,
      topImprovements,
      totalPositiveTicks,
      totalImprovementTicks,
      groupedBreakdown,
      commentsList,
      eventsCoveredCount,
    };
  }, [filteredSubmissions]);

  const handleCopyFeedbackQrUrl = async () => {
    if (!feedbackQrUrl) return;
    try {
      await navigator.clipboard.writeText(feedbackQrUrl);
      setCopiedQrUrl(true);
      window.setTimeout(() => setCopiedQrUrl(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleDownloadFeedbackQrPng = () => {
    if (!feedbackQrDataUrl) return;
    const ev = events.find((e) => e.id === qrTargetEventId);
    const slug = (ev?.title || 'event')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const link = document.createElement('a');
    link.href = feedbackQrDataUrl;
    link.download = `presenza-feedback-qr-${slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clean up any active attachment Blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewRevokeFn) {
        previewRevokeFn();
      }
    };
  }, [previewRevokeFn]);

  const handleCloseAttachmentModal = () => {
    if (previewRevokeFn) {
      previewRevokeFn();
    }
    setPreviewingSub(null);
    setPreviewBlobUrl(null);
    setPreviewRevokeFn(null);
    setLoadingPreview(false);
    setPreviewError(null);
  };

  const handleOpenAttachmentModal = async (sub: FeedbackSubmissionRecord) => {
    if (!sub.attachment) return;
    if (previewRevokeFn) {
      previewRevokeFn();
    }
    setPreviewingSub(sub);
    setPreviewBlobUrl(null);
    setPreviewRevokeFn(null);
    setPreviewError(null);
    setLoadingPreview(true);
    try {
      const { blobUrl, revoke } = await fetchFeedbackAttachmentBlobUrl(
        sub.attachment
      );
      setPreviewBlobUrl(blobUrl);
      setPreviewRevokeFn(() => revoke);
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : 'Failed to load supporting attachment.'
      );
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDeleteSubmission = async (sub: FeedbackSubmissionRecord) => {
    setDeletingSubmissionId(sub.id);
    try {
      if (sub.attachment?.attachmentId) {
        await deleteFeedbackAttachmentRecord(sub.attachment.attachmentId);
      }
      await deleteDoc(doc(db, 'feedbackSubmissions', sub.id));
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `feedbackSubmissions/${sub.id}`
      );
    } finally {
      setDeletingSubmissionId(null);
    }
  };

  // Customizer Mutations
  const handleAddCriterion = () => {
    const label = newCriterionLabel.trim().slice(0, 120);
    if (label.length < 2) return;
    if (draftConfig.ratingCriteria.length >= 12) {
      setConfigError('Maximum of 12 rating criteria reached.');
      return;
    }
    setDraftConfig((prev) => ({
      ...prev,
      ratingCriteria: [
        ...prev.ratingCriteria,
        {
          id: generateSafeId('crit'),
          label,
          active: true,
          required: true,
        },
      ],
    }));
    setNewCriterionLabel('');
    setConfigError(null);
  };

  const handleAddCategory = () => {
    const name = newCategoryName.trim().slice(0, 80);
    if (name.length < 2) return;
    if (draftConfig.categories.length >= 12) {
      setConfigError('Maximum of 12 feedback categories reached.');
      return;
    }
    const id = generateSafeId('cat');
    setDraftConfig((prev) => ({
      ...prev,
      categories: [
        ...prev.categories,
        { id, name, sentiment: newCategorySentiment },
      ],
    }));
    setNewStatementCategory(id);
    setNewCategoryName('');
    setConfigError(null);
  };

  const handleDeleteCategory = (catId: string) => {
    if (draftConfig.categories.length <= 1) {
      setConfigError('At least 1 feedback category must remain.');
      return;
    }
    const remaining = draftConfig.categories.filter((c) => c.id !== catId);
    setDraftConfig((prev) => ({
      ...prev,
      categories: remaining,
      statements: prev.statements.filter((s) => s.categoryId !== catId),
    }));
    if (newStatementCategory === catId && remaining[0]) {
      setNewStatementCategory(remaining[0].id);
    }
  };

  const handleAddStatement = () => {
    const text = newStatementText.trim().slice(0, 200);
    if (text.length < 2) return;
    if (draftConfig.statements.length >= 40) {
      setConfigError('Maximum of 40 checklist statements reached.');
      return;
    }
    const targetCat =
      draftConfig.categories.find((c) => c.id === newStatementCategory)?.id ||
      draftConfig.categories[0]?.id ||
      'cat_positive';

    setDraftConfig((prev) => ({
      ...prev,
      statements: [
        ...prev.statements,
        {
          id: generateSafeId('stmt'),
          categoryId: targetCat,
          text,
          active: true,
          required: false,
        },
      ],
    }));
    setNewStatementText('');
    setConfigError(null);
  };

  const handleMoveCriterion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftConfig.ratingCriteria.length) return;
    setDraftConfig((prev) => {
      const next = [...prev.ratingCriteria];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, ratingCriteria: next };
    });
  };

  const handleMoveStatement = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftConfig.statements.length) return;
    setDraftConfig((prev) => {
      const next = [...prev.statements];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, statements: next };
    });
  };

  const handleAddCustomQuestion = () => {
    const prompt = newCustomQuestionPrompt.trim().slice(0, 200);
    if (prompt.length < 2) return;
    if (draftConfig.customQuestions.length >= 6) {
      setConfigError('Maximum of 6 additional open-ended questions reached.');
      return;
    }
    setDraftConfig((prev) => ({
      ...prev,
      customQuestions: [
        ...prev.customQuestions,
        {
          id: generateSafeId('qst'),
          prompt,
          placeholder: newCustomQuestionPlaceholder.trim().slice(0, 200),
          active: true,
          required: false,
        },
      ],
    }));
    setNewCustomQuestionPrompt('');
    setNewCustomQuestionPlaceholder('');
    setConfigError(null);
  };

  const handleMoveCustomQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draftConfig.customQuestions.length) return;
    setDraftConfig((prev) => {
      const next = [...prev.customQuestions];
      [next[index], next[target]] = [next[target], next[index]];
      return { ...prev, customQuestions: next };
    });
  };

  const applySchedulePreset = (
    preset: 'event-window' | 'now-2h' | 'today-workday' | 'clear'
  ) => {
    setConfigError(null);
    if (preset === 'clear') {
      setDraftConfig((prev) => ({
        ...prev,
        openAtIso: '',
        closeAtIso: '',
      }));
      return;
    }

    if (preset === 'event-window') {
      const targetEv = events.find((e) => e.id === configTargetId);
      const baseDate = targetEv?.eventDate || formatLocalDateYmd(new Date());
      const startTime = targetEv?.startTime || '09:00';
      const openIso = localDateAndTimeToIso(baseDate, startTime);
      const openMs = parseIsoTimestampMs(openIso) ?? Date.now();
      const closeIso = new Date(openMs + 2 * 60 * 60 * 1000).toISOString();
      setDraftConfig((prev) => ({
        ...prev,
        scheduleEnabled: true,
        openAtIso: openIso,
        closeAtIso: closeIso,
      }));
      return;
    }

    if (preset === 'now-2h') {
      const nowRounded = new Date();
      nowRounded.setSeconds(0, 0);
      const closeDate = new Date(nowRounded.getTime() + 2 * 60 * 60 * 1000);
      setDraftConfig((prev) => ({
        ...prev,
        scheduleEnabled: true,
        openAtIso: nowRounded.toISOString(),
        closeAtIso: closeDate.toISOString(),
      }));
      return;
    }

    const todayStr = formatLocalDateYmd(new Date());
    setDraftConfig((prev) => ({
      ...prev,
      scheduleEnabled: true,
      openAtIso: localDateAndTimeToIso(todayStr, '08:00'),
      closeAtIso: localDateAndTimeToIso(todayStr, '17:00'),
    }));
  };

  const updateScheduleField = (
    which: 'open' | 'close',
    part: 'date' | 'time',
    value: string
  ) => {
    setDraftConfig((prev) => {
      const currentIso = which === 'open' ? prev.openAtIso : prev.closeAtIso;
      const existingParts = isoToLocalDateAndTime(currentIso);
      const defaultDate =
        events.find((e) => e.id === configTargetId)?.eventDate ||
        formatLocalDateYmd(new Date());

      let nextDate = existingParts.date;
      let nextTime = existingParts.time;
      if (part === 'date') {
        nextDate = value;
        if (value && !nextTime) {
          nextTime = which === 'open' ? '08:00' : '17:00';
        }
      } else {
        nextTime = value;
        if (value && !nextDate) {
          nextDate = defaultDate;
        }
      }

      const nextIso =
        nextDate && nextTime ? localDateAndTimeToIso(nextDate, nextTime) : '';
      return which === 'open'
        ? { ...prev, openAtIso: nextIso }
        : { ...prev, closeAtIso: nextIso };
    });
  };

  const clearScheduleEndpoint = (which: 'open' | 'close') => {
    setDraftConfig((prev) =>
      which === 'open'
        ? { ...prev, openAtIso: '' }
        : { ...prev, closeAtIso: '' }
    );
  };

  const handleQuickToggleFeedbackActive = async (
    targetEventId: string,
    nextActive: boolean
  ) => {
    setConfigError(null);
    setTogglingActiveEventId(targetEventId);
    try {
      const base =
        targetEventId === configTargetId
          ? draftConfig
          : mergeFeedbackConfig(
              feedbackConfigsById.get(targetEventId) ??
                feedbackConfigsById.get('default') ??
                null,
              targetEventId
            );
      const updatedConfig: FeedbackConfig = {
        ...base,
        eventId: targetEventId,
        feedbackActive: nextActive,
      };
      const payload = buildFeedbackConfigWritePayload(
        updatedConfig,
        user.uid,
        (ms) => Timestamp.fromMillis(ms),
        serverTimestamp()
      );
      await setDoc(doc(db, 'feedbackConfigs', targetEventId), payload);
      if (targetEventId === configTargetId) {
        setDraftConfig((prev) => ({ ...prev, feedbackActive: nextActive }));
      }
      setConfigSaved(true);
      window.setTimeout(() => setConfigSaved(false), 2000);
    } catch (error) {
      const info = reportFirestoreError(
        error,
        OperationType.WRITE,
        `feedbackConfigs/${targetEventId}`
      );
      setConfigError(
        `Failed to update feedback status (${info.code || 'write-error'}): ${info.error}`
      );
    } finally {
      setTogglingActiveEventId(null);
    }
  };

  const handleSaveFeedbackConfig = async () => {
    setConfigError(null);
    setConfigSaved(false);

    const cleanedCriteria = draftConfig.ratingCriteria
      .map((c) => ({ ...c, label: c.label.trim().slice(0, 120) }))
      .filter((c) => c.label.length >= 2);
    if (cleanedCriteria.length === 0) {
      setConfigError('Please keep at least 1 star rating question (2+ characters).');
      return;
    }
    if (draftConfig.categories.length === 0) {
      setConfigError('Please keep at least 1 feedback category.');
      return;
    }

    const openMs = draftConfig.scheduleEnabled
      ? parseIsoTimestampMs(draftConfig.openAtIso)
      : null;
    const closeMs = draftConfig.scheduleEnabled
      ? parseIsoTimestampMs(draftConfig.closeAtIso)
      : null;

    if (draftConfig.scheduleEnabled) {
      if (openMs === null && closeMs === null) {
        setConfigError(
          'Please set an opening time, a closing time, or turn off the time restriction.'
        );
        return;
      }
      if (openMs !== null && closeMs !== null && closeMs <= openMs) {
        setConfigError(
          'Closing date & time must be later than the opening date & time.'
        );
        return;
      }
    }

    setSavingConfig(true);
    try {
      const payload = buildFeedbackConfigWritePayload(
        {
          ...draftConfig,
          eventId: configTargetId,
          ratingCriteria: cleanedCriteria,
        },
        user.uid,
        (ms) => Timestamp.fromMillis(ms),
        serverTimestamp()
      );

      await setDoc(doc(db, 'feedbackConfigs', configTargetId), payload);
      setConfigSaved(true);
      window.setTimeout(() => setConfigSaved(false), 2500);
    } catch (error) {
      const info = reportFirestoreError(
        error,
        OperationType.WRITE,
        `feedbackConfigs/${configTargetId}`
      );
      setConfigError(
        `Failed to save feedback settings (${info.code || 'write-error'}): ${info.error}`
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const hasCustomOverrideForTarget =
    configTargetId !== 'default' && feedbackConfigsById.has(configTargetId);
  const selectedTargetEvent =
    configTargetId !== 'default'
      ? events.find((e) => e.id === configTargetId) || null
      : null;

  const openScheduleParts = isoToLocalDateAndTime(draftConfig.openAtIso);
  const closeScheduleParts = isoToLocalDateAndTime(draftConfig.closeAtIso);
  const draftScheduleEval = evaluateFeedbackSchedule(draftConfig);

  return (
    <div className="space-y-6">
      {/* Sub-module Header & Mode Switch */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">
            Feedback and Evaluation Recap
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            Review feedback &amp; evaluation summaries for a specific event or across all events, export PDF/CSV reports, and customize questions or schedule.
          </p>
        </div>

        <div
          className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 self-start sm:self-auto"
          role="tablist"
          aria-label="Feedback management views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'analytics'}
            onClick={() => setSubTab('analytics')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
              subTab === 'analytics'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-blue-700" />
            <span>Recap Overview ({feedbackSubmissions.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'customize'}
            onClick={() => setSubTab('customize')}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
              subTab === 'customize'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5 text-blue-700" />
            <span>Customize Questions &amp; Schedule</span>
          </button>
        </div>
      </div>

      {subTab === 'analytics' ? (
        <div className="space-y-6">
          {/* Recap Scope Choice: Specific Event vs All Events */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-blue-700">
                  Recap Event Scope
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {selectedRecapEvent
                    ? `${selectedRecapEvent.title} · ${selectedRecapEvent.eventDate} · ${selectedRecapEvent.venue}`
                    : `All Events (${events.length} ${events.length === 1 ? 'session' : 'sessions'})`}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1"
                  role="group"
                  aria-label="Choose all events or specific event"
                >
                  <button
                    type="button"
                    onClick={() => setFilterEventId('all')}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      filterEventId === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Events ({feedbackSubmissions.length})
                  </button>
                  <button
                    type="button"
                    disabled={events.length === 0}
                    onClick={() => {
                      const targetId =
                        filterEventId !== 'all'
                          ? filterEventId
                          : qrTargetEventId || events[0]?.id || 'all';
                      setFilterEventId(targetId);
                      if (targetId !== 'all') {
                        setQrTargetEventId(targetId);
                      }
                    }}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                      filterEventId !== 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Specific Event
                  </button>
                </div>

                <select
                  value={filterEventId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setFilterEventId(nextId);
                    if (nextId !== 'all') {
                      setQrTargetEventId(nextId);
                    }
                  }}
                  aria-label="Choose event or all events for feedback recap"
                  className="min-h-[40px] px-3.5 py-2 text-xs sm:text-sm font-semibold bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 min-w-[230px] max-w-sm"
                >
                  <option value="all">
                    All Events ({feedbackSubmissions.length} responses)
                  </option>
                  {events.map((ev) => {
                    const count = submissionCountByEventId.get(ev.id) ?? 0;
                    return (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.eventDate}) · {count} response
                        {count === 1 ? '' : 's'}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </section>

          {/* Quick Feedback QR Share Strip */}
          {events.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-20 h-20 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                    {feedbackQrDataUrl ? (
                      <img
                        src={feedbackQrDataUrl}
                        alt="Event feedback QR code"
                        className="w-full h-full object-contain p-1 bg-white"
                      />
                    ) : (
                      <QrCode className="w-7 h-7 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold uppercase tracking-wider text-blue-700">
                      Direct Feedback QR Link
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Scanning opens the event&apos;s feedback &amp; evaluation form automatically without logging in.
                    </p>
                    {feedbackQrUrl && (
                      <p className="text-[11px] font-mono-tabular text-slate-500 mt-1 truncate max-w-xl">
                        {feedbackQrUrl}
                      </p>
                    )}
                    {feedbackQrUrl && !feedbackQrIsPublic && (
                      <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 mt-1.5">
                        Warning: Using private preview/local domain. Set your public Vercel URL in Attendance &amp; Sessions → Branding so phones can open this QR code.
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={qrTargetEventId}
                        onChange={(e) => setQrTargetEventId(e.target.value)}
                        aria-label="Select event for feedback QR code"
                        className="min-h-[36px] px-2.5 py-1 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 max-w-xs"
                      >
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.title} ({ev.eventDate}
                            {ev.status === 'closed' ? ' · Closed' : ''})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleCopyFeedbackQrUrl()}
                        disabled={!feedbackQrUrl}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                      >
                        {copiedQrUrl ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedQrUrl ? 'Copied Link' : 'Copy Link'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadFeedbackQrPng}
                        disabled={!feedbackQrDataUrl}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Save QR PNG</span>
                      </button>
                      {qrTargetEventId && (
                        <>
                          <button
                            type="button"
                            disabled={togglingActiveEventId === qrTargetEventId}
                            onClick={() =>
                              void handleQuickToggleFeedbackActive(
                                qrTargetEventId,
                                qrEventEffectiveConfig.feedbackActive === false
                              )
                            }
                            className={`min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-60 ${
                              qrEventEffectiveConfig.feedbackActive === false
                                ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                                : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                            }`}
                          >
                            {togglingActiveEventId === qrTargetEventId ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : qrEventEffectiveConfig.feedbackActive === false ? (
                              <PlayCircle className="w-3.5 h-3.5" />
                            ) : (
                              <PauseCircle className="w-3.5 h-3.5" />
                            )}
                            <span>
                              {qrEventEffectiveConfig.feedbackActive === false
                                ? 'Activate Feedback'
                                : 'Deactivate Feedback'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenFeedbackForm(qrTargetEventId)}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Form</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfigTargetId(qrTargetEventId);
                              setSubTab('customize');
                            }}
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <CalendarClock className="w-3.5 h-3.5" />
                            <span>Edit Questions &amp; Time</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs space-y-1 shrink-0 lg:max-w-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                    <Clock className="w-3.5 h-3.5 text-blue-700" />
                    <span>Feedback Status</span>
                    <span
                      className={`ml-auto px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                        qrEventSchedule.status === 'deactivated'
                          ? 'bg-slate-200 text-slate-700'
                          : qrEventSchedule.status === 'always-open' ||
                            qrEventSchedule.status === 'open'
                          ? 'bg-emerald-100 text-emerald-800'
                          : qrEventSchedule.status === 'before-open'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {qrEventSchedule.status === 'deactivated'
                        ? 'Deactivated'
                        : qrEventSchedule.status === 'always-open'
                        ? 'Active · Always Open'
                        : qrEventSchedule.status === 'open'
                        ? 'Active · Open Now'
                        : qrEventSchedule.status === 'before-open'
                        ? 'Scheduled'
                        : 'Closed'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-snug">
                    {qrEventSchedule.status === 'deactivated'
                      ? 'Paused by administrator — participants see a paused notice until reactivated.'
                      : !qrEventEffectiveConfig.scheduleEnabled
                      ? 'Open anytime while the session is active.'
                      : `${
                          qrEventEffectiveConfig.openAtIso
                            ? `From ${formatScheduleDateTime(qrEventEffectiveConfig.openAtIso)}`
                            : 'Open immediately'
                        } · ${
                          qrEventEffectiveConfig.closeAtIso
                            ? `Until ${formatScheduleDateTime(qrEventEffectiveConfig.closeAtIso)}`
                            : 'No closing cutoff'
                        }`}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Filters & Export Bar */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
                <Filter className="w-3.5 h-3.5 text-blue-700" />
                <span>Filter Feedback Results</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(filterEventId !== 'all' ||
                  filterDate !== 'all' ||
                  filterFacilitator !== 'all' ||
                  filterTopic !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterEventId('all');
                      setFilterDate('all');
                      setFilterFacilitator('all');
                      setFilterTopic('all');
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Filters</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={filteredSubmissions.length === 0}
                  onClick={() => {
                    const selectedEv =
                      filterEventId !== 'all'
                        ? events.find((e) => e.id === filterEventId) ?? null
                        : null;
                    const eventsById = new Map(events.map((e) => [e.id, e]));
                    const activeFilters = [
                      filterDate !== 'all' ? `Date: ${filterDate}` : '',
                      filterFacilitator !== 'all'
                        ? `Facilitator: ${filterFacilitator}`
                        : '',
                      filterTopic !== 'all' ? `Topic: ${filterTopic}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    downloadFeedbackReportPdf(filteredSubmissions, {
                      selectedEvent: selectedEv,
                      eventsById,
                      branding,
                      filenamePrefix: selectedEv?.title || 'feedback-report',
                      filterSummary: activeFilters,
                    });
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </button>
                <button
                  type="button"
                  disabled={filteredSubmissions.length === 0}
                  onClick={() =>
                    exportFeedbackCsv(
                      filteredSubmissions,
                      filterEventId !== 'all'
                        ? events.find((e) => e.id === filterEventId)?.title ||
                            'event-feedback'
                        : 'presenza-feedback-report'
                    )
                  }
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export to Excel (CSV)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <select
                value={filterEventId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setFilterEventId(nextId);
                  if (nextId !== 'all') {
                    setQrTargetEventId(nextId);
                  }
                }}
                aria-label="Filter feedback by event"
                className="min-h-[40px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">
                  All Events ({feedbackSubmissions.length})
                </option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({submissionCountByEventId.get(ev.id) ?? 0})
                  </option>
                ))}
              </select>

              <select
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                aria-label="Filter feedback by date"
                className="min-h-[40px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Dates</option>
                {filterOptions.dates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                value={filterFacilitator}
                onChange={(e) => setFilterFacilitator(e.target.value)}
                aria-label="Filter feedback by facilitator"
                className="min-h-[40px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Facilitators / Speakers</option>
                {filterOptions.facilitators.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>

              <select
                value={filterTopic}
                onChange={(e) => setFilterTopic(e.target.value)}
                aria-label="Filter feedback by topic"
                className="min-h-[40px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Sessions / Topics</option>
                {filterOptions.topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">
                Feedback Submissions
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-tabular text-slate-900">
                {analytics.total}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Across {analytics.eventsCoveredCount}{' '}
                {analytics.eventsCoveredCount === 1 ? 'event' : 'events'}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">
                Overall Satisfaction
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-tabular text-amber-600 flex items-center gap-1.5">
                <span>
                  {analytics.overallAverage > 0
                    ? analytics.overallAverage.toFixed(2)
                    : '—'}
                </span>
                <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Out of 5.00 ({analytics.totalStarVotes} ratings)
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">
                Positive Highlights Ticked
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-tabular text-emerald-700">
                {analytics.totalPositiveTicks}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {analytics.totalImprovementTicks} improvement suggestions
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500">
                Written Comments
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-tabular text-blue-700">
                {analytics.commentsList.length}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Participant suggestions &amp; notes
              </div>
            </div>
          </div>

          {filteredSubmissions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                No feedback responses match the selected filters
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Share an event&apos;s Feedback QR link above so participants can submit star ratings, quick checklist ticks, and written recommendations.
              </p>
            </div>
          ) : (
            <>
              {/* Visual Charts Row: Star Distribution + Per-Criterion Bar Chart */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* 1–5 Star Distribution Chart */}
                <section className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Rating Distribution (1–5 Stars)
                    </h3>
                    <span className="text-xs font-mono-tabular text-slate-500">
                      {analytics.totalStarVotes} votes
                    </span>
                  </div>

                  <div className="space-y-3">
                    {([5, 4, 3, 2, 1] as const).map((star) => {
                      const count = analytics.starCounts[star];
                      const pct =
                        analytics.totalStarVotes > 0
                          ? Math.round((count / analytics.totalStarVotes) * 100)
                          : 0;
                      return (
                        <div key={star} className="flex items-center gap-3">
                          <div className="w-14 text-xs font-mono-tabular font-semibold text-slate-700 inline-flex items-center gap-1 shrink-0">
                            <span>{star}</span>
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          </div>
                          <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                star >= 4
                                  ? 'bg-emerald-600'
                                  : star === 3
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="w-16 text-right text-xs font-mono-tabular text-slate-600 shrink-0">
                            {count} ({pct}%)
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Average Rating Per Evaluation Criterion Chart */}
                <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      Average Score by Evaluation Area
                    </h3>
                    <span className="text-xs text-slate-500">Scale: 1.0 – 5.0</span>
                  </div>

                  <div className="space-y-3">
                    {analytics.criterionAverages.map((crit) => {
                      const pct = Math.min(100, Math.round((crit.average / 5) * 100));
                      return (
                        <div key={crit.label} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-800 truncate">
                              {crit.label}
                            </span>
                            <span className="font-mono-tabular font-bold text-slate-900 shrink-0">
                              {crit.average.toFixed(2)} / 5 ({crit.count})
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-600 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>

              {/* Most Frequently Selected Positive & Improvement Areas */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                      <ThumbsUp className="w-4 h-4 text-emerald-700" />
                      <span>Most Selected Positive Feedback</span>
                    </h3>
                    <span className="text-xs font-mono-tabular text-emerald-700 font-semibold">
                      {analytics.totalPositiveTicks} ticks
                    </span>
                  </div>

                  {analytics.topPositive.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">
                      No positive checklist items selected yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {analytics.topPositive.map((item) => {
                        const pct = Math.round(
                          (item.count / Math.max(1, analytics.total)) * 100
                        );
                        return (
                          <div key={item.text} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-slate-800 font-medium">
                                {item.text}
                              </span>
                              <span className="font-mono-tabular font-bold text-emerald-700 shrink-0">
                                {item.count} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-emerald-50 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-emerald-600"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-amber-700" />
                      <span>Most Selected Improvement Areas</span>
                    </h3>
                    <span className="text-xs font-mono-tabular text-amber-700 font-semibold">
                      {analytics.totalImprovementTicks} ticks
                    </span>
                  </div>

                  {analytics.topImprovements.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">
                      No improvement suggestions ticked in this selection.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {analytics.topImprovements.map((item) => {
                        const pct = Math.round(
                          (item.count / Math.max(1, analytics.total)) * 100
                        );
                        return (
                          <div key={item.text} className="space-y-1">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-slate-800 font-medium">
                                {item.text}
                              </span>
                              <span className="font-mono-tabular font-bold text-amber-700 shrink-0">
                                {item.count} ({pct}%)
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-amber-50 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-amber-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              {/* Separate Results by Event, Facilitator & Session Topic */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h3 className="text-base font-bold text-slate-900">
                    Evaluation Summary by Event, Facilitator &amp; Topic
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Clearly separates performance metrics across individual sessions, facilitators, and topics.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">Event</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Facilitator / Speaker</th>
                        <th className="py-3 px-4">Session / Topic</th>
                        <th className="py-3 px-4 text-right">Responses</th>
                        <th className="py-3 px-4 text-right">Avg Rating</th>
                        <th className="py-3 px-4 text-right">Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analytics.groupedBreakdown.map((row) => {
                        const avg =
                          row.ratedCount > 0 ? row.ratingSum / row.ratedCount : 0;
                        return (
                          <tr
                            key={`${row.eventId}-${row.facilitatorName}-${row.sessionTopic}`}
                            className="hover:bg-slate-50/70"
                          >
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {row.eventTitle}
                            </td>
                            <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                              {row.eventDate}
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {row.facilitatorName}
                            </td>
                            <td className="py-3 px-4 text-slate-700">
                              {row.sessionTopic}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                              {row.responses}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-bold text-amber-700">
                              {avg > 0 ? `${avg.toFixed(2)} ★` : '—'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular text-slate-600">
                              {row.commentsCount}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Participant Written Comments & Individual Submissions */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-blue-700" />
                      <span>
                        Written Comments &amp; Submission Details ({filteredSubmissions.length})
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Individual participant evaluations ordered from newest to oldest.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                  {filteredSubmissions.map((sub) => (
                    <div
                      key={sub.id}
                      className="px-6 py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4 hover:bg-slate-50/50"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-bold text-slate-900">
                            {sub.participantName?.trim() || 'Anonymous Participant'}
                          </span>
                          {sub.participantDepartment && (
                            <span className="text-slate-500">
                              ({sub.participantDepartment})
                            </span>
                          )}
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="text-blue-700 font-semibold">
                            {sub.eventTitle}
                          </span>
                          <span className="text-slate-400 font-mono-tabular">
                            {sub.eventDate}
                          </span>
                          {sub.facilitatorName && (
                            <span className="text-slate-500">
                              · {sub.facilitatorName}
                            </span>
                          )}
                        </div>

                        {sub.writtenComment.trim() ? (
                          <p className="text-sm text-slate-800 leading-relaxed bg-slate-50 border border-slate-200/70 rounded-xl px-3.5 py-2.5">
                            &ldquo;{sub.writtenComment}&rdquo;
                          </p>
                        ) : (
                          <p className="text-xs italic text-slate-400">
                            No written comment provided.
                          </p>
                        )}

                        {sub.selectedStatements.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {sub.selectedStatements.map((st) => (
                              <span
                                key={st.statementId}
                                className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${
                                  st.sentiment === 'improvement'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                {st.text}
                              </span>
                            ))}
                          </div>
                        )}

                        {Array.isArray(sub.customAnswers) &&
                          sub.customAnswers.length > 0 && (
                            <div className="pt-1.5 space-y-1">
                              {sub.customAnswers.map((ans) => (
                                <div
                                  key={ans.questionId}
                                  className="text-xs bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-1.5"
                                >
                                  <span className="font-semibold text-blue-900">
                                    {ans.prompt}:{' '}
                                  </span>
                                  <span className="text-slate-700">
                                    {ans.answer}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                        {sub.attachment && (
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => void handleOpenAttachmentModal(sub)}
                              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/80 px-3 py-1.5 text-xs font-semibold text-blue-900 transition-colors"
                            >
                              {sub.attachment.fileCategory === 'pdf' ? (
                                <FileText className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                              ) : sub.attachment.fileCategory === 'video' ? (
                                <Film className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                              ) : (
                                <ImageIcon className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                              )}
                              <span className="truncate max-w-[220px]">
                                {sub.attachment.fileName}
                              </span>
                              <span className="text-[11px] font-mono-tabular text-blue-700/80 shrink-0">
                                ({formatAttachmentBytes(sub.attachment.byteSize)})
                              </span>
                              <span className="inline-flex items-center gap-1 pl-1 border-l border-blue-200 text-blue-700 shrink-0">
                                <Eye className="w-3.5 h-3.5" />
                                <span>
                                  {sub.attachment.fileCategory === 'pdf'
                                    ? 'View PDF'
                                    : sub.attachment.fileCategory === 'video'
                                    ? 'Play Video'
                                    : 'View Photo'}
                                </span>
                              </span>
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-bold font-mono-tabular text-amber-600 inline-flex items-center gap-1">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                            <span>
                              {sub.averageRating > 0
                                ? sub.averageRating.toFixed(1)
                                : '—'}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono-tabular text-slate-400">
                            {sub.ratings.length} rated
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={deletingSubmissionId === sub.id}
                          onClick={() => void handleDeleteSubmission(sub)}
                          className="min-h-[34px] min-w-[34px] rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center transition-colors disabled:opacity-50"
                          aria-label="Delete feedback submission"
                        >
                          {deletingSubmissionId === sub.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      ) : (
        /* Sub-tab B: Customize Feedback Questions, Statements & Schedule */
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div className="space-y-1">
              <label
                htmlFor="feedback-config-target"
                className="block text-xs font-bold uppercase tracking-wider text-blue-700"
              >
                Form Customization Target
              </label>
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  id="feedback-config-target"
                  value={configTargetId}
                  onChange={(e) => {
                    setConfigTargetId(e.target.value);
                    setConfigSaved(false);
                    setConfigError(null);
                  }}
                  className="min-h-[42px] px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="default">
                    Global Default Template (All Events)
                  </option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      Event Override: {ev.title} ({ev.eventDate})
                    </option>
                  ))}
                </select>
                {hasCustomOverrideForTarget && (
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                    Custom Event Form Active
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setDraftConfig(buildDefaultFeedbackConfig(configTargetId))
                }
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Load Recommended Defaults</span>
              </button>
              <button
                type="button"
                disabled={savingConfig}
                onClick={() => void handleSaveFeedbackConfig()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {savingConfig ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : configSaved ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{configSaved ? 'Saved!' : 'Save Form & Schedule'}</span>
              </button>
            </div>
          </div>

          {configError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
              {configError}
            </div>
          )}

          {selectedTargetEvent?.status === 'active' && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 flex items-start gap-2.5 text-xs text-emerald-950">
              <Radio className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Ongoing Session Live Sync:</span>{' '}
                Changes to rating questions, checklist statements, activation state, or submission schedule apply immediately to participants viewing or opening the feedback form during this session.
              </div>
            </div>
          )}

          {/* 1. Activation & Submission Time Schedule */}
          <section className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 sm:p-5 space-y-4">
            {/* Live Activate / Deactivate Row */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-blue-200/70">
              <div>
                <div className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  {draftConfig.feedbackActive !== false ? (
                    <PlayCircle className="w-4 h-4 text-emerald-700" />
                  ) : (
                    <PauseCircle className="w-4 h-4 text-amber-700" />
                  )}
                  <span>Feedback &amp; Evaluation Availability</span>
                  <span
                    className={`text-[11px] font-bold uppercase ${
                      draftConfig.feedbackActive !== false
                        ? 'text-emerald-700'
                        : 'text-amber-800'
                    }`}
                  >
                    {draftConfig.feedbackActive !== false
                      ? '· Active'
                      : '· Deactivated'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Activate or deactivate feedback anytime, including while an event is ongoing. Participants stay synced in real time.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={togglingActiveEventId === configTargetId}
                  onClick={() =>
                    void handleQuickToggleFeedbackActive(
                      configTargetId,
                      draftConfig.feedbackActive === false
                    )
                  }
                  className={`min-h-[38px] px-3.5 py-2 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-60 ${
                    draftConfig.feedbackActive === false
                      ? 'border-emerald-300 bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950'
                  }`}
                >
                  {togglingActiveEventId === configTargetId ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : draftConfig.feedbackActive === false ? (
                    <PlayCircle className="w-3.5 h-3.5" />
                  ) : (
                    <PauseCircle className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {draftConfig.feedbackActive === false
                      ? 'Activate Feedback Now'
                      : 'Deactivate Feedback Now'}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-blue-700" />
                  <span>Feedback &amp; Evaluation Submission Time Window</span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Control when participants can fill in and submit feedback. Enforced live on the form and on Firestore security rules ({localTimeZoneName}).
                </p>
              </div>

              <label className="min-h-[40px] px-3.5 py-2 rounded-xl border border-blue-200 bg-white flex items-center gap-2.5 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={draftConfig.scheduleEnabled}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      scheduleEnabled: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                />
                <span className="text-xs font-semibold text-slate-900">
                  Enable Scheduled Time Window
                </span>
              </label>
            </div>

            {draftConfig.scheduleEnabled ? (
              <div className="space-y-4 pt-2 border-t border-blue-200/70">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
                      Quick Fill:
                    </span>
                    {configTargetId !== 'default' && (
                      <button
                        type="button"
                        onClick={() => applySchedulePreset('event-window')}
                        className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-800"
                      >
                        Event Date &amp; Start (+2h)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => applySchedulePreset('now-2h')}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-800"
                    >
                      Open Now for 2 Hours
                    </button>
                    <button
                      type="button"
                      onClick={() => applySchedulePreset('today-workday')}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-medium text-slate-800"
                    >
                      {scheduleTimeFormat === '12h'
                        ? 'Today (08:00 AM – 05:00 PM)'
                        : 'Today (08:00 – 17:00)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => applySchedulePreset('clear')}
                      className="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 text-xs font-medium text-slate-600"
                    >
                      Clear Times
                    </button>
                  </div>

                  <div
                    className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
                    role="group"
                    aria-label="Feedback schedule time format"
                  >
                    <button
                      type="button"
                      onClick={() => setScheduleTimeFormat('12h')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        scheduleTimeFormat === '12h'
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      12-Hour (AM / PM)
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleTimeFormat('24h')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        scheduleTimeFormat === '24h'
                          ? 'bg-blue-700 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      24-Hour
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(
                    [
                      {
                        which: 'open' as const,
                        title: 'Opens At (Start Date & Time)',
                        parts: openScheduleParts,
                        iso: draftConfig.openAtIso,
                        fallbackTime: '08:00',
                        emptyHint: 'Leave blank to allow submissions immediately.',
                        setPrefix: 'Participants can enter starting',
                      },
                      {
                        which: 'close' as const,
                        title: 'Closes At (End Date & Time)',
                        parts: closeScheduleParts,
                        iso: draftConfig.closeAtIso,
                        fallbackTime: '17:00',
                        emptyHint:
                          'Leave blank to keep open until the session is closed.',
                        setPrefix: 'Submissions lock after',
                      },
                    ] as const
                  ).map((endpoint) => {
                    const effectiveTime =
                      endpoint.parts.time || endpoint.fallbackTime;
                    const p24 = parse24hParts(effectiveTime);
                    const p12 = parse24hTo12h(effectiveTime);
                    const isConfigured = Boolean(endpoint.iso);

                    return (
                      <div
                        key={endpoint.which}
                        className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            {endpoint.title}
                          </span>
                          <div className="flex items-center gap-2">
                            {isConfigured && (
                              <span className="font-mono-tabular text-[11px] text-slate-500">
                                {scheduleTimeFormat === '12h'
                                  ? `24h: ${effectiveTime}`
                                  : `${String(p12.hour12).padStart(2, '0')}:${String(
                                      p12.minute
                                    ).padStart(2, '0')} ${p12.period}`}
                              </span>
                            )}
                            {isConfigured ? (
                              <button
                                type="button"
                                onClick={() =>
                                  clearScheduleEndpoint(endpoint.which)
                                }
                                className="text-[11px] font-semibold text-rose-600 hover:underline"
                              >
                                Clear
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-500">
                                Optional
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <input
                            type="date"
                            aria-label={`Feedback ${endpoint.which}ing date`}
                            value={endpoint.parts.date}
                            onChange={(e) =>
                              updateScheduleField(
                                endpoint.which,
                                'date',
                                e.target.value
                              )
                            }
                            className="w-full min-h-[38px] px-2.5 py-1.5 text-xs sm:text-sm font-mono-tabular border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />

                          {scheduleTimeFormat === '12h' ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                aria-label={`Feedback ${endpoint.which}ing hour (12-hour)`}
                                value={p12.hour12}
                                onChange={(e) =>
                                  updateScheduleField(
                                    endpoint.which,
                                    'time',
                                    format12hTo24h(
                                      Number(e.target.value),
                                      p12.minute,
                                      p12.period
                                    )
                                  )
                                }
                                className="flex-1 min-w-[60px] min-h-[38px] px-2 py-1.5 text-xs sm:text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              >
                                {Array.from({ length: 12 }, (_, idx) => {
                                  const h = idx + 1;
                                  return (
                                    <option key={h} value={h}>
                                      {String(h).padStart(2, '0')}
                                    </option>
                                  );
                                })}
                              </select>
                              <span className="font-mono-tabular font-bold text-slate-500">
                                :
                              </span>
                              <select
                                aria-label={`Feedback ${endpoint.which}ing minute`}
                                value={p12.minute}
                                onChange={(e) =>
                                  updateScheduleField(
                                    endpoint.which,
                                    'time',
                                    format12hTo24h(
                                      p12.hour12,
                                      Number(e.target.value),
                                      p12.period
                                    )
                                  )
                                }
                                className="flex-1 min-w-[60px] min-h-[38px] px-2 py-1.5 text-xs sm:text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              >
                                {Array.from({ length: 60 }, (_, m) => (
                                  <option key={m} value={m}>
                                    {String(m).padStart(2, '0')}
                                  </option>
                                ))}
                              </select>
                              <div
                                className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden shrink-0"
                                role="group"
                                aria-label={`Feedback ${endpoint.which}ing AM or PM`}
                              >
                                {(['AM', 'PM'] as const).map((periodOption) => (
                                  <button
                                    key={periodOption}
                                    type="button"
                                    onClick={() =>
                                      updateScheduleField(
                                        endpoint.which,
                                        'time',
                                        format12hTo24h(
                                          p12.hour12,
                                          p12.minute,
                                          periodOption
                                        )
                                      )
                                    }
                                    className={`min-h-[36px] px-2.5 text-xs font-bold transition-colors ${
                                      p12.period === periodOption
                                        ? 'bg-blue-700 text-white'
                                        : 'text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    {periodOption}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <select
                                aria-label={`Feedback ${endpoint.which}ing hour (24-hour)`}
                                value={p24.hour24}
                                onChange={(e) =>
                                  updateScheduleField(
                                    endpoint.which,
                                    'time',
                                    format24hPartsToString(
                                      Number(e.target.value),
                                      p24.minute
                                    )
                                  )
                                }
                                className="flex-1 min-h-[38px] px-2.5 py-1.5 text-xs sm:text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              >
                                {Array.from({ length: 24 }, (_, h) => (
                                  <option key={h} value={h}>
                                    {String(h).padStart(2, '0')}
                                  </option>
                                ))}
                              </select>
                              <span className="font-mono-tabular font-bold text-slate-500">
                                :
                              </span>
                              <select
                                aria-label={`Feedback ${endpoint.which}ing minute (24-hour)`}
                                value={p24.minute}
                                onChange={(e) =>
                                  updateScheduleField(
                                    endpoint.which,
                                    'time',
                                    format24hPartsToString(
                                      p24.hour24,
                                      Number(e.target.value)
                                    )
                                  )
                                }
                                className="flex-1 min-h-[38px] px-2.5 py-1.5 text-xs sm:text-sm font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                              >
                                {Array.from({ length: 60 }, (_, m) => (
                                  <option key={m} value={m}>
                                    {String(m).padStart(2, '0')}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500">
                          {endpoint.iso
                            ? `${endpoint.setPrefix} ${formatScheduleDateTime(
                                endpoint.iso
                              )}`
                            : endpoint.emptyHint}
                        </p>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                  <div className="lg:col-span-8">
                    <label
                      htmlFor="fb-schedule-closed-msg"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Custom Message When Outside Scheduled Time (Optional)
                    </label>
                    <input
                      id="fb-schedule-closed-msg"
                      type="text"
                      maxLength={300}
                      value={draftConfig.scheduleClosedMessage}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          scheduleClosedMessage: e.target.value,
                        }))
                      }
                      placeholder="e.g. Evaluation opens during the final 30 minutes of the workshop."
                      className="w-full min-h-[38px] px-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs">
                    <div className="text-[11px] font-semibold text-slate-500">
                      Live Status Preview
                    </div>
                    <div
                      className={`mt-0.5 font-bold ${
                        draftScheduleEval.status === 'deactivated'
                          ? 'text-amber-700'
                          : draftScheduleEval.status === 'open'
                          ? 'text-emerald-700'
                          : draftScheduleEval.status === 'before-open'
                          ? 'text-amber-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {draftScheduleEval.status === 'deactivated' &&
                        'Deactivated (Paused by Admin)'}
                      {draftScheduleEval.status === 'open' &&
                        (draftScheduleEval.closeAtMs
                          ? `Open Now · Closes in ${formatScheduleCountdown(
                              draftScheduleEval.closeAtMs - Date.now()
                            )}`
                          : 'Open Now')}
                      {draftScheduleEval.status === 'before-open' &&
                        draftScheduleEval.openAtMs &&
                        `Opens in ${formatScheduleCountdown(
                          draftScheduleEval.openAtMs - Date.now()
                        )}`}
                      {draftScheduleEval.status === 'closed' &&
                        'Currently Closed'}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 bg-white/80 border border-blue-100 rounded-xl px-3.5 py-2.5">
                  {draftConfig.feedbackActive === false
                    ? 'Feedback is currently deactivated — participants cannot submit feedback until you reactivate it above.'
                    : 'Schedule restriction is off — participants can fill in Feedback & Evaluation anytime while the event session is active.'}
                </p>
                {draftConfig.feedbackActive === false && (
                  <div>
                    <label
                      htmlFor="fb-schedule-closed-msg-paused"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Custom Message Shown While Paused (Optional)
                    </label>
                    <input
                      id="fb-schedule-closed-msg-paused"
                      type="text"
                      maxLength={300}
                      value={draftConfig.scheduleClosedMessage}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          scheduleClosedMessage: e.target.value,
                        }))
                      }
                      placeholder="e.g. Evaluation will reopen once the closing keynote ends."
                      className="w-full min-h-[38px] px-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* 2. Menu Heading, Welcome Statement & Section Labels */}
          <section className="pt-4 border-t border-slate-200 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Feedback &amp; Evaluation Menu Statements &amp; Section Prompts
              </h3>
              <p className="text-xs text-slate-500">
                Customize the title, welcome statement, section headings, and written question displayed on the participant feedback menu.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-4">
                <label
                  htmlFor="fb-form-heading"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Menu / Form Heading
                </label>
                <input
                  id="fb-form-heading"
                  type="text"
                  maxLength={120}
                  value={draftConfig.formHeading}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      formHeading: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="lg:col-span-8">
                <label
                  htmlFor="fb-intro-note"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Welcome / Intro Statement
                </label>
                <input
                  id="fb-intro-note"
                  type="text"
                  maxLength={400}
                  value={draftConfig.introNote}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      introNote: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="lg:col-span-5">
                <label
                  htmlFor="fb-rating-title"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Rating Section Heading
                </label>
                <input
                  id="fb-rating-title"
                  type="text"
                  maxLength={140}
                  value={draftConfig.ratingSectionTitle}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      ratingSectionTitle: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="lg:col-span-7">
                <label
                  htmlFor="fb-rating-subtitle"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Rating Section Instruction / Statement
                </label>
                <input
                  id="fb-rating-subtitle"
                  type="text"
                  maxLength={300}
                  value={draftConfig.ratingSectionSubtitle}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      ratingSectionSubtitle: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="lg:col-span-5">
                <label
                  htmlFor="fb-checklist-title"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Checklist Section Heading
                </label>
                <input
                  id="fb-checklist-title"
                  type="text"
                  maxLength={140}
                  value={draftConfig.checklistSectionTitle}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      checklistSectionTitle: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="lg:col-span-7">
                <label
                  htmlFor="fb-checklist-subtitle"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Checklist Section Instruction / Statement
                </label>
                <input
                  id="fb-checklist-subtitle"
                  type="text"
                  maxLength={300}
                  value={draftConfig.checklistSectionSubtitle}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      checklistSectionSubtitle: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="lg:col-span-4">
                <label
                  htmlFor="fb-comment-label"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Written Comment Question Label
                </label>
                <input
                  id="fb-comment-label"
                  type="text"
                  maxLength={160}
                  value={draftConfig.commentQuestionLabel}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      commentQuestionLabel: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="lg:col-span-5">
                <label
                  htmlFor="fb-comment-placeholder"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Written Comment Placeholder / Hint
                </label>
                <input
                  id="fb-comment-placeholder"
                  type="text"
                  maxLength={240}
                  value={draftConfig.commentPlaceholder}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      commentPlaceholder: e.target.value,
                    }))
                  }
                  className="w-full min-h-[40px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="lg:col-span-3 flex items-end">
                <label className="w-full min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.requireWrittenComment}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        requireWrittenComment: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Written Comment Mandatory
                  </span>
                </label>
              </div>
            </div>

            {/* Supporting Document / Photo / Video Upload Settings */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-blue-700" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Supporting Document, Photo &amp; Video Attachment
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Allow participants to attach PDF (.pdf), JPEG photo (.jpg / .jpeg), or video (.mp4 / .mov) with their evaluation.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draftConfig.allowAttachment}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          allowAttachment: e.target.checked,
                          requireAttachment: e.target.checked
                            ? prev.requireAttachment
                            : false,
                        }))
                      }
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <span className="text-xs font-semibold text-slate-800">
                      Enable File Upload
                    </span>
                  </label>
                  {draftConfig.allowAttachment && (
                    <label className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={draftConfig.requireAttachment}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            requireAttachment: e.target.checked,
                          }))
                        }
                        className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <span className="text-xs font-semibold text-slate-800">
                        Mandatory Attachment
                      </span>
                    </label>
                  )}
                </div>
              </div>

              {draftConfig.allowAttachment && (
                <div>
                  <label
                    htmlFor="fb-attachment-label"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Attachment Section Heading
                  </label>
                  <input
                    id="fb-attachment-label"
                    type="text"
                    maxLength={160}
                    value={draftConfig.attachmentLabel}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        attachmentLabel: e.target.value,
                      }))
                    }
                    placeholder="4. Supporting Document, Photo, or Video"
                    className="w-full min-h-[38px] px-3 py-1.5 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Star Rating Criteria Editor */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  1–5 Star Rating Questions ({draftConfig.ratingCriteria.length}/12)
                </h3>
                <p className="text-xs text-slate-500">
                  Customize evaluation questions, reorder them, activate/deactivate items, or set them as mandatory.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={120}
                  value={newCriterionLabel}
                  onChange={(e) => setNewCriterionLabel(e.target.value)}
                  placeholder="New rating question..."
                  className="min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={handleAddCriterion}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Question</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {draftConfig.ratingCriteria.map((crit, idx) => (
                <div
                  key={crit.id}
                  className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70"
                >
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveCriterion(idx, -1)}
                      aria-label={`Move ${crit.label} up`}
                      className="min-h-[30px] min-w-[30px] rounded-md text-slate-500 hover:bg-white hover:text-slate-900 inline-flex items-center justify-center disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draftConfig.ratingCriteria.length - 1}
                      onClick={() => handleMoveCriterion(idx, 1)}
                      aria-label={`Move ${crit.label} down`}
                      className="min-h-[30px] min-w-[30px] rounded-md text-slate-500 hover:bg-white hover:text-slate-900 inline-flex items-center justify-center disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    maxLength={120}
                    value={crit.label}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        ratingCriteria: prev.ratingCriteria.map((c) =>
                          c.id === crit.id ? { ...c, label: e.target.value } : c
                        ),
                      }))
                    }
                    className="flex-1 min-w-[200px] min-h-[36px] px-3 py-1 text-xs sm:text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 px-2">
                    <input
                      type="checkbox"
                      checked={crit.active}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          ratingCriteria: prev.ratingCriteria.map((c) =>
                            c.id === crit.id
                              ? { ...c, active: e.target.checked }
                              : c
                          ),
                        }))
                      }
                    />
                    <span>Active</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 px-2">
                    <input
                      type="checkbox"
                      checked={crit.required}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          ratingCriteria: prev.ratingCriteria.map((c) =>
                            c.id === crit.id
                              ? { ...c, required: e.target.checked }
                              : c
                          ),
                        }))
                      }
                    />
                    <span>Mandatory</span>
                  </label>
                  <button
                    type="button"
                    disabled={draftConfig.ratingCriteria.length <= 1}
                    onClick={() =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        ratingCriteria: prev.ratingCriteria.filter(
                          (c) => c.id !== crit.id
                        ),
                      }))
                    }
                    className="min-h-[34px] min-w-[34px] rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center disabled:opacity-40"
                    aria-label={`Delete criterion ${crit.label}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Feedback Categories Manager */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Feedback Categories ({draftConfig.categories.length}/12)
                </h3>
                <p className="text-xs text-slate-500">
                  Organize quick feedback statements into Positive or Improvement Suggestion groups.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  maxLength={80}
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="New category name..."
                  className="min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <select
                  value={newCategorySentiment}
                  onChange={(e) =>
                    setNewCategorySentiment(
                      e.target.value === 'improvement'
                        ? 'improvement'
                        : 'positive'
                    )
                  }
                  className="min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="positive">Positive</option>
                  <option value="improvement">Suggestion / Improve</option>
                </select>
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {draftConfig.categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70"
                >
                  <input
                    type="text"
                    maxLength={80}
                    value={cat.name}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        categories: prev.categories.map((c) =>
                          c.id === cat.id ? { ...c, name: e.target.value } : c
                        ),
                      }))
                    }
                    className="flex-1 min-h-[34px] px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded border shrink-0 ${
                      cat.sentiment === 'improvement'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {cat.sentiment === 'improvement' ? 'Suggestion' : 'Positive'}
                  </span>
                  <button
                    type="button"
                    disabled={draftConfig.categories.length <= 1}
                    onClick={() => handleDeleteCategory(cat.id)}
                    className="min-h-[32px] min-w-[32px] rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center disabled:opacity-40"
                    aria-label={`Delete category ${cat.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Checklist Statements Editor */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Quick Feedback Checklist Statements ({draftConfig.statements.length}/40)
              </h3>
              <p className="text-xs text-slate-500">
                Add, edit, reorder, delete, activate/deactivate, or mark checklist statements as mandatory.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
              <select
                value={newStatementCategory}
                onChange={(e) => setNewStatementCategory(e.target.value)}
                aria-label="Category for new statement"
                className="min-h-[40px] px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-800"
              >
                {draftConfig.categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                maxLength={200}
                value={newStatementText}
                onChange={(e) => setNewStatementText(e.target.value)}
                placeholder="Type a new feedback statement..."
                className="flex-1 min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={handleAddStatement}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Statement</span>
              </button>
            </div>

            <div className="space-y-2">
              {draftConfig.statements.map((stmt, idx) => (
                <div
                  key={stmt.id}
                  className="flex flex-wrap lg:flex-nowrap items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-white"
                >
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveStatement(idx, -1)}
                      aria-label={`Move statement ${stmt.text} up`}
                      className="min-h-[30px] min-w-[30px] rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 inline-flex items-center justify-center disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draftConfig.statements.length - 1}
                      onClick={() => handleMoveStatement(idx, 1)}
                      aria-label={`Move statement ${stmt.text} down`}
                      className="min-h-[30px] min-w-[30px] rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 inline-flex items-center justify-center disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <select
                    value={stmt.categoryId}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        statements: prev.statements.map((s) =>
                          s.id === stmt.id
                            ? { ...s, categoryId: e.target.value }
                            : s
                        ),
                      }))
                    }
                    className="min-h-[36px] px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-800"
                  >
                    {draftConfig.categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    maxLength={200}
                    value={stmt.text}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        statements: prev.statements.map((s) =>
                          s.id === stmt.id ? { ...s, text: e.target.value } : s
                        ),
                      }))
                    }
                    className="flex-1 min-w-[220px] min-h-[36px] px-3 py-1 text-xs sm:text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />

                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 px-2">
                    <input
                      type="checkbox"
                      checked={stmt.active}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          statements: prev.statements.map((s) =>
                            s.id === stmt.id
                              ? { ...s, active: e.target.checked }
                              : s
                          ),
                        }))
                      }
                    />
                    <span>Active</span>
                  </label>

                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 px-2">
                    <input
                      type="checkbox"
                      checked={stmt.required}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          statements: prev.statements.map((s) =>
                            s.id === stmt.id
                              ? { ...s, required: e.target.checked }
                              : s
                          ),
                        }))
                      }
                    />
                    <span>Mandatory</span>
                  </label>

                  <button
                    type="button"
                    onClick={() =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        statements: prev.statements.filter(
                          (s) => s.id !== stmt.id
                        ),
                      }))
                    }
                    className="min-h-[34px] min-w-[34px] rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center"
                    aria-label={`Delete statement ${stmt.text}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Custom Open-Ended Questions Editor */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Additional Open-Ended Questions ({draftConfig.customQuestions.length}/6)
              </h3>
              <p className="text-xs text-slate-500">
                Add optional reflection or topic questions (for example: &ldquo;What was your key takeaway?&rdquo; or &ldquo;What topic should we offer next?&rdquo;).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
              <input
                type="text"
                maxLength={200}
                value={newCustomQuestionPrompt}
                onChange={(e) => setNewCustomQuestionPrompt(e.target.value)}
                placeholder="Question prompt (e.g. What was your biggest takeaway?)..."
                className="sm:col-span-6 min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <input
                type="text"
                maxLength={200}
                value={newCustomQuestionPlaceholder}
                onChange={(e) =>
                  setNewCustomQuestionPlaceholder(e.target.value)
                }
                placeholder="Optional answer placeholder..."
                className="sm:col-span-4 min-h-[40px] px-3 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={handleAddCustomQuestion}
                className="sm:col-span-2 min-h-[40px] px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question</span>
              </button>
            </div>

            {draftConfig.customQuestions.length > 0 && (
              <div className="space-y-2">
                {draftConfig.customQuestions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="flex flex-wrap lg:flex-nowrap items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveCustomQuestion(idx, -1)}
                        aria-label={`Move question ${q.prompt} up`}
                        className="min-h-[30px] min-w-[30px] rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === draftConfig.customQuestions.length - 1}
                        onClick={() => handleMoveCustomQuestion(idx, 1)}
                        aria-label={`Move question ${q.prompt} down`}
                        className="min-h-[30px] min-w-[30px] rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 inline-flex items-center justify-center disabled:opacity-30"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <input
                      type="text"
                      maxLength={200}
                      value={q.prompt}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          customQuestions: prev.customQuestions.map((item) =>
                            item.id === q.id
                              ? { ...item, prompt: e.target.value }
                              : item
                          ),
                        }))
                      }
                      placeholder="Question prompt"
                      className="flex-1 min-w-[200px] min-h-[36px] px-3 py-1 text-xs sm:text-sm border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <input
                      type="text"
                      maxLength={200}
                      value={q.placeholder}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          customQuestions: prev.customQuestions.map((item) =>
                            item.id === q.id
                              ? { ...item, placeholder: e.target.value }
                              : item
                          ),
                        }))
                      }
                      placeholder="Hint placeholder"
                      className="w-full sm:w-52 min-h-[36px] px-3 py-1 text-xs border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 px-2">
                      <input
                        type="checkbox"
                        checked={q.active}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            customQuestions: prev.customQuestions.map((item) =>
                              item.id === q.id
                                ? { ...item, active: e.target.checked }
                                : item
                            ),
                          }))
                        }
                      />
                      <span>Active</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 px-2">
                      <input
                        type="checkbox"
                        checked={q.required}
                        onChange={(e) =>
                          setDraftConfig((prev) => ({
                            ...prev,
                            customQuestions: prev.customQuestions.map((item) =>
                              item.id === q.id
                                ? { ...item, required: e.target.checked }
                                : item
                            ),
                          }))
                        }
                      />
                      <span>Mandatory</span>
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          customQuestions: prev.customQuestions.filter(
                            (item) => item.id !== q.id
                          ),
                        }))
                      }
                      className="min-h-[34px] min-w-[34px] rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center"
                      aria-label={`Delete question ${q.prompt}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Supporting Document / Photo / Video Preview Modal */}
      {previewingSub?.attachment && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attachment-preview-title"
        >
          <div className="w-full max-w-3xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="attachment-preview-title"
                  className="text-sm font-bold text-slate-900 truncate"
                >
                  {previewingSub.attachment.fileName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {previewingSub.participantName?.trim() || 'Anonymous Participant'} ·{' '}
                  {previewingSub.eventTitle} ·{' '}
                  {formatAttachmentBytes(previewingSub.attachment.byteSize)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewBlobUrl && (
                  <a
                    href={previewBlobUrl}
                    download={previewingSub.attachment.fileName}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleCloseAttachmentModal}
                  aria-label="Close attachment preview"
                  className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto flex-1 bg-slate-50 flex items-center justify-center min-h-[260px]">
              {loadingPreview ? (
                <div className="flex flex-col items-center gap-2.5 text-slate-600">
                  <Loader2 className="w-7 h-7 animate-spin text-blue-700" />
                  <span className="text-xs font-medium">
                    Loading supporting attachment...
                  </span>
                </div>
              ) : previewError ? (
                <div className="max-w-md rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 text-center">
                  {previewError}
                </div>
              ) : previewBlobUrl ? (
                previewingSub.attachment.fileCategory === 'image' ? (
                  <img
                    src={previewBlobUrl}
                    alt={previewingSub.attachment.fileName}
                    className="max-h-[68vh] w-auto rounded-xl border border-slate-200 shadow-sm object-contain bg-white"
                  />
                ) : previewingSub.attachment.fileCategory === 'video' ? (
                  <video
                    src={previewBlobUrl}
                    controls
                    playsInline
                    className="max-h-[68vh] w-full rounded-xl border border-slate-200 bg-black"
                  />
                ) : (
                  <div className="w-full space-y-3">
                    <iframe
                      src={previewBlobUrl}
                      title={previewingSub.attachment.fileName}
                      className="w-full h-[65vh] rounded-xl border border-slate-200 bg-white"
                    />
                    <p className="text-[11px] text-slate-500 text-center">
                      If your browser blocks inline PDF rendering, use the Download button above to open it directly.
                    </p>
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
