import type {
  CertificateTermKey,
  FeedbackConfig,
  FeedbackRatingCriterion,
  FeedbackStatement,
  FeedbackStatementCategory,
  RecognitionTemplateConfig,
  TermBestCategoryNames,
} from '../types';

export const DEFAULT_RATING_CRITERIA: FeedbackRatingCriterion[] = [
  {
    id: 'crit_overall',
    label: 'Overall event satisfaction',
    active: true,
    required: true,
  },
  {
    id: 'crit_facilitator',
    label: 'Quality of the facilitator',
    active: true,
    required: true,
  },
  {
    id: 'crit_relevance',
    label: 'Relevance of the material',
    active: true,
    required: true,
  },
  {
    id: 'crit_clarity',
    label: 'Clarity of presentation',
    active: true,
    required: true,
  },
  {
    id: 'crit_organization',
    label: 'Organization and event management',
    active: true,
    required: true,
  },
  {
    id: 'crit_facilities',
    label: 'Facilities and supporting resources',
    active: true,
    required: false,
  },
];

export const DEFAULT_FEEDBACK_CATEGORIES: FeedbackStatementCategory[] = [
  {
    id: 'cat_positive',
    name: 'Positive Feedback',
    sentiment: 'positive',
  },
  {
    id: 'cat_suggestions',
    name: 'Suggestions & Areas to Improve',
    sentiment: 'improvement',
  },
];

export const DEFAULT_FEEDBACK_STATEMENTS: FeedbackStatement[] = [
  {
    id: 'stmt_pos_1',
    categoryId: 'cat_positive',
    text: 'The materials were useful and relevant.',
    active: true,
    required: false,
  },
  {
    id: 'stmt_pos_2',
    categoryId: 'cat_positive',
    text: 'The facilitator explained the topic clearly.',
    active: true,
    required: false,
  },
  {
    id: 'stmt_pos_3',
    categoryId: 'cat_positive',
    text: 'The activities encouraged active participation.',
    active: true,
    required: false,
  },
  {
    id: 'stmt_pos_4',
    categoryId: 'cat_positive',
    text: 'The event met my expectations.',
    active: true,
    required: false,
  },
  {
    id: 'stmt_pos_5',
    categoryId: 'cat_positive',
    text: 'I gained new knowledge and skills.',
    active: true,
    required: false,
  },
  {
    id: 'stmt_pos_6',
    categoryId: 'cat_positive',
    text: 'The event was well organized.',
    active: true,
    required: false,
  },
  {
    id: 'stmt_imp_1',
    categoryId: 'cat_suggestions',
    text: 'More practical activities are needed.',
    active: true,
    required: false,
  },
  {
    id: 'stmt_imp_2',
    categoryId: 'cat_suggestions',
    text: 'More time should be allocated for discussion.',
    active: true,
    required: false,
  },
  {
    id: 'stmt_imp_3',
    categoryId: 'cat_suggestions',
    text: 'Additional learning materials would be helpful.',
    active: true,
    required: false,
  },
  {
    id: 'stmt_imp_4',
    categoryId: 'cat_suggestions',
    text: 'The session should provide more real-life examples.',
    active: true,
    required: false,
  },
];

