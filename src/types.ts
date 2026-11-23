import type { Timestamp } from 'firebase/firestore';

export type EventCategory = string;

export type EventStatus = 'active' | 'closed';

export type AttendanceStatus = 'On Time' | 'Late';

export interface EventRecord {
  id: string;
  title: string;
  category: EventCategory;
  description: string;
  venue: string;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  lateCutoffTime: string; // HH:MM
  cutoffTimestamp: Timestamp;
  status: EventStatus;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  departmentLabel?: string;
  departmentPresets?: string;
  consentText?: string;
  facilitators?: string;
  principalName?: string;
  requireParticipantLogin?: boolean;
  theme?: string;
  topic?: string;
}

export interface AttendanceRecord {
  id: string;
  eventId: string;
  eventName: string;
  fullName: string;
  classDepartment: string;
  photoDataUrl: string;
  photoConsent: boolean;
  attendanceDate: string; // YYYY-MM-DD
  checkInTime: string;
  serverTimestamp: Timestamp;
  status: AttendanceStatus;
  lateExcuse: string;
  participantEmail?: string;
  participantUid?: string;
}

export interface CheckInReceipt {
  id: string;
  eventId: string;
  eventName: string;
  fullName: string;
  classDepartment: string;
  photoDataUrl: string;
  attendanceDate: string;
  checkInTime: string;
  recordedAtIso: string;
  status: AttendanceStatus;
  lateExcuse: string;
  participantEmail?: string;
}

export interface OrganizationBranding {
  organizationName: string;
  logoDataUrl: string;
  publicAppUrl?: string;
}

export interface DiagnosticErrorDetails {
  title: string;
  message: string;
  failingUrl: string;
  httpStatus?: number | null;
  firebaseCode?: string;
  firebaseMessage?: string;
  consoleError?: string;
  component: string;
}

export interface AuthorizedAdminRecord {
  id: string;
  email: string;
  displayName: string;
  addedByUid: string;
  addedByEmail: string;
  createdAt: Timestamp;
}

export type CertificateThemeId =
  | 'classic-navy'
  | 'emerald-academic'
  | 'royal-slate'
  | 'crimson-crest'
  | 'teal-modern';

export type CertificateElementKey =
  | 'orgLogo'
  | 'orgName'
  | 'kicker'
  | 'title'
  | 'subtitle'
  | 'rankBadge'
  | 'photo'
  | 'awardedTo'
  | 'recipientName'
  | 'department'
  | 'citation'
  | 'seal'
  | 'dateFooter'
  | 'facilitatorBlock'
  | 'principalBlock';

export interface CertificateElementConfig {
  visible: boolean;
  x: number; // mm from left edge (0..297 on A4 landscape)
  y: number; // mm from top edge (0..210 on A4 landscape)
}

export type CertificateElementsMap = Record<
  CertificateElementKey,
  CertificateElementConfig
>;

export type CertificateTermKey = 'none' | 'term1' | 'term2' | 'term3' | 'term4';

export type TermBestCategoryNames = {
  term1: string;
  term2: string;
  term3: string;
  term4: string;
};

export interface CertificateSettings {
  themeId: CertificateThemeId;
  backgroundDataUrl: string;
  backgroundOpacity: number; // 0..100
  facilitatorSignatureDataUrl: string;
  principalSignatureDataUrl: string;
  picPdName: string;
  picPdTitle: string;
  principalName: string;
  principalTitle: string;
  bestTerm: CertificateTermKey;
  termBestCategories: TermBestCategoryNames;
  elements: CertificateElementsMap;
}

// Module 1: Participant Feedback & Evaluation
export interface FeedbackRatingCriterion {
  id: string;
  label: string;
  active: boolean;
  required: boolean;
}

export interface FeedbackStatementCategory {
  id: string;
  name: string;
  sentiment: 'positive' | 'improvement';
}

export interface FeedbackStatement {
  id: string;
  categoryId: string;
  text: string;
  active: boolean;
  required: boolean;
}

