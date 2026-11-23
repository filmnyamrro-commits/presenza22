import {
  AlertCircle,
  Award,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FlipHorizontal2,
  Loader2,
  MapPin,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Volume2,
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
  reportFirestoreError,
} from '../firebase';
import {
  type CheckInReceipt,
  type DiagnosticErrorDetails,
  type EventRecord,
  OperationType,
  type OrganizationBranding,
  type ParticipationCertificateRecord,
  type ParticipationTemplateConfig,
  type VoiceAnnouncementSettings,
} from '../types';
import { isValidEventIdParam } from '../utils/qrUrl';
import DiagnosticErrorPanel from './DiagnosticErrorPanel';
import ParticipationCertificateCanvas from './ParticipationCertificateCanvas';
import {
  buildCutoffDate,
  evaluateAttendanceStatus,
  formatClockTime,
  formatLocalDateYmd,
  generateSafeId,
} from '../utils/dateTime';
import {
  buildParticipationCertificateNumber,
  DEFAULT_PARTICIPATION_TEMPLATE,
  formatEventLocation,
  mergeParticipationTemplate,
} from '../utils/feedbackAndRecognitionDefaults';
import { captureVideoFrame, compressImageFile } from '../utils/imageCompress';
import { downloadParticipationCertificatesPdf } from '../utils/pdfExport';
import {
  DEFAULT_VOICE_SETTINGS,
  formatAnnouncementMessage,
  mergeVoiceSettings,
  speakAnnouncement,
  stopAllAnnouncements,
  unlockBrowserAudio,
} from '../utils/voiceAnnouncement';