export function buildDefaultFeedbackConfig(eventId = 'default'): FeedbackConfig {
  return {
    eventId,
    formHeading: 'Feedback & Evaluation',
    introNote:
      'Your honest feedback helps us improve future workshops, seminars, and professional development sessions.',
    ratingSectionTitle: '1. Satisfaction Rating (1–5 Stars)',
    ratingSectionSubtitle:
      'Tap a star from 1 (Needs improvement) to 5 (Excellent) for each area.',
    checklistSectionTitle: '2. Quick Feedback Checklist',
    checklistSectionSubtitle:
      'Tick all statements that match your experience in this session.',
    commentQuestionLabel: '3. Written Comments',
    commentPlaceholder:
      'Please share your comments, suggestions, or recommendations.',
    requireWrittenComment: false,
    allowAttachment: true,
    requireAttachment: false,
    attachmentLabel: '4. Supporting Document, Photo, or Video',
    ratingCriteria: DEFAULT_RATING_CRITERIA.map((c) => ({ ...c })),
    categories: DEFAULT_FEEDBACK_CATEGORIES.map((c) => ({ ...c })),
    statements: DEFAULT_FEEDBACK_STATEMENTS.map((s) => ({ ...s })),
    customQuestions: [],
    feedbackActive: true,
    scheduleEnabled: false,
    openAtIso: '',
    closeAtIso: '',
    scheduleClosedMessage: '',
  };
}

export function mergeFeedbackConfig(
  partial?: Partial<FeedbackConfig> | null,
  fallbackEventId = 'default'
): FeedbackConfig {
  const base = buildDefaultFeedbackConfig(partial?.eventId || fallbackEventId);
  if (!partial) return base;
  return {
    eventId: partial.eventId || fallbackEventId,
    formHeading:
      typeof partial.formHeading === 'string' && partial.formHeading.trim()
        ? partial.formHeading.slice(0, 120)
        : base.formHeading,
    introNote:
      typeof partial.introNote === 'string'
        ? partial.introNote.slice(0, 400)
        : base.introNote,
    ratingSectionTitle:
      typeof partial.ratingSectionTitle === 'string' &&
      partial.ratingSectionTitle.trim()
        ? partial.ratingSectionTitle.slice(0, 140)
        : base.ratingSectionTitle,
    ratingSectionSubtitle:
      typeof partial.ratingSectionSubtitle === 'string'
        ? partial.ratingSectionSubtitle.slice(0, 300)
        : base.ratingSectionSubtitle,
    checklistSectionTitle:
      typeof partial.checklistSectionTitle === 'string' &&
      partial.checklistSectionTitle.trim()
        ? partial.checklistSectionTitle.slice(0, 140)
        : base.checklistSectionTitle,
    checklistSectionSubtitle:
      typeof partial.checklistSectionSubtitle === 'string'
        ? partial.checklistSectionSubtitle.slice(0, 300)
        : base.checklistSectionSubtitle,
    commentQuestionLabel:
      typeof partial.commentQuestionLabel === 'string' &&
      partial.commentQuestionLabel.trim()
        ? partial.commentQuestionLabel.slice(0, 160)
        : base.commentQuestionLabel,
    commentPlaceholder:
      typeof partial.commentPlaceholder === 'string'
        ? partial.commentPlaceholder.slice(0, 240)
        : base.commentPlaceholder,
    requireWrittenComment:
      typeof partial.requireWrittenComment === 'boolean'
        ? partial.requireWrittenComment
        : base.requireWrittenComment,
    allowAttachment:
      typeof partial.allowAttachment === 'boolean'
        ? partial.allowAttachment
        : base.allowAttachment,
    requireAttachment:
      typeof partial.requireAttachment === 'boolean'
        ? partial.requireAttachment
        : base.requireAttachment,
    attachmentLabel:
      typeof partial.attachmentLabel === 'string' &&
      partial.attachmentLabel.trim()
        ? partial.attachmentLabel.slice(0, 160)
        : base.attachmentLabel,
    ratingCriteria:
      Array.isArray(partial.ratingCriteria) && partial.ratingCriteria.length > 0
        ? partial.ratingCriteria.slice(0, 12).map((c) => ({
            id: String(c.id || ''),
            label: String(c.label || '').slice(0, 120),
            active: typeof c.active === 'boolean' ? c.active : true,
            required: typeof c.required === 'boolean' ? c.required : false,
          }))
        : base.ratingCriteria,
    categories:
      Array.isArray(partial.categories) && partial.categories.length > 0
        ? partial.categories.slice(0, 12).map((c) => ({
            id: String(c.id || ''),
            name: String(c.name || '').slice(0, 80),
            sentiment:
              c.sentiment === 'improvement' ? 'improvement' : 'positive',
          }))
        : base.categories,
    statements: Array.isArray(partial.statements)
      ? partial.statements.slice(0, 40).map((s) => ({
          id: String(s.id || ''),
          categoryId: String(s.categoryId || 'cat_positive'),
          text: String(s.text || '').slice(0, 200),
          active: typeof s.active === 'boolean' ? s.active : true,
          required: typeof s.required === 'boolean' ? s.required : false,
        }))
      : base.statements,
    customQuestions: Array.isArray(partial.customQuestions)
      ? partial.customQuestions.slice(0, 6).map((q) => ({
          id: String(q.id || ''),
          prompt: String(q.prompt || '').slice(0, 200),
          placeholder: String(q.placeholder || '').slice(0, 200),
          active: typeof q.active === 'boolean' ? q.active : true,
          required: typeof q.required === 'boolean' ? q.required : false,
        }))
      : base.customQuestions,
    feedbackActive:
      typeof partial.feedbackActive === 'boolean'
        ? partial.feedbackActive
        : true,
    scheduleEnabled:
      typeof partial.scheduleEnabled === 'boolean'
        ? partial.scheduleEnabled
        : false,
    openAtIso:
      typeof partial.openAtIso === 'string'
        ? partial.openAtIso.slice(0, 40)
        : '',
    closeAtIso:
      typeof partial.closeAtIso === 'string'
        ? partial.closeAtIso.slice(0, 40)
        : '',
    scheduleClosedMessage:
      typeof partial.scheduleClosedMessage === 'string'
        ? partial.scheduleClosedMessage.slice(0, 300)
        : '',
  };
}