export interface FeedbackCustomQuestion {
  id: string;
  prompt: string;
  placeholder: string;
  active: boolean;
  required: boolean;
}

export interface FeedbackCustomAnswer {
  questionId: string;
  prompt: string;
  answer: string;
}

export type FeedbackAttachmentMimeType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'video/mp4'
  | 'video/quicktime';

export type FeedbackAttachmentCategory = 'pdf' | 'image' | 'video';

export interface FeedbackAttachmentMeta {
  attachmentId: string;
  fileName: string;
  mimeType: FeedbackAttachmentMimeType;
  fileCategory: FeedbackAttachmentCategory;
  byteSize: number;
  chunkCount: number;
}

export interface FeedbackConfig {
  eventId: string; // 'default' or specific event ID
  formHeading: string;
  introNote: string;
  ratingSectionTitle: string;
  ratingSectionSubtitle: string;
  checklistSectionTitle: string;
  checklistSectionSubtitle: string;
  commentQuestionLabel: string;
  commentPlaceholder: string;
  requireWrittenComment: boolean;
  allowAttachment: boolean;
  requireAttachment: boolean;
  attachmentLabel: string;
  ratingCriteria: FeedbackRatingCriterion[];
  categories: FeedbackStatementCategory[];
  statements: FeedbackStatement[];
  customQuestions: FeedbackCustomQuestion[];
  feedbackActive: boolean;
  scheduleEnabled: boolean;
  openAtIso: string;
  closeAtIso: string;
  scheduleClosedMessage: string;
}

export interface FeedbackRatingEntry {
  criterionId: string;
  label: string;
  score: number; // 1..5
}

export interface FeedbackStatementSelection {
  statementId: string;
  categoryId: string;
  categoryName: string;
  sentiment: 'positive' | 'improvement';
  text: string;
}

export interface FeedbackSubmissionRecord {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  facilitatorName: string;
  sessionTopic: string;
  ratings: FeedbackRatingEntry[];
  averageRating: number;
  selectedStatements: FeedbackStatementSelection[];
  writtenComment: string;
  customAnswers?: FeedbackCustomAnswer[];
  attachment?: FeedbackAttachmentMeta;
  participantName?: string;
  participantDepartment?: string;
  participantEmail?: string;
  attendanceId?: string;
  clientSubmissionToken: string;
  serverTimestamp: Timestamp;
}

