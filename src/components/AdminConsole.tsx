import {
  AlertTriangle,
  Archive,
  Award,
  Building2,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileText,
  ImagePlus,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  MonitorPlay,
  Palette,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  type User,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  type DocumentReference,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ADMIN_EMAIL_PATTERN,
  auth,
  type AuthErrorDetails,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  formatFirebaseAuthError,
  googleProvider,
  handleFirestoreError,
  normalizeAdminEmail,
} from '../firebase';
import {
  type AttendanceRecord,
  type AttendanceStatus,
  type AuthorizedAdminRecord,
  type CertificateSettings,
  type EventCategory,
  type EventRecord,
  type FeedbackConfig,
  type FeedbackSubmissionRecord,
  type IssuedCertificateRecord,
  type LiveBoardSettings,
  OperationType,
  type OrganizationBranding,
  type RecognitionCategory,
  type RecognitionTemplateConfig,
  type VoiceAnnouncementSettings,
} from '../types';
import { exportAttendanceCsv } from '../utils/csvExport';
import { compressJpegBackground, compressLogoFile } from '../utils/imageCompress';
import {
  DEFAULT_CERTIFICATE_SETTINGS,
  downloadBig5CertificatesPdf,
  downloadRecapitulationPdf,
  downloadSingleCertificatePdf,
  mergeCertificateSettings,
} from '../utils/pdfExport';
import {
  buildCutoffDate,
  format12hTo24h,
  format24hPartsToString,
  formatLocalDateYmd,
  formatTime24h,
  generateSafeId,
  parse24hParts,
  parse24hTo12h,
} from '../utils/dateTime';
import {
  buildFeedbackConfigWritePayload,
  DEFAULT_RECOGNITION_TEMPLATE,
  evaluateFeedbackSchedule,
  formatScheduleDateTime,
  isoToLocalDateAndTime,
  localDateAndTimeToIso,
  mergeFeedbackConfig,
  mergeRecognitionTemplate,
  parseIsoTimestampMs,
} from '../utils/feedbackAndRecognitionDefaults';
import {
  DEFAULT_LIVE_BOARD_SETTINGS,
  mergeLiveBoardSettings,
  sortAttendancesChronologically,
} from '../utils/liveDashboardLayout';
import {
  AnnouncementQueue,
  DEFAULT_VOICE_SETTINGS,
  mergeVoiceSettings,
  stopAllAnnouncements,
  unlockBrowserAudio,
} from '../utils/voiceAnnouncement';
import {
  normalizeAndValidatePublicUrl,
  resolveQrOrigin,
} from '../utils/qrUrl';
import AdminFeedbackModule from './AdminFeedbackModule';
import AdminRecognitionModule from './AdminRecognitionModule';
import AdminVoiceSettingsModule from './AdminVoiceSettingsModule';
import CertificateCustomizerModal from './CertificateCustomizerModal';
import EventQrThumbnail from './EventQrThumbnail';
import LiveAnimatedDashboard from './LiveAnimatedDashboard';
import QrPosterModal from './QrPosterModal';

export type AdminSectionTab =
  | 'attendance'
  | 'live-board'
  | 'feedback'
  | 'certificates'
  | 'voice';

const PRESENZA_NATIVE_LOGO_URL =
  '/assets/aistudio/Logo_Presenza__Kehadiran_Cerdas_Beraksen_Emas_259b7478.png';
const ADMIN_NATIVE_LOGO_STORAGE_KEY = 'presenza_admin_native_logo_bg_v1';

interface AdminConsoleProps {
  user: User | null;
  authReady: boolean;
  branding?: OrganizationBranding | null;
  activeSection?: AdminSectionTab;
  onChangeSection?: (section: AdminSectionTab) => void;
  onOpenCheckIn: (eventId: string) => void;
  onOpenFeedbackForm?: (eventId: string) => void;
}