export function buildFeedbackConfigWritePayload(
  config: FeedbackConfig,
  updatedByUid: string,
  createTimestampFromMs: (ms: number) => unknown,
  serverTimestampValue: unknown
): Record<string, unknown> {
  const cleanedCriteria = config.ratingCriteria
    .map((c) => ({
      ...c,
      label: c.label.trim().slice(0, 120),
    }))
    .filter((c) => c.label.length >= 2);
  const safeCriteria =
    cleanedCriteria.length > 0
      ? cleanedCriteria.slice(0, 12)
      : DEFAULT_RATING_CRITERIA.map((c) => ({ ...c }));

  const safeCategories =
    config.categories.length > 0
      ? config.categories.slice(0, 12)
      : DEFAULT_FEEDBACK_CATEGORIES.map((c) => ({ ...c }));

  const cleanedStatements = config.statements
    .map((s) => ({
      ...s,
      text: s.text.trim().slice(0, 200),
    }))
    .filter((s) => s.text.length >= 2)
    .slice(0, 40);

  const cleanedCustomQuestions = config.customQuestions
    .map((q) => ({
      ...q,
      prompt: q.prompt.trim().slice(0, 200),
      placeholder: q.placeholder.trim().slice(0, 200),
    }))
    .filter((q) => q.prompt.length >= 2)
    .slice(0, 6);

  const openMs = config.scheduleEnabled
    ? parseIsoTimestampMs(config.openAtIso)
    : null;
  const closeMs = config.scheduleEnabled
    ? parseIsoTimestampMs(config.closeAtIso)
    : null;

  const payload: Record<string, unknown> = {
    eventId: config.eventId || 'default',
    formHeading:
      config.formHeading.trim().slice(0, 120) || 'Feedback & Evaluation',
    introNote: config.introNote.trim().slice(0, 400),
    ratingSectionTitle:
      config.ratingSectionTitle.trim().slice(0, 140) ||
      '1. Satisfaction Rating (1–5 Stars)',
    ratingSectionSubtitle: config.ratingSectionSubtitle.trim().slice(0, 300),
    checklistSectionTitle:
      config.checklistSectionTitle.trim().slice(0, 140) ||
      '2. Quick Feedback Checklist',
    checklistSectionSubtitle: config.checklistSectionSubtitle
      .trim()
      .slice(0, 300),
    commentQuestionLabel:
      config.commentQuestionLabel.trim().slice(0, 160) ||
      '3. Written Comments',
    commentPlaceholder: config.commentPlaceholder.trim().slice(0, 240),
    requireWrittenComment: Boolean(config.requireWrittenComment),
    allowAttachment: Boolean(config.allowAttachment),
    requireAttachment: config.allowAttachment
      ? Boolean(config.requireAttachment)
      : false,
    attachmentLabel:
      config.attachmentLabel.trim().slice(0, 160) ||
      '4. Supporting Document, Photo, or Video',
    ratingCriteria: safeCriteria,
    categories: safeCategories,
    statements: cleanedStatements,
    customQuestions: cleanedCustomQuestions,
    feedbackActive: config.feedbackActive !== false,
    scheduleEnabled: Boolean(config.scheduleEnabled),
    openAtIso:
      config.scheduleEnabled && openMs !== null
        ? new Date(openMs).toISOString()
        : '',
    closeAtIso:
      config.scheduleEnabled && closeMs !== null
        ? new Date(closeMs).toISOString()
        : '',
    scheduleClosedMessage: config.scheduleClosedMessage.trim().slice(0, 300),
    updatedByUid,
    updatedAt: serverTimestampValue,
  };

  if (config.scheduleEnabled && openMs !== null) {
    payload.openTimestamp = createTimestampFromMs(openMs);
  }
  if (config.scheduleEnabled && closeMs !== null) {
    payload.closeTimestamp = createTimestampFromMs(closeMs);
  }

  return payload;
}