// Module 2: Certificates & Recognition
export interface RecognitionCategory {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  createdByUid: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type RecognitionFontFamily = 'times' | 'helvetica' | 'courier';
export type RecognitionOrientation = 'landscape' | 'portrait';

export interface RecognitionTemplateConfig {
  orientation: RecognitionOrientation;
  title: string;
  subtitle: string;
  wordingTemplate: string;
  fontFamily: RecognitionFontFamily;
  primaryColor: string; // Hex e.g. #0F172A
  accentColor: string; // Hex e.g. #B45309
  paperColor: string; // Hex e.g. #FFFFFF
  customLogoDataUrl: string;
  signatureDataUrl: string;
  signatoryLabel: string;
  bestTerm: CertificateTermKey;
  termBestCategories: TermBestCategoryNames;
  picPdName: string;
  picPdTitle: string;
  picPdSignatureDataUrl: string;
  principalName: string;
  principalTitle: string;
  principalSignatureDataUrl: string;
  showTopic: boolean;
  showFacilitator: boolean;
  showCertificateId: boolean;
}

export interface IssuedCertificateRecord {
  id: string;
  certificateNumber: string;
  dedupeKey: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  eventTheme: string;
  eventTopic: string;
  facilitators: string;
  organizerName: string;
  attendanceId: string;
  participantName: string;
  participantDepartment: string;
  participantEmail: string;
  categoryId: string;
  categoryName: string;
  bestTerm?: CertificateTermKey;
  termCategoryName?: string;
  issueDate: string; // YYYY-MM-DD
  selectionMethod: 'manual' | 'evaluation';
  orientation: RecognitionOrientation;
  certificateTitle: string;
  certificateSubtitle: string;
  wordingText: string;
  fontFamily: RecognitionFontFamily;
  primaryColor: string;
  accentColor: string;
  paperColor: string;
  signatoryLabel: string;
  picPdName?: string;
  picPdTitle?: string;
  principalName?: string;
  principalTitle?: string;
  issuedByUid: string;
  issuedByEmail: string;
  createdAt: Timestamp;
}

export type ParticipationLanguageFormat = 'bilingual' | 'english' | 'bahasa';

export interface ParticipationTemplateConfig {
  languageFormat: ParticipationLanguageFormat;
  orientation: RecognitionOrientation;
  fontFamily: RecognitionFontFamily;
  primaryColor: string;
  accentColor: string;
  paperColor: string;
  titleEn: string;
  titleId: string;
  subtitleEn: string;
  subtitleId: string;
  wordingEn: string;
  wordingId: string;
  cityName: string;
  customLogoDataUrl: string;
  backgroundDataUrl: string;
  backgroundOpacity: number;
  picPdName: string;
  picPdTitle: string;
  picPdSignatureDataUrl: string;
  principalName: string;
  principalTitle: string;
  principalSignatureDataUrl: string;
  showTopic: boolean;
  showCertificateId: boolean;
}

export interface ParticipationCertificateRecord {
  certificateNumber: string;
  attendanceId: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  eventTopic: string;
  facilitators: string;
  organizerName: string;
  participantName: string;
  participantDepartment: string;
  participantEmail: string;
  checkInTime: string;
  attendanceStatus: AttendanceStatus;
  issueDate: string;
}

// Module 3: AI Voice Check-in Announcement
export type VoiceLanguage = 'en-US' | 'id-ID';
export type VoiceEngineMode = 'auto' | 'ai' | 'browser';
export type VoicePresetId =
  | 'en-prof-male'
  | 'en-friendly-male'
  | 'en-prof-female'
  | 'en-friendly-female'
  | 'id-male'
  | 'id-female'
  | 'browser-custom';

export interface VoiceAnnouncementSettings {
  enabled: boolean;
  engineMode: VoiceEngineMode;
  voiceId: VoicePresetId;
  browserVoiceUri: string;
  language: VoiceLanguage;
  speakingRate: number;
  volume: number;
  englishTemplate: string;
  indonesianTemplate: string;
  announceOnDashboard: boolean;
  announceOnCheckIn: boolean;
  showReplayWelcomeOnCheckIn: boolean;
}

// Module 4: Live Animated Attendance Dashboard
export type LiveBoardAnimationStyle =
  | 'zoom-bounce'
  | 'slide-up'
  | 'slide-side'
  | 'fade-scale';

export type LiveBoardCardLayout =
  | 'portrait-card'
  | 'horizontal-tile'
  | 'compact-badge';

export type LiveBoardSizeScale = 'auto' | 'sm' | 'md' | 'lg' | 'xl';

export type LiveBoardThemeId =
  | 'clean-light'
  | 'slate-conference'
  | 'midnight-projector'
  | 'emerald-hall'
  | 'warm-ivory';

export type LiveBoardDisplayMode =
  | 'fit'
  | 'auto-paginate'
  | 'rotating'
  | 'manual';

export interface LiveBoardSettings {
  animationStyle: LiveBoardAnimationStyle;
  animationDurationMs: number;
  cardLayout: LiveBoardCardLayout;
  columnsMode: 'auto' | 'manual';
  manualColumns: number;
  photoSize: LiveBoardSizeScale;
  fontSize: LiveBoardSizeScale;
  backgroundTheme: LiveBoardThemeId;
  displayMode: LiveBoardDisplayMode;
  rotationIntervalSec: number;
  disableAnimations: boolean;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