export default function AdminConsole({
  user,
  authReady,
  branding,
  activeSection,
  onChangeSection,
  onOpenCheckIn,
  onOpenFeedbackForm,
}: AdminConsoleProps) {
  const [internalSection, setInternalSection] =
    useState<AdminSectionTab>('attendance');
  const currentSection = activeSection ?? internalSection;
  const setCurrentSection = (next: AdminSectionTab) => {
    if (onChangeSection) {
      onChangeSection(next);
    } else {
      setInternalSection(next);
    }
  };

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorDetails | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Filters
  const [eventListTab, setEventListTab] = useState<'ongoing' | 'ended'>('ongoing');
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [qrEvent, setQrEvent] = useState<EventRecord | null>(null);
  const [lightboxRecord, setLightboxRecord] = useState<AttendanceRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: 'event' | 'attendance';
    id: string;
    label: string;
  } | null>(null);
  const [showEraseModal, setShowEraseModal] = useState(false);
  const [eraseScope, setEraseScope] = useState<'previous' | 'recapOnly' | 'all'>('previous');
  const [erasingHistory, setErasingHistory] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);
  const [deletingSingle, setDeletingSingle] = useState(false);

  // Live dashboard JPEG portrait background state
  const [dashboardBgUrl, setDashboardBgUrl] = useState<string | null>(null);
  const [dashboardBgOpacity, setDashboardBgOpacity] = useState<number>(25);
  const [savingBg, setSavingBg] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const bgOpacitySaveTimerRef = useRef<number | null>(null);

  // Certificate studio customization state
  const [certificateSettings, setCertificateSettings] =
    useState<CertificateSettings>(DEFAULT_CERTIFICATE_SETTINGS);
  const [showCertCustomizer, setShowCertCustomizer] = useState(false);
  const [savingCertSettings, setSavingCertSettings] = useState(false);
  const [certSettingsError, setCertSettingsError] = useState<string | null>(
    null
  );

  // School / Company Logo & Name branding state + Public QR Production URL
  const [orgNameInput, setOrgNameInput] = useState('');
  const [publicAppUrlInput, setPublicAppUrlInput] = useState('');
  const [savingBranding, setSavingBranding] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSaved, setBrandingSaved] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  // Native PRESENZA logo background preferences for Admin Console
  const [showAdminLogoBg, setShowAdminLogoBg] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(ADMIN_NATIVE_LOGO_STORAGE_KEY);
      if (!raw) return true;
      const parsed = JSON.parse(raw) as { enabled?: unknown };
      return typeof parsed.enabled === 'boolean' ? parsed.enabled : true;
    } catch {
      return true;
    }
  });
  const [adminLogoBgOpacity, setAdminLogoBgOpacity] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem(ADMIN_NATIVE_LOGO_STORAGE_KEY);
      if (!raw) return 16;
      const parsed = JSON.parse(raw) as { opacity?: unknown };
      if (typeof parsed.opacity === 'number' && Number.isFinite(parsed.opacity)) {
        return Math.min(45, Math.max(5, Math.round(parsed.opacity)));
      }
      return 16;
    } catch {
      return 16;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        ADMIN_NATIVE_LOGO_STORAGE_KEY,
        JSON.stringify({
          enabled: showAdminLogoBg,
          opacity: adminLogoBgOpacity,
        })
      );
    } catch {
      // Ignore storage restrictions
    }
  }, [showAdminLogoBg, adminLogoBgOpacity]);

  useEffect(() => {
    setOrgNameInput(branding?.organizationName || '');
  }, [branding?.organizationName]);

  useEffect(() => {
    setPublicAppUrlInput(branding?.publicAppUrl || '');
  }, [branding?.publicAppUrl]);

  // Event form state
  const [evTitle, setEvTitle] = useState('');
  const [evCategory, setEvCategory] = useState('');
  const [evVenue, setEvVenue] = useState('');
  const [evDescription, setEvDescription] = useState('');
  const [evDate, setEvDate] = useState(() => formatLocalDateYmd(new Date()));
  const [evStartTime, setEvStartTime] = useState(() => formatTime24h(new Date()));
  const [evCutoffTime, setEvCutoffTime] = useState(() => {
    const d = new Date(Date.now() + 15 * 60 * 1000);
    return formatTime24h(d);
  });
  const [evDepartmentLabel, setEvDepartmentLabel] = useState('Class / Department');
  const [evConsentText, setEvConsentText] = useState(
    'I consent to the use of my submitted photo for PRESENZA verification and official professional development attendance records.'
  );
  const [evFacilitators, setEvFacilitators] = useState('');
  const [evPrincipalName, setEvPrincipalName] = useState('');
  const [evTheme, setEvTheme] = useState('');
  const [evTopic, setEvTopic] = useState('');
  const [timeFormatMode, setTimeFormatMode] = useState<'24h' | '12h'>('24h');
  const [evFeedbackActive, setEvFeedbackActive] = useState<boolean>(true);
  const [evFeedbackScheduleEnabled, setEvFeedbackScheduleEnabled] =
    useState<boolean>(false);
  const [evFeedbackOpenDate, setEvFeedbackOpenDate] = useState<string>('');
  const [evFeedbackOpenTime, setEvFeedbackOpenTime] = useState<string>('');
  const [evFeedbackCloseDate, setEvFeedbackCloseDate] = useState<string>('');
  const [evFeedbackCloseTime, setEvFeedbackCloseTime] = useState<string>('');
  const [evFeedbackClosedMessage, setEvFeedbackClosedMessage] =
    useState<string>('');
  const [evFeedbackTimeFormat, setEvFeedbackTimeFormat] = useState<
    '12h' | '24h'
  >('12h');
  const [savingEvent, setSavingEvent] = useState(false);
  const [eventFormError, setEventFormError] = useState<string | null>(null);

  // Module 1 (Feedback & Evaluation) & Module 2 (Certificates & Recognition) State
  const [feedbackConfigsById, setFeedbackConfigsById] = useState<
    Map<string, FeedbackConfig>
  >(() => new Map());
  const [feedbackSubmissions, setFeedbackSubmissions] = useState<
    FeedbackSubmissionRecord[]
  >([]);
  const [togglingFeedbackEventId, setTogglingFeedbackEventId] = useState<
    string | null
  >(null);
  const [customizeFeedbackTargetEventId, setCustomizeFeedbackTargetEventId] =
    useState<string | null>(null);
  const [customizeFeedbackNonce, setCustomizeFeedbackNonce] = useState(0);
  const [recognitionCategories, setRecognitionCategories] = useState<
    RecognitionCategory[]
  >([]);
  const [recognitionTemplate, setRecognitionTemplate] =
    useState<RecognitionTemplateConfig>(DEFAULT_RECOGNITION_TEMPLATE);
  const [issuedCertificates, setIssuedCertificates] = useState<
    IssuedCertificateRecord[]
  >([]);

  // Module 3: AI Voice Check-in Announcement state
  const [voiceSettings, setVoiceSettings] =
    useState<VoiceAnnouncementSettings>(DEFAULT_VOICE_SETTINGS);
  const [dashboardVoiceMuted, setDashboardVoiceMuted] = useState(false);
  const [speakingParticipantName, setSpeakingParticipantName] = useState<
    string | null
  >(null);
  const [dashboardAutoplayBlocked, setDashboardAutoplayBlocked] =
    useState(false);

  const voiceSettingsRef = useRef<VoiceAnnouncementSettings>(
    DEFAULT_VOICE_SETTINGS
  );
  const dashboardVoiceMutedRef = useRef(false);
  const initialAttendancesLoadedRef = useRef(false);
  const knownAttendanceIdsRef = useRef<Set<string>>(new Set());
  const announcementQueueRef = useRef<AnnouncementQueue | null>(null);

  // Module 4: Live Animated Attendance Dashboard state
  const [liveBoardSettings, setLiveBoardSettings] = useState<LiveBoardSettings>(
    DEFAULT_LIVE_BOARD_SETTINGS
  );
  const [newlyArrivedIds, setNewlyArrivedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [latestArrival, setLatestArrival] = useState<AttendanceRecord | null>(
    null
  );
  const [isProjectorOpen, setIsProjectorOpen] = useState(false);
  const arrivalTimersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  useEffect(() => {
    dashboardVoiceMutedRef.current = dashboardVoiceMuted;
    if (dashboardVoiceMuted) {
      announcementQueueRef.current?.clear();
    }
  }, [dashboardVoiceMuted]);

  if (!announcementQueueRef.current) {
    announcementQueueRef.current = new AnnouncementQueue(
      () => voiceSettingsRef.current,
      (state) => {
        setSpeakingParticipantName(state.speakingName);
        setDashboardAutoplayBlocked(state.autoplayBlocked);
      }
    );
  }

  useEffect(() => {
    const unlockOnce = () => {
      unlockBrowserAudio();
      window.removeEventListener('pointerdown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      announcementQueueRef.current?.clear();
      stopAllAnnouncements();
      arrivalTimersRef.current.forEach((timerId) =>
        window.clearTimeout(timerId)
      );
      arrivalTimersRef.current.clear();
    };
  }, []);

  // Authorized Administrators management state
  const [authorizedAdmins, setAuthorizedAdmins] = useState<
    AuthorizedAdminRecord[]
  >([]);
  const [showAdminsModal, setShowAdminsModal] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminManageError, setAdminManageError] = useState<string | null>(null);
  const [removingAdminEmail, setRemovingAdminEmail] = useState<string | null>(
    null
  );

  // Verify admin authorization (email allowlist, legacy UID doc, or bootstrap owner)
  useEffect(() => {
    let active = true;
    async function verifyAdmin() {
      if (!authReady) return;
      if (!user || !user.email) {
        if (active) {
          setIsAdmin(false);
          setCheckingAdmin(false);
        }
        return;
      }

      if (!user.emailVerified) {
        if (active) {
          setIsAdmin(false);
          setCheckingAdmin(false);
        }
        return;
      }

      setCheckingAdmin(true);
      const emailLower = normalizeAdminEmail(user.email);

      if (emailLower === BOOTSTRAPPED_ADMIN_EMAIL) {
        if (active) {
          setIsAdmin(true);
          setCheckingAdmin(false);
        }
        return;
      }

      try {
        if (ADMIN_EMAIL_PATTERN.test(emailLower)) {
          const emailSnap = await getDoc(
            doc(db, 'authorizedAdmins', emailLower)
          );
          if (emailSnap.exists()) {
            if (active) {
              setIsAdmin(true);
              setCheckingAdmin(false);
            }
            return;
          }
        }
      } catch {
        // Fall through to legacy UID check
      }

      try {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        if (active) {
          setIsAdmin(adminSnap.exists());
          setCheckingAdmin(false);
        }
      } catch {
        if (active) {
          setIsAdmin(false);
          setCheckingAdmin(false);
        }
      }
    }
    void verifyAdmin();
    return () => {
      active = false;
    };
  }, [user, authReady]);

  // Attach real-time Firestore listeners ONLY when authenticated as admin
  useEffect(() => {
    if (!authReady || !isAdmin) {
      setEvents([]);
      setAttendances([]);
      setAuthorizedAdmins([]);
      setFeedbackConfigsById(new Map());
      setFeedbackSubmissions([]);
      setRecognitionCategories([]);
      setRecognitionTemplate(DEFAULT_RECOGNITION_TEMPLATE);
      setIssuedCertificates([]);
      setVoiceSettings(DEFAULT_VOICE_SETTINGS);
      setLiveBoardSettings(DEFAULT_LIVE_BOARD_SETTINGS);
      setNewlyArrivedIds(new Set());
      setLatestArrival(null);
      arrivalTimersRef.current.forEach((timerId) =>
        window.clearTimeout(timerId)
      );
      arrivalTimersRef.current.clear();
      initialAttendancesLoadedRef.current = false;
      knownAttendanceIdsRef.current = new Set();
      announcementQueueRef.current?.clear();
      setLoadingData(false);
      return;
    }

    setLoadingData(true);

    const unsubEvents = onSnapshot(
      collection(db, 'events'),
      (snap) => {
        const list: EventRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<EventRecord, 'id'>),
        }));
        list.sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return bt - at;
        });
        setEvents(list);
        setLoadingData(false);
      },
      (error) => {
        setLoadingData(false);
        handleFirestoreError(error, OperationType.LIST, 'events');
      }
    );

    const unsubAttendances = onSnapshot(
      collection(db, 'attendances'),
      (snap) => {
        const rawList: AttendanceRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AttendanceRecord, 'id'>),
        }));
        const list = sortAttendancesChronologically(rawList);

        if (!initialAttendancesLoadedRef.current) {
          knownAttendanceIdsRef.current = new Set(list.map((item) => item.id));
          initialAttendancesLoadedRef.current = true;
        } else {
          const newlyAdded: AttendanceRecord[] = [];
          for (const rec of list) {
            if (!knownAttendanceIdsRef.current.has(rec.id)) {
              knownAttendanceIdsRef.current.add(rec.id);
              newlyAdded.push(rec);
            }
          }

          if (newlyAdded.length > 0) {
            setLatestArrival(newlyAdded[newlyAdded.length - 1]);
            setNewlyArrivedIds((prev) => {
              const next = new Set(prev);
              for (const rec of newlyAdded) {
                next.add(rec.id);
              }
              return next;
            });

            for (const rec of newlyAdded) {
              const existingTimer = arrivalTimersRef.current.get(rec.id);
              if (existingTimer !== undefined) {
                window.clearTimeout(existingTimer);
              }
              const timerId = window.setTimeout(() => {
                arrivalTimersRef.current.delete(rec.id);
                setNewlyArrivedIds((prev) => {
                  if (!prev.has(rec.id)) return prev;
                  const next = new Set(prev);
                  next.delete(rec.id);
                  return next;
                });
              }, 6000);
              arrivalTimersRef.current.set(rec.id, timerId);
            }

            const vs = voiceSettingsRef.current;
            if (
              vs.enabled &&
              vs.announceOnDashboard &&
              !dashboardVoiceMutedRef.current
            ) {
              for (const rec of newlyAdded) {
                announcementQueueRef.current?.enqueue({
                  id: rec.id,
                  participantName: rec.fullName,
                  department: rec.classDepartment,
                  eventTitle: rec.eventName,
                });
              }
            }
          }
        }

        setAttendances(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'attendances');
      }
    );

    const unsubBgSetting = onSnapshot(
      doc(db, 'dashboardSettings', 'live'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as {
            backgroundDataUrl?: string;
            backgroundOpacity?: number;
          };
          setDashboardBgUrl(data.backgroundDataUrl || null);
          if (
            typeof data.backgroundOpacity === 'number' &&
            Number.isFinite(data.backgroundOpacity)
          ) {
            setDashboardBgOpacity(
              Math.min(100, Math.max(0, data.backgroundOpacity))
            );
          }
        } else {
          setDashboardBgUrl(null);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'dashboardSettings/live');
      }
    );

    const unsubCertSettings = onSnapshot(
      doc(db, 'certificateSettings', 'default'),
      (snap) => {
        if (snap.exists()) {
          setCertificateSettings(
            mergeCertificateSettings(
              snap.data() as Partial<CertificateSettings>
            )
          );
        } else {
          setCertificateSettings(DEFAULT_CERTIFICATE_SETTINGS);
        }
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          'certificateSettings/default'
        );
      }
    );

    const unsubAdmins = onSnapshot(
      collection(db, 'authorizedAdmins'),
      (snap) => {
        const list: AuthorizedAdminRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AuthorizedAdminRecord, 'id'>),
        }));
        list.sort((a, b) => a.email.localeCompare(b.email));
        setAuthorizedAdmins(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'authorizedAdmins');
      }
    );

    const unsubFeedbackConfigs = onSnapshot(
      collection(db, 'feedbackConfigs'),
      (snap) => {
        const map = new Map<string, FeedbackConfig>();
        snap.docs.forEach((d) => {
          map.set(
            d.id,
            mergeFeedbackConfig(d.data() as Partial<FeedbackConfig>, d.id)
          );
        });
        setFeedbackConfigsById(map);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'feedbackConfigs');
      }
    );

    const unsubFeedbackSubmissions = onSnapshot(
      collection(db, 'feedbackSubmissions'),
      (snap) => {
        const list: FeedbackSubmissionRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FeedbackSubmissionRecord, 'id'>),
        }));
        list.sort((a, b) => {
          const at = a.serverTimestamp?.toMillis?.() ?? 0;
          const bt = b.serverTimestamp?.toMillis?.() ?? 0;
          return bt - at;
        });
        setFeedbackSubmissions(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'feedbackSubmissions');
      }
    );

    const unsubRecCategories = onSnapshot(
      collection(db, 'recognitionCategories'),
      (snap) => {
        const list: RecognitionCategory[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<RecognitionCategory, 'id'>),
        }));
        list.sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
        );
        setRecognitionCategories(list);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.LIST,
          'recognitionCategories'
        );
      }
    );

    const unsubRecTemplate = onSnapshot(
      doc(db, 'recognitionTemplates', 'default'),
      (snap) => {
        if (snap.exists()) {
          setRecognitionTemplate(
            mergeRecognitionTemplate(
              snap.data() as Partial<RecognitionTemplateConfig>
            )
          );
        } else {
          setRecognitionTemplate(DEFAULT_RECOGNITION_TEMPLATE);
        }
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          'recognitionTemplates/default'
        );
      }
    );

    const unsubCertificates = onSnapshot(
      collection(db, 'certificates'),
      (snap) => {
        const list: IssuedCertificateRecord[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<IssuedCertificateRecord, 'id'>),
        }));
        list.sort((a, b) => {
          const at = a.createdAt?.toMillis?.() ?? 0;
          const bt = b.createdAt?.toMillis?.() ?? 0;
          return bt - at;
        });
        setIssuedCertificates(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'certificates');
      }
    );

    const unsubVoiceSettings = onSnapshot(
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
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'voiceSettings/default');
      }
    );

    const unsubLiveBoardSettings = onSnapshot(
      doc(db, 'liveBoardSettings', 'default'),
      (snap) => {
        if (snap.exists()) {
          setLiveBoardSettings(
            mergeLiveBoardSettings(
              snap.data() as Partial<LiveBoardSettings>
            )
          );
        } else {
          setLiveBoardSettings(DEFAULT_LIVE_BOARD_SETTINGS);
        }
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          'liveBoardSettings/default'
        );
      }
    );

    return () => {
      unsubEvents();
      unsubAttendances();
      unsubBgSetting();
      unsubCertSettings();
      unsubAdmins();
      unsubFeedbackConfigs();
      unsubFeedbackSubmissions();
      unsubRecCategories();
      unsubRecTemplate();
      unsubCertificates();
      unsubVoiceSettings();
      unsubLiveBoardSettings();
      if (bgOpacitySaveTimerRef.current !== null) {
        window.clearTimeout(bgOpacitySaveTimerRef.current);
      }
    };
  }, [authReady, isAdmin]);

  const handleSaveLiveBoardSettings = async (next: LiveBoardSettings) => {
    if (!user) return;
    const normalized = mergeLiveBoardSettings(next);
    try {
      await setDoc(doc(db, 'liveBoardSettings', 'default'), {
        ...normalized,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      setLiveBoardSettings(normalized);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        'liveBoardSettings/default'
      );
      throw error;
    }
  };

  const handleUploadDashboardBg = async (file: File) => {
    if (!user) return;
    setBgError(null);
    setSavingBg(true);
    try {
      const dataUrl = await compressJpegBackground(file);
      await setDoc(doc(db, 'dashboardSettings', 'live'), {
        backgroundDataUrl: dataUrl,
        backgroundOpacity: dashboardBgOpacity,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setBgError(
        err instanceof Error ? err.message : 'Failed to upload JPEG background.'
      );
    } finally {
      setSavingBg(false);
    }
  };

  const handleChangeDashboardBgOpacity = (nextOpacity: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(nextOpacity)));
    setDashboardBgOpacity(clamped);
    if (!user || !dashboardBgUrl) return;

    if (bgOpacitySaveTimerRef.current !== null) {
      window.clearTimeout(bgOpacitySaveTimerRef.current);
    }

    bgOpacitySaveTimerRef.current = window.setTimeout(() => {
      bgOpacitySaveTimerRef.current = null;
      void updateDoc(doc(db, 'dashboardSettings', 'live'), {
        backgroundOpacity: clamped,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      }).catch((error) => {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          'dashboardSettings/live'
        );
      });
    }, 300);
  };

  const handleRemoveDashboardBg = async () => {
    setBgError(null);
    setSavingBg(true);
    try {
      await deleteDoc(doc(db, 'dashboardSettings', 'live'));
    } catch (error) {
      setBgError('Unable to clear background. Please try again.');
      handleFirestoreError(error, OperationType.DELETE, 'dashboardSettings/live');
    } finally {
      setSavingBg(false);
    }
  };

  const handleSyncCertificateSettings = async (
    nextSettings: CertificateSettings
  ) => {
    if (!user) return;
    const normalized = mergeCertificateSettings(nextSettings);
    try {
      await setDoc(doc(db, 'certificateSettings', 'default'), {
        ...normalized,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      setCertificateSettings(normalized);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        'certificateSettings/default'
      );
      throw error;
    }
  };

  const handleSaveCertificateSettings = async (
    nextSettings: CertificateSettings
  ) => {
    if (!user) return;
    setCertSettingsError(null);
    setSavingCertSettings(true);
    try {
      const normalized = mergeCertificateSettings(nextSettings);
      await setDoc(doc(db, 'certificateSettings', 'default'), {
        ...normalized,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      setCertificateSettings(normalized);

      // Keep recognition template signatories & Term 1–4 synchronized
      const syncedTemplate = mergeRecognitionTemplate({
        ...recognitionTemplate,
        bestTerm: normalized.bestTerm,
        termBestCategories: normalized.termBestCategories,
        picPdName: normalized.picPdName,
        picPdTitle: normalized.picPdTitle,
        picPdSignatureDataUrl: normalized.facilitatorSignatureDataUrl,
        principalName: normalized.principalName,
        principalTitle: normalized.principalTitle,
        principalSignatureDataUrl: normalized.principalSignatureDataUrl,
        signatoryLabel: normalized.picPdTitle || 'PIC of Professional Development',
      });
      await setDoc(doc(db, 'recognitionTemplates', 'default'), {
        ...syncedTemplate,
        signatureDataUrl: '',
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });

      setShowCertCustomizer(false);
    } catch (error) {
      setCertSettingsError(
        'Unable to save certificate customization. Please ensure image sizes are valid and try again.'
      );
      handleFirestoreError(
        error,
        OperationType.WRITE,
        'certificateSettings/default'
      );
    } finally {
      setSavingCertSettings(false);
    }
  };

  const handleUploadOrgLogo = async (file: File) => {
    if (!user) return;
    setBrandingError(null);
    setBrandingSaved(false);
    setSavingBranding(true);
    const currentPublicUrl = branding?.publicAppUrl || '';
    try {
      const logoDataUrl = await compressLogoFile(file);
      await setDoc(doc(db, 'branding', 'default'), {
        organizationName: orgNameInput.trim().slice(0, 120),
        logoDataUrl,
        publicAppUrl: currentPublicUrl,
        updatedByUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      setBrandingSaved(true);
      window.setTimeout(() => setBrandingSaved(false), 2500);
    } catch (err) {
      setBrandingError(
        err instanceof Error ? err.message : 'Failed to upload school or company logo.'
      );
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSaveOrgName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBrandingError(null);
    setBrandingSaved(false);
    setSavingBranding(true);
    const cleanName = orgNameInput.trim().slice(0, 120);
    const currentLogo = branding?.logoDataUrl || '';
    const currentPublicUrl = branding?.publicAppUrl || '';
    try {
      if (!cleanName && !currentLogo && !currentPublicUrl) {
        await deleteDoc(doc(db, 'branding', 'default'));
      } else {
        await setDoc(doc(db, 'branding', 'default'), {
          organizationName: cleanName,
          logoDataUrl: currentLogo,
          publicAppUrl: currentPublicUrl,
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
      }
      setBrandingSaved(true);
      window.setTimeout(() => setBrandingSaved(false), 2500);
    } catch (error) {
      setBrandingError('Unable to save school or company name.');
      handleFirestoreError(error, OperationType.WRITE, 'branding/default');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleSavePublicAppUrl = async (nextUrlRaw: string) => {
    if (!user) return;
    setBrandingError(null);
    setBrandingSaved(false);
    const check = normalizeAndValidatePublicUrl(nextUrlRaw);
    if (!check.ok) {
      setBrandingError(check.error);
      throw new Error(check.error);
    }
    setSavingBranding(true);
    const cleanName = orgNameInput.trim().slice(0, 120);
    const currentLogo = branding?.logoDataUrl || '';
    try {
      if (!cleanName && !currentLogo && !check.origin) {
        await deleteDoc(doc(db, 'branding', 'default'));
      } else {
        await setDoc(doc(db, 'branding', 'default'), {
          organizationName: cleanName,
          logoDataUrl: currentLogo,
          publicAppUrl: check.origin,
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
      }
      setPublicAppUrlInput(check.origin);
      setBrandingSaved(true);
      window.setTimeout(() => setBrandingSaved(false), 2500);
    } catch (error) {
      setBrandingError('Unable to save public QR URL.');
      handleFirestoreError(error, OperationType.WRITE, 'branding/default');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleRemoveOrgLogo = async () => {
    if (!user) return;
    setBrandingError(null);
    setBrandingSaved(false);
    setSavingBranding(true);
    const cleanName = orgNameInput.trim().slice(0, 120);
    const currentPublicUrl = branding?.publicAppUrl || '';
    try {
      if (!cleanName && !currentPublicUrl) {
        await deleteDoc(doc(db, 'branding', 'default'));
      } else {
        await setDoc(doc(db, 'branding', 'default'), {
          organizationName: cleanName,
          logoDataUrl: '',
          publicAppUrl: currentPublicUrl,
          updatedByUid: user.uid,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      setBrandingError('Unable to remove logo.');
      handleFirestoreError(error, OperationType.WRITE, 'branding/default');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err));
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    try {
      await signOut(auth);
    } catch (err: unknown) {
      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const handleAddAuthorizedAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    setAdminManageError(null);

    const emailLower = normalizeAdminEmail(newAdminEmail);
    const displayName = newAdminName.trim().slice(0, 100);

    if (!ADMIN_EMAIL_PATTERN.test(emailLower) || emailLower.length > 128) {
      setAdminManageError('Please enter a valid Google email address.');
      return;
    }

    if (
      emailLower === BOOTSTRAPPED_ADMIN_EMAIL ||
      authorizedAdmins.some((a) => a.email === emailLower)
    ) {
      setAdminManageError(`${emailLower} is already an authorized administrator.`);
      return;
    }

    setSavingAdmin(true);
    try {
      await setDoc(doc(db, 'authorizedAdmins', emailLower), {
        email: emailLower,
        displayName,
        addedByUid: user.uid,
        addedByEmail: normalizeAdminEmail(user.email),
        createdAt: serverTimestamp(),
      });
      setNewAdminEmail('');
      setNewAdminName('');
    } catch (error) {
      setAdminManageError('Unable to add administrator email. Please try again.');
      handleFirestoreError(
        error,
        OperationType.CREATE,
        `authorizedAdmins/${emailLower}`
      );
    } finally {
      setSavingAdmin(false);
    }
  };

  const handleRemoveAuthorizedAdmin = async (emailLower: string) => {
    if (!user || !user.email) return;
    const currentEmail = normalizeAdminEmail(user.email);
    if (emailLower === currentEmail) {
      setAdminManageError('You cannot remove your own currently signed-in account.');
      return;
    }

    setAdminManageError(null);
    setRemovingAdminEmail(emailLower);
    try {
      await deleteDoc(doc(db, 'authorizedAdmins', emailLower));
    } catch (error) {
      setAdminManageError('Unable to remove administrator email.');
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `authorizedAdmins/${emailLower}`
      );
    } finally {
      setRemovingAdminEmail(null);
    }
  };

  const applyModalFeedbackPreset = (
    preset: 'session-window' | 'last-30m' | 'today' | 'clear',
    overrideDate?: string,
    overrideStartTime?: string
  ) => {
    const baseDate =
      overrideDate || evDate || formatLocalDateYmd(new Date());
    const baseStart = overrideStartTime || evStartTime || '09:00';
    if (preset === 'clear') {
      setEvFeedbackOpenDate('');
      setEvFeedbackOpenTime('');
      setEvFeedbackCloseDate('');
      setEvFeedbackCloseTime('');
      return;
    }

    if (preset === 'today') {
      setEvFeedbackScheduleEnabled(true);
      setEvFeedbackOpenDate(baseDate);
      setEvFeedbackOpenTime('08:00');
      setEvFeedbackCloseDate(baseDate);
      setEvFeedbackCloseTime('17:00');
      return;
    }

    const startIso = localDateAndTimeToIso(baseDate, baseStart);
    const startMs = parseIsoTimestampMs(startIso) ?? Date.now();
    if (preset === 'last-30m') {
      const openParts = isoToLocalDateAndTime(
        new Date(startMs + 90 * 60 * 1000).toISOString()
      );
      const closeParts = isoToLocalDateAndTime(
        new Date(startMs + 120 * 60 * 1000).toISOString()
      );
      setEvFeedbackScheduleEnabled(true);
      setEvFeedbackOpenDate(openParts.date);
      setEvFeedbackOpenTime(openParts.time);
      setEvFeedbackCloseDate(closeParts.date);
      setEvFeedbackCloseTime(closeParts.time);
      return;
    }

    // session-window: Event start -> +2h
    const openParts = isoToLocalDateAndTime(new Date(startMs).toISOString());
    const closeParts = isoToLocalDateAndTime(
      new Date(startMs + 2 * 60 * 60 * 1000).toISOString()
    );
    setEvFeedbackScheduleEnabled(true);
    setEvFeedbackOpenDate(openParts.date);
    setEvFeedbackOpenTime(openParts.time);
    setEvFeedbackCloseDate(closeParts.date);
    setEvFeedbackCloseTime(closeParts.time);
  };

  const openCreateModal = () => {
    const now = new Date();
    const cutoff = new Date(now.getTime() + 15 * 60 * 1000);
    const defaultDate = formatLocalDateYmd(now);
    const defaultStart = formatTime24h(now);
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    setEditingEvent(null);
    setEvTitle('');
    setEvCategory('');
    setEvVenue('');
    setEvDescription('');
    setEvDate(defaultDate);
    setEvStartTime(defaultStart);
    setEvCutoffTime(formatTime24h(cutoff));
    setEvDepartmentLabel('Class / Department');
    setEvConsentText(
      'I consent to the use of my submitted photo for PRESENZA verification and official professional development attendance records.'
    );
    setEvFacilitators('');
    setEvPrincipalName('');
    setEvTheme('');
    setEvTopic('');
    setEvFeedbackActive(true);
    setEvFeedbackScheduleEnabled(false);
    setEvFeedbackOpenDate(defaultDate);
    setEvFeedbackOpenTime(defaultStart);
    setEvFeedbackCloseDate(formatLocalDateYmd(twoHoursLater));
    setEvFeedbackCloseTime(formatTime24h(twoHoursLater));
    setEvFeedbackClosedMessage('');
    setEventFormError(null);
    setShowEventModal(true);
  };

  const openEditModal = (ev: EventRecord) => {
    const existingCfg = mergeFeedbackConfig(
      feedbackConfigsById.get(ev.id) ??
        feedbackConfigsById.get('default') ??
        null,
      ev.id
    );
    const openParts = isoToLocalDateAndTime(existingCfg.openAtIso);
    const closeParts = isoToLocalDateAndTime(existingCfg.closeAtIso);

    setEditingEvent(ev);
    setEvTitle(ev.title);
    setEvCategory(ev.category);
    setEvVenue(ev.venue);
    setEvDescription(ev.description);
    setEvDate(ev.eventDate);
    setEvStartTime(ev.startTime);
    setEvCutoffTime(ev.lateCutoffTime);
    setEvDepartmentLabel(ev.departmentLabel || 'Class / Department');
    setEvConsentText(
      ev.consentText ||
        'I consent to the use of my submitted photo for PRESENZA verification and official professional development attendance records.'
    );
    setEvFacilitators(ev.facilitators || '');
    setEvPrincipalName(ev.principalName || '');
    setEvTheme(ev.theme || '');
    setEvTopic(ev.topic || '');
    setEvFeedbackActive(existingCfg.feedbackActive !== false);
    setEvFeedbackScheduleEnabled(existingCfg.scheduleEnabled);
    setEvFeedbackOpenDate(openParts.date || ev.eventDate);
    setEvFeedbackOpenTime(openParts.time || ev.startTime || '08:00');
    setEvFeedbackCloseDate(closeParts.date || ev.eventDate);
    setEvFeedbackCloseTime(closeParts.time || '17:00');
    setEvFeedbackClosedMessage(existingCfg.scheduleClosedMessage || '');
    setEventFormError(null);
    setShowEventModal(true);
  };

  const handleQuickCreateStarter = async () => {
    if (!user) return;
    setSavingEvent(true);
    const now = new Date();
    const cutoff = new Date(now.getTime() + 20 * 60 * 1000);
    const eventDate = formatLocalDateYmd(now);
    const startTime = formatTime24h(now);
    const lateCutoffTime = formatTime24h(cutoff);
    const eventId = generateSafeId('evt');
    const cutoffTs = Timestamp.fromDate(
      buildCutoffDate(eventDate, lateCutoffTime)
    );

    const payload = {
      title: 'Teacher Professional Development Workshop',
      category: 'Professional Development' as EventCategory,
      description:
        'Collaborative curriculum planning and instructional review session.',
      venue: 'Main Conference Hall',
      eventDate,
      startTime,
      lateCutoffTime,
      cutoffTimestamp: cutoffTs,
      status: 'active' as const,
      createdByUid: user.uid,
    };

    try {
      await setDoc(doc(db, 'events', eventId), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setEventListTab('ongoing');
      setSelectedEventFilter(eventId);
      setQrEvent({
        id: eventId,
        ...payload,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `events/${eventId}`);
    } finally {
      setSavingEvent(false);
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setEventFormError(null);

    const title = evTitle.trim();
    const category = evCategory.trim();
    const venue = evVenue.trim();
    const description = evDescription.trim();

    if (title.length < 2) {
      setEventFormError('Please enter a session title (at least 2 characters).');
      return;
    }
    if (category.length < 1) {
      setEventFormError('Please enter a session type.');
      return;
    }
    if (venue.length < 1) {
      setEventFormError('Please enter a room or venue.');
      return;
    }

    const fbOpenIso =
      evFeedbackScheduleEnabled && evFeedbackOpenDate
        ? localDateAndTimeToIso(
            evFeedbackOpenDate,
            evFeedbackOpenTime || '08:00'
          )
        : '';
    const fbCloseIso =
      evFeedbackScheduleEnabled && evFeedbackCloseDate
        ? localDateAndTimeToIso(
            evFeedbackCloseDate,
            evFeedbackCloseTime || '17:00'
          )
        : '';
    const fbOpenMs = evFeedbackScheduleEnabled
      ? parseIsoTimestampMs(fbOpenIso)
      : null;
    const fbCloseMs = evFeedbackScheduleEnabled
      ? parseIsoTimestampMs(fbCloseIso)
      : null;

    if (evFeedbackScheduleEnabled) {
      if (fbOpenMs === null && fbCloseMs === null) {
        setEventFormError(
          'Please set a Feedback opening date/time, a closing date/time, or uncheck the scheduled feedback window.'
        );
        return;
      }
      if (fbOpenMs !== null && fbCloseMs !== null && fbCloseMs <= fbOpenMs) {
        setEventFormError(
          'Feedback closing date & time must be later than the feedback opening date & time.'
        );
        return;
      }
    }

    setSavingEvent(true);
    const cutoffTs = Timestamp.fromDate(buildCutoffDate(evDate, evCutoffTime));

    const deptLabel = (evDepartmentLabel.trim() || 'Class / Department').slice(0, 80);
    const consentStatement = (
      evConsentText.trim() ||
      'I consent to the use of my submitted photo for PRESENZA verification and official professional development attendance records.'
    ).slice(0, 400);
    const facilitators = evFacilitators.trim().slice(0, 200);
    const principalName = evPrincipalName.trim().slice(0, 120);
    const theme = evTheme.trim().slice(0, 120);
    const topic = evTopic.trim().slice(0, 200);

    try {
      if (editingEvent) {
        await updateDoc(doc(db, 'events', editingEvent.id), {
          title: title.slice(0, 140),
          category: category.slice(0, 80),
          description: description.slice(0, 500),
          venue: venue.slice(0, 120),
          eventDate: evDate,
          startTime: evStartTime,
          lateCutoffTime: evCutoffTime,
          cutoffTimestamp: cutoffTs,
          departmentLabel: deptLabel,
          departmentPresets: editingEvent.departmentPresets || '',
          consentText: consentStatement,
          facilitators,
          principalName,
          theme,
          topic,
          requireParticipantLogin: false,
          updatedAt: serverTimestamp(),
        });

        const baseFeedbackCfg = mergeFeedbackConfig(
          feedbackConfigsById.get(editingEvent.id) ??
            feedbackConfigsById.get('default') ??
            null,
          editingEvent.id
        );
        const feedbackPayload = buildFeedbackConfigWritePayload(
          {
            ...baseFeedbackCfg,
            eventId: editingEvent.id,
            feedbackActive: evFeedbackActive,
            scheduleEnabled: evFeedbackScheduleEnabled,
            openAtIso: evFeedbackScheduleEnabled ? fbOpenIso : '',
            closeAtIso: evFeedbackScheduleEnabled ? fbCloseIso : '',
            scheduleClosedMessage: evFeedbackClosedMessage.trim().slice(0, 300),
          },
          user.uid,
          (ms) => Timestamp.fromMillis(ms),
          serverTimestamp()
        );
        await setDoc(doc(db, 'feedbackConfigs', editingEvent.id), feedbackPayload);
      } else {
        const eventId = generateSafeId('evt');
        const newPayload = {
          title: title.slice(0, 140),
          category: category.slice(0, 80),
          description: description.slice(0, 500),
          venue: venue.slice(0, 120),
          eventDate: evDate,
          startTime: evStartTime,
          lateCutoffTime: evCutoffTime,
          cutoffTimestamp: cutoffTs,
          departmentLabel: deptLabel,
          consentText: consentStatement,
          facilitators,
          principalName,
          theme,
          topic,
          requireParticipantLogin: false,
          status: 'active' as const,
          createdByUid: user.uid,
        };
        await setDoc(doc(db, 'events', eventId), {
          ...newPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const baseFeedbackCfg = mergeFeedbackConfig(
          feedbackConfigsById.get('default') ?? null,
          eventId
        );
        const feedbackPayload = buildFeedbackConfigWritePayload(
          {
            ...baseFeedbackCfg,
            eventId,
            feedbackActive: evFeedbackActive,
            scheduleEnabled: evFeedbackScheduleEnabled,
            openAtIso: evFeedbackScheduleEnabled ? fbOpenIso : '',
            closeAtIso: evFeedbackScheduleEnabled ? fbCloseIso : '',
            scheduleClosedMessage: evFeedbackClosedMessage.trim().slice(0, 300),
          },
          user.uid,
          (ms) => Timestamp.fromMillis(ms),
          serverTimestamp()
        );
        await setDoc(doc(db, 'feedbackConfigs', eventId), feedbackPayload);

        setShowEventModal(false);
        setEventListTab('ongoing');
        setSelectedEventFilter(eventId);
        setQrEvent({
          id: eventId,
          ...newPayload,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
        return;
      }
      setShowEventModal(false);
    } catch (error) {
      setEventFormError('Failed to save session. Please verify all fields.');
      handleFirestoreError(
        error,
        editingEvent ? OperationType.UPDATE : OperationType.CREATE,
        editingEvent ? `events/${editingEvent.id}` : 'events'
      );
    } finally {
      setSavingEvent(false);
    }
  };

  const handleToggleEventFeedbackActive = async (ev: EventRecord) => {
    if (!user) return;
    setTogglingFeedbackEventId(ev.id);
    try {
      const currentCfg = mergeFeedbackConfig(
        feedbackConfigsById.get(ev.id) ??
          feedbackConfigsById.get('default') ??
          null,
        ev.id
      );
      const nextActive = currentCfg.feedbackActive === false;
      const payload = buildFeedbackConfigWritePayload(
        {
          ...currentCfg,
          eventId: ev.id,
          feedbackActive: nextActive,
        },
        user.uid,
        (ms) => Timestamp.fromMillis(ms),
        serverTimestamp()
      );
      await setDoc(doc(db, 'feedbackConfigs', ev.id), payload);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `feedbackConfigs/${ev.id}`
      );
    } finally {
      setTogglingFeedbackEventId(null);
    }
  };

  const handleToggleEventStatus = async (ev: EventRecord) => {
    const nextStatus = ev.status === 'active' ? 'closed' : 'active';
    try {
      await updateDoc(doc(db, 'events', ev.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${ev.id}`);
    }
  };

  const handleEndAndSaveEvent = async (ev: EventRecord): Promise<boolean> => {
    try {
      await updateDoc(doc(db, 'events', ev.id), {
        status: 'closed',
        updatedAt: serverTimestamp(),
      });
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${ev.id}`);
      return false;
    }
  };

  const handleToggleAttendanceStatus = async (record: AttendanceRecord) => {
    const nextStatus: AttendanceStatus =
      record.status === 'On Time' ? 'Late' : 'On Time';
    const nextExcuse =
      nextStatus === 'Late'
        ? record.lateExcuse && record.lateExcuse.trim().length >= 3
          ? record.lateExcuse
          : 'Marked late by administrator'
        : record.lateExcuse || '';
    try {
      await updateDoc(doc(db, 'attendances', record.id), {
        status: nextStatus,
        lateExcuse: nextExcuse,
      });
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.UPDATE,
        `attendances/${record.id}`
      );
    }
  };

  const commitBatchDeletes = async (
    refs: DocumentReference[],
    pathLabel: string
  ) => {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
      const slice = refs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const ref of slice) {
        batch.delete(ref);
      }
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, pathLabel);
      }
    }
  };

  const handleConfirmedDelete = async (includeEventRecap = true) => {
    if (!confirmDelete) return;
    const { type, id } = confirmDelete;
    setDeletingSingle(true);
    try {
      if (type === 'event') {
        if (includeEventRecap) {
          const linkedAttendances = attendances.filter((a) => a.eventId === id);
          if (linkedAttendances.length > 0) {
            await commitBatchDeletes(
              linkedAttendances.map((a) => doc(db, 'attendances', a.id)),
              'attendances'
            );
          }
        }
        await deleteDoc(doc(db, 'events', id));
        if (selectedEventFilter === id) {
          setSelectedEventFilter('all');
        }
      } else {
        await deleteDoc(doc(db, 'attendances', id));
      }
      setConfirmDelete(null);
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.DELETE,
        `${type === 'event' ? 'events' : 'attendances'}/${id}`
      );
    } finally {
      setDeletingSingle(false);
    }
  };

  const filteredAttendances = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return attendances.filter((rec) => {
      if (selectedEventFilter !== 'all' && rec.eventId !== selectedEventFilter) {
        return false;
      }
      if (statusFilter !== 'all' && rec.status !== statusFilter) {
        return false;
      }
      if (q) {
        const hay = `${rec.fullName} ${rec.classDepartment} ${rec.eventName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [attendances, selectedEventFilter, statusFilter, searchQuery]);

  const metrics = useMemo(() => {
    const base =
      selectedEventFilter === 'all'
        ? attendances
        : attendances.filter((a) => a.eventId === selectedEventFilter);
    const total = base.length;
    const onTime = base.filter((a) => a.status === 'On Time').length;
    const late = base.filter((a) => a.status === 'Late').length;
    const activeSessions = events.filter((e) => e.status === 'active').length;
    const onTimeRate = total > 0 ? Math.round((onTime / total) * 100) : 0;
    return { total, onTime, late, activeSessions, onTimeRate };
  }, [attendances, events, selectedEventFilter]);

  const eventsById = useMemo(
    () => new Map(events.map((e) => [e.id, e])),
    [events]
  );

  const selectedEventObj = useMemo(
    () => events.find((e) => e.id === selectedEventFilter) ?? null,
    [events, selectedEventFilter]
  );

  const sessionChronologicalRecords = useMemo(() => {
    return selectedEventFilter === 'all'
      ? attendances
      : attendances.filter((a) => a.eventId === selectedEventFilter);
  }, [attendances, selectedEventFilter]);

  const sessionBig5 = useMemo(
    () => sessionChronologicalRecords.slice(0, 5),
    [sessionChronologicalRecords]
  );

  const attendanceCountsByEvent = useMemo(() => {
    const map = new Map<string, number>();
    for (const rec of attendances) {
      map.set(rec.eventId, (map.get(rec.eventId) ?? 0) + 1);
    }
    return map;
  }, [attendances]);

  const ongoingEvents = useMemo(
    () => events.filter((ev) => ev.status === 'active'),
    [events]
  );

  const endedEvents = useMemo(
    () => events.filter((ev) => ev.status !== 'active'),
    [events]
  );

  const displayedEvents =
    eventListTab === 'ongoing' ? ongoingEvents : endedEvents;

  const previousCleanupTargets = useMemo(() => {
    const todayYmd = formatLocalDateYmd(new Date());
    const allEventIds = new Set(events.map((e) => e.id));
    const prevEvents = events.filter(
      (ev) => ev.status === 'closed' || ev.eventDate < todayYmd
    );
    const prevEventIds = new Set(prevEvents.map((e) => e.id));
    const prevAttendances = attendances.filter(
      (rec) => prevEventIds.has(rec.eventId) || !allEventIds.has(rec.eventId)
    );
    return {
      previousEvents: prevEvents,
      previousAttendances: prevAttendances,
    };
  }, [events, attendances]);

  const openEraseHistoryModal = (
    preferredScope?: 'previous' | 'recapOnly' | 'all'
  ) => {
    setEraseError(null);
    if (preferredScope) {
      setEraseScope(preferredScope);
    } else if (
      previousCleanupTargets.previousEvents.length > 0 ||
      previousCleanupTargets.previousAttendances.length > 0
    ) {
      setEraseScope('previous');
    } else if (attendances.length > 0) {
      setEraseScope('recapOnly');
    } else {
      setEraseScope('all');
    }
    setShowEraseModal(true);
  };

  const handleEraseHistory = async (saveRecapFirst: boolean) => {
    setEraseError(null);

    const targetEvents =
      eraseScope === 'previous'
        ? previousCleanupTargets.previousEvents
        : eraseScope === 'all'
        ? events
        : [];
    const targetAttendances =
      eraseScope === 'previous'
        ? previousCleanupTargets.previousAttendances
        : attendances;

    if (targetEvents.length === 0 && targetAttendances.length === 0) {
      setEraseError('There are no matching events or attendance records in this selection.');
      return;
    }

    if (saveRecapFirst && targetAttendances.length > 0) {
      downloadRecapitulationPdf(targetAttendances, null, eventsById, branding);
    }

    setErasingHistory(true);
    try {
      if (targetAttendances.length > 0) {
        await commitBatchDeletes(
          targetAttendances.map((rec) => doc(db, 'attendances', rec.id)),
          'attendances'
        );
      }
      if (targetEvents.length > 0) {
        await commitBatchDeletes(
          targetEvents.map((ev) => doc(db, 'events', ev.id)),
          'events'
        );
        if (
          selectedEventFilter !== 'all' &&
          targetEvents.some((ev) => ev.id === selectedEventFilter)
        ) {
          setSelectedEventFilter('all');
        }
      }
      setShowEraseModal(false);
    } catch {
      setEraseError('Some records could not be deleted. Please try again.');
    } finally {
      setErasingHistory(false);
    }
  };

  const adminNativeLogoBackdrop = showAdminLogoBg ? (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none select-none flex items-center justify-center overflow-hidden px-6"
    >
      <img
        src={PRESENZA_NATIVE_LOGO_URL}
        alt=""
        style={{ opacity: adminLogoBgOpacity / 100 }}
        className="w-[min(82vw,680px)] max-h-[76vh] object-contain mix-blend-multiply transition-opacity duration-200"
      />
    </div>
  ) : null;

  // Loading auth state
  if (!authReady || checkingAdmin) {
    return (
      <div className="relative isolate min-h-[calc(100vh-10rem)]">
        {adminNativeLogoBackdrop}
        <div className="relative z-10 max-w-md mx-auto px-4 py-20 text-center">
          <Loader2 className="w-7 h-7 animate-spin text-blue-700 mx-auto" />
          <p className="mt-3 text-sm text-slate-600">
            Checking administrator session...
          </p>
        </div>
      </div>
    );
  }

  // Not signed in -> Welcome to PRESENZA Sign-In Screen
  if (!user) {
    return (
      <div className="relative isolate min-h-[calc(100vh-10rem)] flex items-center justify-center">
        {adminNativeLogoBackdrop}
        <div className="relative z-10 w-full max-w-lg mx-auto px-4 py-10 sm:py-14">
          <div className="bg-white/95 backdrop-blur-xs border border-slate-200 rounded-2xl p-6 sm:p-8 text-center space-y-5 shadow-sm">
            <div className="flex flex-col items-center gap-3">
              <img
                src={PRESENZA_NATIVE_LOGO_URL}
                alt="PRESENZA Smart Attendance"
                className="h-24 sm:h-28 w-auto object-contain mix-blend-multiply"
              />
            </div>
            <div className="space-y-2">
              <p className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-500">
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Sign-In Mode</span>
                <span aria-hidden="true">·</span>
                <span>Administrator &amp; Teacher Access</span>
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Welcome to PRESENZA
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Check-In, Feedback &amp; Evaluation, and Certificates are locked until you sign in with an authorized Google account. Attendees can still open event QR links directly without logging in.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 text-left space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-rose-950">{authError.title}</p>
                  <span className="font-mono-tabular text-[11px] text-rose-700">
                    {authError.code}
                  </span>
                </div>
                <p className="leading-relaxed text-rose-800">{authError.message}</p>
                {authError.helpSteps && authError.helpSteps.length > 0 && (
                  <ol className="list-decimal list-inside space-y-1 pt-1 text-rose-800">
                    {authError.helpSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={signingIn}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60"
            >
              {signingIn ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Users className="w-4 h-4" />
              )}
              <span>{signingIn ? 'Signing in...' : 'Sign in with Google'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Signed in but not authorized as Admin
  if (!isAdmin) {
    return (
      <div className="relative isolate min-h-[calc(100vh-10rem)]">
        {adminNativeLogoBackdrop}
        <div className="relative z-10 max-w-lg mx-auto px-4 py-12 sm:py-16">
          <div className="bg-white/90 backdrop-blur-xs border border-slate-200 rounded-2xl p-6 sm:p-8 text-center space-y-5 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Administrator Access Restricted
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Signed in as <span className="font-semibold">{user.email || 'Unknown account'}</span>.{' '}
                {!user.emailVerified
                  ? 'This account email is not verified. Please sign in with a verified Google administrator account.'
                  : 'This account is not registered as an administrator for PRESENZA.'}
              </p>
            </div>
            {authError && (
              <div
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 text-left"
              >
                {authError.message}
              </div>
            )}
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 hover:bg-slate-100 transition-colors inline-flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out &amp; Switch Account</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Admin Console
  return (
    <div className="relative min-h-[calc(100vh-10rem)]">
      {adminNativeLogoBackdrop}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
      {/* Top Admin Header (shown only on Admin Console views, omitted from Certificates & Recognition) */}
      {currentSection !== 'certificates' && (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Administrator Console
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Signed in as {user.displayName || user.email}</span>
            <span aria-hidden="true">·</span>
            <span>Real-time attendance monitor</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (selectedEventFilter === 'all') {
                const ongoingEvent = events.find((e) => e.status === 'active') ?? events[0];
                if (ongoingEvent) {
                  setSelectedEventFilter(ongoingEvent.id);
                }
              }
              setCurrentSection('live-board');
              setIsProjectorOpen(true);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <MonitorPlay className="w-4 h-4 text-indigo-700" />
            <span>Projector Board</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAdminManageError(null);
              setShowAdminsModal(true);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            <span>Manage Admins ({authorizedAdmins.length + 1})</span>
          </button>
          {(events.length > 0 || attendances.length > 0) && (
            <button
              type="button"
              onClick={() => openEraseHistoryModal()}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-rose-800 text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-4 h-4" />
              <span>Save / Erase History</span>
            </button>
          )}
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Session</span>
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
      )}

      {/* Admin Module Switcher Tabs (omitted on Certificates & Recognition page) */}
      {currentSection !== 'certificates' && (
      <nav
        className="flex flex-wrap items-center gap-2 bg-white/85 backdrop-blur-xs border border-slate-200 rounded-2xl p-1.5"
        aria-label="Administrator modules"
      >
        <button
          type="button"
          onClick={() => setCurrentSection('attendance')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
            currentSection === 'attendance'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Events &amp; Attendance ({events.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentSection('live-board')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
            currentSection === 'live-board'
              ? 'bg-indigo-700 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <MonitorPlay className="w-4 h-4" />
          <span>Live Animated Dashboard ({attendances.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentSection('feedback')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
            currentSection === 'feedback'
              ? 'bg-blue-700 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Feedback and Evaluation Recap ({feedbackSubmissions.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentSection('voice')}
          className={`min-h-[42px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
            currentSection === 'voice'
              ? 'bg-emerald-700 text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <Volume2 className="w-4 h-4" />
          <span>Voice Announcement Settings</span>
        </button>
      </nav>
      )}

      {(currentSection === 'live-board' || isProjectorOpen) && (
        <LiveAnimatedDashboard
          events={events}
          attendances={attendances}
          selectedEventFilter={selectedEventFilter}
          onChangeEventFilter={setSelectedEventFilter}
          branding={branding}
          dashboardBgUrl={dashboardBgUrl}
          dashboardBgOpacity={dashboardBgOpacity}
          boardSettings={liveBoardSettings}
          onSaveBoardSettings={handleSaveLiveBoardSettings}
          newlyArrivedIds={newlyArrivedIds}
          latestArrival={latestArrival}
          onPreviewPhoto={(rec) => setLightboxRecord(rec)}
          isProjectorOpen={isProjectorOpen}
          onSetProjectorOpen={setIsProjectorOpen}
          voiceEnabled={
            voiceSettings.enabled && voiceSettings.announceOnDashboard
          }
          dashboardVoiceMuted={dashboardVoiceMuted}
          onToggleVoiceMute={() => {
            unlockBrowserAudio();
            setDashboardVoiceMuted((m) => !m);
          }}
          speakingParticipantName={speakingParticipantName}
          onSavePublicAppUrl={handleSavePublicAppUrl}
          onEndAndSaveEvent={handleEndAndSaveEvent}
        />
      )}

      {currentSection === 'feedback' && (
        <AdminFeedbackModule
          user={user}
          events={events}
          branding={branding}
          feedbackConfigsById={feedbackConfigsById}
          feedbackSubmissions={feedbackSubmissions}
          onOpenFeedbackForm={(eventId) => {
            if (onOpenFeedbackForm) {
              onOpenFeedbackForm(eventId);
            }
          }}
          initialCustomizeEventId={customizeFeedbackTargetEventId}
          customizeRequestNonce={customizeFeedbackNonce}
        />
      )}

      {currentSection === 'certificates' && (
        <AdminRecognitionModule
          user={user}
          events={events}
          attendances={attendances}
          feedbackSubmissions={feedbackSubmissions}
          branding={branding}
          categories={recognitionCategories}
          templateConfig={recognitionTemplate}
          certificates={issuedCertificates}
          certificateSettings={certificateSettings}
          onSyncCertificateSettings={handleSyncCertificateSettings}
        />
      )}

      {currentSection === 'voice' && (
        <AdminVoiceSettingsModule user={user} savedSettings={voiceSettings} />
      )}

      {currentSection === 'attendance' && (
        <>
      {/* School / Company Top-Left Branding Bar */}
      <section className="bg-white/85 backdrop-blur-xs border border-slate-200 rounded-2xl p-4 sm:p-5">
        <input
          ref={logoInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleUploadOrgLogo(file);
          }}
          className="hidden"
          aria-label="Upload school or company logo"
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
              {branding?.logoDataUrl ? (
                <img
                  src={branding.logoDataUrl}
                  alt={branding.organizationName ? `${branding.organizationName} logo` : 'School or company logo'}
                  className="w-full h-full object-contain p-1 bg-white"
                />
              ) : (
                <Building2 className="w-5 h-5 text-slate-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-700">
                Top-Left School / Company Branding
              </div>
              <div className="text-sm font-bold text-slate-900 truncate mt-0.5">
                {branding?.organizationName?.trim()
                  ? `${branding.organizationName} · PRESENZA`
                  : 'PRESENZA (upload logo & enter school or company name)'}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Shown in the top-left header for participants &amp; admins, QR board, Recap PDF, and Certificates.
              </p>
            </div>
          </div>

          <form
            onSubmit={handleSaveOrgName}
            className="flex flex-wrap items-center gap-2 shrink-0"
          >
            <input
              type="text"
              maxLength={120}
              value={orgNameInput}
              onChange={(e) => setOrgNameInput(e.target.value)}
              placeholder="School or Company Name..."
              aria-label="School or Company Name"
              className="min-h-[40px] w-full sm:w-64 px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={savingBranding}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              {savingBranding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : brandingSaved ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : null}
              <span>{brandingSaved ? 'Saved' : 'Save Name'}</span>
            </button>
            <button
              type="button"
              disabled={savingBranding}
              onClick={() => logoInputRef.current?.click()}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <ImagePlus className="w-3.5 h-3.5 text-blue-700" />
              <span>{branding?.logoDataUrl ? 'Change Logo' : 'Upload Logo'}</span>
            </button>
            {branding?.logoDataUrl && (
              <button
                type="button"
                disabled={savingBranding}
                onClick={() => void handleRemoveOrgLogo()}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                Remove Logo
              </button>
            )}
          </form>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {(() => {
            const qrStatus = resolveQrOrigin(branding?.publicAppUrl);
            return (
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Public QR Production URL (Vercel / Custom Domain)
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      qrStatus.isPublic
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-amber-50 text-amber-900 border-amber-300'
                    }`}
                  >
                    {qrStatus.isPublic
                      ? `Public HTTPS: ${qrStatus.origin}`
                      : 'Private Preview — Set Vercel URL'}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {qrStatus.isPublic
                    ? 'All generated Check-In & Feedback QR codes point to this public HTTPS host so any Android, iPhone, or iPad can scan without login.'
                    : qrStatus.warning}
                </p>
              </div>
            );
          })()}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSavePublicAppUrl(publicAppUrlInput).catch(() => {
                // Error already surfaced in brandingError
              });
            }}
            className="flex flex-wrap items-center gap-2 shrink-0"
          >
            <input
              type="url"
              maxLength={250}
              value={publicAppUrlInput}
              onChange={(e) => setPublicAppUrlInput(e.target.value)}
              placeholder="https://your-app.vercel.app"
              aria-label="Public QR Production URL"
              className="min-h-[40px] w-full sm:w-72 px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              disabled={savingBranding}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
            >
              Save QR URL
            </button>
          </form>
        </div>

        {brandingError && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {brandingError}
          </div>
        )}

        {/* Native PRESENZA Logo Admin Console Background Control */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={PRESENZA_NATIVE_LOGO_URL}
              alt="PRESENZA Native Logo"
              className="w-12 h-9 rounded-lg border border-slate-200 bg-white object-contain p-0.5 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Admin Console Native Logo Background
              </div>
              <p className="text-xs text-slate-500">
                Displays the official PRESENZA emblem as the watermark backdrop across the Admin Console.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAdminLogoBg}
                onChange={(e) => setShowAdminLogoBg(e.target.checked)}
                className="w-4 h-4 accent-blue-700 rounded cursor-pointer"
              />
              <span>{showAdminLogoBg ? 'Visible' : 'Hidden'}</span>
            </label>

            {showAdminLogoBg && (
              <label className="min-h-[36px] px-3 py-1 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-2">
                <span>Opacity</span>
                <input
                  type="range"
                  min={5}
                  max={45}
                  step={1}
                  value={adminLogoBgOpacity}
                  onChange={(e) => setAdminLogoBgOpacity(Number(e.target.value))}
                  aria-label="Admin Console native logo background opacity"
                  className="w-24 accent-blue-700 cursor-pointer"
                />
                <span className="font-mono-tabular w-8 text-right">
                  {adminLogoBgOpacity}%
                </span>
              </label>
            )}
          </div>
        </div>
      </section>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/85 backdrop-blur-xs border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">
            Active Sessions
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-tabular text-slate-900">
            {metrics.activeSessions}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {events.length} total created
          </div>
        </div>

        <div className="bg-white/85 backdrop-blur-xs border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">
            Recorded Check-Ins
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-tabular text-slate-900">
            {metrics.total}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {selectedEventFilter === 'all' ? 'Across all sessions' : 'Filtered session'}
          </div>
        </div>

        <div className="bg-white/85 backdrop-blur-xs border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">On Time</div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-tabular text-emerald-700">
            {metrics.onTime}
          </div>
          <div className="mt-1 text-xs font-mono-tabular text-slate-500">
            {metrics.onTimeRate}% punctuality
          </div>
        </div>

        <div className="bg-white/85 backdrop-blur-xs border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="text-xs font-medium text-slate-500">Late Arrivals</div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold font-mono-tabular text-amber-700">
            {metrics.late}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            After cutoff time
          </div>
        </div>
      </div>

      {/* Two-Column Workspace: Event & QR Management + Real-Time Arrival Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Ongoing Event & Ended Event Selector */}
        <section className="lg:col-span-7 bg-white/88 backdrop-blur-xs border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1.5">
              <div
                role="tablist"
                aria-label="Event status categories"
                className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventListTab === 'ongoing'}
                  onClick={() => setEventListTab('ongoing')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                    eventListTab === 'ongoing'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Ongoing Event</span>
                  <span
                    className={`font-mono-tabular text-xs font-semibold ${
                      eventListTab === 'ongoing'
                        ? 'text-emerald-700'
                        : 'text-slate-500'
                    }`}
                  >
                    ({ongoingEvents.length})
                  </span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={eventListTab === 'ended'}
                  onClick={() => setEventListTab('ended')}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-colors inline-flex items-center gap-2 whitespace-nowrap ${
                    eventListTab === 'ended'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span>Ended Event</span>
                  <span
                    className={`font-mono-tabular text-xs font-semibold ${
                      eventListTab === 'ended'
                        ? 'text-slate-800'
                        : 'text-slate-500'
                    }`}
                  >
                    ({endedEvents.length})
                  </span>
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Choose Ongoing Event or Ended Event, then click an event to open its QR codes and Check-In &amp; Feedback status.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Event</span>
            </button>
          </div>

          {loadingData ? (
            <div className="p-6 space-y-3">
              <div className="h-16 bg-slate-100 rounded-xl animate-pulse" />
              <div className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center space-y-4">
              <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto">
                <CalendarPlus className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  No events created yet
                </h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                  Specify an event name, date, and location to automatically generate its unique check-in QR code.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Event</span>
                </button>
                <button
                  type="button"
                  onClick={handleQuickCreateStarter}
                  disabled={savingEvent}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold transition-colors"
                >
                  Quick-Open Today&apos;s PD Workshop
                </button>
              </div>
            </div>
          ) : displayedEvents.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
                <CalendarClock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {eventListTab === 'ongoing'
                    ? 'No ongoing events right now'
                    : 'No ended events yet'}
                </h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
                  {eventListTab === 'ongoing'
                    ? 'Create a new event to open check-in & feedback, or switch to Ended Event to view past sessions.'
                    : 'Events that have been closed or ended will appear here.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                {eventListTab === 'ongoing' && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Event</span>
                  </button>
                )}
                {eventListTab === 'ongoing' && endedEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEventListTab('ended')}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors"
                  >
                    View Ended Event ({endedEvents.length})
                  </button>
                )}
                {eventListTab === 'ended' && ongoingEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setEventListTab('ongoing')}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold transition-colors"
                  >
                    View Ongoing Event ({ongoingEvents.length})
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {displayedEvents.map((ev) => {
                const count = attendanceCountsByEvent.get(ev.id) ?? 0;
                const isCheckInOpen = ev.status === 'active';
                const evFeedbackCfg = mergeFeedbackConfig(
                  feedbackConfigsById.get(ev.id) ??
                    feedbackConfigsById.get('default') ??
                    null,
                  ev.id
                );
                const evFeedbackEval = evaluateFeedbackSchedule(evFeedbackCfg);
                const isFeedbackPaused = evFeedbackCfg.feedbackActive === false;

                const feedbackStatusLabel = !isCheckInOpen
                  ? 'Feedback Ended'
                  : isFeedbackPaused
                  ? 'Feedback Paused'
                  : evFeedbackEval.status === 'before-open' &&
                    evFeedbackCfg.openAtIso
                  ? `Feedback Opens ${formatScheduleDateTime(evFeedbackCfg.openAtIso)}`
                  : evFeedbackEval.status === 'closed'
                  ? 'Feedback Ended'
                  : evFeedbackCfg.scheduleEnabled && evFeedbackCfg.closeAtIso
                  ? `Feedback Open until ${formatScheduleDateTime(evFeedbackCfg.closeAtIso)}`
                  : 'Feedback Open / Active';

                const feedbackStatusTone = !isCheckInOpen
                  ? 'text-rose-700'
                  : isFeedbackPaused
                  ? 'text-amber-700'
                  : evFeedbackEval.status === 'before-open'
                  ? 'text-blue-700'
                  : evFeedbackEval.status === 'closed'
                  ? 'text-rose-700'
                  : 'text-emerald-700';

                const handleOpenClickedEvent = () => {
                  setSelectedEventFilter(ev.id);
                  setQrEvent(ev);
                };

                return (
                  <div
                    key={ev.id}
                    role="button"
                    tabIndex={0}
                    onClick={handleOpenClickedEvent}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenClickedEvent();
                      }
                    }}
                    aria-label={`Open ${ev.title} to view Check-In and Feedback status`}
                    className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 transition-colors cursor-pointer"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div onClick={(e) => e.stopPropagation()}>
                        <EventQrThumbnail
                          eventId={ev.id}
                          eventTitle={ev.title}
                          publicAppUrl={branding?.publicAppUrl}
                          onClick={handleOpenClickedEvent}
                        />
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                            {ev.title}
                          </h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span>{ev.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {ev.venue}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">{ev.eventDate}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-tabular">
                            {ev.startTime} (Cutoff {ev.lateCutoffTime})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                          <span className="font-mono-tabular font-semibold text-slate-700">
                            {count}{' '}
                            {count === 1
                              ? 'participant checked in'
                              : 'participants checked in'}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span
                            className={`font-semibold ${
                              isCheckInOpen ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {isCheckInOpen ? 'Check-In Open / Active' : 'Check-In Ended'}
                          </span>
                          <span className="text-slate-300" aria-hidden="true">
                            ·
                          </span>
                          <span className={`font-semibold ${feedbackStatusTone}`}>
                            {feedbackStatusLabel}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="flex flex-wrap items-center gap-1.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={handleOpenClickedEvent}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        <span>Open Event</span>
                      </button>
                      {isCheckInOpen && (
                        <button
                          type="button"
                          disabled={togglingFeedbackEventId === ev.id}
                          onClick={() =>
                            void handleToggleEventFeedbackActive(ev)
                          }
                          className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-1 whitespace-nowrap disabled:opacity-60 ${
                            isFeedbackPaused
                              ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                              : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'
                          }`}
                          title={
                            isFeedbackPaused
                              ? 'Activate Feedback & Evaluation for participants'
                              : 'Pause / Deactivate Feedback & Evaluation for participants'
                          }
                        >
                          {togglingFeedbackEventId === ev.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isFeedbackPaused ? (
                            <PlayCircle className="w-3.5 h-3.5" />
                          ) : (
                            <PauseCircle className="w-3.5 h-3.5" />
                          )}
                          <span>
                            {isFeedbackPaused
                              ? 'Activate Feedback'
                              : 'Pause Feedback'}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCustomizeFeedbackTargetEventId(ev.id);
                          setCustomizeFeedbackNonce((n) => n + 1);
                          setCurrentSection('feedback');
                        }}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                        title="Edit Feedback questions, statements, and schedule live"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Edit Feedback</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleEventStatus(ev)}
                        className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold transition-colors whitespace-nowrap"
                      >
                        {isCheckInOpen ? 'End Event' : 'Reopen'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(ev)}
                        className="min-h-[38px] min-w-[38px] px-2 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 transition-colors inline-flex items-center justify-center"
                        aria-label={`Edit ${ev.title}`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete({
                            type: 'event',
                            id: ev.id,
                            label: ev.title,
                          })
                        }
                        className="min-h-[38px] min-w-[38px] px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-rose-700 transition-colors inline-flex items-center justify-center"
                        aria-label={`Delete ${ev.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right 5 Columns: Real-Time Arrival Feed */}
        <section
          aria-label="Real-time attendance feed"
          className="lg:col-span-5 relative bg-white border border-slate-200 rounded-2xl overflow-hidden"
        >
          {dashboardBgUrl && (
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

          <input
            ref={bgInputRef}
            type="file"
            accept="image/jpeg,.jpg,.jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void handleUploadDashboardBg(file);
            }}
            className="hidden"
            aria-label="Upload JPEG portrait background for live dashboard"
          />

          <div className="relative z-10">
            <div
              className={`px-5 py-4 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 ${
                dashboardBgUrl ? 'bg-white/80 backdrop-blur-[2px]' : ''
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    Real-Time Arrival Feed
                  </h2>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                    <span
                      className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"
                      aria-hidden="true"
                    />
                    <span>Live</span>
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5">
                  Ranked from earliest check-in (#1) at top to latest at bottom
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-mono-tabular font-semibold text-slate-700 mr-1">
                  {attendances.length} total
                </span>
                {voiceSettings.enabled && voiceSettings.announceOnDashboard && (
                  <button
                    type="button"
                    onClick={() => {
                      unlockBrowserAudio();
                      setDashboardVoiceMuted((m) => !m);
                    }}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                      dashboardVoiceMuted
                        ? 'border-slate-300 bg-slate-100 text-slate-600'
                        : speakingParticipantName
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100'
                    }`}
                    title="Mute or unmute live dashboard voice announcements"
                  >
                    {dashboardVoiceMuted ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Voice Muted</span>
                      </>
                    ) : speakingParticipantName ? (
                      <>
                        <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                        <span className="max-w-[140px] truncate">
                          Speaking: {speakingParticipantName}
                        </span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>AI Voice On</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCurrentSection('live-board')}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-xs font-semibold text-indigo-800 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <MonitorPlay className="w-3.5 h-3.5" />
                  <span>Animated Board</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentSection('voice')}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors whitespace-nowrap"
                >
                  Voice Settings
                </button>
                <button
                  type="button"
                  disabled={savingBg}
                  onClick={() => bgInputRef.current?.click()}
                  className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  {savingBg ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ImagePlus className="w-3.5 h-3.5 text-blue-700" />
                  )}
                  <span>{dashboardBgUrl ? 'Change JPEG Bg' : 'JPEG Portrait Bg'}</span>
                </button>
                {dashboardBgUrl && (
                  <label className="min-h-[34px] px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1.5">
                    <span>Opacity</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={dashboardBgOpacity}
                      onChange={(e) =>
                        handleChangeDashboardBgOpacity(Number(e.target.value))
                      }
                      aria-label="Real-time feed background photo opacity"
                      className="w-14 accent-blue-700 cursor-pointer"
                    />
                    <span className="font-mono-tabular w-7 text-right">
                      {dashboardBgOpacity}%
                    </span>
                  </label>
                )}
                {dashboardBgUrl && (
                  <button
                    type="button"
                    disabled={savingBg}
                    onClick={() => void handleRemoveDashboardBg()}
                    className="min-h-[34px] px-2 py-1 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {dashboardAutoplayBlocked && !dashboardVoiceMuted && (
              <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
                <span>
                  Browser blocked automatic audio playback. Click once to allow live check-in announcements.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    unlockBrowserAudio();
                    setDashboardAutoplayBlocked(false);
                    announcementQueueRef.current?.replayBlocked();
                  }}
                  className="px-3 py-1 rounded-lg bg-amber-900 hover:bg-amber-800 text-white font-semibold"
                >
                  Enable Dashboard Audio
                </button>
              </div>
            )}

            {bgError && (
              <div className="px-5 py-2 text-xs text-rose-700 bg-rose-50 border-b border-rose-200">
                {bgError}
              </div>
            )}

            {attendances.length === 0 ? (
              <div className="p-8 text-center space-y-2 min-h-[260px] flex flex-col items-center justify-center">
                <p className="text-sm font-semibold text-slate-900">
                  Waiting for first arrival
                </p>
                <p className="text-xs text-slate-600 max-w-xs mx-auto">
                  As soon as a participant scans an event QR code and submits, their name and check-in time will appear here instantly.
                </p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-200/70">
                <AnimatePresence initial={false}>
                  {attendances.map((rec, index) => {
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
                        className={`px-5 py-3.5 flex items-center justify-between gap-3 ${
                          isRecent
                            ? 'bg-blue-50/75'
                            : dashboardBgUrl
                            ? 'bg-white/55 hover:bg-white/80'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 text-xs font-mono-tabular font-semibold text-slate-500 shrink-0">
                            #{index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => setLightboxRecord(rec)}
                            className="w-10 h-10 rounded-full overflow-hidden border border-slate-200 bg-slate-100 shrink-0 hover:ring-2 hover:ring-blue-600 transition-all"
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
                                  Just arrived
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 truncate">
                              {rec.classDepartment} · {rec.eventName}
                            </div>
                            {rec.status === 'Late' && rec.lateExcuse && (
                              <div className="text-xs text-amber-800 truncate mt-0.5">
                                Excuse: {rec.lateExcuse}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono-tabular text-xs font-semibold text-slate-900">
                            {rec.checkInTime}
                          </div>
                          <div
                            className={`text-[11px] font-semibold ${
                              rec.status === 'On Time'
                                ? 'text-emerald-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {rec.status}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Live Attendance Roster Table */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Live Attendance Log
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Updates automatically as participants submit check-ins from their devices.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search */}
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or class..."
                aria-label="Search attendance records"
                className="w-full min-h-[40px] pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            {/* Session Filter */}
            <select
              value={selectedEventFilter}
              onChange={(e) => setSelectedEventFilter(e.target.value)}
              aria-label="Filter by session"
              className="min-h-[40px] px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Sessions</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title}
                </option>
              ))}
            </select>

            {/* Status Segmented Control */}
            <div
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg"
              role="group"
              aria-label="Filter by attendance status"
            >
              {(['all', 'On Time', 'Late'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === status
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {status === 'all' ? 'All' : status}
                </button>
              ))}
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={() => {
                exportAttendanceCsv(
                  filteredAttendances,
                  selectedEventObj ? selectedEventObj.title : 'presenza-all-sessions'
                );
              }}
              disabled={filteredAttendances.length === 0}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            {/* Download Recapitulation PDF */}
            <button
              type="button"
              onClick={() =>
                downloadRecapitulationPdf(
                  filteredAttendances,
                  selectedEventObj,
                  eventsById,
                  branding
                )
              }
              disabled={filteredAttendances.length === 0}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-900 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span>Recap PDF</span>
            </button>

            {/* Download Big 5 Earliest Arrival Certificates PDF */}
            <button
              type="button"
              onClick={() =>
                downloadBig5CertificatesPdf(
                  sessionChronologicalRecords,
                  selectedEventObj?.title,
                  eventsById,
                  branding,
                  certificateSettings
                )
              }
              disabled={sessionBig5.length === 0}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
            >
              <Award className="w-4 h-4 text-amber-700" />
              <span>Big 5 Certificates PDF</span>
            </button>
          </div>
        </div>

        {/* Top 5 Earliest Arrivals (Big 5) Certificate Strip */}
        {sessionBig5.length > 0 && (
          <div className="px-6 py-4 border-b border-slate-200 bg-amber-50/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-700 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900">
                  Top {sessionBig5.length} Earliest Arrivals (Big 5)
                </h3>
                <span className="text-xs text-slate-500">
                  {selectedEventObj ? selectedEventObj.title : 'All Sessions'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    setCertSettingsError(null);
                    setShowCertCustomizer(true);
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Palette className="w-3.5 h-3.5 text-blue-700" />
                  <span>Customize Layout &amp; Signatures</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadBig5CertificatesPdf(
                      sessionChronologicalRecords,
                      selectedEventObj?.title,
                      eventsById,
                      branding,
                      certificateSettings
                    )
                  }
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100 text-xs font-semibold text-amber-900 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download All {sessionBig5.length} Certificates (PDF)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {sessionBig5.map((rec, idx) => (
                <div
                  key={rec.id}
                  className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between gap-2.5"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span className="font-mono-tabular text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 shrink-0">
                      #{idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLightboxRecord(rec)}
                      className="w-9 h-9 rounded-full overflow-hidden border border-slate-200 bg-slate-100 shrink-0 hover:ring-2 hover:ring-blue-600 transition-all"
                      aria-label={`View photo of ${rec.fullName}`}
                    >
                      <img
                        src={rec.photoDataUrl}
                        alt={rec.fullName}
                        className="w-full h-full object-cover"
                      />
                    </button>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {rec.fullName}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {rec.classDepartment}
                      </div>
                      <div className="font-mono-tabular text-[11px] font-semibold text-slate-700 mt-0.5">
                        {rec.checkInTime}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      downloadSingleCertificatePdf(
                        rec,
                        idx + 1,
                        sessionChronologicalRecords.length,
                        eventsById.get(rec.eventId) ?? null,
                        branding,
                        certificateSettings
                      )
                    }
                    className="w-full min-h-[34px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-800 transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap"
                  >
                    <Award className="w-3.5 h-3.5 text-amber-700" />
                    <span>Certificate PDF</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {filteredAttendances.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              No attendance records match the current filters
            </p>
            <p className="text-xs text-slate-500">
              Share a session QR code so participants can scan and check in without logging in.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Photo</th>
                  <th className="py-3 px-4">Participant</th>
                  <th className="py-3 px-4">Class / Department</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Server Timestamp</th>
                  <th className="py-3 px-4">Status &amp; Excuse</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredAttendances.map((rec, index) => {
                  const serverDate = rec.serverTimestamp?.toDate
                    ? rec.serverTimestamp.toDate()
                    : null;
                  return (
                    <tr
                      key={rec.id}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-mono-tabular text-xs font-semibold text-slate-500">
                        {index + 1}
                      </td>
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => setLightboxRecord(rec)}
                          className="w-11 h-11 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 hover:ring-2 hover:ring-blue-600 transition-all block"
                          aria-label={`View photo of ${rec.fullName}`}
                        >
                          <img
                            src={rec.photoDataUrl}
                            alt={rec.fullName}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-slate-900">
                          {rec.fullName}
                        </div>
                        {rec.participantEmail && (
                          <div className="text-[11px] text-slate-500">
                            {rec.participantEmail}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700">
                        {rec.classDepartment}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 max-w-[200px] truncate">
                        {rec.eventName}
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular text-xs text-slate-700 whitespace-nowrap">
                        <div>{rec.attendanceDate}</div>
                        <div className="text-slate-500">{rec.checkInTime}</div>
                      </td>
                      <td className="py-2.5 px-4 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                        {serverDate
                          ? serverDate.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })
                          : 'Syncing...'}
                      </td>
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => void handleToggleAttendanceStatus(rec)}
                          title="Click to toggle On Time / Late"
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap ${
                            rec.status === 'On Time'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {rec.status === 'On Time' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Clock className="w-3.5 h-3.5 text-amber-700" />
                          )}
                          <span>{rec.status}</span>
                        </button>
                        {rec.status === 'Late' && rec.lateExcuse && (
                          <div className="mt-1 text-xs text-amber-900 max-w-[220px] break-words">
                            {rec.lateExcuse}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              type: 'attendance',
                              id: rec.id,
                              label: `${rec.fullName} (${rec.eventName})`,
                            })
                          }
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          aria-label={`Delete attendance record for ${rec.fullName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
        </>
      )}
      </div>

      {/* Create / Edit Session Modal */}
      {showEventModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-modal-title"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 id="event-modal-title" className="text-lg font-bold text-slate-900">
                {editingEvent ? 'Edit Session' : 'Create Workshop / Session'}
              </h2>
              <button
                type="button"
                onClick={() => setShowEventModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Close session form"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              <div>
                <label
                  htmlFor="ev-title"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Event Name *
                </label>
                <input
                  id="ev-title"
                  type="text"
                  required
                  maxLength={140}
                  value={evTitle}
                  onChange={(e) => setEvTitle(e.target.value)}
                  placeholder="e.g. Differentiated Instruction PD Workshop"
                  className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="ev-category"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Session Type *
                  </label>
                  <input
                    id="ev-category"
                    type="text"
                    required
                    maxLength={80}
                    value={evCategory}
                    onChange={(e) => setEvCategory(e.target.value)}
                    placeholder="Type custom session type..."
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ev-venue"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Location / Venue *
                  </label>
                  <input
                    id="ev-venue"
                    type="text"
                    required
                    maxLength={120}
                    value={evVenue}
                    onChange={(e) => setEvVenue(e.target.value)}
                    placeholder="e.g. Room 204 / Auditorium"
                    className="w-full min-h-[44px] px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="ev-date"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Date &amp; Time Settings *
                  </label>

                  <div
                    className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
                    role="group"
                    aria-label="Time format"
                  >
                    <button
                      type="button"
                      onClick={() => setTimeFormatMode('24h')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        timeFormatMode === '24h'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      24-Hour
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeFormatMode('12h')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        timeFormatMode === '12h'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      12-Hour (AM / PM)
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="ev-date"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Event Date *
                  </label>
                  <input
                    id="ev-date"
                    type="date"
                    required
                    value={evDate}
                    onChange={(e) => setEvDate(e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 text-xs font-mono-tabular border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      {
                        idPrefix: 'ev-start',
                        label: 'Start Time *',
                        value: evStartTime,
                        onChange: setEvStartTime,
                      },
                      {
                        idPrefix: 'ev-cutoff',
                        label: 'Late After *',
                        value: evCutoffTime,
                        onChange: setEvCutoffTime,
                      },
                    ] as const
                  ).map((field) => {
                    const p24 = parse24hParts(field.value);
                    const p12 = parse24hTo12h(field.value);

                    return (
                      <div
                        key={field.idPrefix}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor={`${field.idPrefix}-hour`}
                            className="text-xs font-semibold text-slate-700"
                          >
                            {field.label}
                          </label>
                          <span className="font-mono-tabular text-[11px] text-slate-500">
                            {timeFormatMode === '24h'
                              ? `${String(p12.hour12).padStart(2, '0')}:${String(p12.minute).padStart(2, '0')} ${p12.period}`
                              : `24h: ${field.value}`}
                          </span>
                        </div>

                        {timeFormatMode === '24h' ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              id={`${field.idPrefix}-hour`}
                              aria-label={`${field.label} hour (24-hour)`}
                              value={p24.hour24}
                              onChange={(e) =>
                                field.onChange(
                                  format24hPartsToString(
                                    Number(e.target.value),
                                    p24.minute
                                  )
                                )
                              }
                              className="flex-1 min-h-[40px] px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                              aria-label={`${field.label} minute`}
                              value={p24.minute}
                              onChange={(e) =>
                                field.onChange(
                                  format24hPartsToString(
                                    p24.hour24,
                                    Number(e.target.value)
                                  )
                                )
                              }
                              className="flex-1 min-h-[40px] px-2.5 py-1.5 text-sm font-mono-tabular bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                            >
                              {Array.from({ length: 60 }, (_, m) => (
                                <option key={m} value={m}>
                                  {String(m).padStart(2, '0')}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              id={`${field.idPrefix}-hour`}
                              aria-label={`${field.label} hour (12-hour)`}
                              value={p12.hour12}
                              onChange={(e) =>
                                field.onChange(
                                  format12hTo24h(
                                    Number(e.target.value),
                                    p12.minute,
                                    p12.period
                                  )
                                )
                              }
                              className="flex-1 min-w-[60px] min-h-[40px] px-2 py-1.5 text-sm font-mono-tabular bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                              aria-label={`${field.label} minute`}
                              value={p12.minute}
                              onChange={(e) =>
                                field.onChange(
                                  format12hTo24h(
                                    p12.hour12,
                                    Number(e.target.value),
                                    p12.period
                                  )
                                )
                              }
                              className="flex-1 min-w-[60px] min-h-[40px] px-2 py-1.5 text-sm font-mono-tabular bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                              aria-label={`${field.label} AM or PM`}
                            >
                              {(['AM', 'PM'] as const).map((periodOption) => (
                                <button
                                  key={periodOption}
                                  type="button"
                                  onClick={() =>
                                    field.onChange(
                                      format12hTo24h(
                                        p12.hour12,
                                        p12.minute,
                                        periodOption
                                      )
                                    )
                                  }
                                  className={`min-h-[38px] px-2.5 text-xs font-bold transition-colors ${
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="ev-desc"
                  className="block text-xs font-semibold text-slate-700 mb-1.5"
                >
                  Notes / Welcome Message (shown on participant form)
                </label>
                <textarea
                  id="ev-desc"
                  rows={2}
                  maxLength={500}
                  value={evDescription}
                  onChange={(e) => setEvDescription(e.target.value)}
                  placeholder="Short instructions or agenda shown on the participant check-in screen..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Form & Certificate Customization Controls */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-900">
                  Customize Participant Form &amp; Certificates
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="ev-facilitators"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Facilitators (shown on Certificate)
                    </label>
                    <input
                      id="ev-facilitators"
                      type="text"
                      maxLength={200}
                      value={evFacilitators}
                      onChange={(e) => setEvFacilitators(e.target.value)}
                      placeholder="e.g. Ms. Elena Vance, Mr. David Park"
                      className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ev-principal"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Principal Name (shown on Certificate)
                    </label>
                    <input
                      id="ev-principal"
                      type="text"
                      maxLength={120}
                      value={evPrincipalName}
                      onChange={(e) => setEvPrincipalName(e.target.value)}
                      placeholder="e.g. Dr. Sarah Rahman"
                      className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="ev-theme"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Event Theme (for Recognition &amp; Feedback)
                    </label>
                    <input
                      id="ev-theme"
                      type="text"
                      maxLength={120}
                      value={evTheme}
                      onChange={(e) => setEvTheme(e.target.value)}
                      placeholder="e.g. Future-Ready Pedagogy"
                      className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="ev-topic"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Session / Topic (for Feedback &amp; Certificates)
                    </label>
                    <input
                      id="ev-topic"
                      type="text"
                      maxLength={200}
                      value={evTopic}
                      onChange={(e) => setEvTopic(e.target.value)}
                      placeholder="e.g. Active Learning & Formative Assessment"
                      className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="ev-dept-label"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Class / Department Field Label
                  </label>
                  <input
                    id="ev-dept-label"
                    type="text"
                    maxLength={80}
                    value={evDepartmentLabel}
                    onChange={(e) => setEvDepartmentLabel(e.target.value)}
                    placeholder="e.g. Class / Department or Grade / Subject"
                    className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ev-consent-text"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Photo Consent Text
                  </label>
                  <textarea
                    id="ev-consent-text"
                    rows={2}
                    maxLength={400}
                    value={evConsentText}
                    onChange={(e) => setEvConsentText(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Feedback & Evaluation Schedule & Availability (Configurable BEFORE Create & Open) */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-blue-700 shrink-0" />
                      <span className="text-xs font-bold text-slate-900">
                        Feedback &amp; Evaluation Timing &amp; Activation
                      </span>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={evFeedbackActive}
                        onChange={(e) => setEvFeedbackActive(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <span>
                        {evFeedbackActive
                          ? 'Active when opened'
                          : 'Paused (Deactivated)'}
                      </span>
                    </label>
                  </div>

                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 space-y-3">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={evFeedbackScheduleEnabled}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEvFeedbackScheduleEnabled(checked);
                          if (
                            checked &&
                            !evFeedbackOpenDate &&
                            !evFeedbackCloseDate
                          ) {
                            applyModalFeedbackPreset('session-window');
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <span className="text-xs font-semibold text-slate-900">
                        Schedule Feedback &amp; Evaluation Open / Close Window
                      </span>
                    </label>

                    {evFeedbackScheduleEnabled ? (
                      <div className="space-y-3 pt-2 border-t border-blue-200/70">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
                              Quick Fill:
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                applyModalFeedbackPreset('session-window')
                              }
                              className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-800"
                            >
                              Session Start (+2h)
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                applyModalFeedbackPreset('last-30m')
                              }
                              className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-800"
                            >
                              Last 30 Mins (of 2h)
                            </button>
                            <button
                              type="button"
                              onClick={() => applyModalFeedbackPreset('today')}
                              className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-800"
                            >
                              {evFeedbackTimeFormat === '12h'
                                ? 'Full Day (08:00 AM–05:00 PM)'
                                : 'Full Day (08:00–17:00)'}
                            </button>
                            <button
                              type="button"
                              onClick={() => applyModalFeedbackPreset('clear')}
                              className="min-h-[30px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 text-[11px] font-medium text-slate-600"
                            >
                              Clear
                            </button>
                          </div>

                          <div
                            className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
                            role="group"
                            aria-label="Modal feedback schedule time format"
                          >
                            <button
                              type="button"
                              onClick={() => setEvFeedbackTimeFormat('12h')}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                                evFeedbackTimeFormat === '12h'
                                  ? 'bg-blue-700 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              12-Hour (AM / PM)
                            </button>
                            <button
                              type="button"
                              onClick={() => setEvFeedbackTimeFormat('24h')}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                                evFeedbackTimeFormat === '24h'
                                  ? 'bg-blue-700 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              24-Hour
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {(
                            [
                              {
                                key: 'open' as const,
                                label: 'Feedback Opens At',
                                dateVal: evFeedbackOpenDate,
                                setDateVal: setEvFeedbackOpenDate,
                                timeVal: evFeedbackOpenTime || '08:00',
                                setTimeVal: (val: string) => {
                                  if (!evFeedbackOpenDate) {
                                    setEvFeedbackOpenDate(
                                      evDate || formatLocalDateYmd(new Date())
                                    );
                                  }
                                  setEvFeedbackOpenTime(val);
                                },
                              },
                              {
                                key: 'close' as const,
                                label: 'Feedback Closes At',
                                dateVal: evFeedbackCloseDate,
                                setDateVal: setEvFeedbackCloseDate,
                                timeVal: evFeedbackCloseTime || '17:00',
                                setTimeVal: (val: string) => {
                                  if (!evFeedbackCloseDate) {
                                    setEvFeedbackCloseDate(
                                      evDate || formatLocalDateYmd(new Date())
                                    );
                                  }
                                  setEvFeedbackCloseTime(val);
                                },
                              },
                            ] as const
                          ).map((slot) => {
                            const p24 = parse24hParts(slot.timeVal);
                            const p12 = parse24hTo12h(slot.timeVal);

                            return (
                              <div
                                key={slot.key}
                                className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-slate-800">
                                    {slot.label}
                                  </span>
                                  <span className="font-mono-tabular text-[10px] text-slate-500">
                                    {evFeedbackTimeFormat === '12h'
                                      ? `24h: ${slot.timeVal}`
                                      : `${String(p12.hour12).padStart(
                                          2,
                                          '0'
                                        )}:${String(p12.minute).padStart(
                                          2,
                                          '0'
                                        )} ${p12.period}`}
                                  </span>
                                </div>

                                <input
                                  type="date"
                                  aria-label={`Session feedback ${slot.key}ing date`}
                                  value={slot.dateVal}
                                  onChange={(e) =>
                                    slot.setDateVal(e.target.value)
                                  }
                                  className="w-full min-h-[36px] px-2 py-1 text-xs font-mono-tabular border border-slate-300 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
                                />

                                {evFeedbackTimeFormat === '12h' ? (
                                  <div className="flex items-center gap-1">
                                    <select
                                      aria-label={`Session feedback ${slot.key}ing hour (12-hour)`}
                                      value={p12.hour12}
                                      onChange={(e) =>
                                        slot.setTimeVal(
                                          format12hTo24h(
                                            Number(e.target.value),
                                            p12.minute,
                                            p12.period
                                          )
                                        )
                                      }
                                      className="flex-1 min-w-[52px] min-h-[36px] px-1.5 py-1 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                                      aria-label={`Session feedback ${slot.key}ing minute`}
                                      value={p12.minute}
                                      onChange={(e) =>
                                        slot.setTimeVal(
                                          format12hTo24h(
                                            p12.hour12,
                                            Number(e.target.value),
                                            p12.period
                                          )
                                        )
                                      }
                                      className="flex-1 min-w-[52px] min-h-[36px] px-1.5 py-1 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                                      aria-label={`Session feedback ${slot.key}ing AM or PM`}
                                    >
                                      {(['AM', 'PM'] as const).map(
                                        (periodOption) => (
                                          <button
                                            key={periodOption}
                                            type="button"
                                            onClick={() =>
                                              slot.setTimeVal(
                                                format12hTo24h(
                                                  p12.hour12,
                                                  p12.minute,
                                                  periodOption
                                                )
                                              )
                                            }
                                            className={`min-h-[34px] px-2 text-[11px] font-bold transition-colors ${
                                              p12.period === periodOption
                                                ? 'bg-blue-700 text-white'
                                                : 'text-slate-700 hover:bg-slate-100'
                                            }`}
                                          >
                                            {periodOption}
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <select
                                      aria-label={`Session feedback ${slot.key}ing hour (24-hour)`}
                                      value={p24.hour24}
                                      onChange={(e) =>
                                        slot.setTimeVal(
                                          format24hPartsToString(
                                            Number(e.target.value),
                                            p24.minute
                                          )
                                        )
                                      }
                                      className="flex-1 min-h-[36px] px-2 py-1 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                                      aria-label={`Session feedback ${slot.key}ing minute (24-hour)`}
                                      value={p24.minute}
                                      onChange={(e) =>
                                        slot.setTimeVal(
                                          format24hPartsToString(
                                            p24.hour24,
                                            Number(e.target.value)
                                          )
                                        )
                                      }
                                      className="flex-1 min-h-[36px] px-2 py-1 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
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
                            );
                          })}
                        </div>

                        <div>
                          <label
                            htmlFor="ev-fb-closed-msg"
                            className="block text-[11px] font-semibold text-slate-700 mb-1"
                          >
                            Message When Outside Window or Paused (Optional)
                          </label>
                          <input
                            id="ev-fb-closed-msg"
                            type="text"
                            maxLength={300}
                            value={evFeedbackClosedMessage}
                            onChange={(e) =>
                              setEvFeedbackClosedMessage(e.target.value)
                            }
                            placeholder="e.g. Evaluation opens during the final 30 minutes of the session."
                            className="w-full min-h-[36px] px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-600">
                        {evFeedbackActive
                          ? 'Feedback & Evaluation will be open immediately when the session starts. You can also edit questions or pause feedback anytime while the event is ongoing.'
                          : 'Feedback & Evaluation will start paused until you click Activate Feedback.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Instant Participant Access Notice */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="text-xs text-emerald-950">
                      <span className="font-bold">
                        Direct Participant Check-In (No Login Required):
                      </span>{' '}
                      Anyone with the session link or QR code can check in immediately without email, password, or OTP verification. Administrator dashboards remain protected.
                    </div>
                  </div>
                </div>
              </div>

              {eventFormError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {eventFormError}
                </p>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEvent}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors inline-flex items-center gap-2 disabled:opacity-60"
                >
                  {savingEvent && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>{editingEvent ? 'Save Changes' : 'Create & Open'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code + Live Clock-In Dashboard Modal */}
      {qrEvent && (() => {
        const liveQrEvent = events.find((e) => e.id === qrEvent.id) ?? qrEvent;
        const liveQrFeedbackCfg =
          feedbackConfigsById.get(liveQrEvent.id) ??
          feedbackConfigsById.get('default') ??
          null;
        return (
          <QrPosterModal
            event={liveQrEvent}
            eventAttendances={attendances.filter((a) => a.eventId === liveQrEvent.id)}
            eventFeedbackSubmissions={feedbackSubmissions.filter(
              (s) => s.eventId === liveQrEvent.id
            )}
            feedbackConfig={liveQrFeedbackCfg}
            onClose={() => setQrEvent(null)}
            onOpenCheckIn={onOpenCheckIn}
            onOpenFeedback={onOpenFeedbackForm}
            onOpenFeedbackAnalytics={() => {
              setCurrentSection('feedback');
            }}
            onLaunchProjector={(eventId) => {
              setSelectedEventFilter(eventId);
              setCurrentSection('live-board');
              setIsProjectorOpen(true);
            }}
            onToggleEventStatus={handleToggleEventStatus}
            onToggleFeedbackActive={handleToggleEventFeedbackActive}
            togglingFeedback={togglingFeedbackEventId === liveQrEvent.id}
            onPreviewPhoto={(rec) => setLightboxRecord(rec)}
            dashboardBgUrl={dashboardBgUrl}
            dashboardBgOpacity={dashboardBgOpacity}
            savingBg={savingBg}
            bgError={bgError}
            onUploadBackground={handleUploadDashboardBg}
            onChangeBackgroundOpacity={handleChangeDashboardBgOpacity}
            onRemoveBackground={handleRemoveDashboardBg}
            branding={branding}
            onSavePublicAppUrl={handleSavePublicAppUrl}
          />
        );
      })()}

      {/* Photo Lightbox Modal */}
      {lightboxRecord && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxRecord(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {lightboxRecord.fullName}
                </h3>
                <p className="text-xs text-slate-500">
                  {lightboxRecord.classDepartment} · {lightboxRecord.checkInTime}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLightboxRecord(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Close photo preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 bg-slate-50">
              <img
                src={lightboxRecord.photoDataUrl}
                alt={`${lightboxRecord.fullName} verification photo`}
                className="w-full max-h-[65vh] object-contain rounded-xl bg-white border border-slate-200"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal (Single Event or Single Attendance) */}
      {confirmDelete && (() => {
        const singleEventObj =
          confirmDelete.type === 'event'
            ? events.find((e) => e.id === confirmDelete.id) ?? null
            : null;
        const singleEventAttendances =
          confirmDelete.type === 'event'
            ? attendances.filter((a) => a.eventId === confirmDelete.id)
            : [];

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-900">
                  Save or Delete {confirmDelete.type === 'event' ? 'Event' : 'Record'}
                </h3>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  disabled={deletingSingle}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                  aria-label="Close confirmation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed">
                Do you want to keep{' '}
                <span className="font-semibold text-slate-900">
                  {confirmDelete.label}
                </span>{' '}
                or permanently delete it?
                {confirmDelete.type === 'event' && singleEventAttendances.length > 0 && (
                  <>
                    {' '}
                    This event currently has{' '}
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {singleEventAttendances.length}
                    </span>{' '}
                    recap attendance{' '}
                    {singleEventAttendances.length === 1 ? 'record' : 'records'}.
                  </>
                )}
              </p>

              {confirmDelete.type === 'event' && singleEventAttendances.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-600">
                    Save a copy of this event&apos;s recap before deleting:
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadRecapitulationPdf(
                        singleEventAttendances,
                        singleEventObj,
                        eventsById,
                        branding
                      )
                    }
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-700" />
                    <span>Download Recap PDF</span>
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  disabled={deletingSingle}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                >
                  <Archive className="w-4 h-4 text-slate-600" />
                  <span>Save &amp; Keep</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmedDelete(true)}
                  disabled={deletingSingle}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  {deletingSingle && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>
                    {confirmDelete.type === 'event' && singleEventAttendances.length > 0
                      ? 'Delete Event & Recap'
                      : 'Delete Permanently'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* History & Recap Manager Modal (Save or Erase All / Previous Events & Recap) */}
      {showEraseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="erase-history-title"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h2 id="erase-history-title" className="text-lg font-bold text-slate-900">
                    Manage History, Events &amp; Recap
                  </h2>
                  <p className="text-xs text-slate-500">
                    Choose whether to save a backup or erase previous events and attendance history.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEraseModal(false)}
                disabled={erasingHistory}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Close history manager"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Save / Backup Section */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Option 1: Save &amp; Keep Records
                  </div>
                  <span className="font-mono-tabular text-xs text-slate-500">
                    {events.length} events · {attendances.length} check-ins
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Download your attendance recapitulation, Big 5 certificates, or CSV spreadsheet, or keep all history stored in the dashboard.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={attendances.length === 0}
                    onClick={() =>
                      downloadRecapitulationPdf(
                        attendances,
                        null,
                        eventsById,
                        branding
                      )
                    }
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Save Recap PDF</span>
                  </button>
                  <button
                    type="button"
                    disabled={attendances.length === 0}
                    onClick={() =>
                      downloadBig5CertificatesPdf(
                        attendances,
                        undefined,
                        eventsById,
                        branding,
                        certificateSettings
                      )
                    }
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Award className="w-3.5 h-3.5 text-amber-700" />
                    <span>Save Big 5 Certificates PDF</span>
                  </button>
                  <button
                    type="button"
                    disabled={attendances.length === 0}
                    onClick={() => exportAttendanceCsv(attendances, 'presenza-full-history')}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Save CSV Backup</span>
                  </button>
                </div>
              </div>

              {/* Erase Scope Selector */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Option 2: Select History to Erase
                </div>

                <label
                  className={`block rounded-xl border p-3.5 cursor-pointer transition-colors ${
                    eraseScope === 'previous'
                      ? 'border-rose-300 bg-rose-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="eraseScope"
                      checked={eraseScope === 'previous'}
                      onChange={() => setEraseScope('previous')}
                      className="mt-1 text-rose-600 focus:ring-rose-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          Previous &amp; Closed Events + Their Recap
                        </span>
                        <span className="font-mono-tabular text-xs font-semibold text-slate-600 shrink-0">
                          {previousCleanupTargets.previousEvents.length} events ·{' '}
                          {previousCleanupTargets.previousAttendances.length} recaps
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Removes past-date or closed events and their attendance recap logs while keeping today&apos;s active sessions intact.
                      </p>
                    </div>
                  </div>
                </label>

                <label
                  className={`block rounded-xl border p-3.5 cursor-pointer transition-colors ${
                    eraseScope === 'recapOnly'
                      ? 'border-rose-300 bg-rose-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="eraseScope"
                      checked={eraseScope === 'recapOnly'}
                      onChange={() => setEraseScope('recapOnly')}
                      className="mt-1 text-rose-600 focus:ring-rose-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          All Attendance History &amp; Recap Only (Keep Events)
                        </span>
                        <span className="font-mono-tabular text-xs font-semibold text-slate-600 shrink-0">
                          {attendances.length} recaps
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Clears all participant check-ins, photos, and recap logs while keeping your event list and QR codes reusable.
                      </p>
                    </div>
                  </div>
                </label>

                <label
                  className={`block rounded-xl border p-3.5 cursor-pointer transition-colors ${
                    eraseScope === 'all'
                      ? 'border-rose-300 bg-rose-50/50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="eraseScope"
                      checked={eraseScope === 'all'}
                      onChange={() => setEraseScope('all')}
                      className="mt-1 text-rose-600 focus:ring-rose-600"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          Erase Everything (All Events &amp; All Recap History)
                        </span>
                        <span className="font-mono-tabular text-xs font-semibold text-rose-700 shrink-0">
                          {events.length} events · {attendances.length} recaps
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Permanently wipes every event, QR session, and attendance recap record for a completely fresh start.
                      </p>
                    </div>
                  </div>
                </label>
              </div>

              {eraseError && (
                <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {eraseError}
                </p>
              )}

              {/* Explicit Choice Buttons: Save & Keep vs Save PDF & Erase vs Delete Permanently */}
              {(() => {
                const scopeEventsCount =
                  eraseScope === 'previous'
                    ? previousCleanupTargets.previousEvents.length
                    : eraseScope === 'all'
                    ? events.length
                    : 0;
                const scopeAttendancesCount =
                  eraseScope === 'previous'
                    ? previousCleanupTargets.previousAttendances.length
                    : attendances.length;
                const hasTargets = scopeEventsCount > 0 || scopeAttendancesCount > 0;

                return (
                  <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowEraseModal(false)}
                      disabled={erasingHistory}
                      className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center justify-center gap-1.5"
                    >
                      <Archive className="w-4 h-4 text-slate-600" />
                      <span>Keep &amp; Save (Don&apos;t Delete)</span>
                    </button>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleEraseHistory(true)}
                        disabled={erasingHistory || scopeAttendancesCount === 0}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-800 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {erasingHistory ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                        <span>Save Recap PDF &amp; Delete</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleEraseHistory(false)}
                        disabled={erasingHistory || !hasTargets}
                        className="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {erasingHistory ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                        <span>Delete Permanently</span>
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* Authorized Administrators Modal */}
      {showAdminsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admins-modal-title"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="admins-modal-title"
                    className="text-base sm:text-lg font-bold text-slate-900"
                  >
                    Authorized Administrators
                  </h2>
                  <p className="text-xs text-slate-500">
                    Only listed Google email accounts can sign in to this Admin Console.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAdminsModal(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                aria-label="Close administrators modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              {/* Add New Admin Email Form */}
              <form
                onSubmit={handleAddAuthorizedAdmin}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3"
              >
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5 text-blue-700" />
                  <span>Authorize Teacher or Admin Email</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="email"
                    required
                    maxLength={128}
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="teacher@school.edu"
                    aria-label="Administrator Google email"
                    className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <input
                    type="text"
                    maxLength={100}
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    placeholder="Name or role (optional)"
                    aria-label="Administrator name or role"
                    className="min-h-[42px] px-3 py-2 text-sm bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {adminManageError && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                    {adminManageError}
                  </p>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingAdmin}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {savingAdmin ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    <span>Add Authorized Admin</span>
                  </button>
                </div>
              </form>

              {/* Current Authorized List */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Authorized Accounts ({authorizedAdmins.length + 1})
                </div>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white">
                  {/* Bootstrap Owner Entry */}
                  <div className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-50/60">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {BOOTSTRAPPED_ADMIN_EMAIL}
                      </div>
                      <div className="text-xs text-slate-500">
                        Primary Owner (Bootstrap)
                        {user.email &&
                        normalizeAdminEmail(user.email) ===
                          BOOTSTRAPPED_ADMIN_EMAIL
                          ? ' · Current session'
                          : ''}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                      Owner
                    </span>
                  </div>

                  {authorizedAdmins.map((adminItem) => {
                    const isSelf =
                      Boolean(user.email) &&
                      normalizeAdminEmail(user.email!) === adminItem.email;
                    return (
                      <div
                        key={adminItem.id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {adminItem.email}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {adminItem.displayName
                              ? `${adminItem.displayName} · `
                              : ''}
                            Added by {adminItem.addedByEmail}
                            {isSelf ? ' · Current session' : ''}
                          </div>
                        </div>

                        {isSelf ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                            Active
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={removingAdminEmail === adminItem.email}
                            onClick={() =>
                              void handleRemoveAuthorizedAdmin(adminItem.email)
                            }
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 transition-colors inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
                          >
                            {removingAdminEmail === adminItem.email ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Studio & Layout Customizer Modal */}
      {showCertCustomizer && (
        <CertificateCustomizerModal
          initialSettings={certificateSettings}
          branding={branding}
          dashboardBgUrl={dashboardBgUrl}
          sampleRecord={sessionBig5[0] ?? attendances[0] ?? null}
          sampleEvent={
            (sessionBig5[0]
              ? eventsById.get(sessionBig5[0].eventId)
              : selectedEventObj ?? events[0]) ?? null
          }
          totalParticipants={Math.max(
            1,
            sessionChronologicalRecords.length || attendances.length
          )}
          saving={savingCertSettings}
          error={certSettingsError}
          onSave={handleSaveCertificateSettings}
          onClose={() => setShowCertCustomizer(false)}
        />
      )}
    </div>
  );
}