export interface FeedbackScheduleEvaluation {
  status: 'deactivated' | 'always-open' | 'open' | 'before-open' | 'closed';
  isOpen: boolean;
  openAtMs: number | null;
  closeAtMs: number | null;
  openAtDate: Date | null;
  closeAtDate: Date | null;
}

export function parseIsoTimestampMs(iso?: string | null): number | null {
  if (!iso || !iso.trim()) return null;
  const ms = Date.parse(iso.trim());
  return Number.isFinite(ms) ? ms : null;
}

export function evaluateFeedbackSchedule(
  config: Pick<
    FeedbackConfig,
    'scheduleEnabled' | 'openAtIso' | 'closeAtIso'
  > & { feedbackActive?: boolean },
  nowMs: number = Date.now()
): FeedbackScheduleEvaluation {
  const openAtMs = parseIsoTimestampMs(config.openAtIso);
  const closeAtMs = parseIsoTimestampMs(config.closeAtIso);
  const openAtDate = openAtMs !== null ? new Date(openAtMs) : null;
  const closeAtDate = closeAtMs !== null ? new Date(closeAtMs) : null;

  if (config.feedbackActive === false) {
    return {
      status: 'deactivated',
      isOpen: false,
      openAtMs,
      closeAtMs,
      openAtDate,
      closeAtDate,
    };
  }

  if (!config.scheduleEnabled) {
    return {
      status: 'always-open',
      isOpen: true,
      openAtMs: null,
      closeAtMs: null,
      openAtDate: null,
      closeAtDate: null,
    };
  }

  if (openAtMs !== null && nowMs < openAtMs) {
    return {
      status: 'before-open',
      isOpen: false,
      openAtMs,
      closeAtMs,
      openAtDate,
      closeAtDate,
    };
  }

  if (closeAtMs !== null && nowMs > closeAtMs) {
    return {
      status: 'closed',
      isOpen: false,
      openAtMs,
      closeAtMs,
      openAtDate,
      closeAtDate,
    };
  }

  return {
    status: 'open',
    isOpen: true,
    openAtMs,
    closeAtMs,
    openAtDate,
    closeAtDate,
  };
}

