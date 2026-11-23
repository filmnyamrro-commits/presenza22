import {
  AlertCircle,
  Award,
  Calendar,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Clock,
  Download,
  Eye,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageSquare,
  Paperclip,
  Send,
  Sparkles,
  Square,
  Star,
  Trash2,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { type User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  db,
  extractFirebaseErrorDetails,
  normalizeAdminEmail,
  reportFirestoreError,
} from '../firebase';
import {
  type DiagnosticErrorDetails,
  type EventRecord,
  type FeedbackConfig,
  type FeedbackCustomAnswer,
  type FeedbackRatingEntry,
  type FeedbackStatementSelection,
  OperationType,
  type OrganizationBranding,
  type ParticipationCertificateRecord,
  type ParticipationTemplateConfig,
} from '../types';
import { formatLocalDateYmd, generateSafeId } from '../utils/dateTime';
import {
  formatAttachmentBytes,
  prepareFeedbackAttachment,
  uploadFeedbackAttachment,
  type PreparedFeedbackAttachment,
} from '../utils/feedbackAttachment';
import {
  buildParticipationCertificateNumber,
  DEFAULT_PARTICIPATION_TEMPLATE,
  evaluateFeedbackSchedule,
  formatScheduleCountdown,
  formatScheduleDateTime,
  mergeFeedbackConfig,
  mergeParticipationTemplate,
} from '../utils/feedbackAndRecognitionDefaults';
import { downloadParticipationCertificatesPdf } from '../utils/pdfExport';
import { isValidEventIdParam } from '../utils/qrUrl';
import DiagnosticErrorPanel from './DiagnosticErrorPanel';
import ParticipationCertificateCanvas from './ParticipationCertificateCanvas';

interface ParticipantFeedbackProps {
  requestedEventId: string | null;
  user?: User | null;
  onSelectEventId: (eventId: string | null) => void;
  onGoToCheckIn?: (eventId?: string | null) => void;
  onGoToAdmin?: () => void;
}

type QrEventNotice =
  | {
      kind: 'ended';
      eventTitle: string;
      eventDate?: string;
      venue?: string;
    }
  | {
      kind: 'unavailable';
    };

interface StoredCheckInHint {
  attendanceId?: string;
  fullName?: string;
  classDepartment?: string;
  participantEmail?: string;
  attendanceDate?: string;
  checkInTime?: string;
  status?: 'On Time' | 'Late';
}

interface StoredFeedbackReceipt {
  submissionId: string;
  eventId: string;
  eventTitle: string;
  averageRating: number;
  submittedAtIso: string;
  selectedCount: number;
  attachmentName?: string;
}

const STAR_LABELS: Record<number, string> = {
  1: 'Needs improvement',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

function readCheckInHint(eventId: string): StoredCheckInHint | null {
  try {
    const raw = window.localStorage.getItem(`presenza_last_checkin_${eventId}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCheckInHint;
  } catch {
    return null;
  }
}

function readFeedbackReceipt(eventId: string): StoredFeedbackReceipt | null {
  try {
    const raw = window.localStorage.getItem(
      `presenza_feedback_submitted_${eventId}`
    );
    if (!raw) return null;
    return JSON.parse(raw) as StoredFeedbackReceipt;
  } catch {
    return null;
  }
}

export default function ParticipantFeedback({
  requestedEventId,
  user = null,
  onSelectEventId,
  onGoToCheckIn,
  onGoToAdmin,
}: ParticipantFeedbackProps) {
  const [activeEvents, setActiveEvents] = useState<EventRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [resolvingRequestedEvent, setResolvingRequestedEvent] = useState(() =>
    Boolean(requestedEventId)
  );
  const [qrEventNotice, setQrEventNotice] = useState<QrEventNotice | null>(
    null
  );
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventDiagnostic, setEventDiagnostic] =
    useState<DiagnosticErrorDetails | null>(null);

  const [feedbackConfig, setFeedbackConfig] = useState<FeedbackConfig>(() =>
    mergeFeedbackConfig(null, 'default')
  );
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Interactive Form State
  const [ratingsMap, setRatingsMap] = useState<Record<string, number>>({});
  const [selectedStatementIds, setSelectedStatementIds] = useState<Set<string>>(
    () => new Set()
  );
  const [writtenComment, setWrittenComment] = useState('');
  const [customAnswersMap, setCustomAnswersMap] = useState<
    Record<string, string>
  >({});
  const [participantName, setParticipantName] = useState('');
  const [participantDepartment, setParticipantDepartment] = useState('');
  const [linkedAttendanceId, setLinkedAttendanceId] = useState('');

  // Attachment state (PDF, JPEG photo, or MP4/MOV video)
  const [preparedAttachment, setPreparedAttachment] =
    useState<PreparedFeedbackAttachment | null>(null);
  const [preparingAttachment, setPreparingAttachment] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [showInlinePdfPreview, setShowInlinePdfPreview] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submittedReceipt, setSubmittedReceipt] =
    useState<StoredFeedbackReceipt | null>(null);

  const [participationTemplate, setParticipationTemplate] =
    useState<ParticipationTemplateConfig>(DEFAULT_PARTICIPATION_TEMPLATE);
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);
  const [showCertPreviewModal, setShowCertPreviewModal] = useState(false);

  // Load Participation Template & Branding for automatic participant certificate delivery
  useEffect(() => {
    const unsubTemplate = onSnapshot(
      doc(db, 'participationTemplates', 'default'),
      (snap) => {
        if (snap.exists()) {
          setParticipationTemplate(
            mergeParticipationTemplate(
              snap.data() as Partial<ParticipationTemplateConfig>
            )
          );
        } else {
          setParticipationTemplate(DEFAULT_PARTICIPATION_TEMPLATE);
        }
      },
      () => {
        setParticipationTemplate(DEFAULT_PARTICIPATION_TEMPLATE);
      }
    );
    const unsubBrand = onSnapshot(
      doc(db, 'branding', 'default'),
      (snap) => {
        if (snap.exists()) {
          setBranding(snap.data() as OrganizationBranding);
        } else {
          setBranding(null);
        }
      },
      () => {
        setBranding(null);
      }
    );
    return () => {
      unsubTemplate();
      unsubBrand();
    };
  }, []);

  // Subscribe to open active events
  useEffect(() => {
    setLoadingEvents(true);
    const eventsQuery = query(
      collection(db, 'events'),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const list: EventRecord[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EventRecord, 'id'>),
        }));
        list.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
        setActiveEvents(list);
        setLoadingEvents(false);
      },
      (error) => {
        setLoadingEvents(false);
        const info = reportFirestoreError(error, OperationType.LIST, 'events');
        setEventError(
          `Unable to load active feedback sessions (${info.code || 'firestore-error'}).`
        );
        setEventDiagnostic({
          title: 'Active Sessions Listener Failed',
          message: info.error,
          failingUrl: window.location.href,
          firebaseCode: info.code || undefined,
          firebaseMessage: info.error,
          consoleError: `Firestore LIST events failed: ${info.error}`,
          component: 'ParticipantFeedback.subscribeActiveEvents',
        });
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time resolution for QR event or default active session
  useEffect(() => {
    setEventError(null);
    setEventDiagnostic(null);

    if (!requestedEventId) {
      setQrEventNotice(null);
      setResolvingRequestedEvent(false);
      if (!loadingEvents) {
        setSelectedEvent(activeEvents[0] ?? null);
      }
      return;
    }

    if (!isValidEventIdParam(requestedEventId)) {
      setSelectedEvent(null);
      setQrEventNotice({ kind: 'unavailable' });
      setEventError('This event or event name is not available.');
      setResolvingRequestedEvent(false);
      return;
    }

    setResolvingRequestedEvent(true);
    const unsubRequested = onSnapshot(
      doc(db, 'events', requestedEventId),
      (snap) => {
        if (!snap.exists()) {
          setSelectedEvent(null);
          setQrEventNotice({ kind: 'unavailable' });
          setEventError('This event or event name is not available.');
          setResolvingRequestedEvent(false);
          return;
        }

        const data = snap.data() as Omit<EventRecord, 'id'>;
        const cleanTitle = data.title?.trim() || '';

        if (!cleanTitle) {
          setSelectedEvent(null);
          setQrEventNotice({ kind: 'unavailable' });
          setEventError('This event or event name is not available.');
          setResolvingRequestedEvent(false);
          return;
        }

        if (data.status !== 'active') {
          setSelectedEvent(null);
          setQrEventNotice({
            kind: 'ended',
            eventTitle: cleanTitle,
            eventDate: data.eventDate,
            venue: data.venue,
          });
          setEventError(`The event "${cleanTitle}" has ended.`);
          setResolvingRequestedEvent(false);
          return;
        }

        setQrEventNotice(null);
        setEventError(null);
        setEventDiagnostic(null);
        setSelectedEvent({ id: snap.id, ...data });
        setResolvingRequestedEvent(false);
      },
      (err) => {
        const info = reportFirestoreError(
          err,
          OperationType.GET,
          `events/${requestedEventId}`
        );
        setSelectedEvent(null);
        setQrEventNotice(null);
        setEventError(
          `Unable to load feedback session "${requestedEventId}" (${info.code || 'firestore-error'}).`
        );
        setEventDiagnostic({
          title: 'Session Lookup Failed',
          message: info.error,
          failingUrl: window.location.href,
          firebaseCode: info.code || undefined,
          firebaseMessage: info.error,
          consoleError: `Firestore GET events/${requestedEventId}: ${info.error}`,
          component: 'ParticipantFeedback.resolveEvent',
        });
        setResolvingRequestedEvent(false);
      }
    );

    return () => unsubRequested();
  }, [requestedEventId, activeEvents, loadingEvents]);

  // Live-subscribe to feedback form configuration (per-event override -> default -> built-in defaults) + check-in hint / duplicate receipt
  useEffect(() => {
    if (!selectedEvent) {
      setFeedbackConfig(mergeFeedbackConfig(null, 'default'));
      setSubmittedReceipt(null);
      return;
    }

    const eventId = selectedEvent.id;
    setLoadingConfig(true);
    setFormError(null);
    setRatingsMap({});
    setSelectedStatementIds(new Set());
    setWrittenComment('');
    setCustomAnswersMap({});
    setAttachmentError(null);
    setUploadProgress(null);
    setShowInlinePdfPreview(false);
    setPreparedAttachment((prev) => {
      if (prev?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return null;
    });

    const priorReceipt = readFeedbackReceipt(eventId);
    setSubmittedReceipt(priorReceipt);

    const checkInHint = readCheckInHint(eventId);
    setParticipantName(
      checkInHint?.fullName || user?.displayName?.trim() || ''
    );
    setParticipantDepartment(checkInHint?.classDepartment || '');
    setLinkedAttendanceId(checkInHint?.attendanceId || '');

    let eventCfgData: Partial<FeedbackConfig> | null | undefined = undefined;
    let defaultCfgData: Partial<FeedbackConfig> | null | undefined = undefined;

    const applyLatestConfig = () => {
      if (eventCfgData === undefined && defaultCfgData === undefined) return;
      const chosen = eventCfgData ?? defaultCfgData ?? null;
      setFeedbackConfig(mergeFeedbackConfig(chosen, eventId));
      if (eventCfgData !== undefined && (eventCfgData !== null || defaultCfgData !== undefined)) {
        setLoadingConfig(false);
      }
    };

    const unsubEventCfg = onSnapshot(
      doc(db, 'feedbackConfigs', eventId),
      (snap) => {
        eventCfgData = snap.exists()
          ? (snap.data() as Partial<FeedbackConfig>)
          : null;
        applyLatestConfig();
      },
      (error) => {
        reportFirestoreError(
          error,
          OperationType.GET,
          `feedbackConfigs/${eventId}`
        );
        eventCfgData = null;
        applyLatestConfig();
      }
    );

    const unsubDefaultCfg = onSnapshot(
      doc(db, 'feedbackConfigs', 'default'),
      (snap) => {
        defaultCfgData = snap.exists()
          ? (snap.data() as Partial<FeedbackConfig>)
          : null;
        applyLatestConfig();
      },
      (error) => {
        reportFirestoreError(
          error,
          OperationType.GET,
          'feedbackConfigs/default'
        );
        defaultCfgData = null;
        applyLatestConfig();
      }
    );

    return () => {
      unsubEventCfg();
      unsubDefaultCfg();
    };
  }, [selectedEvent?.id, user?.displayName]);

  // Live 1s clock while a feedback schedule window is active
  useEffect(() => {
    if (!feedbackConfig.scheduleEnabled) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [feedbackConfig.scheduleEnabled]);

  const scheduleEvaluation = useMemo(
    () => evaluateFeedbackSchedule(feedbackConfig, nowMs),
    [feedbackConfig, nowMs]
  );

  const activeCriteria = useMemo(
    () => feedbackConfig.ratingCriteria.filter((c) => c.active),
    [feedbackConfig.ratingCriteria]
  );

  const activeStatementsByCategory = useMemo(() => {
    const activeList = feedbackConfig.statements.filter((s) => s.active);
    return feedbackConfig.categories
      .map((cat) => ({
        category: cat,
        statements: activeList.filter((s) => s.categoryId === cat.id),
      }))
      .filter((group) => group.statements.length > 0);
  }, [feedbackConfig.categories, feedbackConfig.statements]);

  const activeCustomQuestions = useMemo(
    () => feedbackConfig.customQuestions.filter((q) => q.active && q.prompt.trim()),
    [feedbackConfig.customQuestions]
  );

  const ratedScores = useMemo(() => {
    const entries = activeCriteria
      .map((c) => ratingsMap[c.id])
      .filter((score): score is number => typeof score === 'number' && score >= 1);
    if (entries.length === 0) return { count: 0, average: 0 };
    const sum = entries.reduce((acc, s) => acc + s, 0);
    return {
      count: entries.length,
      average: Math.round((sum / entries.length) * 100) / 100,
    };
  }, [activeCriteria, ratingsMap]);

  const clearAttachment = () => {
    setAttachmentError(null);
    setShowInlinePdfPreview(false);
    setPreparedAttachment((prev) => {
      if (prev?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return null;
    });
  };

  const handleAttachmentFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAttachmentError(null);
    setFormError(null);
    setShowInlinePdfPreview(false);
    setPreparingAttachment(true);
    try {
      const prepared = await prepareFeedbackAttachment(file);
      setPreparedAttachment((prev) => {
        if (prev?.previewUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(prev.previewUrl);
        }
        return prepared;
      });
    } catch (err) {
      setAttachmentError(
        err instanceof Error
          ? err.message
          : 'Unable to prepare the selected document or media file.'
      );
    } finally {
      setPreparingAttachment(false);
    }
  };

  const toggleStatement = (id: string) => {
    setSelectedStatementIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent || submitting || submittedReceipt) return;
    setFormError(null);

    const liveSchedule = evaluateFeedbackSchedule(feedbackConfig, Date.now());
    if (!liveSchedule.isOpen) {
      setFormError(
        liveSchedule.status === 'deactivated'
          ? 'Feedback & Evaluation is currently deactivated by the organizer.'
          : liveSchedule.status === 'before-open'
          ? 'Feedback submissions are not open yet for this scheduled window.'
          : 'The scheduled window for submitting feedback has closed.'
      );
      return;
    }

    // 1. Validate mandatory rating criteria
    const missingCriteria = activeCriteria.filter(
      (c) => c.required && !(ratingsMap[c.id] >= 1 && ratingsMap[c.id] <= 5)
    );
    if (missingCriteria.length > 0) {
      setFormError(
        `Please rate "${missingCriteria[0].label}" before submitting your evaluation.`
      );
      return;
    }

    // 2. Validate mandatory checklist statements if any
    const missingRequiredStatement = feedbackConfig.statements.find(
      (s) => s.active && s.required && !selectedStatementIds.has(s.id)
    );
    if (missingRequiredStatement) {
      setFormError(
        `Please confirm the required feedback statement: "${missingRequiredStatement.text}"`
      );
      return;
    }

    // 3. Validate mandatory custom open-ended questions
    const missingCustomQuestion = activeCustomQuestions.find(
      (q) => q.required && (customAnswersMap[q.id] || '').trim().length < 2
    );
    if (missingCustomQuestion) {
      setFormError(
        `Please answer the required question: "${missingCustomQuestion.prompt}"`
      );
      return;
    }

    // 4. Validate written comment if mandatory
    const cleanComment = writtenComment.trim().slice(0, 1500);
    if (feedbackConfig.requireWrittenComment && cleanComment.length < 3) {
      setFormError(
        'Please share a brief comment or suggestion in the written feedback box.'
      );
      return;
    }

    // 5. Validate attachment if mandatory
    if (
      feedbackConfig.allowAttachment &&
      feedbackConfig.requireAttachment &&
      !preparedAttachment
    ) {
      setFormError(
        'Please add a supporting document (PDF), JPEG photo, or video (MP4 / MOV) before submitting.'
      );
      return;
    }

    // Build payload
    const ratingEntries: FeedbackRatingEntry[] = activeCriteria
      .filter((c) => ratingsMap[c.id] >= 1 && ratingsMap[c.id] <= 5)
      .map((c) => ({
        criterionId: c.id.slice(0, 80),
        label: c.label.slice(0, 120),
        score: ratingsMap[c.id],
      }));

    const customAnswerEntries: FeedbackCustomAnswer[] = activeCustomQuestions
      .map((q) => ({
        questionId: q.id.slice(0, 80),
        prompt: q.prompt.slice(0, 200),
        answer: (customAnswersMap[q.id] || '').trim().slice(0, 1000),
      }))
      .filter((a) => a.answer.length > 0);

    if (
      ratingEntries.length === 0 &&
      selectedStatementIds.size === 0 &&
      !cleanComment &&
      customAnswerEntries.length === 0 &&
      !preparedAttachment
    ) {
      setFormError(
        'Please provide at least one star rating, checklist selection, written answer, or supporting file before submitting.'
      );
      return;
    }

    const avg =
      ratingEntries.length > 0
        ? Math.round(
            (ratingEntries.reduce((acc, r) => acc + r.score, 0) /
              ratingEntries.length) *
              100
          ) / 100
        : 0;

    const categoryMap = new Map(
      feedbackConfig.categories.map((c) => [c.id, c])
    );
    const statementSelections: FeedbackStatementSelection[] =
      feedbackConfig.statements
        .filter((s) => s.active && selectedStatementIds.has(s.id))
        .map((s) => {
          const cat = categoryMap.get(s.categoryId);
          return {
            statementId: s.id.slice(0, 80),
            categoryId: s.categoryId.slice(0, 80),
            categoryName: (cat?.name || 'Feedback').slice(0, 80),
            sentiment: cat?.sentiment === 'improvement' ? 'improvement' : 'positive',
            text: s.text.slice(0, 200),
          };
        });

    const submissionId = generateSafeId('fbk');
    const clientToken = generateSafeId('tok');
    const eventDateVal =
      /^\d{4}-\d{2}-\d{2}$/.test(selectedEvent.eventDate)
        ? selectedEvent.eventDate
        : formatLocalDateYmd(new Date());

    const payload: Record<string, unknown> = {
      eventId: selectedEvent.id,
      eventTitle: selectedEvent.title,
      eventDate: eventDateVal,
      eventVenue: (selectedEvent.venue || '').slice(0, 120),
      facilitatorName: (
        selectedEvent.facilitators?.trim() || 'Session Facilitator'
      ).slice(0, 200),
      sessionTopic: (
        selectedEvent.topic?.trim() ||
        selectedEvent.theme?.trim() ||
        selectedEvent.category ||
        ''
      ).slice(0, 200),
      ratings: ratingEntries,
      averageRating: avg,
      selectedStatements: statementSelections,
      writtenComment: cleanComment,
      clientSubmissionToken: clientToken,
      serverTimestamp: serverTimestamp(),
    };
    if (customAnswerEntries.length > 0) {
      payload.customAnswers = customAnswerEntries;
    }
    if (preparedAttachment) {
      payload.attachment = preparedAttachment.meta;
    }

    const cleanName = participantName.trim().slice(0, 100);
    const cleanDept = participantDepartment.trim().slice(0, 100);
    if (cleanName) payload.participantName = cleanName;
    if (cleanDept) payload.participantDepartment = cleanDept;

    const checkInHint = readCheckInHint(selectedEvent.id);
    const verifiedEmail =
      user?.email && user.emailVerified
        ? normalizeAdminEmail(user.email)
        : checkInHint?.participantEmail || '';
    if (verifiedEmail) {
      payload.participantEmail = verifiedEmail.slice(0, 128);
    }
    if (linkedAttendanceId && /^[a-zA-Z0-9_-]{1,128}$/.test(linkedAttendanceId)) {
      payload.attendanceId = linkedAttendanceId;
    }

    setSubmitting(true);
    setUploadProgress(preparedAttachment ? 0 : null);
    try {
      await setDoc(doc(db, 'feedbackSubmissions', submissionId), payload);

      if (preparedAttachment) {
        await uploadFeedbackAttachment({
          submissionId,
          eventId: selectedEvent.id,
          prepared: preparedAttachment,
          onProgress: (pct) => setUploadProgress(pct),
        });
      }

      const receipt: StoredFeedbackReceipt = {
        submissionId,
        eventId: selectedEvent.id,
        eventTitle: selectedEvent.title,
        averageRating: avg,
        submittedAtIso: new Date().toISOString(),
        selectedCount: statementSelections.length,
        ...(preparedAttachment
          ? { attachmentName: preparedAttachment.meta.fileName }
          : {}),
      };
      try {
        window.localStorage.setItem(
          `presenza_feedback_submitted_${selectedEvent.id}`,
          JSON.stringify(receipt)
        );
      } catch {
        // Ignore storage quota errors cleanly
      }
      clearAttachment();
      setSubmittedReceipt(receipt);
    } catch (error) {
      const { code, message } = extractFirebaseErrorDetails(error);
      reportFirestoreError(
        error,
        OperationType.CREATE,
        `feedbackSubmissions/${submissionId}`
      );
      if (
        code.includes('permission-denied') ||
        message.toLowerCase().includes('permission')
      ) {
        setFormError(
          'Unable to submit feedback. This session may have been closed or the scheduled window ended.'
        );
      } else {
        setFormError(`Unable to save feedback (${code || 'network-error'}): ${message}`);
      }
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  // Thank-You / Duplicate Prevention Screen
  if (selectedEvent && submittedReceipt) {
    const checkInHint = readCheckInHint(selectedEvent.id);
    const certAttendanceId =
      checkInHint?.attendanceId || linkedAttendanceId || '';
    const certParticipantName =
      checkInHint?.fullName?.trim() || participantName.trim();
    const autoCert: ParticipationCertificateRecord | null =
      certAttendanceId && certParticipantName
        ? {
            certificateNumber: buildParticipationCertificateNumber(
              selectedEvent.id,
              certAttendanceId,
              selectedEvent.eventDate
            ),
            attendanceId: certAttendanceId,
            eventId: selectedEvent.id,
            eventTitle: selectedEvent.title,
            eventDate:
              selectedEvent.eventDate || formatLocalDateYmd(new Date()),
            eventVenue: selectedEvent.venue || '',
            eventTopic:
              selectedEvent.topic?.trim() || selectedEvent.category || '',
            facilitators: selectedEvent.facilitators?.trim() || '',
            organizerName: branding?.organizationName?.trim() || 'PRESENZA',
            participantName: certParticipantName,
            participantDepartment:
              checkInHint?.classDepartment?.trim() ||
              participantDepartment.trim(),
            participantEmail: checkInHint?.participantEmail || '',
            checkInTime: checkInHint?.checkInTime || '',
            attendanceStatus: checkInHint?.status || 'On Time',
            issueDate:
              checkInHint?.attendanceDate ||
              selectedEvent.eventDate ||
              formatLocalDateYmd(new Date()),
          }
        : null;

    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 sm:p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Feedback Recorded</span>
              </span>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">
                Thank You for Your Evaluation
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
                Your evaluation for{' '}
                <span className="font-semibold text-slate-900">
                  {submittedReceipt.eventTitle}
                </span>{' '}
                has been saved safely. Duplicate submissions from this device for this event are prevented automatically.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  Average Rating
                </div>
                <div className="mt-1 text-xl font-bold font-mono-tabular text-amber-600 flex items-center justify-center gap-1">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                  <span>
                    {submittedReceipt.averageRating > 0
                      ? submittedReceipt.averageRating.toFixed(1)
                      : '—'}
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-medium text-slate-500">
                  Checklist Items
                </div>
                <div className="mt-1 text-xl font-bold font-mono-tabular text-slate-900">
                  {submittedReceipt.selectedCount}
                </div>
              </div>
            </div>
            {submittedReceipt.attachmentName && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-800">
                <Paperclip className="w-3.5 h-3.5" />
                <span>Attached: {submittedReceipt.attachmentName}</span>
              </div>
            )}

            {autoCert && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">
                      Certificate of Participation Ready
                    </div>
                    <div className="text-[11px] font-mono-tabular text-amber-900 mt-0.5 truncate">
                      {autoCert.certificateNumber} · {autoCert.participantName}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCertPreviewModal(true)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-700" />
                    <span>Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadParticipationCertificatesPdf(
                        [autoCert],
                        participationTemplate,
                        branding
                      )
                    }
                    className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs font-mono-tabular text-slate-500">
              Recorded: {submittedReceipt.submittedAtIso.slice(0, 16).replace('T', ' ')} UTC
            </span>
            {onGoToCheckIn && (
              <button
                type="button"
                onClick={() => onGoToCheckIn(selectedEvent.id)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors whitespace-nowrap"
              >
                Back to Event Check-In
              </button>
            )}
          </div>
        </div>

        {showCertPreviewModal && autoCert && (
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
                    Certificate of Participation · {autoCert.participantName}
                  </div>
                  <div className="text-xs font-mono-tabular text-slate-500">
                    {autoCert.certificateNumber}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCertPreviewModal(false)}
                  aria-label="Close certificate preview"
                  className="min-h-[36px] min-w-[36px] rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 sm:p-6 bg-slate-100">
                <ParticipationCertificateCanvas
                  template={participationTemplate}
                  branding={branding}
                  participantName={autoCert.participantName}
                  participantDepartment={autoCert.participantDepartment}
                  eventTitle={autoCert.eventTitle}
                  eventDate={autoCert.eventDate}
                  eventVenue={autoCert.eventVenue}
                  eventTopic={autoCert.eventTopic}
                  facilitators={autoCert.facilitators}
                  certificateNumber={autoCert.certificateNumber}
                  issueDate={autoCert.issueDate}
                />
              </div>
              <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadParticipationCertificatesPdf(
                      [autoCert],
                      participationTemplate,
                      branding
                    )
                  }
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Certificate (PDF)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (requestedEventId && resolvingRequestedEvent) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 flex items-center justify-center gap-3 text-sm font-medium text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-blue-700" />
          <span>Checking event status...</span>
        </div>
      </div>
    );
  }

  if (requestedEventId && qrEventNotice) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div
          role="alert"
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
        >
          <div className="px-6 py-6 sm:px-8 border-b border-slate-200 bg-amber-50/70 flex items-start gap-4">
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              {qrEventNotice.kind === 'ended' ? (
                <Clock className="w-6 h-6" />
              ) : (
                <AlertCircle className="w-6 h-6" />
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
                {qrEventNotice.kind === 'ended'
                  ? 'Event Ended · Feedback Closed'
                  : 'QR Link Unavailable'}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 text-balance">
                {qrEventNotice.kind === 'ended'
                  ? `${qrEventNotice.eventTitle} has ended`
                  : 'Event or Name Not Available'}
              </h1>
            </div>
          </div>

          <div className="px-6 py-6 sm:px-8 space-y-5">
            <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
              {qrEventNotice.kind === 'ended' ? (
                <>
                  The event{' '}
                  <strong className="font-semibold text-slate-900">
                    &ldquo;{qrEventNotice.eventTitle}&rdquo;
                  </strong>{' '}
                  has ended and is no longer accepting submissions.
                </>
              ) : (
                'This event or event name is not available. The QR code may have been removed, expired, or entered incorrectly.'
              )}
            </p>

            {qrEventNotice.kind === 'ended' && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                <span className="font-semibold text-slate-900">
                  {qrEventNotice.eventTitle}
                </span>
                {qrEventNotice.eventDate && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">
                      {qrEventNotice.eventDate}
                    </span>
                  </>
                )}
                {qrEventNotice.venue && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{qrEventNotice.venue}</span>
                    </span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-amber-800">Closed</span>
              </div>
            )}

            {(activeEvents.length > 0 || onGoToAdmin) && (
              <div className="pt-2 flex flex-wrap items-center gap-2.5">
                {activeEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onSelectEventId(activeEvents[0].id)}
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    Switch to Active Session
                  </button>
                )}
                {onGoToAdmin && (
                  <button
                    type="button"
                    onClick={onGoToAdmin}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    Open Admin Console
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6">
      {eventError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900 space-y-2"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <span>{eventError}</span>
            </div>
            {activeEvents.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectEventId(activeEvents[0].id)}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-amber-900 text-white text-xs font-semibold hover:bg-amber-800 whitespace-nowrap shrink-0"
              >
                Switch to Active Session
              </button>
            )}
          </div>
          {eventDiagnostic && (
            <DiagnosticErrorPanel diagnostic={eventDiagnostic} />
          )}
        </div>
      )}

      {!loadingEvents && activeEvents.length === 0 && !selectedEvent && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center space-y-3">
          <h1 className="text-xl font-bold text-slate-900">
            No Open Session for Feedback
          </h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {onGoToAdmin
              ? 'Open an active workshop or seminar session in the Admin Console to collect participant feedback and evaluations.'
              : 'Please scan an active event feedback QR code provided by your session facilitator.'}
          </p>
          {onGoToAdmin && (
            <button
              type="button"
              onClick={onGoToAdmin}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors"
            >
              Open Admin Console
            </button>
          )}
        </div>
      )}

      {selectedEvent && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Section 1: Event Information Card */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 space-y-5 lg:sticky lg:top-24">
            <div>
              <div className="flex items-center justify-between gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
                <span>{feedbackConfig.formHeading || 'Feedback & Evaluation'}</span>
                <span>No Login Required</span>
              </div>
              <h1 className="mt-2 text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {selectedEvent.title}
              </h1>
              {feedbackConfig.introNote && (
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                  {feedbackConfig.introNote}
                </p>
              )}
            </div>

            {!requestedEventId && activeEvents.length > 1 && (
              <div className="pt-4 border-t border-slate-100">
                <label
                  htmlFor="feedback-event-select"
                  className="block text-xs font-semibold text-slate-600 mb-1.5"
                >
                  Select Active Event ({activeEvents.length} open)
                </label>
                <select
                  id="feedback-event-select"
                  value={selectedEvent.id}
                  onChange={(e) => onSelectEventId(e.target.value || null)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {activeEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} ({ev.eventDate})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <dl className="pt-4 border-t border-slate-100 divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex items-start justify-between gap-3">
                <dt className="text-slate-500 inline-flex items-center gap-1.5 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Date</span>
                </dt>
                <dd className="font-mono-tabular font-semibold text-slate-900 text-right">
                  {selectedEvent.eventDate}
                </dd>
              </div>
              <div className="py-2.5 flex items-start justify-between gap-3">
                <dt className="text-slate-500 inline-flex items-center gap-1.5 shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>Location</span>
                </dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {selectedEvent.venue}
                </dd>
              </div>
              <div className="py-2.5 flex items-start justify-between gap-3">
                <dt className="text-slate-500 inline-flex items-center gap-1.5 shrink-0">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>Facilitator</span>
                </dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {selectedEvent.facilitators?.trim() || 'Session Facilitator'}
                </dd>
              </div>
              <div className="py-2.5 flex items-start justify-between gap-3">
                <dt className="text-slate-500 shrink-0">Session / Topic</dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {selectedEvent.topic?.trim() ||
                    selectedEvent.theme?.trim() ||
                    selectedEvent.category}
                </dd>
              </div>
            </dl>

            {ratedScores.count > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 flex items-center justify-between text-xs">
                <span className="font-medium text-amber-950">
                  Your Avg Rating ({ratedScores.count}/{activeCriteria.length})
                </span>
                <span className="font-mono-tabular font-bold text-amber-700 inline-flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                  {ratedScores.average.toFixed(1)} / 5.0
                </span>
              </div>
            )}
          </aside>

          {/* Right Form Sections or Scheduled / Deactivated Gate */}
          {!scheduleEvaluation.isOpen ? (
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5">
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    scheduleEvaluation.status === 'deactivated'
                      ? 'bg-slate-100 text-slate-700'
                      : scheduleEvaluation.status === 'before-open'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  <CalendarClock className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <span
                    className={`inline-block text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                      scheduleEvaluation.status === 'deactivated'
                        ? 'bg-slate-100 text-slate-700'
                        : scheduleEvaluation.status === 'before-open'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {scheduleEvaluation.status === 'deactivated'
                      ? 'Feedback Deactivated'
                      : scheduleEvaluation.status === 'before-open'
                      ? 'Feedback Opens Soon'
                      : 'Feedback Window Closed'}
                  </span>
                  <h2 className="text-xl font-bold text-slate-900">
                    {scheduleEvaluation.status === 'deactivated'
                      ? 'Feedback & Evaluation Is Currently Paused'
                      : scheduleEvaluation.status === 'before-open'
                      ? 'Feedback & Evaluation Is Not Open Yet'
                      : 'Feedback & Evaluation Window Has Ended'}
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {feedbackConfig.scheduleClosedMessage.trim()
                      ? feedbackConfig.scheduleClosedMessage
                      : scheduleEvaluation.status === 'deactivated'
                      ? 'The organizer has temporarily deactivated feedback & evaluation for this session. This page will unlock automatically as soon as it is activated.'
                      : scheduleEvaluation.status === 'before-open'
                      ? 'The organizer has scheduled a specific time window for submitting evaluations. This page will unlock automatically once the opening time is reached.'
                      : 'The scheduled time window for filling in feedback and evaluations for this session has passed.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {scheduleEvaluation.openAtDate && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Opens At
                    </div>
                    <div className="mt-1 text-sm font-bold font-mono-tabular text-slate-900">
                      {formatScheduleDateTime(scheduleEvaluation.openAtDate)}
                    </div>
                  </div>
                )}
                {scheduleEvaluation.closeAtDate && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Closes At
                    </div>
                    <div className="mt-1 text-sm font-bold font-mono-tabular text-slate-900">
                      {formatScheduleDateTime(scheduleEvaluation.closeAtDate)}
                    </div>
                  </div>
                )}
              </div>

              {scheduleEvaluation.status === 'before-open' &&
                scheduleEvaluation.openAtMs !== null && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-amber-900 inline-flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-700" />
                      <span>Time remaining until feedback opens</span>
                    </span>
                    <span className="font-mono-tabular text-sm font-bold text-amber-900">
                      {formatScheduleCountdown(
                        scheduleEvaluation.openAtMs - nowMs
                      )}
                    </span>
                  </div>
                )}

              {onGoToCheckIn && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => onGoToCheckIn(selectedEvent.id)}
                    className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors"
                  >
                    Back to Event Check-In
                  </button>
                </div>
              )}
            </div>
          ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-8"
          >
            {feedbackConfig.scheduleEnabled && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-900">
                <span className="font-semibold inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Evaluation window is open now</span>
                </span>
                {scheduleEvaluation.closeAtMs !== null &&
                  scheduleEvaluation.closeAtDate && (
                    <span className="font-mono-tabular font-semibold">
                      Closes {formatScheduleDateTime(scheduleEvaluation.closeAtDate)} (
                      {formatScheduleCountdown(
                        scheduleEvaluation.closeAtMs - nowMs
                      )}{' '}
                      left)
                    </span>
                  )}
              </div>
            )}

            {loadingConfig && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                <span>Loading customized evaluation form...</span>
              </div>
            )}

            {/* Section 2: Interactive 1–5 Star Satisfaction Rating */}
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {feedbackConfig.ratingSectionTitle}
                </h2>
                {feedbackConfig.ratingSectionSubtitle && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {feedbackConfig.ratingSectionSubtitle}
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {activeCriteria.map((criterion) => {
                  const score = ratingsMap[criterion.id] ?? 0;
                  return (
                    <div
                      key={criterion.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {criterion.label}{' '}
                          {criterion.required && (
                            <span className="text-rose-600">*</span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {score > 0
                            ? `${score} / 5 · ${STAR_LABELS[score]}`
                            : criterion.required
                            ? 'Required rating'
                            : 'Optional rating'}
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1 shrink-0"
                        role="radiogroup"
                        aria-label={criterion.label}
                      >
                        {[1, 2, 3, 4, 5].map((starValue) => {
                          const filled = starValue <= score;
                          return (
                            <button
                              key={starValue}
                              type="button"
                              onClick={() =>
                                setRatingsMap((prev) => ({
                                  ...prev,
                                  [criterion.id]: starValue,
                                }))
                              }
                              aria-label={`${criterion.label}: ${starValue} out of 5 stars`}
                              aria-checked={score === starValue}
                              role="radio"
                              className="min-w-[40px] min-h-[40px] rounded-lg flex items-center justify-center hover:bg-amber-50 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500"
                            >
                              <Star
                                className={`w-6 h-6 transition-transform ${
                                  filled
                                    ? 'fill-amber-400 text-amber-500 scale-105'
                                    : 'text-slate-300 hover:text-amber-300'
                                }`}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section 3: Quick Feedback / Checklist */}
            {activeStatementsByCategory.length > 0 && (
              <section className="pt-6 border-t border-slate-200 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {feedbackConfig.checklistSectionTitle}
                  </h2>
                  {feedbackConfig.checklistSectionSubtitle && (
                    <p className="text-xs text-slate-500 mt-0.5">
                      {feedbackConfig.checklistSectionSubtitle}
                    </p>
                  )}
                </div>

                <div className="space-y-5">
                  {activeStatementsByCategory.map(({ category, statements }) => (
                    <div key={category.id} className="space-y-2.5">
                      <h3
                        className={`text-xs font-bold uppercase tracking-wider ${
                          category.sentiment === 'positive'
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {category.name}
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {statements.map((stmt) => {
                          const checked = selectedStatementIds.has(stmt.id);
                          const isPositive = category.sentiment === 'positive';
                          return (
                            <button
                              key={stmt.id}
                              type="button"
                              onClick={() => toggleStatement(stmt.id)}
                              aria-pressed={checked}
                              className={`text-left p-3.5 rounded-xl border transition-colors flex items-start gap-2.5 ${
                                checked
                                  ? isPositive
                                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950'
                                    : 'border-amber-500 bg-amber-50/70 text-amber-950'
                                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              {checked ? (
                                <CheckSquare
                                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                                    isPositive
                                      ? 'text-emerald-700'
                                      : 'text-amber-700'
                                  }`}
                                />
                              ) : (
                                <Square className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
                              )}
                              <span className="text-xs sm:text-sm font-medium leading-snug">
                                {stmt.text}{' '}
                                {stmt.required && (
                                  <span className="text-rose-600 font-bold">*</span>
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Additional Custom Open-Ended Questions */}
            {activeCustomQuestions.length > 0 && (
              <section className="pt-6 border-t border-slate-200 space-y-4">
                {activeCustomQuestions.map((q) => {
                  const val = customAnswersMap[q.id] || '';
                  return (
                    <div key={q.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`custom-q-${q.id}`}
                          className="text-sm font-bold text-slate-900"
                        >
                          {q.prompt}{' '}
                          {q.required && (
                            <span className="text-rose-600">*</span>
                          )}
                        </label>
                        <span className="text-[11px] font-mono-tabular text-slate-400">
                          {val.length}/1000
                        </span>
                      </div>
                      <textarea
                        id={`custom-q-${q.id}`}
                        rows={2}
                        maxLength={1000}
                        value={val}
                        onChange={(e) =>
                          setCustomAnswersMap((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }))
                        }
                        placeholder={
                          q.placeholder || 'Write your response here...'
                        }
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  );
                })}
              </section>
            )}

            {/* Section 4: Written Comments */}
            <section className="pt-6 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="feedback-written-comment"
                  className="text-lg font-bold text-slate-900 inline-flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4 text-blue-700" />
                  <span>
                    {feedbackConfig.commentQuestionLabel}{' '}
                    {feedbackConfig.requireWrittenComment && (
                      <span className="text-rose-600">*</span>
                    )}
                  </span>
                </label>
                <span className="text-xs font-mono-tabular text-slate-400">
                  {writtenComment.length}/1500
                </span>
              </div>
              <textarea
                id="feedback-written-comment"
                rows={4}
                maxLength={1500}
                value={writtenComment}
                onChange={(e) => setWrittenComment(e.target.value)}
                placeholder={
                  feedbackConfig.commentPlaceholder ||
                  'Please share your comments, suggestions, or recommendations.'
                }
                className="w-full px-4 py-3 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </section>

            {/* Section 4: Supporting Document, JPEG Photo, or Video (PDF / JPG / MP4 / MOV) */}
            {feedbackConfig.allowAttachment && (
              <section className="pt-6 border-t border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <label
                    htmlFor="feedback-attachment-input"
                    className="text-lg font-bold text-slate-900 inline-flex items-center gap-2"
                  >
                    <Paperclip className="w-4 h-4 text-blue-700" />
                    <span>
                      {feedbackConfig.attachmentLabel ||
                        '4. Supporting Document, Photo, or Video'}{' '}
                      {feedbackConfig.requireAttachment && (
                        <span className="text-rose-600">*</span>
                      )}
                    </span>
                  </label>
                  <span className="text-xs text-slate-500">
                    PDF, JPEG, MP4, or MOV · Max 5 MB
                  </span>
                </div>

                <input
                  id="feedback-attachment-input"
                  ref={attachmentInputRef}
                  type="file"
                  accept="application/pdf,.pdf,image/jpeg,.jpg,.jpeg,video/mp4,.mp4,video/quicktime,.mov"
                  onChange={handleAttachmentFileChange}
                  className="hidden"
                />

                {!preparedAttachment ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 sm:p-5 space-y-3">
                    <button
                      type="button"
                      disabled={preparingAttachment || submitting}
                      onClick={() => attachmentInputRef.current?.click()}
                      className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-sm font-semibold text-slate-900 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      {preparingAttachment ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-blue-700" />
                          <span>Preparing file...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 text-blue-700" />
                          <span>Add Document (PDF, JPEG Photo, or MP4 / MOV Video)</span>
                        </>
                      )}
                    </button>
                    <p className="text-xs text-slate-500 text-center">
                      Attach an evaluation sheet (.pdf), activity photo (.jpg / .jpeg), or reflection clip (.mp4 / .mov).
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                          {preparedAttachment.meta.fileCategory === 'pdf' ? (
                            <FileText className="w-5 h-5 text-rose-600" />
                          ) : preparedAttachment.meta.fileCategory === 'video' ? (
                            <Film className="w-5 h-5 text-indigo-600" />
                          ) : (
                            <ImageIcon className="w-5 h-5 text-emerald-600" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-slate-900 truncate">
                            {preparedAttachment.meta.fileName}
                          </div>
                          <div className="text-xs text-slate-500 font-mono-tabular">
                            {preparedAttachment.meta.mimeType === 'application/pdf'
                              ? 'PDF Document'
                              : preparedAttachment.meta.mimeType === 'image/jpeg'
                              ? 'JPEG Photo'
                              : preparedAttachment.meta.mimeType === 'video/quicktime'
                              ? 'MOV Video'
                              : 'MP4 Video'}{' '}
                            · {formatAttachmentBytes(preparedAttachment.meta.byteSize)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {preparedAttachment.meta.fileCategory === 'pdf' && (
                          <button
                            type="button"
                            onClick={() => setShowInlinePdfPreview((v) => !v)}
                            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800"
                          >
                            {showInlinePdfPreview ? 'Hide Preview' : 'Preview PDF'}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={submitting || preparingAttachment}
                          onClick={() => attachmentInputRef.current?.click()}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 disabled:opacity-50"
                        >
                          Replace File
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={clearAttachment}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>

                    {preparedAttachment.meta.fileCategory === 'image' && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-white max-w-xs">
                        <img
                          src={preparedAttachment.previewUrl}
                          alt={preparedAttachment.meta.fileName}
                          className="w-full max-h-56 object-contain bg-slate-100"
                        />
                      </div>
                    )}

                    {preparedAttachment.meta.fileCategory === 'video' && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-black">
                        <video
                          src={preparedAttachment.previewUrl}
                          controls
                          playsInline
                          className="w-full max-h-64 mx-auto"
                        />
                      </div>
                    )}

                    {preparedAttachment.meta.fileCategory === 'pdf' &&
                      showInlinePdfPreview && (
                        <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
                          <iframe
                            src={preparedAttachment.previewUrl}
                            title={preparedAttachment.meta.fileName}
                            className="w-full h-72"
                          />
                        </div>
                      )}
                  </div>
                )}

                {attachmentError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900"
                  >
                    {attachmentError}
                  </div>
                )}

                {uploadProgress !== null && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold text-blue-800">
                      <span>Uploading supporting file...</span>
                      <span className="font-mono-tabular">{uploadProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-blue-100 overflow-hidden">
                      <div
                        className="h-full bg-blue-700 transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Optional Participant Identification (auto-filled when checked in) */}
            <section className="pt-5 border-t border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600 inline-flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-blue-700" />
                  <span>Participant Identification (Optional)</span>
                </span>
                {linkedAttendanceId && (
                  <span className="text-[11px] font-semibold text-emerald-700">
                    Linked to check-in record
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  maxLength={100}
                  value={participantName}
                  onChange={(e) => setParticipantName(e.target.value)}
                  placeholder="Your name (optional, leave blank to stay anonymous)"
                  aria-label="Participant name (optional)"
                  className="min-h-[42px] px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <input
                  type="text"
                  maxLength={100}
                  value={participantDepartment}
                  onChange={(e) => setParticipantDepartment(e.target.value)}
                  placeholder={`${
                    selectedEvent.departmentLabel?.trim() ||
                    'Class / Department / School / City'
                  } (optional)`}
                  aria-label={`${
                    selectedEvent.departmentLabel?.trim() ||
                    'Class / Department / School / City'
                  } (optional)`}
                  className="min-h-[42px] px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </section>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm text-rose-800 font-medium"
              >
                {formError}
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {ratedScores.count > 0
                  ? `${ratedScores.count} rating(s) and ${selectedStatementIds.size} checklist item(s) ready.`
                  : 'Complete the star ratings and submit your evaluation.'}
              </span>
              <button
                type="submit"
                disabled={submitting || preparingAttachment}
                className="w-full sm:w-auto min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {submitting
                    ? uploadProgress !== null
                      ? `Uploading (${uploadProgress}%)...`
                      : 'Submitting...'
                    : 'Submit Feedback'}
                </span>
              </button>
            </div>
          </form>
          )}
        </div>
      )}
    </div>
  );
}