interface ParticipantCheckInProps {
  requestedEventId: string | null;
  user?: User | null;
  onSelectEventId: (eventId: string | null) => void;
  onGoToFeedback?: (eventId: string) => void;
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

const CHECKIN_DEDUPE_STORAGE_KEY = 'presenza_checkin_receipts_v1';
const ACTIVE_CHECKIN_POINTER_KEY = 'presenza_active_checkin_pointer_v1';

function buildParticipantDedupeKey(
  eventId: string,
  fullName: string,
  classDepartment: string
): string {
  const normName = fullName.trim().toLowerCase().replace(/\s+/g, ' ');
  const normDept = classDepartment.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${eventId}::${normName}::${normDept}`;
}

function readSavedReceiptByKey(dedupeKey: string): CheckInReceipt | null {
  try {
    const raw = window.localStorage.getItem(CHECKIN_DEDUPE_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, CheckInReceipt>;
    return map[dedupeKey] ?? null;
  } catch {
    return null;
  }
}

function saveReceiptForDedupe(dedupeKey: string, receipt: CheckInReceipt): void {
  const writeMap = (entryReceipt: CheckInReceipt) => {
    const raw = window.localStorage.getItem(CHECKIN_DEDUPE_STORAGE_KEY);
    const map: Record<string, CheckInReceipt> = raw ? JSON.parse(raw) : {};
    map[dedupeKey] = entryReceipt;
    // Keep at most 20 recent receipts on device to stay well under storage quota
    const entries = Object.entries(map);
    const trimmed =
      entries.length > 20
        ? Object.fromEntries(entries.slice(entries.length - 20))
        : map;
    window.localStorage.setItem(
      CHECKIN_DEDUPE_STORAGE_KEY,
      JSON.stringify(trimmed)
    );
  };

  try {
    writeMap(receipt);
  } catch {
    // Fallback without photo bytes if browser storage quota is nearly full
    try {
      writeMap({ ...receipt, photoDataUrl: '' });
    } catch {
      // Ignore storage quota restrictions cleanly
    }
  }
}

function saveActiveReceiptForEvent(
  eventId: string,
  dedupeKey: string,
  receipt: CheckInReceipt
): void {
  try {
    const raw = window.localStorage.getItem(ACTIVE_CHECKIN_POINTER_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    map[eventId] = dedupeKey;
    window.localStorage.setItem(ACTIVE_CHECKIN_POINTER_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota restrictions cleanly
  }
  try {
    window.sessionStorage.setItem(
      `presenza_session_receipt_${eventId}`,
      JSON.stringify(receipt)
    );
  } catch {
    // Ignore sessionStorage restrictions cleanly
  }
}

function readActiveReceiptForEvent(eventId: string): CheckInReceipt | null {
  try {
    const sessionRaw = window.sessionStorage.getItem(
      `presenza_session_receipt_${eventId}`
    );
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw) as CheckInReceipt;
      if (parsed && parsed.eventId === eventId) return parsed;
    }
  } catch {
    // Ignore sessionStorage read issues
  }
  try {
    const raw = window.localStorage.getItem(ACTIVE_CHECKIN_POINTER_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    const dedupeKey = map[eventId];
    if (!dedupeKey) return null;
    return readSavedReceiptByKey(dedupeKey);
  } catch {
    return null;
  }
}

function clearActiveReceiptForEvent(eventId: string): void {
  try {
    const raw = window.localStorage.getItem(ACTIVE_CHECKIN_POINTER_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, string>;
      delete map[eventId];
      window.localStorage.setItem(
        ACTIVE_CHECKIN_POINTER_KEY,
        JSON.stringify(map)
      );
    }
  } catch {
    // Ignore storage restrictions
  }
  try {
    window.sessionStorage.removeItem(`presenza_session_receipt_${eventId}`);
  } catch {
    // Ignore sessionStorage restrictions
  }
}

function hasSubmittedFeedbackForEvent(eventId: string): boolean {
  try {
    return Boolean(
      window.localStorage.getItem(`presenza_feedback_submitted_${eventId}`)
    );
  } catch {
    return false;
  }
}

export default function ParticipantCheckIn({
  requestedEventId,
  onSelectEventId,
  onGoToFeedback,
  onGoToAdmin,
}: ParticipantCheckInProps) {
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

  const [now, setNow] = useState<Date>(() => new Date());

  // Form fields
  const [fullName, setFullName] = useState('');
  const [classDepartment, setClassDepartment] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [lateExcuse, setLateExcuse] = useState('');

  // Camera state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingPhoto, setProcessingPhoto] = useState(false);

  // Submit & receipt state
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formDiagnostic, setFormDiagnostic] =
    useState<DiagnosticErrorDetails | null>(null);
  const [duplicateReceipt, setDuplicateReceipt] = useState<CheckInReceipt | null>(null);
  const [receipt, setReceipt] = useState<CheckInReceipt | null>(() =>
    requestedEventId ? readActiveReceiptForEvent(requestedEventId) : null
  );

  // Voice announcement settings
  const [voiceSettings, setVoiceSettings] =
    useState<VoiceAnnouncementSettings>(DEFAULT_VOICE_SETTINGS);
  const [speakingReceipt, setSpeakingReceipt] = useState(false);

  // Automatic Participation Certificate template & branding
  const [participationTemplate, setParticipationTemplate] =
    useState<ParticipationTemplateConfig>(DEFAULT_PARTICIPATION_TEMPLATE);
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);
  const [receiptEventMeta, setReceiptEventMeta] = useState<EventRecord | null>(
    null
  );
  const [showCertPreviewModal, setShowCertPreviewModal] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const submitLockRef = useRef(false);

  // Load saved Voice Announcement Settings, Participation Template & Branding
  useEffect(() => {
    const unsubVoice = onSnapshot(
      doc(db, 'voiceSettings', 'default'),
      (snap) => {
        if (snap.exists()) {
          setVoiceSettings(
            mergeVoiceSettings(
              snap.data() as Partial<VoiceAnnouncementSettings>
            )
          );
        } else {
          setVoiceSettings(DEFAULT_VOICE_SETTINGS);
        }
      },
      () => {
        setVoiceSettings(DEFAULT_VOICE_SETTINGS);
      }
    );
    const unsubParticipation = onSnapshot(
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
    const unsubBranding = onSnapshot(
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
      unsubVoice();
      unsubParticipation();
      unsubBranding();
      stopAllAnnouncements();
    };
  }, []);

  // Load event metadata for receipt certificate (topic, venue, facilitators) even after page refresh
  useEffect(() => {
    const receiptEventId = receipt?.eventId;
    if (!receiptEventId || !isValidEventIdParam(receiptEventId)) {
      setReceiptEventMeta(null);
      return;
    }
    const unsubReceiptEvent = onSnapshot(
      doc(db, 'events', receiptEventId),
      (snap) => {
        if (snap.exists()) {
          setReceiptEventMeta({
            id: snap.id,
            ...(snap.data() as Omit<EventRecord, 'id'>),
          });
        }
      },
      () => {
        // Fallback to selectedEvent / receipt fields silently
      }
    );
    return () => unsubReceiptEvent();
  }, [receipt?.eventId]);

  // Live 1-second clock tick for accurate check-in time display
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Subscribe to active events
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
          `Unable to load active sessions from the database (${info.code || 'firestore-error'}).`
        );
        setEventDiagnostic({
          title: 'Active Sessions Listener Failed',
          message: info.error,
          failingUrl: window.location.href,
          firebaseCode: info.code || undefined,
          firebaseMessage: info.error,
          consoleError: `Firestore LIST events failed: ${info.error}`,
          component: 'ParticipantCheckIn.subscribeActiveEvents',
        });
      }
    );

    return () => unsubscribe();
  }, []);

  // Resolve requestedEventId in real time (so closing/removing an event immediately updates QR view) or default to first active event
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
            venue: formatEventLocation(data.venue, data.city) || data.venue,
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
          `Unable to load QR session "${requestedEventId}" (${info.code || 'firestore-error'}).`
        );
        setEventDiagnostic({
          title: 'Session Lookup Failed',
          message: info.error,
          failingUrl: window.location.href,
          firebaseCode: info.code || undefined,
          firebaseMessage: info.error,
          consoleError: `Firestore GET events/${requestedEventId}: ${info.error}`,
          component: 'ParticipantCheckIn.resolveEvent',
        });
        setResolvingRequestedEvent(false);
      }
    );

    return () => unsubRequested();
  }, [requestedEventId, activeEvents, loadingEvents]);

  // Restore saved check-in confirmation notification when participant returns to Check-In
  const activeTargetEventId = selectedEvent?.id || requestedEventId || null;
  useEffect(() => {
    if (!activeTargetEventId) {
      setReceipt(null);
      return;
    }
    const saved = readActiveReceiptForEvent(activeTargetEventId);
    setReceipt(saved);
  }, [activeTargetEventId]);

  // Camera stream lifecycle
  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setActiveStream(null);
    setCameraReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Attach MediaStream reliably once <video> is mounted (prevents iOS/Safari & fast-grant blank video)
  useEffect(() => {
    const video = videoRef.current;
    if (!cameraOpen || !activeStream || !video) return;

    let cancelled = false;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    video.autoplay = true;
    video.srcObject = activeStream;

    const markReady = () => {
      if (cancelled) return;
      if (video.videoWidth > 0 || video.readyState >= 2) {
        setCameraReady(true);
      }
    };

    const handleLoadedMetadata = () => {
      void video.play().catch(() => {
        // Ignore autoplay promise rejection if user gesture already active
      });
      markReady();
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', markReady);
    video.addEventListener('playing', markReady);

    if (video.readyState >= 2) {
      handleLoadedMetadata();
    } else {
      void video.play().catch(() => {
        // Will play once metadata arrives
      });
    }

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', markReady);
      video.removeEventListener('playing', markReady);
    };
  }, [cameraOpen, activeStream]);

  const startCamera = async (facing: 'user' | 'environment') => {
    setCameraError(null);
    setCameraReady(false);
    stopCameraStream();

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setCameraError(
        'Live browser camera requires a secure HTTPS connection. Please open the HTTPS attendance link, or tap "Use native phone camera app" below.'
      );
      setCameraOpen(false);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Live camera preview is not supported in this browser. Please tap "Use native phone camera app" below.'
      );
      setCameraOpen(false);
      return;
    }

    try {
      setCameraOpen(true);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (constraintErr) {
        const errName =
          constraintErr instanceof DOMException ? constraintErr.name : '';
        if (
          errName === 'OverconstrainedError' ||
          errName === 'NotFoundError' ||
          errName === 'TypeError'
        ) {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } else {
          throw constraintErr;
        }
      }

      streamRef.current = stream;
      setActiveStream(stream);
    } catch (err) {
      setCameraOpen(false);
      stopCameraStream();
      const errName = err instanceof DOMException ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied. Allow camera access in your browser site settings (Safari: Aa / Settings → Camera → Allow; Chrome: Lock icon → Permissions → Camera), or tap "Use native phone camera app" below.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError(
          'No live browser camera was detected on this device. Please ensure a camera is connected or tap "Use native phone camera app" below.'
        );
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraError(
          'Your camera is currently being used by another application. Close the other app and try again, or tap "Use native phone camera app" below.'
        );
      } else {
        const message =
          err instanceof Error ? err.message : 'Camera access is unavailable.';
        setCameraError(
          `Unable to open live camera (${message}). Please tap "Use native phone camera app" below.`
        );
      }
    }
  };

  const handleToggleFacing = () => {
    const next = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(next);
    void startCamera(next);
  };

  const handleCaptureSnapshot = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      setCameraError('Camera is still warming up. Please wait a moment and tap Capture Photo again.');
      return;
    }
    try {
      setProcessingPhoto(true);
      const dataUrl = captureVideoFrame(video, cameraFacing === 'user');
      setPhotoDataUrl(dataUrl);
      setCameraOpen(false);
      stopCameraStream();
      setFormError(null);
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : 'Could not capture photo.'
      );
    } finally {
      setProcessingPhoto(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCameraError(null);
    setFormError(null);
    setProcessingPhoto(true);
    try {
      const compressed = await compressImageFile(file);
      setPhotoDataUrl(compressed);
      setCameraOpen(false);
      stopCameraStream();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Unable to process selected photo.'
      );
    } finally {
      setProcessingPhoto(false);
    }
  };

  // Compute live automatic attendance metadata
  const cutoffDate = selectedEvent
    ? selectedEvent.cutoffTimestamp?.toDate
      ? selectedEvent.cutoffTimestamp.toDate()
      : buildCutoffDate(selectedEvent.eventDate, selectedEvent.lateCutoffTime)
    : null;

  const liveStatus = cutoffDate ? evaluateAttendanceStatus(now, cutoffDate) : 'On Time';
  const liveDateStr = formatLocalDateYmd(now);
  const liveTimeStr = formatClockTime(now);

  const departmentPresetOptions = useMemo(() => {
    const raw = selectedEvent?.departmentPresets || '';
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 12);
  }, [selectedEvent?.departmentPresets]);

  const customDepartmentLabel =
    selectedEvent?.departmentLabel?.trim() ||
    'Class / Department / School / City';
  const customConsentText =
    selectedEvent?.consentText?.trim() ||
    'I consent to the use of my submitted photo for PRESENZA verification and official professional development attendance records.';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || submitting) return;
    setFormError(null);
    setFormDiagnostic(null);
    setDuplicateReceipt(null);

    if (!selectedEvent) {
      setFormError('No active workshop or seminar session is selected.');
      return;
    }

    const cleanName = fullName.trim();
    const cleanDept = classDepartment.trim();

    if (cleanName.length < 2) {
      setFormError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (cleanDept.length < 1) {
      setFormError(`Please enter your ${customDepartmentLabel.toLowerCase()}.`);
      return;
    }
    if (!photoDataUrl) {
      setFormError('Please take a verification photo before submitting.');
      return;
    }
    if (!photoConsent) {
      setFormError('Please check the photo consent box before submitting.');
      return;
    }

    // Check accidental duplicate submission on this device for the same event + person
    const dedupeKey = buildParticipantDedupeKey(
      selectedEvent.id,
      cleanName,
      cleanDept
    );
    const existingReceipt = readSavedReceiptByKey(dedupeKey);
    if (existingReceipt) {
      setDuplicateReceipt(existingReceipt);
      setFormError(
        `${cleanName} (${cleanDept}) is already checked in to this session on this device. Duplicate submission prevented.`
      );
      return;
    }

    const submitMoment = new Date();
    const attendanceDate = formatLocalDateYmd(submitMoment);
    const checkInTime = formatClockTime(submitMoment);
    const eventCutoff = selectedEvent.cutoffTimestamp?.toDate
      ? selectedEvent.cutoffTimestamp.toDate()
      : buildCutoffDate(selectedEvent.eventDate, selectedEvent.lateCutoffTime);
    const computedStatus = evaluateAttendanceStatus(submitMoment, eventCutoff);
    const cleanExcuse = lateExcuse.trim().slice(0, 300);

    if (computedStatus === 'Late' && cleanExcuse.length < 3) {
      setFormError(
        'You are checking in after the cutoff time. Please type your excuse for being late before submitting.'
      );
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);

    try {
      // Server-side rate limit & duplicate-burst protection (gracefully skipped if static hosting)
      try {
        const guardResp = await fetch('/api/public/checkin-guard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: selectedEvent.id,
            fullName: cleanName,
            classDepartment: cleanDept,
          }),
        });
        const contentType = guardResp.headers.get('content-type') || '';
        if (
          contentType.includes('application/json') &&
          (guardResp.status === 429 ||
            guardResp.status === 409 ||
            guardResp.status === 400)
        ) {
          const guardData = (await guardResp.json().catch(() => null)) as {
            error?: string;
          } | null;
          const msg =
            guardData?.error ||
            'Duplicate or rapid check-in request blocked. Please wait a moment.';
          setFormError(msg);
          setFormDiagnostic({
            title: 'Check-In Guard Rejected Submission',
            message: msg,
            failingUrl: `${window.location.origin}/api/public/checkin-guard`,
            httpStatus: guardResp.status,
            component: 'ParticipantCheckIn.handleSubmit (checkin-guard)',
          });
          return;
        }
      } catch {
        // Non-blocking fallback when backend guard endpoint is unreachable
      }

      const attendanceId = generateSafeId('att');
      const finalExcuse = computedStatus === 'Late' ? cleanExcuse : '';

      const payload: Record<string, unknown> = {
        eventId: selectedEvent.id,
        eventName: selectedEvent.title,
        fullName: cleanName.slice(0, 100),
        classDepartment: cleanDept.slice(0, 100),
        photoDataUrl,
        photoConsent: true,
        attendanceDate,
        checkInTime,
        serverTimestamp: serverTimestamp(),
        status: computedStatus,
        lateExcuse: finalExcuse,
      };

      try {
        await setDoc(doc(db, 'attendances', attendanceId), payload);

        const nextReceipt: CheckInReceipt = {
          id: attendanceId,
          eventId: selectedEvent.id,
          eventName: selectedEvent.title,
          fullName: cleanName,
          classDepartment: cleanDept,
          photoDataUrl,
          attendanceDate,
          checkInTime,
          recordedAtIso: submitMoment.toISOString(),
          status: computedStatus,
          lateExcuse: finalExcuse,
        };

        saveReceiptForDedupe(dedupeKey, nextReceipt);
        saveActiveReceiptForEvent(selectedEvent.id, dedupeKey, nextReceipt);

        try {
          window.localStorage.setItem(
            `presenza_last_checkin_${selectedEvent.id}`,
            JSON.stringify({
              attendanceId,
              fullName: cleanName,
              classDepartment: cleanDept,
              participantEmail: '',
              attendanceDate,
              checkInTime,
              status: computedStatus,
            })
          );
        } catch {
          // Ignore storage quota restrictions cleanly
        }

        setReceipt(nextReceipt);

        if (voiceSettings.enabled && voiceSettings.announceOnCheckIn) {
          unlockBrowserAudio();
          const announcementText = formatAnnouncementMessage(voiceSettings, {
            name: cleanName,
            department: cleanDept,
            eventTitle: selectedEvent.title,
          });
          if (announcementText) {
            setSpeakingReceipt(true);
            void speakAnnouncement(announcementText, voiceSettings).finally(() => {
              setSpeakingReceipt(false);
            });
          }
        }
      } catch (error) {
        const { code, message } = extractFirebaseErrorDetails(error);
        reportFirestoreError(
          error,
          OperationType.CREATE,
          `attendances/${attendanceId}`
        );
        if (
          code.includes('permission-denied') ||
          message.toLowerCase().includes('permission')
        ) {
          setFormError(
            'Unable to record attendance. This session may have been closed or a field failed validation.'
          );
        } else {
          setFormError(
            `Unable to save attendance (${code || 'network-error'}): ${message}`
          );
        }
        setFormDiagnostic({
          title: 'Attendance Submission Failed',
          message,
          failingUrl: window.location.href,
          firebaseCode: code || undefined,
          firebaseMessage: message,
          consoleError: `Firestore CREATE attendances/${attendanceId}: ${message}`,
          component: 'ParticipantCheckIn.handleSubmit',
        });
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const handleResetForNext = () => {
    const targetId = receipt?.eventId || selectedEvent?.id || requestedEventId;
    if (targetId) {
      clearActiveReceiptForEvent(targetId);
    }
    setReceipt(null);
    setDuplicateReceipt(null);
    setFullName('');
    setClassDepartment('');
    setPhotoDataUrl(null);
    setPhotoConsent(false);
    setLateExcuse('');
    setFormError(null);
    setCameraError(null);
    stopCameraStream();
    setCameraOpen(false);
  };

  // Confirmation Receipt Screen
  if (receipt) {
    const feedbackAlreadyDone = hasSubmittedFeedbackForEvent(receipt.eventId);
    const eventMeta =
      receiptEventMeta?.id === receipt.eventId
        ? receiptEventMeta
        : selectedEvent?.id === receipt.eventId
        ? selectedEvent
        : null;
    const eventDateVal =
      eventMeta?.eventDate || receipt.attendanceDate || formatLocalDateYmd(new Date());
    const organizerName = branding?.organizationName?.trim() || 'PRESENZA';
    const autoCert: ParticipationCertificateRecord = {
      certificateNumber: buildParticipationCertificateNumber(
        receipt.eventId,
        receipt.id,
        eventDateVal
      ),
      attendanceId: receipt.id,
      eventId: receipt.eventId,
      eventTitle: eventMeta?.title || receipt.eventName,
      eventDate: eventDateVal,
      eventVenue: formatEventLocation(eventMeta?.venue, eventMeta?.city),
      eventTopic: eventMeta?.topic?.trim() || eventMeta?.category || '',
      facilitators:
        eventMeta?.picName?.trim() || eventMeta?.facilitators?.trim() || '',
      organizerName,
      participantName: receipt.fullName,
      participantDepartment: receipt.classDepartment,
      participantEmail: receipt.participantEmail || '',
      checkInTime: receipt.checkInTime,
      attendanceStatus: receipt.status,
      issueDate: receipt.attendanceDate || eventDateVal,
      cityName:
        eventMeta?.city?.trim() || participationTemplate.cityName || 'Jakarta',
      picPdTitle:
        eventMeta?.picTitle?.trim() || participationTemplate.picPdTitle || '',
      picPdName:
        eventMeta?.picName?.trim() || participationTemplate.picPdName || '',
      principalName:
        eventMeta?.principalName?.trim() ||
        participationTemplate.principalName ||
        '',
    };
    const langLabel =
      participationTemplate.languageFormat === 'english'
        ? 'English Format'
        : participationTemplate.languageFormat === 'bahasa'
        ? 'Bahasa Indonesia Format'
        : 'Bilingual (English & Bahasa)';

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-6 sm:px-8 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Check-In Successful · Attendance Recorded
                </h1>
                <p className="text-sm text-slate-600 mt-0.5">
                  Thank you, {receipt.fullName}. Your attendance for this session has already been saved with a verified server timestamp.
                </p>
              </div>
            </div>

            <div
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 ${
                receipt.status === 'On Time'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {receipt.status === 'On Time' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              ) : (
                <Clock className="w-4 h-4 text-amber-700" />
              )}
              <span>{receipt.status}</span>
            </div>
          </div>

          <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-4">
              <div className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
                {receipt.photoDataUrl ? (
                  <img
                    src={receipt.photoDataUrl}
                    alt={`${receipt.fullName} check-in verification`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 text-emerald-700 p-4 text-center">
                    <UserCheck className="w-10 h-10" />
                    <span className="text-xs font-semibold text-slate-600">
                      Verification Photo Recorded
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-2 text-center">
                Photo consent recorded
              </p>
            </div>

            <dl className="sm:col-span-8 divide-y divide-slate-100 text-sm">
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">Full Name</dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {receipt.fullName}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">
                  {eventMeta?.departmentLabel?.trim() ||
                    selectedEvent?.departmentLabel?.trim() ||
                    'Class / Department / School / City'}
                </dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {receipt.classDepartment}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">Event Name</dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {receipt.eventName}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">Attendance Date</dt>
                <dd className="font-mono-tabular font-medium text-slate-900 text-right">
                  {receipt.attendanceDate}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">Exact Check-In Time</dt>
                <dd className="font-mono-tabular font-medium text-slate-900 text-right">
                  {receipt.checkInTime}
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">Server Timestamp</dt>
                <dd className="font-mono-tabular text-xs text-slate-700 text-right">
                  Verified ({receipt.recordedAtIso.slice(0, 19).replace('T', ' ')} UTC)
                </dd>
              </div>
              <div className="py-3 flex justify-between gap-4">
                <dt className="text-slate-500">Attendance Status</dt>
                <dd className="font-semibold text-slate-900 text-right">
                  {receipt.status}
                </dd>
              </div>
              {receipt.participantEmail && (
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500">Verified Email</dt>
                  <dd className="font-medium text-slate-900 text-right break-all">
                    {receipt.participantEmail}
                  </dd>
                </div>
              )}
              {receipt.status === 'Late' && receipt.lateExcuse && (
                <div className="py-3 flex justify-between gap-4">
                  <dt className="text-slate-500 shrink-0">Late Excuse</dt>
                  <dd className="text-slate-800 text-right break-words max-w-xs">
                    {receipt.lateExcuse}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Automatic Certificate of Participation Card */}
          <div className="mx-6 sm:mx-8 mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-900">
                  Certificate of Participation / Sertifikat Partisipasi
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Automatically issued for your attendance · {langLabel}
                </div>
                <div className="text-[11px] font-mono-tabular font-semibold text-amber-900 mt-1">
                  No: {autoCert.certificateNumber}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowCertPreviewModal(true)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
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
                className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Certificate (PDF)</span>
              </button>
            </div>
          </div>

          <div className="px-6 py-4 sm:px-8 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              No account or email required. You may close this page now.
            </span>
            <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {voiceSettings.enabled && voiceSettings.showReplayWelcomeOnCheckIn && (
                <button
                  type="button"
                  onClick={() => {
                    unlockBrowserAudio();
                    const text = formatAnnouncementMessage(voiceSettings, {
                      name: receipt.fullName,
                      department: receipt.classDepartment,
                      eventTitle: receipt.eventName,
                    });
                    if (text) {
                      setSpeakingReceipt(true);
                      void speakAnnouncement(text, voiceSettings).finally(() => {
                        setSpeakingReceipt(false);
                      });
                    }
                  }}
                  disabled={speakingReceipt}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap disabled:opacity-70"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>
                    {speakingReceipt ? 'Announcing...' : 'Replay Welcome Voice'}
                  </span>
                </button>
              )}
              {onGoToFeedback && (
                <button
                  type="button"
                  onClick={() => onGoToFeedback(receipt.eventId)}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>
                    {feedbackAlreadyDone
                      ? 'View Feedback Confirmation'
                      : 'Give Session Feedback'}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={handleResetForNext}
                className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Check In Another Participant</span>
              </button>
            </div>
          </div>
        </div>

        {showCertPreviewModal && (
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
                    Certificate of Participation · {receipt.fullName}
                  </div>
                  <div className="text-xs font-mono-tabular text-slate-500">
                    {autoCert.certificateNumber} · {langLabel}
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
                  cityName={autoCert.cityName}
                  overridePicPdName={autoCert.picPdName}
                  overridePicPdTitle={autoCert.picPdTitle}
                  overridePrincipalName={autoCert.principalName}
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
                  ? 'Event Ended · Check-In Closed'
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
                  has ended and attendance check-in is now closed.
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
                    Back to Admin Console
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
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Notice if session lookup encountered a network/permission error */}
      {eventError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-sm text-amber-900 space-y-2"
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
                className="min-h-[40px] px-3.5 py-2 rounded-lg bg-amber-900 text-white text-xs font-semibold hover:bg-amber-800 transition-colors whitespace-nowrap shrink-0"
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
        <div className="mb-6 rounded-xl border border-slate-200 bg-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-900">
              No active session is currently open
            </h2>
            <p className="text-sm text-slate-600">
              {onGoToAdmin
                ? 'Sign in as an administrator to customize the attendance form, open a session, and share its QR code.'
                : 'Please scan a valid event QR code or wait for your session organizer to open check-in.'}
            </p>
          </div>
          {onGoToAdmin && (
            <button
              type="button"
              onClick={onGoToAdmin}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              Admin Sign In &amp; Customize
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left Column: Session Information & Live Automatic Telemetry */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-blue-700">
              <span>INSTANT QR CHECK-IN</span>
              <span>NO LOGIN REQUIRED</span>
            </div>

            {loadingEvents ? (
              <div className="mt-3 space-y-2 animate-pulse">
                <div className="h-7 bg-slate-200 rounded w-3/4" />
                <div className="h-4 bg-slate-100 rounded w-1/2" />
              </div>
            ) : selectedEvent ? (
              <>
                <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight text-balance">
                  {selectedEvent.title}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{selectedEvent.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {formatEventLocation(selectedEvent.venue, selectedEvent.city)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{selectedEvent.eventDate}</span>
                </div>
                {selectedEvent.description && (
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                    {selectedEvent.description}
                  </p>
                )}
              </>
            ) : (
              <div className="mt-2">
                <h1 className="text-2xl font-bold text-slate-900">
                  PRESENZA
                </h1>
                <p className="mt-1.5 text-sm text-slate-600">
                  Scan an event QR code or select an open workshop session to record your attendance immediately.
                </p>
              </div>
            )}
          </div>

          {/* Session Switcher if multiple active sessions exist and not strictly locked or user wants to switch */}
          {activeEvents.length > 1 && (
            <div className="pt-4 border-t border-slate-100">
              <label
                htmlFor="session-select"
                className="block text-xs font-semibold text-slate-600 mb-1.5"
              >
                Active Session ({activeEvents.length} open)
              </label>
              <select
                id="session-select"
                value={selectedEvent?.id ?? ''}
                onChange={(e) => onSelectEventId(e.target.value || null)}
                className="w-full min-h-[44px] px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {activeEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} ({ev.eventDate})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Live Automatic Metadata Panel */}
          <div className="pt-5 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Recorded Automatically
              </span>
              {selectedEvent && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold ${
                    liveStatus === 'On Time'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {liveStatus === 'On Time' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-amber-700" />
                  )}
                  <span>{liveStatus}</span>
                </span>
              )}
            </div>

            <dl className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex items-center justify-between gap-3">
                <dt className="text-slate-500">Attendance Date</dt>
                <dd className="font-mono-tabular font-medium text-slate-900">
                  {liveDateStr}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <dt className="text-slate-500">Exact Check-In Time</dt>
                <dd className="font-mono-tabular font-semibold text-slate-900">
                  {liveTimeStr}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <dt className="text-slate-500">Late Cutoff</dt>
                <dd className="font-mono-tabular text-slate-700">
                  {selectedEvent ? selectedEvent.lateCutoffTime : '—'}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-3">
                <dt className="text-slate-500">Server Timestamp</dt>
                <dd className="text-xs font-medium text-slate-700">
                  Synced on submit
                </dd>
              </div>
            </dl>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span>
              No sign-up, account, email address, OTP, or password is required to mark attendance.
            </span>
          </div>
        </section>

        {/* Right Column: Participant Attendance Form */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-8 min-w-0">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">
              Participant Check-In Form
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Complete the fields below, take your verification photo, and confirm photo consent to submit.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* 1. Full Name */}
            <div>
              <label
                htmlFor="full-name"
                className="block text-sm font-semibold text-slate-900 mb-2"
              >
                1. Full Name <span className="text-rose-600">*</span>
              </label>
              <input
                id="full-name"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                maxLength={100}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="w-full min-h-[48px] px-4 py-3 text-base bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
            </div>

            {/* 2. Class / Department (free-text entry with optional quick-select presets) */}
            <div>
              <label
                htmlFor="class-department"
                className="block text-sm font-semibold text-slate-900 mb-2"
              >
                2. {customDepartmentLabel} <span className="text-rose-600">*</span>
              </label>
              <input
                id="class-department"
                name="classDepartment"
                type="text"
                required
                maxLength={100}
                value={classDepartment}
                onChange={(e) => setClassDepartment(e.target.value)}
                placeholder={`Type your ${customDepartmentLabel.toLowerCase()}`}
                className="w-full min-h-[48px] px-4 py-3 text-base bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
              />
              {departmentPresetOptions.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {departmentPresetOptions.map((preset) => {
                    const selected =
                      classDepartment.trim().toLowerCase() ===
                      preset.toLowerCase();
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setClassDepartment(preset)}
                        className={`min-h-[36px] px-3 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                          selected
                            ? 'border-blue-600 bg-blue-50 text-blue-800'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. Photo (Live Camera or Native Phone Camera) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="block text-sm font-semibold text-slate-900">
                  3. Verification Photo <span className="text-rose-600">*</span>
                </span>
                {photoDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoDataUrl(null);
                      setCameraError(null);
                    }}
                    className="text-xs font-semibold text-blue-700 hover:text-blue-900 min-h-[36px] px-2"
                  >
                    Clear Photo
                  </button>
                )}
              </div>

              {/* Hidden Native Device Camera Input (iOS/Android direct camera app) */}
              <input
                ref={nativeCameraInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Take a photo with device camera app"
              />

              {photoDataUrl ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-36 h-36 rounded-xl overflow-hidden border border-slate-200 bg-white shrink-0">
                    <img
                      src={photoDataUrl}
                      alt="Captured participant preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 text-center sm:text-left space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Photo ready for submission
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Automatically compressed for fast check-in on mobile connections.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoDataUrl(null);
                          void startCamera(cameraFacing);
                        }}
                        className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors flex items-center gap-1.5"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Retake Picture</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : cameraOpen ? (
                <div className="rounded-2xl border border-slate-300 bg-slate-950 overflow-hidden">
                  <div className="relative aspect-[4/3] w-full bg-slate-900 flex items-center justify-center">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      className={`w-full h-full object-cover ${
                        cameraFacing === 'user' ? '-scale-x-100' : ''
                      }`}
                    />
                    {!cameraReady && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-white text-xs gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Starting camera...</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-slate-900 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCameraOpen(false);
                        stopCameraStream();
                      }}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleFacing}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      <FlipHorizontal2 className="w-4 h-4" />
                      <span>Flip Camera</span>
                    </button>
                    <button
                      type="button"
                      disabled={!cameraReady || processingPhoto}
                      onClick={handleCaptureSnapshot}
                      className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Capture Photo</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-4 sm:p-5 space-y-3">
                  <button
                    type="button"
                    onClick={() => void startCamera(cameraFacing)}
                    disabled={processingPhoto}
                    className="w-full min-h-[52px] px-4 py-3 rounded-xl bg-white border border-slate-300 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <Camera className="w-5 h-5 text-blue-700 shrink-0" />
                    <span>Take Picture (Live Camera)</span>
                  </button>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      Works on iPhone, iPad, Android, Windows &amp; Mac.
                    </span>
                    <button
                      type="button"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      className="min-h-[36px] px-2 text-blue-700 hover:underline font-medium shrink-0"
                    >
                      Use native phone camera app
                    </button>
                  </div>
                </div>
              )}

              {processingPhoto && (
                <p className="mt-2 text-xs text-blue-700 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Optimizing photo...</span>
                </p>
              )}

              {cameraError && (
                <div
                  role="alert"
                  className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 leading-relaxed"
                >
                  {cameraError}
                </div>
              )}
            </div>

            {/* Required Late Excuse Field when checking in past cutoff */}
            {selectedEvent && liveStatus === 'Late' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="late-excuse"
                    className="flex items-center gap-1.5 text-sm font-semibold text-amber-950"
                  >
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>
                      Excuse for Being Late <span className="text-rose-600">*</span>
                    </span>
                  </label>
                  <span className="text-xs font-mono-tabular text-amber-800">
                    {lateExcuse.length}/300
                  </span>
                </div>
                <p className="text-xs text-amber-900">
                  Check-in is past the {selectedEvent.lateCutoffTime} cutoff time. Please type your reason before submitting.
                </p>
                <textarea
                  id="late-excuse"
                  name="lateExcuse"
                  required
                  rows={2}
                  maxLength={300}
                  value={lateExcuse}
                  onChange={(e) => setLateExcuse(e.target.value)}
                  placeholder="e.g. Traffic delay, parent conference ran over, classroom handover..."
                  className="w-full px-3.5 py-2.5 text-base sm:text-sm bg-white border border-amber-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-600"
                />
              </div>
            )}

            {/* Consent Checkbox */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <label
                htmlFor="photo-consent"
                className="flex items-start gap-3 cursor-pointer select-none"
              >
                <span className="min-h-[44px] min-w-[44px] -m-2 flex items-center justify-center shrink-0">
                  <input
                    id="photo-consent"
                    type="checkbox"
                    checked={photoConsent}
                    onChange={(e) => setPhotoConsent(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-300 text-blue-700 focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  />
                </span>
                <span className="text-sm text-slate-700 leading-relaxed pt-0.5">
                  {customConsentText}
                </span>
              </label>
            </div>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                  {duplicateReceipt && (
                    <button
                      type="button"
                      onClick={() => setReceipt(duplicateReceipt)}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 self-start sm:self-auto"
                    >
                      View Saved Receipt
                    </button>
                  )}
                </div>
                {formDiagnostic && (
                  <DiagnosticErrorPanel diagnostic={formDiagnostic} />
                )}
              </div>
            )}

            {/* Large SUBMIT ATTENDANCE CTA Button */}
            <button
              type="submit"
              disabled={submitting || !selectedEvent}
              className="w-full h-14 px-6 rounded-xl bg-blue-700 hover:bg-blue-800 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white text-base font-bold tracking-wide transition-all flex items-center justify-center gap-2.5 shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>RECORDING ATTENDANCE...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-5 h-5" />
                  <span>SUBMIT ATTENDANCE</span>
                </>
              )}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