export function formatScheduleDateTime(isoOrDate: string | Date): string {
  const date =
    typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatScheduleCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function isoToLocalDateAndTime(iso: string): {
  date: string;
  time: string;
} {
  const ms = parseIsoTimestampMs(iso);
  if (ms === null) return { date: '', time: '' };
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

export function localDateAndTimeToIso(dateStr: string, timeStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const cleanTime = /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '00:00';
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = cleanTime.split(':').map(Number);
  const localDate = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  if (Number.isNaN(localDate.getTime())) return '';
  return localDate.toISOString();
}

export const DEFAULT_RECOGNITION_CATEGORIES: ReadonlyArray<{
  id: string;
  name: string;
  description: string;
  sortOrder: number;
}> = [
  {
    id: 'rec_best_participant',
    name: 'Best Participant',
    description:
      'Overall excellence in engagement, preparation, and positive workshop contribution.',
    sortOrder: 1,
  },
  {
    id: 'rec_most_active',
    name: 'Most Active Participant',
    description:
      'Consistent, energetic participation throughout discussions and hands-on activities.',
    sortOrder: 2,
  },
  {
    id: 'rec_best_collaboration',
    name: 'Best Collaboration',
    description:
      'Exemplary partner and group collaboration supporting fellow participants.',
    sortOrder: 3,
  },
  {
    id: 'rec_outstanding_contribution',
    name: 'Most Outstanding Contribution',
    description:
      'Valuable insights, resources, or practical input that elevated the entire session.',
    sortOrder: 4,
  },
  {
    id: 'rec_innovative_ideas',
    name: 'Most Innovative Ideas',
    description:
      'Creative, forward-thinking approaches and fresh solutions shared during the session.',
    sortOrder: 5,
  },
  {
    id: 'rec_critical_thinking',
    name: 'Best Question or Critical Thinking',
    description:
      'Thought-provoking questions and analytical depth that sparked meaningful reflection.',
    sortOrder: 6,
  },
  {
    id: 'rec_enthusiastic_learner',
    name: 'Most Enthusiastic Learner',
    description:
      'Infectious curiosity, openness to feedback, and eagerness to master new concepts.',
    sortOrder: 7,
  },
  {
    id: 'rec_best_teamwork',
    name: 'Best Teamwork',
    description:
      'Strong team spirit, shared responsibility, and constructive group synergy.',
    sortOrder: 8,
  },
  {
    id: 'rec_most_improved',
    name: 'Most Improved Participant',
    description:
      'Noticeable growth, confidence, and skill progression across session milestones.',
    sortOrder: 9,
  },
  {
    id: 'rec_outstanding_leadership',
    name: 'Outstanding Leadership',
    description:
      'Guiding peers with clarity, initiative, and encouraging group facilitation.',
    sortOrder: 10,
  },
  {
    id: 'rec_best_term_1',
    name: 'Best Category — Term 1',
    description:
      'Top achievement and exemplary professional growth recognized for Term 1.',
    sortOrder: 11,
  },
  {
    id: 'rec_best_term_2',
    name: 'Best Category — Term 2',
    description:
      'Top achievement and exemplary professional growth recognized for Term 2.',
    sortOrder: 12,
  },
  {
    id: 'rec_best_term_3',
    name: 'Best Category — Term 3',
    description:
      'Top achievement and exemplary professional growth recognized for Term 3.',
    sortOrder: 13,
  },
  {
    id: 'rec_best_term_4',
    name: 'Best Category — Term 4',
    description:
      'Top achievement and exemplary professional growth recognized for Term 4.',
    sortOrder: 14,
  },
];

export const DEFAULT_TERM_BEST_CATEGORIES: TermBestCategoryNames = {
  term1: 'Best Category — Term 1',
  term2: 'Best Category — Term 2',
  term3: 'Best Category — Term 3',
  term4: 'Best Category — Term 4',
};

export const CERTIFICATE_TERM_OPTIONS: ReadonlyArray<{
  key: CertificateTermKey;
  shortLabel: string;
  termTitle: string;
}> = [
  { key: 'none', shortLabel: 'Standard', termTitle: 'Standard Award' },
  { key: 'term1', shortLabel: 'Term 1', termTitle: 'Term 1' },
  { key: 'term2', shortLabel: 'Term 2', termTitle: 'Term 2' },
  { key: 'term3', shortLabel: 'Term 3', termTitle: 'Term 3' },
  { key: 'term4', shortLabel: 'Term 4', termTitle: 'Term 4' },
];

export function normalizeBestTermKey(value: unknown): CertificateTermKey {
  if (
    value === 'term1' ||
    value === 'term2' ||
    value === 'term3' ||
    value === 'term4'
  ) {
    return value;
  }
  return 'none';
}

export function mergeTermBestCategories(
  partial?: Partial<TermBestCategoryNames> | null
): TermBestCategoryNames {
  return {
    term1:
      typeof partial?.term1 === 'string' && partial.term1.trim()
        ? partial.term1.slice(0, 100)
        : DEFAULT_TERM_BEST_CATEGORIES.term1,
    term2:
      typeof partial?.term2 === 'string' && partial.term2.trim()
        ? partial.term2.slice(0, 100)
        : DEFAULT_TERM_BEST_CATEGORIES.term2,
    term3:
      typeof partial?.term3 === 'string' && partial.term3.trim()
        ? partial.term3.slice(0, 100)
        : DEFAULT_TERM_BEST_CATEGORIES.term3,
    term4:
      typeof partial?.term4 === 'string' && partial.term4.trim()
        ? partial.term4.slice(0, 100)
        : DEFAULT_TERM_BEST_CATEGORIES.term4,
  };
}

export function resolveBestTermLabel(
  bestTerm: CertificateTermKey | undefined,
  termBestCategories?: Partial<TermBestCategoryNames> | null
): string {
  const key = normalizeBestTermKey(bestTerm);
  if (key === 'none') return '';
  const merged = mergeTermBestCategories(termBestCategories);
  return merged[key].trim() || DEFAULT_TERM_BEST_CATEGORIES[key];
}

export interface RecognitionWordingPreset {
  id: string;
  label: string;
  description: string;
  template: string;
}

export const RECOGNITION_WORDING_PRESETS: ReadonlyArray<RecognitionWordingPreset> =
  [
    {
      id: 'standard',
      label: '1. Standard Recognition (Default)',
      description: 'Classic award phrasing with event, date, and venue',
      template:
        'This certificate is proudly presented to {{participant}} in recognition of being named {{category}} during "{{event}}" held on {{date}} at {{venue}}.',
    },
    {
      id: 'formal-academic',
      label: '2. Formal Academic',
      description: 'Formal institutional commendation from the organizer',
      template:
        'In recognition of exemplary dedication and achievement as {{category}}, {{organizer}} hereby awards this certificate to {{participant}} for outstanding participation in "{{event}}" on {{date}} at {{venue}}.',
    },
    {
      id: 'topic-focused',
      label: '3. Workshop & Topic Focus',
      description: 'Highlights the specific session topic alongside the event',
      template:
        'Awarded to {{participant}} for achieving {{category}} in the "{{event}}" session focusing on {{topic}}, conducted on {{date}} at {{venue}}.',
    },
    {
      id: 'contribution',
      label: '4. Leadership & Contribution',
      description: 'Emphasizes active engagement and positive contribution',
      template:
        'With sincere appreciation for valuable contributions, active engagement, and excellence as {{category}}, this honor is presented to {{participant}} during "{{event}}" on {{date}}.',
    },
    {
      id: 'facilitator-endorsed',
      label: '5. Facilitator Endorsed',
      description: 'Includes organizer, session topic, and facilitator credit',
      template:
        'Presented by {{organizer}} to {{participant}} in commendation of distinction as {{category}} in "{{event}}" ({{topic}}), facilitated by {{facilitator}} on {{date}} at {{venue}}.',
    },
    {
      id: 'concise',
      label: '6. Concise Honor',
      description: 'Short, clean statement ideal for compact layouts',
      template:
        'Proudly awarded to {{participant}} as {{category}} for "{{event}}" held on {{date}} at {{venue}}.',
    },
  ];

export const DEFAULT_RECOGNITION_TEMPLATE: RecognitionTemplateConfig = {
  orientation: 'landscape',
  title: 'CERTIFICATE OF RECOGNITION',
  subtitle: 'AWARDED FOR EXEMPLARY PARTICIPATION & ACHIEVEMENT',
  wordingTemplate: RECOGNITION_WORDING_PRESETS[0].template,
  fontFamily: 'times',
  primaryColor: '#0F172A',
  accentColor: '#B45309',
  paperColor: '#FFFFFF',
  customLogoDataUrl: '',
  signatureDataUrl: '',
  signatoryLabel: 'PIC of Professional Development',
  bestTerm: 'none',
  termBestCategories: { ...DEFAULT_TERM_BEST_CATEGORIES },
  picPdName: '',
  picPdTitle: 'PIC of Professional Development',
  picPdSignatureDataUrl: '',
  principalName: '',
  principalTitle: 'Principal',
  principalSignatureDataUrl: '',
  showTopic: true,
  showFacilitator: true,
  showCertificateId: true,
};

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function mergeRecognitionTemplate(
  partial?: Partial<RecognitionTemplateConfig> | null
): RecognitionTemplateConfig {
  if (!partial) {
    return {
      ...DEFAULT_RECOGNITION_TEMPLATE,
      termBestCategories: { ...DEFAULT_TERM_BEST_CATEGORIES },
    };
  }
  const legacySig =
    typeof partial.signatureDataUrl === 'string'
      ? partial.signatureDataUrl
      : '';
  const picPdSig =
    typeof partial.picPdSignatureDataUrl === 'string'
      ? partial.picPdSignatureDataUrl
      : legacySig;
  const principalSig =
    typeof partial.principalSignatureDataUrl === 'string'
      ? partial.principalSignatureDataUrl
      : '';

  return {
    orientation:
      partial.orientation === 'portrait' ? 'portrait' : 'landscape',
    title:
      typeof partial.title === 'string' && partial.title.trim().length >= 2
        ? partial.title.slice(0, 120)
        : DEFAULT_RECOGNITION_TEMPLATE.title,
    subtitle:
      typeof partial.subtitle === 'string'
        ? partial.subtitle.slice(0, 140)
        : DEFAULT_RECOGNITION_TEMPLATE.subtitle,
    wordingTemplate:
      typeof partial.wordingTemplate === 'string' &&
      partial.wordingTemplate.trim().length >= 5
        ? partial.wordingTemplate.slice(0, 600)
        : DEFAULT_RECOGNITION_TEMPLATE.wordingTemplate,
    fontFamily:
      partial.fontFamily === 'helvetica' || partial.fontFamily === 'courier'
        ? partial.fontFamily
        : 'times',
    primaryColor:
      typeof partial.primaryColor === 'string' &&
      HEX_COLOR_REGEX.test(partial.primaryColor)
        ? partial.primaryColor
        : DEFAULT_RECOGNITION_TEMPLATE.primaryColor,
    accentColor:
      typeof partial.accentColor === 'string' &&
      HEX_COLOR_REGEX.test(partial.accentColor)
        ? partial.accentColor
        : DEFAULT_RECOGNITION_TEMPLATE.accentColor,
    paperColor:
      typeof partial.paperColor === 'string' &&
      HEX_COLOR_REGEX.test(partial.paperColor)
        ? partial.paperColor
        : DEFAULT_RECOGNITION_TEMPLATE.paperColor,
    customLogoDataUrl:
      typeof partial.customLogoDataUrl === 'string'
        ? partial.customLogoDataUrl
        : '',
    signatureDataUrl: legacySig,
    signatoryLabel:
      typeof partial.signatoryLabel === 'string'
        ? partial.signatoryLabel.slice(0, 120)
        : DEFAULT_RECOGNITION_TEMPLATE.signatoryLabel,
    bestTerm: normalizeBestTermKey(partial.bestTerm),
    termBestCategories: mergeTermBestCategories(partial.termBestCategories),
    picPdName:
      typeof partial.picPdName === 'string'
        ? partial.picPdName.slice(0, 120)
        : '',
    picPdTitle:
      typeof partial.picPdTitle === 'string' && partial.picPdTitle.trim()
        ? partial.picPdTitle.slice(0, 120)
        : DEFAULT_RECOGNITION_TEMPLATE.picPdTitle,
    picPdSignatureDataUrl: picPdSig,
    principalName:
      typeof partial.principalName === 'string'
        ? partial.principalName.slice(0, 120)
        : '',
    principalTitle:
      typeof partial.principalTitle === 'string' && partial.principalTitle.trim()
        ? partial.principalTitle.slice(0, 120)
        : DEFAULT_RECOGNITION_TEMPLATE.principalTitle,
    principalSignatureDataUrl: principalSig,
    showTopic:
      typeof partial.showTopic === 'boolean'
        ? partial.showTopic
        : DEFAULT_RECOGNITION_TEMPLATE.showTopic,
    showFacilitator:
      typeof partial.showFacilitator === 'boolean'
        ? partial.showFacilitator
        : DEFAULT_RECOGNITION_TEMPLATE.showFacilitator,
    showCertificateId:
      typeof partial.showCertificateId === 'boolean'
        ? partial.showCertificateId
        : DEFAULT_RECOGNITION_TEMPLATE.showCertificateId,
  };
}

export function buildCertificateDedupeKey(
  eventId: string,
  categoryId: string,
  participantName: string,
  participantEmail?: string
): string {
  const identity =
    participantEmail && participantEmail.trim()
      ? participantEmail.trim().toLowerCase()
      : participantName
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' ');
  return `${eventId}::${categoryId}::${identity}`.slice(0, 240);
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildCertificateDocId(dedupeKey: string): string {
  const hashA = fnv1aHex(dedupeKey);
  const hashB = fnv1aHex(`${dedupeKey}::presenza`);
  return `cert_${hashA}${hashB}`;
}

export function generateCertificateNumber(): string {
  const year = new Date().getFullYear();
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  const bytes = new Uint8Array(6);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      suffix += alphabet[bytes[i] % alphabet.length];
    }
  } else {
    for (let i = 0; i < 6; i++) {
      suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  }
  return `PRZ-${year}-${suffix}`;
}

export function interpolateRecognitionWording(
  templateStr: string,
  vars: {
    participant: string;
    category: string;
    event: string;
    date: string;
    venue: string;
    topic?: string;
    theme?: string;
    facilitator?: string;
    organizer?: string;
    department?: string;
  }
): string {
  const map: Record<string, string> = {
    participant: vars.participant || 'Participant',
    category: vars.category || 'Recognition Award',
    event: vars.event || 'Workshop Session',
    date: vars.date || '',
    venue: vars.venue || 'Event Venue',
    topic: vars.topic || 'General Session',
    theme: vars.theme || '',
    facilitator: vars.facilitator || 'Session Facilitator',
    organizer: vars.organizer || 'PRESENZA',
    department: vars.department || '',
  };

  return templateStr
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
      const lower = key.toLowerCase();
      return lower in map ? map[lower] : _match;
    })
    .trim();
}
