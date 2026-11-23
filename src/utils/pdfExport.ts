import { GState, jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  AttendanceRecord,
  CertificateElementKey,
  CertificateElementsMap,
  CertificateSettings,
  CertificateThemeId,
  EventRecord,
  FeedbackSubmissionRecord,
  IssuedCertificateRecord,
  OrganizationBranding,
  RecognitionCategory,
  RecognitionTemplateConfig,
} from '../types';
import { formatCertificateIssueDate, formatLocalDateYmd } from './dateTime';
import {
  DEFAULT_TERM_BEST_CATEGORIES,
  interpolateRecognitionWording,
  mergeTermBestCategories,
  normalizeBestTermKey,
  resolveBestTermLabel,
} from './feedbackAndRecognitionDefaults';

export interface CertificateThemeDefinition {
  id: CertificateThemeId;
  name: string;
  description: string;
  paperRgb: [number, number, number];
  outerBorderRgb: [number, number, number];
  innerBorderRgb: [number, number, number];
  cornerAccentRgb: [number, number, number];
  kickerRgb: [number, number, number];
  headingRgb: [number, number, number];
  subtitleRgb: [number, number, number];
  bodyRgb: [number, number, number];
  accentRgb: [number, number, number];
  sealRgb: [number, number, number];
  podiumBadgeBgRgb: [number, number, number];
  podiumBadgeBorderRgb: [number, number, number];
  podiumBadgeTextRgb: [number, number, number];
  topBarRgb?: [number, number, number];
  paperHex: string;
  outerBorderHex: string;
  innerBorderHex: string;
  kickerHex: string;
  headingHex: string;
  accentHex: string;
  sealHex: string;
}

export const CERTIFICATE_THEMES: Record<
  CertificateThemeId,
  CertificateThemeDefinition
> = {
  'classic-navy': {
    id: 'classic-navy',
    name: 'Classic Navy & Gold',
    description: 'Traditional navy outer frame with warm gold inner trim',
    paperRgb: [255, 255, 255],
    outerBorderRgb: [15, 23, 42],
    innerBorderRgb: [180, 83, 9],
    cornerAccentRgb: [15, 23, 42],
    kickerRgb: [29, 78, 216],
    headingRgb: [15, 23, 42],
    subtitleRgb: [100, 116, 139],
    bodyRgb: [51, 65, 85],
    accentRgb: [29, 78, 216],
    sealRgb: [180, 83, 9],
    podiumBadgeBgRgb: [254, 243, 199],
    podiumBadgeBorderRgb: [180, 83, 9],
    podiumBadgeTextRgb: [146, 64, 14],
    paperHex: '#FFFFFF',
    outerBorderHex: '#0F172A',
    innerBorderHex: '#B45309',
    kickerHex: '#1D4ED8',
    headingHex: '#0F172A',
    accentHex: '#1D4ED8',
    sealHex: '#B45309',
  },
  'emerald-academic': {
    id: 'emerald-academic',
    name: 'Emerald Academic',
    description: 'Ivory parchment with forest emerald border & bronze trim',
    paperRgb: [252, 253, 251],
    outerBorderRgb: [6, 95, 70],
    innerBorderRgb: [180, 83, 9],
    cornerAccentRgb: [6, 95, 70],
    kickerRgb: [4, 120, 87],
    headingRgb: [6, 78, 59],
    subtitleRgb: [71, 85, 105],
    bodyRgb: [51, 65, 85],
    accentRgb: [4, 120, 87],
    sealRgb: [180, 83, 9],
    podiumBadgeBgRgb: [236, 253, 245],
    podiumBadgeBorderRgb: [5, 150, 105],
    podiumBadgeTextRgb: [6, 95, 70],
    paperHex: '#FCFDFB',
    outerBorderHex: '#065F46',
    innerBorderHex: '#B45309',
    kickerHex: '#047857',
    headingHex: '#064E3B',
    accentHex: '#047857',
    sealHex: '#B45309',
  },
  'royal-slate': {
    id: 'royal-slate',
    name: 'Royal Slate Minimal',
    description: 'Clean contemporary slate & indigo frame with top header accent',
    paperRgb: [255, 255, 255],
    outerBorderRgb: [51, 65, 85],
    innerBorderRgb: [99, 102, 241],
    cornerAccentRgb: [79, 70, 229],
    kickerRgb: [79, 70, 229],
    headingRgb: [15, 23, 42],
    subtitleRgb: [100, 116, 139],
    bodyRgb: [51, 65, 85],
    accentRgb: [67, 56, 202],
    sealRgb: [79, 70, 229],
    podiumBadgeBgRgb: [238, 242, 255],
    podiumBadgeBorderRgb: [79, 70, 229],
    podiumBadgeTextRgb: [55, 48, 163],
    topBarRgb: [30, 41, 59],
    paperHex: '#FFFFFF',
    outerBorderHex: '#334155',
    innerBorderHex: '#6366F1',
    kickerHex: '#4F46E5',
    headingHex: '#0F172A',
    accentHex: '#4338CA',
    sealHex: '#4F46E5',
  },
  'crimson-crest': {
    id: 'crimson-crest',
    name: 'Crimson Crest',
    description: 'Warm cream certificate paper with burgundy & antique gold borders',
    paperRgb: [255, 253, 249],
    outerBorderRgb: [136, 19, 55],
    innerBorderRgb: [202, 138, 4],
    cornerAccentRgb: [136, 19, 55],
    kickerRgb: [159, 18, 57],
    headingRgb: [136, 19, 55],
    subtitleRgb: [87, 83, 78],
    bodyRgb: [68, 64, 60],
    accentRgb: [159, 18, 57],
    sealRgb: [161, 98, 7],
    podiumBadgeBgRgb: [254, 249, 195],
    podiumBadgeBorderRgb: [202, 138, 4],
    podiumBadgeTextRgb: [133, 77, 14],
    paperHex: '#FFFDF9',
    outerBorderHex: '#881337',
    innerBorderHex: '#CA8A04',
    kickerHex: '#9F1239',
    headingHex: '#881337',
    accentHex: '#9F1239',
    sealHex: '#A16207',
  },
  'teal-modern': {
    id: 'teal-modern',
    name: 'Teal Modern Horizon',
    description: 'Crisp white layout with vibrant oceanic teal & sky trim',
    paperRgb: [255, 255, 255],
    outerBorderRgb: [15, 118, 110],
    innerBorderRgb: [2, 132, 199],
    cornerAccentRgb: [15, 118, 110],
    kickerRgb: [2, 132, 199],
    headingRgb: [17, 24, 39],
    subtitleRgb: [100, 116, 139],
    bodyRgb: [51, 65, 85],
    accentRgb: [15, 118, 110],
    sealRgb: [2, 132, 199],
    podiumBadgeBgRgb: [240, 253, 250],
    podiumBadgeBorderRgb: [13, 148, 136],
    podiumBadgeTextRgb: [17, 94, 89],
    paperHex: '#FFFFFF',
    outerBorderHex: '#0F766E',
    innerBorderHex: '#0284C7',
    kickerHex: '#0284C7',
    headingHex: '#111827',
    accentHex: '#0F766E',
    sealHex: '#0284C7',
  },
};

export const CERTIFICATE_THEME_LIST: CertificateThemeDefinition[] = [
  CERTIFICATE_THEMES['classic-navy'],
  CERTIFICATE_THEMES['emerald-academic'],
  CERTIFICATE_THEMES['royal-slate'],
  CERTIFICATE_THEMES['crimson-crest'],
  CERTIFICATE_THEMES['teal-modern'],
];

export const DEFAULT_CERTIFICATE_ELEMENTS: CertificateElementsMap = {
  orgLogo: { visible: true, x: 20, y: 17.5 },
  orgName: { visible: true, x: 35.5, y: 23.5 },
  kicker: { visible: true, x: 148.5, y: 24 },
  title: { visible: true, x: 148.5, y: 35 },
  subtitle: { visible: true, x: 148.5, y: 42 },
  rankBadge: { visible: true, x: 148.5, y: 51 },
  photo: { visible: true, x: 148.5, y: 76.5 },
  awardedTo: { visible: true, x: 148.5, y: 106.5 },
  recipientName: { visible: true, x: 148.5, y: 116.5 },
  department: { visible: true, x: 148.5, y: 124.5 },
  citation: { visible: true, x: 148.5, y: 135.5 },
  seal: { visible: true, x: 148.5, y: 158 },
  dateFooter: { visible: false, x: 148.5, y: 180 },
  facilitatorBlock: { visible: true, x: 82, y: 180 },
  principalBlock: { visible: true, x: 215, y: 180 },
};

export const CERTIFICATE_ELEMENT_META: ReadonlyArray<{
  key: CertificateElementKey;
  label: string;
}> = [
  { key: 'orgLogo', label: 'School / Company Logo' },
  { key: 'orgName', label: 'Organization Name' },
  { key: 'kicker', label: 'PRESENZA Header' },
  { key: 'title', label: 'Certificate Title' },
  { key: 'subtitle', label: 'Subtitle Line' },
  { key: 'rankBadge', label: 'Rank / Term Badge' },
  { key: 'photo', label: 'Participant Photo' },
  { key: 'awardedTo', label: 'Awarded-To Intro' },
  { key: 'recipientName', label: 'Recipient Name' },
  { key: 'department', label: 'Class / Dept & Divider' },
  { key: 'citation', label: 'Citation Paragraph' },
  { key: 'seal', label: 'Recognition Seal' },
  { key: 'dateFooter', label: 'Date & Time Footer' },
  { key: 'facilitatorBlock', label: 'PIC of PD & Signature' },
  { key: 'principalBlock', label: 'Principal & Signature' },
];

export const DEFAULT_CERTIFICATE_SETTINGS: CertificateSettings = {
  themeId: 'classic-navy',
  backgroundDataUrl: '',
  backgroundOpacity: 22,
  facilitatorSignatureDataUrl: '',
  principalSignatureDataUrl: '',
  picPdName: '',
  picPdTitle: 'PIC of Professional Development',
  principalName: '',
  principalTitle: 'Principal',
  bestTerm: 'none',
  termBestCategories: { ...DEFAULT_TERM_BEST_CATEGORIES },
  elements: DEFAULT_CERTIFICATE_ELEMENTS,
};

export function mergeCertificateSettings(
  partial?: Partial<CertificateSettings> | null
): CertificateSettings {
  const mergedElements = { ...DEFAULT_CERTIFICATE_ELEMENTS };
  if (partial?.elements) {
    (Object.keys(DEFAULT_CERTIFICATE_ELEMENTS) as CertificateElementKey[]).forEach(
      (key) => {
        const incomingEl = partial.elements?.[key];
        if (incomingEl) {
          mergedElements[key] = {
            visible:
              typeof incomingEl.visible === 'boolean'
                ? incomingEl.visible
                : DEFAULT_CERTIFICATE_ELEMENTS[key].visible,
            x:
              typeof incomingEl.x === 'number' && Number.isFinite(incomingEl.x)
                ? Math.min(297, Math.max(0, incomingEl.x))
                : DEFAULT_CERTIFICATE_ELEMENTS[key].x,
            y:
              typeof incomingEl.y === 'number' && Number.isFinite(incomingEl.y)
                ? Math.min(210, Math.max(0, incomingEl.y))
                : DEFAULT_CERTIFICATE_ELEMENTS[key].y,
          };
        }
      }
    );
  }

  const themeId =
    partial?.themeId && partial.themeId in CERTIFICATE_THEMES
      ? partial.themeId
      : DEFAULT_CERTIFICATE_SETTINGS.themeId;

  return {
    themeId,
    backgroundDataUrl: partial?.backgroundDataUrl || '',
    backgroundOpacity:
      typeof partial?.backgroundOpacity === 'number' &&
      Number.isFinite(partial.backgroundOpacity)
        ? Math.min(100, Math.max(0, partial.backgroundOpacity))
        : DEFAULT_CERTIFICATE_SETTINGS.backgroundOpacity,
    facilitatorSignatureDataUrl: partial?.facilitatorSignatureDataUrl || '',
    principalSignatureDataUrl: partial?.principalSignatureDataUrl || '',
    picPdName:
      typeof partial?.picPdName === 'string'
        ? partial.picPdName.slice(0, 120)
        : '',
    picPdTitle:
      typeof partial?.picPdTitle === 'string' && partial.picPdTitle.trim()
        ? partial.picPdTitle.slice(0, 120)
        : DEFAULT_CERTIFICATE_SETTINGS.picPdTitle,
    principalName:
      typeof partial?.principalName === 'string'
        ? partial.principalName.slice(0, 120)
        : '',
    principalTitle:
      typeof partial?.principalTitle === 'string' &&
      partial.principalTitle.trim()
        ? partial.principalTitle.slice(0, 120)
        : DEFAULT_CERTIFICATE_SETTINGS.principalTitle,
    bestTerm: normalizeBestTermKey(partial?.bestTerm),
    termBestCategories: mergeTermBestCategories(partial?.termBestCategories),
    elements: mergedElements,
  };
}

function detectImageFormat(dataUrl: string): 'JPEG' | 'PNG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'presenza-attendance'
  );
}

function ordinalLabel(rank: number): string {
  if (rank === 1) return '1st Earliest Arrival';
  if (rank === 2) return '2nd Earliest Arrival';
  if (rank === 3) return '3rd Earliest Arrival';
  return `${rank}th Earliest Arrival`;
}

export function downloadRecapitulationPdf(
  records: AttendanceRecord[],
  selectedEvent: EventRecord | null,
  eventsById?: Map<string, EventRecord>,
  branding?: OrganizationBranding | null
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Auto-resolve single event when filter is "All Sessions" but records belong to one event
  let effectiveEvent: EventRecord | null = selectedEvent;
  if (!effectiveEvent && eventsById && records.length > 0) {
    const uniqueEventIds = Array.from(new Set(records.map((r) => r.eventId)));
    if (uniqueEventIds.length === 1) {
      effectiveEvent = eventsById.get(uniqueEventIds[0]) ?? null;
    }
  }

  const includedEvents: EventRecord[] = [];
  if (!effectiveEvent && eventsById) {
    const seen = new Set<string>();
    for (const rec of records) {
      if (!seen.has(rec.eventId)) {
        seen.add(rec.eventId);
        const ev = eventsById.get(rec.eventId);
        if (ev) includedEvents.push(ev);
      }
    }
  }

  const generatedLabel = `Generated: ${new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;

  // Top Header Banner (Event Name as Primary Header)
  const headerTitle = effectiveEvent
    ? effectiveEvent.title
    : records.length > 0 && new Set(records.map((r) => r.eventId)).size === 1
    ? records[0].eventName
    : 'All Recorded Sessions — Attendance Recapitulation';

  const hasLogo = Boolean(branding?.logoDataUrl);
  const orgName = branding?.organizationName?.trim() || '';
  const textStartX = hasLogo ? margin + 17.5 : margin;
  const textAvailableWidth = hasLogo ? contentWidth - 17.5 : contentWidth;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  const titleLines = doc
    .splitTextToSize(headerTitle, textAvailableWidth)
    .slice(0, 2);
  const bannerHeight = titleLines.length > 1 ? 35 : 29;

  doc.setFillColor(15, 23, 42); // #0F172A
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');

  if (hasLogo && branding?.logoDataUrl) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, 5.5, 14, 14, 1.5, 1.5, 'F');
      doc.addImage(
        branding.logoDataUrl,
        detectImageFormat(branding.logoDataUrl),
        margin + 0.8,
        6.3,
        12.4,
        12.4
      );
    } catch {
      // Ignore malformed logo gracefully
    }
  }

  const kickerPrefix = orgName ? `${orgName} · PRESENZA` : 'PRESENZA · RECAP REPORT';
  const kickerText = doc.splitTextToSize(
    kickerPrefix,
    Math.max(50, textAvailableWidth - 48)
  )[0];

  doc.setTextColor(147, 197, 253); // Soft blue kicker
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(kickerText, textStartX, 8.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(generatedLabel, pageWidth - margin, 8.5, { align: 'right' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(titleLines, textStartX, 16.5);

  let cursorY = bannerHeight + 6;

  // Complete Event Details Card
  if (effectiveEvent) {
    const detailRows: Array<[string, string, string, string]> = [
      [
        'Session Type',
        effectiveEvent.category || '—',
        'Status',
        effectiveEvent.status === 'active' ? 'Active (Open)' : 'Closed',
      ],
      [
        'Location / Venue',
        effectiveEvent.venue || '—',
        'Event Date',
        effectiveEvent.eventDate || '—',
      ],
      [
        'Start & Cutoff',
        `${effectiveEvent.startTime}  (Late after ${effectiveEvent.lateCutoffTime})`,
        'Principal Name',
        effectiveEvent.principalName?.trim() || '—',
      ],
    ];

    const facilitatorsValue = effectiveEvent.facilitators?.trim() || '—';
    const descriptionValue = effectiveEvent.description?.trim() || '';

    const labelColW = 30;
    const halfColW = (contentWidth - 10) / 2;
    const facLines = doc.splitTextToSize(
      facilitatorsValue,
      contentWidth - labelColW - 8
    );
    const descLines = descriptionValue
      ? doc.splitTextToSize(descriptionValue, contentWidth - labelColW - 8)
      : [];

    const rowHeight = 6.2;
    const cardPaddingTop = 6;
    const facBlockHeight = Math.max(1, facLines.length) * 4.5 + 2.2;
    const descBlockHeight =
      descLines.length > 0 ? descLines.length * 4.4 + 2.5 : 0;
    const cardHeight =
      cardPaddingTop +
      detailRows.length * rowHeight +
      facBlockHeight +
      descBlockHeight +
      3;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, cursorY, contentWidth, cardHeight, 2, 2, 'FD');

    let rowY = cursorY + 5.5;
    detailRows.forEach(([lLabel, lVal, rLabel, rVal]) => {
      // Left Pair
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${lLabel}:`, margin + 4, rowY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const lTrunc = doc.splitTextToSize(lVal, halfColW - labelColW - 4)[0] || '—';
      doc.text(lTrunc, margin + 4 + labelColW, rowY);

      // Right Pair
      const rightStartX = margin + 4 + halfColW + 4;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(`${rLabel}:`, rightStartX, rowY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const rTrunc = doc.splitTextToSize(rVal, halfColW - labelColW - 4)[0] || '—';
      doc.text(rTrunc, rightStartX + labelColW, rowY);

      rowY += rowHeight;
    });

    // Facilitators full-width row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Facilitators:', margin + 4, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(facLines, margin + 4 + labelColW, rowY);
    rowY += facBlockHeight;

    // Event Notes / Description full-width row
    if (descLines.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Notes / Agenda:', margin + 4, rowY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(descLines, margin + 4 + labelColW, rowY);
    }

    cursorY += cardHeight + 6;
  } else {
    // Combined Multi-Session Header Details
    const sessionSummaries =
      includedEvents.length > 0
        ? includedEvents.slice(0, 6).map((ev) => {
            const extra = [
              ev.category,
              ev.venue,
              `${ev.eventDate} ${ev.startTime} (Cutoff ${ev.lateCutoffTime})`,
              ev.facilitators ? `Facilitators: ${ev.facilitators}` : '',
              ev.principalName ? `Principal: ${ev.principalName}` : '',
            ]
              .filter(Boolean)
              .join('  ·  ');
            return `${ev.title} — ${extra}`;
          })
        : [
            'Combined chronological attendance summary ordered from earliest arrival (#1) to latest.',
          ];

    const summaryLines = sessionSummaries.flatMap((line) =>
      doc.splitTextToSize(line, contentWidth - 8)
    );
    const cardHeight = 8 + summaryLines.length * 4.5;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, cursorY, contentWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Included Event Details (${includedEvents.length || 1})`,
      margin + 4,
      cursorY + 5.2
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(summaryLines, margin + 4, cursorY + 10);

    cursorY += cardHeight + 6;
  }

  // Summary KPI Cards
  const total = records.length;
  const onTimeCount = records.filter((r) => r.status === 'On Time').length;
  const lateCount = records.filter((r) => r.status === 'Late').length;
  const rate = total > 0 ? Math.round((onTimeCount / total) * 100) : 0;

  const boxGap = 4;
  const boxWidth = (pageWidth - margin * 2 - boxGap * 3) / 4;
  const boxHeight = 18;
  const kpis = [
    { label: 'Total Check-Ins', value: String(total), color: [15, 23, 42] as const },
    { label: 'On Time', value: String(onTimeCount), color: [21, 128, 61] as const },
    { label: 'Late Arrivals', value: String(lateCount), color: [180, 83, 9] as const },
    { label: 'Punctuality Rate', value: `${rate}%`, color: [29, 78, 216] as const },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (boxWidth + boxGap);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, cursorY, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, cursorY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 3, cursorY + 14);
  });

  cursorY += boxHeight + 7;

  // Big 5 Earliest Arrivals Highlight Box
  const big5 = records.slice(0, 5);
  if (big5.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Top 5 Earliest Arrivals (Big 5)', margin, cursorY);
    cursorY += 4;

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 251, 235);
    const listHeight = 6 + big5.length * 5.2;
    doc.roundedRect(margin, cursorY, pageWidth - margin * 2, listHeight, 2, 2, 'FD');

    big5.forEach((rec, i) => {
      const rowY = cursorY + 5 + i * 5.2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(180, 83, 9);
      doc.text(`#${i + 1}`, margin + 3, rowY);

      doc.setTextColor(15, 23, 42);
      doc.text(rec.fullName, margin + 11, rowY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(rec.classDepartment, margin + 72, rowY);

      doc.setFont('courier', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(
        `${rec.checkInTime} (${rec.status})`,
        pageWidth - margin - 3,
        rowY,
        { align: 'right' }
      );
    });

    cursorY += listHeight + 7;
  }

  // Chronological Recapitulation Table
  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin, bottom: 16 },
    head: [
      [
        '#',
        'Photo',
        'Full Name',
        'Class / Dept',
        'Event',
        'Check-In',
        'Status',
        'Late Excuse',
      ],
    ],
    body: records.map((rec, index) => [
      String(index + 1),
      '',
      rec.fullName,
      rec.classDepartment,
      rec.eventName,
      `${rec.attendanceDate}\n${rec.checkInTime}`,
      rec.status,
      rec.status === 'Late' && rec.lateExcuse ? rec.lateExcuse : '—',
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      valign: 'middle',
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 14, minCellHeight: 13 },
      2: { cellWidth: 30, fontStyle: 'bold' },
      3: { cellWidth: 25 },
      4: { cellWidth: 32 },
      5: { cellWidth: 22 },
      6: { cellWidth: 17, fontStyle: 'bold' },
      7: { cellWidth: 'auto' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 6) {
        const val = String(data.cell.raw || '');
        if (val === 'On Time') {
          data.cell.styles.textColor = [21, 128, 61];
        } else if (val === 'Late') {
          data.cell.styles.textColor = [180, 83, 9];
        }
      }
    },
    didDrawCell(data) {
      if (data.section === 'body' && data.column.index === 1) {
        const rec = records[data.row.index];
        if (rec?.photoDataUrl) {
          try {
            const imgFormat = detectImageFormat(rec.photoDataUrl);
            const size = Math.min(data.cell.width - 3, data.cell.height - 2, 10.5);
            const x = data.cell.x + (data.cell.width - size) / 2;
            const y = data.cell.y + (data.cell.height - size) / 2;
            doc.addImage(rec.photoDataUrl, imgFormat, x, y, size, size);
          } catch {
            // Skip malformed image gracefully
          }
        }
      }
    },
    didDrawPage() {
      const pageNum = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `${branding?.organizationName ? `${branding.organizationName} · ` : ''}PRESENZA · Official Recapitulation · Page ${pageNum}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 7,
        { align: 'center' }
      );
    },
  });

  const prefix = selectedEvent ? slugify(selectedEvent.title) : 'all-sessions';
  doc.save(`presenza-recapitulation-${prefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function drawAspectContainedImage(
  doc: jsPDF,
  dataUrl: string,
  centerX: number,
  bottomY: number,
  maxW: number,
  maxH: number
): void {
  try {
    const props = doc.getImageProperties(dataUrl);
    const imgW = props.width || maxW;
    const imgH = props.height || maxH;
    const scale = Math.min(maxW / imgW, maxH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = centerX - drawW / 2;
    const drawY = bottomY - drawH;
    doc.addImage(
      dataUrl,
      detectImageFormat(dataUrl),
      drawX,
      drawY,
      drawW,
      drawH
    );
  } catch {
    // Skip malformed signature image gracefully
  }
}

function drawCertificatePage(
  doc: jsPDF,
  record: AttendanceRecord,
  rank: number,
  totalParticipants: number,
  event?: EventRecord | null,
  branding?: OrganizationBranding | null,
  certificateSettings?: Partial<CertificateSettings> | null
): void {
  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const settings = mergeCertificateSettings(certificateSettings);
  const theme = CERTIFICATE_THEMES[settings.themeId];
  const el = settings.elements;

  // Theme Paper Background
  doc.setFillColor(...theme.paperRgb);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Optional Background Photo with Admin-Controlled Transparency
  if (settings.backgroundDataUrl && settings.backgroundOpacity > 0) {
    try {
      const props = doc.getImageProperties(settings.backgroundDataUrl);
      const imgW = props.width || pageWidth;
      const imgH = props.height || pageHeight;
      const imgRatio = imgW / imgH;
      const innerX = 10;
      const innerY = 10;
      const innerW = pageWidth - 20;
      const innerH = pageHeight - 20;
      const innerRatio = innerW / innerH;

      let drawW = innerW;
      let drawH = innerH;
      let drawX = innerX;
      let drawY = innerY;

      if (imgRatio > innerRatio) {
        drawH = innerH;
        drawW = innerH * imgRatio;
        drawX = innerX + (innerW - drawW) / 2;
      } else {
        drawW = innerW;
        drawH = innerW / imgRatio;
        drawY = innerY + (innerH - drawH) / 2;
      }

      const alpha = Math.min(1, Math.max(0, settings.backgroundOpacity / 100));
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: alpha }));
      doc.addImage(
        settings.backgroundDataUrl,
        detectImageFormat(settings.backgroundDataUrl),
        drawX,
        drawY,
        drawW,
        drawH
      );
      doc.restoreGraphicsState();
      doc.setGState(new GState({ opacity: 1 }));

      // Mask clean 10mm outer certificate margin
      doc.setFillColor(...theme.paperRgb);
      doc.rect(0, 0, pageWidth, 10, 'F');
      doc.rect(0, pageHeight - 10, pageWidth, 10, 'F');
      doc.rect(0, 0, 10, pageHeight, 'F');
      doc.rect(pageWidth - 10, 0, 10, pageHeight, 'F');
    } catch {
      // Skip malformed background image gracefully
    }
  }

  // Optional top accent bar for minimal/modern themes
  if (theme.topBarRgb) {
    doc.setFillColor(...theme.topBarRgb);
    doc.rect(10, 10, pageWidth - 20, 3.2, 'F');
  }

  // Outer Frame
  doc.setDrawColor(...theme.outerBorderRgb);
  doc.setLineWidth(1.8);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20, 'S');

  // Inner Trim Frame
  doc.setDrawColor(...theme.innerBorderRgb);
  doc.setLineWidth(0.6);
  doc.rect(14, 14, pageWidth - 28, pageHeight - 28, 'S');

  // Corner Accent Squares
  const corners = [
    [10, 10],
    [pageWidth - 18, 10],
    [10, pageHeight - 18],
    [pageWidth - 18, pageHeight - 18],
  ];
  doc.setFillColor(...theme.cornerAccentRgb);
  corners.forEach(([cx, cy]) => {
    doc.rect(cx, cy, 8, 8, 'F');
  });

  // 1. Organization Logo
  const certOrgName = branding?.organizationName?.trim() || '';
  if (el.orgLogo.visible && branding?.logoDataUrl) {
    try {
      doc.addImage(
        branding.logoDataUrl,
        detectImageFormat(branding.logoDataUrl),
        el.orgLogo.x,
        el.orgLogo.y,
        13,
        13
      );
    } catch {
      // Skip malformed logo gracefully
    }
  }

  // 2. Organization Name
  if (el.orgName.visible && certOrgName) {
    const orgTextX =
      !el.orgLogo.visible && el.orgName.x === DEFAULT_CERTIFICATE_ELEMENTS.orgName.x
        ? 20
        : el.orgName.x;
    const orgLines = doc.splitTextToSize(certOrgName, 58).slice(0, 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...theme.headingRgb);
    doc.text(orgLines, orgTextX, el.orgName.y);
  }

  // 3. Institutional Kicker
  if (el.kicker.visible) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...theme.kickerRgb);
    doc.text('PRESENZA', el.kicker.x, el.kicker.y, { align: 'center' });
  }

  // 4. Main Certificate Heading
  if (el.title.visible) {
    doc.setFont('times', 'bold');
    doc.setFontSize(26);
    doc.setTextColor(...theme.headingRgb);
    doc.text('CERTIFICATE OF RECOGNITION', el.title.x, el.title.y, {
      align: 'center',
    });
  }

  // 5. Subtitle
  if (el.subtitle.visible) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...theme.subtitleRgb);
    doc.text('TOP 5 EARLIEST ARRIVAL HONORS', el.subtitle.x, el.subtitle.y, {
      align: 'center',
    });
  }

  // 6. Rank Distinction / Best Term Ribbon Box
  const bestTermLabel = resolveBestTermLabel(
    settings.bestTerm,
    settings.termBestCategories
  );
  if (el.rankBadge.visible) {
    const isPodium = rank <= 3;
    const badgeText = bestTermLabel
      ? `${bestTermLabel.toUpperCase()} · RANK #${rank}`
      : `RANK #${rank} · ${ordinalLabel(rank).toUpperCase()}`;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const badgeW = Math.min(230, Math.max(92, doc.getTextWidth(badgeText) + 18));
    const badgeH = 9;
    const badgeX = el.rankBadge.x - badgeW / 2;
    const badgeY = el.rankBadge.y - badgeH / 2;

    if (isPodium) {
      doc.setFillColor(...theme.podiumBadgeBgRgb);
      doc.setDrawColor(...theme.podiumBadgeBorderRgb);
    } else {
      doc.setFillColor(239, 246, 255);
      doc.setDrawColor(...theme.accentRgb);
    }
    doc.setLineWidth(0.5);
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 2, 2, 'FD');

    if (isPodium) {
      doc.setTextColor(...theme.podiumBadgeTextRgb);
    } else {
      doc.setTextColor(...theme.accentRgb);
    }
    doc.text(badgeText, el.rankBadge.x, el.rankBadge.y + 1.5, {
      align: 'center',
    });
  }

  // 7. Participant Photo (centered on el.photo.x, el.photo.y)
  if (el.photo.visible) {
    const photoBoxSize = 34;
    const photoX = el.photo.x - photoBoxSize / 2;
    const photoY = el.photo.y - photoBoxSize / 2;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(
      photoX - 1.5,
      photoY - 1.5,
      photoBoxSize + 3,
      photoBoxSize + 3,
      2,
      2,
      'FD'
    );

    if (record.photoDataUrl) {
      try {
        const format = detectImageFormat(record.photoDataUrl);
        doc.addImage(
          record.photoDataUrl,
          format,
          photoX,
          photoY,
          photoBoxSize,
          photoBoxSize
        );
      } catch {
        // Skip image if unsupported
      }
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...theme.subtitleRgb);
    doc.text(
      'Verified Check-In Photo',
      el.photo.x,
      photoY + photoBoxSize + 6,
      { align: 'center' }
    );
  }

  // 8. Awarded-To Intro
  if (el.awardedTo.visible) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...theme.bodyRgb);
    doc.text(
      'This certificate is proudly awarded to',
      el.awardedTo.x,
      el.awardedTo.y,
      { align: 'center' }
    );
  }

  // 9. Recipient Name
  const nameLines = doc.splitTextToSize(record.fullName, 210).slice(0, 2);
  const extraNameShift =
    el.recipientName.visible && nameLines.length > 1 ? 8.5 : 0;

  if (el.recipientName.visible) {
    doc.setFont('times', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(...theme.headingRgb);
    doc.text(nameLines, el.recipientName.x, el.recipientName.y, {
      align: 'center',
    });
  }

  // 10. Class / Department & Divider
  const isDefaultDeptSpacing =
    Math.abs(el.department.y - el.recipientName.y - 8) < 2;
  const deptY = el.department.y + (isDefaultDeptSpacing ? extraNameShift : 0);

  if (el.department.visible) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...theme.accentRgb);
    doc.text(record.classDepartment, el.department.x, deptY, {
      align: 'center',
    });

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.4);
    doc.line(el.department.x - 63.5, deptY + 4, el.department.x + 63.5, deptY + 4);
  }

  // 11. Citation Paragraph
  const isDefaultCitationSpacing =
    Math.abs(el.citation.y - el.recipientName.y - 19) < 2;
  const citationY =
    el.citation.y + (isDefaultCitationSpacing ? extraNameShift : 0);
  const citation = `For demonstrating outstanding punctuality and dedication by arriving among the earliest participants (#${rank} out of ${totalParticipants} attendees) at "${record.eventName}" on ${record.attendanceDate}, checking in at ${record.checkInTime} (${record.status}).`;
  const citationLines = doc.splitTextToSize(citation, 215).slice(0, 3);

  if (el.citation.visible) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...theme.bodyRgb);
    doc.text(citationLines, el.citation.x, citationY, { align: 'center' });
  }

  // 12. Recognition Seal
  if (el.seal.visible) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...theme.sealRgb);
    doc.text(
      `EARLY BIRD #${rank} · PRESENZA RECOGNITION AWARD`,
      el.seal.x,
      el.seal.y,
      { align: 'center' }
    );
  }

  const picPdNameText =
    settings.picPdName.trim() ||
    event?.facilitators?.trim() ||
    '';
  const picPdTitleText =
    settings.picPdTitle.trim() || 'PIC of Professional Development';
  const principalNameText =
    settings.principalName.trim() ||
    event?.principalName?.trim() ||
    '';
  const principalTitleText = settings.principalTitle.trim() || 'Principal';

  // 13. Verified Check-In Date & Time Block (optional; hidden in native layout)
  if (el.dateFooter.visible) {
    const cx = el.dateFooter.x;
    const cy = el.dateFooter.y;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);
    doc.line(cx - 34, cy, cx + 34, cy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...theme.headingRgb);
    doc.text(`${record.attendanceDate} · ${record.checkInTime}`, cx, cy - 3, {
      align: 'center',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...theme.subtitleRgb);
    doc.text('Verified Attendance Date & Time', cx, cy + 5, {
      align: 'center',
    });
  }

  // 14. PIC of Professional Development Block + Optional Digital Signature
  if (el.facilitatorBlock.visible) {
    const cx = el.facilitatorBlock.x;
    const cy = el.facilitatorBlock.y;
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);
    doc.line(cx - 38, cy, cx + 38, cy);

    const facLines = picPdNameText
      ? doc.splitTextToSize(picPdNameText, 72).slice(0, 2)
      : [];
    const facStartY = cy - 3 - Math.max(0, facLines.length - 1) * 4;
    const sigBottomY = facLines.length > 0 ? facStartY - 3.5 : cy - 2;

    if (settings.facilitatorSignatureDataUrl) {
      drawAspectContainedImage(
        doc,
        settings.facilitatorSignatureDataUrl,
        cx,
        sigBottomY,
        46,
        14
      );
    }

    if (facLines.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...theme.headingRgb);
      doc.text(facLines, cx, facStartY, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...theme.subtitleRgb);
    doc.text(picPdTitleText, cx, cy + 5, { align: 'center' });
  }

  // 15. Principal Block + City & Issued Date + Optional Digital Signature
  if (el.principalBlock.visible) {
    const cx = el.principalBlock.x;
    const cy = el.principalBlock.y;
    const big5IssueDate = formatCertificateIssueDate(
      formatLocalDateYmd(new Date())
    );
    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(0.4);
    doc.line(cx - 38, cy, cx + 38, cy);

    const principalLines = principalNameText
      ? doc.splitTextToSize(principalNameText, 72).slice(0, 2)
      : [];
    const principalStartY = cy - 3 - Math.max(0, principalLines.length - 1) * 4;
    const sigBottomY = principalLines.length > 0 ? principalStartY - 3.5 : cy - 2;
    const sigTopSpaceY = sigBottomY - 14.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...theme.bodyRgb);
    doc.text(`Jakarta, ${big5IssueDate}`, cx, sigTopSpaceY, {
      align: 'center',
    });

    if (settings.principalSignatureDataUrl) {
      drawAspectContainedImage(
        doc,
        settings.principalSignatureDataUrl,
        cx,
        sigBottomY,
        46,
        13
      );
    }

    if (principalLines.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...theme.headingRgb);
      doc.text(principalLines, cx, principalStartY, { align: 'center' });
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...theme.subtitleRgb);
    doc.text(principalTitleText, cx, cy + 5, { align: 'center' });
  }
}

export function downloadBig5CertificatesPdf(
  records: AttendanceRecord[],
  eventTitle?: string,
  eventsById?: Map<string, EventRecord>,
  branding?: OrganizationBranding | null,
  certificateSettings?: Partial<CertificateSettings> | null
): void {
  const top5 = records.slice(0, 5);
  if (top5.length === 0) return;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  top5.forEach((rec, idx) => {
    if (idx > 0) {
      doc.addPage('a4', 'landscape');
    }
    const ev = eventsById?.get(rec.eventId) ?? null;
    drawCertificatePage(
      doc,
      rec,
      idx + 1,
      records.length,
      ev,
      branding,
      certificateSettings
    );
  });

  const prefix = eventTitle ? slugify(eventTitle) : 'all-sessions';
  doc.save(`presenza-big5-certificates-${prefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadSingleCertificatePdf(
  record: AttendanceRecord,
  rank: number,
  totalParticipants: number,
  event?: EventRecord | null,
  branding?: OrganizationBranding | null,
  certificateSettings?: Partial<CertificateSettings> | null
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  drawCertificatePage(
    doc,
    record,
    rank,
    totalParticipants,
    event,
    branding,
    certificateSettings
  );
  doc.save(
    `presenza-certificate-rank-${rank}-${slugify(record.fullName)}.pdf`
  );
}

function hexToRgbTuple(hex: string, fallback: [number, number, number]): [number, number, number] {
  const clean = hex.trim();
  const match = /^#?([0-9a-fA-F]{6})$/.exec(clean);
  if (!match) return fallback;
  const num = parseInt(match[1], 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export interface RecognitionPdfRenderOptions {
  logoDataUrl?: string;
  backgroundDataUrl?: string;
  backgroundOpacity?: number;
  signatureDataUrl?: string;
  picPdSignatureDataUrl?: string;
  principalSignatureDataUrl?: string;
  picPdName?: string;
  picPdTitle?: string;
  principalName?: string;
  principalTitle?: string;
  showTopic?: boolean;
  showFacilitator?: boolean;
  showCertificateId?: boolean;
}

export interface RecognitionPdfBatchOptions {
  certificateSettings?: Partial<CertificateSettings> | null;
  categoriesById?: Map<string, RecognitionCategory>;
  eventsById?: Map<string, EventRecord>;
}

function drawRecognitionCertificatePage(
  doc: jsPDF,
  cert: IssuedCertificateRecord,
  options: RecognitionPdfRenderOptions
): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const isPortrait = cert.orientation === 'portrait' || pageH > pageW;
  const centerX = pageW / 2;

  const paperRgb = hexToRgbTuple(cert.paperColor, [255, 255, 255]);
  const primaryRgb = hexToRgbTuple(cert.primaryColor, [15, 23, 42]);
  const accentRgb = hexToRgbTuple(cert.accentColor, [180, 83, 9]);
  const font = cert.fontFamily || 'times';

  // Paper background
  doc.setFillColor(...paperRgb);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Optional Background Photo inside 10mm margin
  const bgOpacity =
    typeof options.backgroundOpacity === 'number' &&
    Number.isFinite(options.backgroundOpacity)
      ? Math.min(100, Math.max(0, options.backgroundOpacity))
      : 0;
  if (options.backgroundDataUrl && bgOpacity > 0) {
    try {
      const props = doc.getImageProperties(options.backgroundDataUrl);
      const imgW = props.width || pageW;
      const imgH = props.height || pageH;
      const imgRatio = imgW / imgH;
      const innerX = 10;
      const innerY = 10;
      const innerW = pageW - 20;
      const innerH = pageH - 20;
      const innerRatio = innerW / innerH;

      let drawW = innerW;
      let drawH = innerH;
      let drawX = innerX;
      let drawY = innerY;

      if (imgRatio > innerRatio) {
        drawH = innerH;
        drawW = innerH * imgRatio;
        drawX = innerX + (innerW - drawW) / 2;
      } else {
        drawW = innerW;
        drawH = innerW / imgRatio;
        drawY = innerY + (innerH - drawH) / 2;
      }

      const alpha = Math.min(1, Math.max(0, bgOpacity / 100));
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: alpha }));
      doc.addImage(
        options.backgroundDataUrl,
        detectImageFormat(options.backgroundDataUrl),
        drawX,
        drawY,
        drawW,
        drawH
      );
      doc.restoreGraphicsState();
      doc.setGState(new GState({ opacity: 1 }));

      doc.setFillColor(...paperRgb);
      doc.rect(0, 0, pageW, 10, 'F');
      doc.rect(0, pageH - 10, pageW, 10, 'F');
      doc.rect(0, 0, 10, pageH, 'F');
      doc.rect(pageW - 10, 0, 10, pageH, 'F');
    } catch {
      // Ignore malformed background image gracefully
    }
  }

  // Double border frame + subtle top accent strip
  doc.setFillColor(...primaryRgb);
  doc.rect(10, 10, pageW - 20, 3.2, 'F');

  doc.setDrawColor(...primaryRgb);
  doc.setLineWidth(1.6);
  doc.rect(10, 10, pageW - 20, pageH - 20, 'S');

  doc.setDrawColor(...accentRgb);
  doc.setLineWidth(0.55);
  doc.rect(14, 14, pageW - 28, pageH - 28, 'S');

  // Corner squares
  doc.setFillColor(...accentRgb);
  [
    [10, 10],
    [pageW - 17, 10],
    [10, pageH - 17],
    [pageW - 17, pageH - 17],
  ].forEach(([cx, cy]) => {
    doc.rect(cx, cy, 7, 7, 'F');
  });

  const formattedIssueDate = formatCertificateIssueDate(
    cert.issueDate || cert.eventDate
  );

  // Top Left Certificate Number & Top Right Issued Date
  if (options.showCertificateId !== false) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Certificate No: ${cert.certificateNumber}`, 19, 20.5, {
      align: 'left',
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Issued: ${formattedIssueDate}`, pageW - 19, 20.5, {
      align: 'right',
    });
  }

  // Top Header: Organization logo & name
  let cursorY = isPortrait ? 31 : 26.5;
  if (options.logoDataUrl) {
    try {
      const logoSize = isPortrait ? 16 : 14;
      doc.addImage(
        options.logoDataUrl,
        detectImageFormat(options.logoDataUrl),
        centerX - logoSize / 2,
        cursorY - 6,
        logoSize,
        logoSize
      );
      cursorY += logoSize + 3;
    } catch {
      // Ignore malformed logo gracefully
    }
  }

  const orgDisplay = cert.organizerName?.trim() || 'PRESENZA';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...accentRgb);
  doc.text(orgDisplay.toUpperCase(), centerX, cursorY, { align: 'center' });
  cursorY += isPortrait ? 12 : 9.5;

  // Certificate Title
  const maxTitleW = pageW - 44;
  doc.setFont(font, 'bold');
  doc.setFontSize(isPortrait ? 24 : 26);
  doc.setTextColor(...primaryRgb);
  const titleLines = doc.splitTextToSize(
    cert.certificateTitle || 'CERTIFICATE OF RECOGNITION',
    maxTitleW
  ).slice(0, 2);
  doc.text(titleLines, centerX, cursorY, { align: 'center' });
  cursorY += titleLines.length * 9 + 2;

  // Subtitle
  if (cert.certificateSubtitle?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    const subLines = doc.splitTextToSize(
      cert.certificateSubtitle.toUpperCase(),
      maxTitleW
    ).slice(0, 2);
    doc.text(subLines, centerX, cursorY, { align: 'center' });
    cursorY += subLines.length * 4.8 + 5;
  } else {
    cursorY += 4;
  }

  // Category Recognition Ribbon (with optional Term 1–4 Best Category distinction)
  const termCatLabel = cert.termCategoryName?.trim() || '';
  const catText =
    termCatLabel && termCatLabel.toLowerCase() !== cert.categoryName.trim().toLowerCase()
      ? `${termCatLabel.toUpperCase()} · ${cert.categoryName.toUpperCase()}`
      : cert.categoryName.toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const ribbonW = Math.min(pageW - 44, Math.max(76, doc.getTextWidth(catText) + 18));
  const ribbonH = 9.5;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...accentRgb);
  doc.setLineWidth(0.55);
  doc.roundedRect(centerX - ribbonW / 2, cursorY, ribbonW, ribbonH, 2, 2, 'FD');
  doc.setTextColor(...accentRgb);
  doc.text(catText, centerX, cursorY + 6.3, { align: 'center' });
  cursorY += ribbonH + (isPortrait ? 16 : 11);

  // "Proudly presented to"
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(71, 85, 105);
  doc.text('This recognition award is proudly presented to', centerX, cursorY, {
    align: 'center',
  });
  cursorY += isPortrait ? 13 : 11;

  // Recipient Name
  doc.setFont(font, 'bold');
  doc.setFontSize(isPortrait ? 25 : 27);
  doc.setTextColor(...primaryRgb);
  const recNameLines = doc.splitTextToSize(cert.participantName, maxTitleW).slice(0, 2);
  doc.text(recNameLines, centerX, cursorY, { align: 'center' });
  cursorY += recNameLines.length * 10 + 1;

  // Department & horizontal accent divider
  if (cert.participantDepartment?.trim()) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...accentRgb);
    doc.text(cert.participantDepartment, centerX, cursorY, { align: 'center' });
    cursorY += 4.5;
  }
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.45);
  doc.line(centerX - 58, cursorY, centerX + 58, cursorY);
  cursorY += isPortrait ? 12 : 9;

  // Wording Paragraph
  const maxBodyW = pageW - (isPortrait ? 44 : 74);
  doc.setFont(font === 'times' ? 'times' : 'helvetica', 'normal');
  doc.setFontSize(isPortrait ? 11.5 : 11);
  doc.setTextColor(51, 65, 85);
  const wordingLines = doc.splitTextToSize(cert.wordingText, maxBodyW).slice(0, 5);
  doc.text(wordingLines, centerX, cursorY, {
    align: 'center',
    lineHeightFactor: 1.4,
  });
  cursorY += wordingLines.length * 6.4 + 4;

  // Event Context Details (Topic only — Theme omitted)
  const topicValue = cert.eventTopic?.trim();
  if (options.showTopic !== false && topicValue) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...primaryRgb);
    const metaLines = doc
      .splitTextToSize(`Topic: ${topicValue}`, maxBodyW)
      .slice(0, 2);
    doc.text(metaLines, centerX, cursorY, { align: 'center' });
    cursorY += metaLines.length * 4.5 + 3;
  }

  // Footer Signature Row — Native layout provides PIC of Professional Development & Principal
  const footerLineY = pageH - (isPortrait ? 34 : 26);
  const sideOffset = isPortrait ? 44 : 62;
  const leftX = centerX - sideOffset;
  const rightX = centerX + sideOffset;

  const picPdNameText =
    cert.picPdName?.trim() || options.picPdName?.trim() || '';
  const picPdTitleText =
    cert.picPdTitle?.trim() ||
    options.picPdTitle?.trim() ||
    'PIC of Professional Development';
  const picPdSig = options.picPdSignatureDataUrl || options.signatureDataUrl || '';

  const principalNameText =
    cert.principalName?.trim() || options.principalName?.trim() || '';
  const principalTitleText =
    cert.principalTitle?.trim() || options.principalTitle?.trim() || 'Principal';
  const principalSig = options.principalSignatureDataUrl || '';

  // Bottom Left: PIC of Professional Development + Signature + Customizable Name
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(leftX - 36, footerLineY, leftX + 36, footerLineY);
  const picNameLines = picPdNameText
    ? doc.splitTextToSize(picPdNameText, 70).slice(0, 2)
    : [];
  const picNameStartY = footerLineY - 3 - Math.max(0, picNameLines.length - 1) * 3.8;
  const picSigBottomY = picNameLines.length > 0 ? picNameStartY - 3 : footerLineY - 2;
  if (picPdSig) {
    drawAspectContainedImage(doc, picPdSig, leftX, picSigBottomY, 44, 13);
  }
  if (picNameLines.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...primaryRgb);
    doc.text(picNameLines, leftX, picNameStartY, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(100, 116, 139);
  const picRoleLines = doc.splitTextToSize(picPdTitleText, 74).slice(0, 2);
  doc.text(picRoleLines, leftX, footerLineY + 4.5, { align: 'center' });

  // Bottom Right: City (Jakarta) & Issued Date above Principal Signature Space + Principal Name & Title
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);
  doc.line(rightX - 36, footerLineY, rightX + 36, footerLineY);
  const priNameLines = principalNameText
    ? doc.splitTextToSize(principalNameText, 70).slice(0, 2)
    : [];
  const priNameStartY = footerLineY - 3 - Math.max(0, priNameLines.length - 1) * 3.8;
  const priSigBottomY = priNameLines.length > 0 ? priNameStartY - 3 : footerLineY - 2;
  const priCityDateY = priSigBottomY - 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Jakarta, ${formattedIssueDate}`, rightX, priCityDateY, {
    align: 'center',
  });

  if (principalSig) {
    drawAspectContainedImage(doc, principalSig, rightX, priSigBottomY, 44, 13);
  }
  if (priNameLines.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...primaryRgb);
    doc.text(priNameLines, rightX, priNameStartY, { align: 'center' });
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(100, 116, 139);
  const priRoleLines = doc.splitTextToSize(principalTitleText, 74).slice(0, 2);
  doc.text(priRoleLines, rightX, footerLineY + 4.5, { align: 'center' });
}

function resolveSyncedCertificateRecord(
  cert: IssuedCertificateRecord,
  template?: Partial<RecognitionTemplateConfig> | null,
  branding?: OrganizationBranding | null,
  extraOptions?: RecognitionPdfBatchOptions
): IssuedCertificateRecord {
  const liveEvent = extraOptions?.eventsById?.get(cert.eventId);
  const liveCategory = extraOptions?.categoriesById?.get(cert.categoryId);
  const resolvedCategoryName = liveCategory?.name?.trim() || cert.categoryName;
  const resolvedEventTitle = liveEvent?.title?.trim() || cert.eventTitle;
  const resolvedEventDate = liveEvent?.eventDate?.trim() || cert.eventDate;
  const resolvedEventVenue = liveEvent?.venue?.trim() || cert.eventVenue;
  const resolvedEventTopic =
    liveEvent?.topic?.trim() || liveEvent?.category?.trim() || cert.eventTopic;
  const resolvedEventTheme = liveEvent?.theme?.trim() || cert.eventTheme;
  const resolvedFacilitators = liveEvent?.facilitators?.trim() || cert.facilitators;
  const resolvedOrganizer =
    branding?.organizationName?.trim() || cert.organizerName || 'PRESENZA';

  if (!template) {
    return {
      ...cert,
      categoryName: resolvedCategoryName,
      eventTitle: resolvedEventTitle,
      eventDate: resolvedEventDate,
      eventVenue: resolvedEventVenue,
      eventTopic: resolvedEventTopic,
      eventTheme: resolvedEventTheme,
      facilitators: resolvedFacilitators,
      organizerName: resolvedOrganizer,
    };
  }

  const resolvedPicPdName =
    typeof template.picPdName === 'string'
      ? template.picPdName.trim()
      : cert.picPdName || '';
  const resolvedPicPdTitle =
    typeof template.picPdTitle === 'string' && template.picPdTitle.trim()
      ? template.picPdTitle.trim()
      : cert.picPdTitle || 'PIC of Professional Development';
  const resolvedPrincipalName =
    typeof template.principalName === 'string'
      ? template.principalName.trim()
      : cert.principalName || '';
  const resolvedPrincipalTitle =
    typeof template.principalTitle === 'string' && template.principalTitle.trim()
      ? template.principalTitle.trim()
      : cert.principalTitle || 'Principal';

  const hasTermSetting = template.bestTerm !== undefined;
  const resolvedTermCategoryName = hasTermSetting
    ? resolveBestTermLabel(template.bestTerm, template.termBestCategories)
    : cert.termCategoryName || '';

  const resolvedWording = template.wordingTemplate?.trim()
    ? interpolateRecognitionWording(template.wordingTemplate, {
        participant: cert.participantName,
        category: resolvedCategoryName,
        event: resolvedEventTitle,
        date: resolvedEventDate,
        venue: resolvedEventVenue,
        topic: resolvedEventTopic,
        theme: resolvedEventTheme,
        facilitator: resolvedPicPdName || resolvedFacilitators,
        organizer: resolvedOrganizer,
        department: cert.participantDepartment,
      })
    : cert.wordingText;

  return {
    ...cert,
    orientation: template.orientation || cert.orientation,
    primaryColor: template.primaryColor || cert.primaryColor,
    accentColor: template.accentColor || cert.accentColor,
    paperColor: template.paperColor || cert.paperColor,
    fontFamily: template.fontFamily || cert.fontFamily,
    certificateTitle: template.title?.trim() || cert.certificateTitle,
    certificateSubtitle:
      typeof template.subtitle === 'string'
        ? template.subtitle
        : cert.certificateSubtitle,
    categoryName: resolvedCategoryName,
    bestTerm: template.bestTerm ?? cert.bestTerm,
    termCategoryName: resolvedTermCategoryName,
    eventTitle: resolvedEventTitle,
    eventDate: resolvedEventDate,
    eventVenue: resolvedEventVenue,
    eventTopic: resolvedEventTopic,
    eventTheme: resolvedEventTheme,
    facilitators: resolvedFacilitators,
    organizerName: resolvedOrganizer,
    wordingText: resolvedWording,
    picPdName: resolvedPicPdName,
    picPdTitle: resolvedPicPdTitle,
    principalName: resolvedPrincipalName,
    principalTitle: resolvedPrincipalTitle,
  };
}

function buildRecognitionPdfDoc(
  certs: IssuedCertificateRecord[],
  template?: Partial<RecognitionTemplateConfig> | null,
  branding?: OrganizationBranding | null,
  extraOptions?: RecognitionPdfBatchOptions
): jsPDF {
  const firstOrientation =
    template?.orientation || certs[0]?.orientation || 'landscape';
  const doc = new jsPDF({
    orientation: firstOrientation,
    unit: 'mm',
    format: 'a4',
  });

  const certBg = extraOptions?.certificateSettings;
  const renderOptions: RecognitionPdfRenderOptions = {
    logoDataUrl: template?.customLogoDataUrl || branding?.logoDataUrl || '',
    backgroundDataUrl: certBg?.backgroundDataUrl || '',
    backgroundOpacity:
      typeof certBg?.backgroundOpacity === 'number'
        ? certBg.backgroundOpacity
        : 22,
    signatureDataUrl: template?.signatureDataUrl || '',
    picPdSignatureDataUrl:
      template?.picPdSignatureDataUrl ||
      template?.signatureDataUrl ||
      certBg?.facilitatorSignatureDataUrl ||
      '',
    principalSignatureDataUrl:
      template?.principalSignatureDataUrl ||
      certBg?.principalSignatureDataUrl ||
      '',
    picPdName: template?.picPdName || '',
    picPdTitle: template?.picPdTitle || 'PIC of Professional Development',
    principalName: template?.principalName || '',
    principalTitle: template?.principalTitle || 'Principal',
    showTopic: template?.showTopic ?? true,
    showFacilitator: template?.showFacilitator ?? true,
    showCertificateId: template?.showCertificateId ?? true,
  };

  certs.forEach((rawCert, idx) => {
    const syncedCert = resolveSyncedCertificateRecord(
      rawCert,
      template,
      branding,
      extraOptions
    );
    const orient =
      syncedCert.orientation === 'portrait' ? 'portrait' : 'landscape';
    if (idx > 0) {
      doc.addPage('a4', orient);
    }
    drawRecognitionCertificatePage(doc, syncedCert, renderOptions);
  });

  return doc;
}

export function downloadRecognitionCertificatesPdf(
  certs: IssuedCertificateRecord[],
  template?: Partial<RecognitionTemplateConfig> | null,
  branding?: OrganizationBranding | null,
  filenamePrefix?: string,
  extraOptions?: RecognitionPdfBatchOptions
): void {
  if (certs.length === 0) return;
  const doc = buildRecognitionPdfDoc(certs, template, branding, extraOptions);
  const firstSynced = resolveSyncedCertificateRecord(
    certs[0],
    template,
    branding,
    extraOptions
  );
  const slug =
    filenamePrefix
      ? slugify(filenamePrefix)
      : certs.length === 1
      ? `${slugify(firstSynced.categoryName)}-${slugify(firstSynced.participantName)}`
      : `${slugify(firstSynced.eventTitle)}-recognition-certificates`;
  doc.save(`presenza-recognition-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function printRecognitionCertificatesPdf(
  certs: IssuedCertificateRecord[],
  template?: Partial<RecognitionTemplateConfig> | null,
  branding?: OrganizationBranding | null,
  extraOptions?: RecognitionPdfBatchOptions
): void {
  if (certs.length === 0) return;
  const doc = buildRecognitionPdfDoc(certs, template, branding, extraOptions);
  doc.autoPrint();
  const blobUrl = URL.createObjectURL(doc.output('blob'));
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.src = blobUrl;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
        URL.revokeObjectURL(blobUrl);
      }, 60_000);
    }
  };
  document.body.appendChild(iframe);
}

export interface FeedbackPdfReportOptions {
  selectedEvent?: EventRecord | null;
  eventsById?: Map<string, EventRecord>;
  branding?: OrganizationBranding | null;
  filenamePrefix?: string;
  filterSummary?: string;
}

export function downloadFeedbackReportPdf(
  submissions: FeedbackSubmissionRecord[],
  options: FeedbackPdfReportOptions = {}
): void {
  const {
    selectedEvent = null,
    eventsById,
    branding = null,
    filenamePrefix = 'presenza-feedback-report',
    filterSummary = '',
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const orgName = branding?.organizationName?.trim() || '';

  // Auto-resolve event when all rows belong to a single event
  let effectiveEvent: EventRecord | null = selectedEvent;
  if (!effectiveEvent && eventsById && submissions.length > 0) {
    const uniqueEventIds = Array.from(
      new Set(submissions.map((s) => s.eventId))
    );
    if (uniqueEventIds.length === 1) {
      effectiveEvent = eventsById.get(uniqueEventIds[0]) ?? null;
    }
  }

  const headerTitle = effectiveEvent
    ? `${effectiveEvent.title} — Feedback & Evaluation`
    : submissions.length > 0 &&
      new Set(submissions.map((s) => s.eventId)).size === 1
    ? `${submissions[0].eventTitle} — Feedback & Evaluation`
    : 'All Recorded Events — Feedback & Evaluation Report';

  const generatedLabel = `Generated: ${new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  })}`;

  const hasLogo = Boolean(branding?.logoDataUrl);
  const textStartX = hasLogo ? margin + 17.5 : margin;
  const textAvailableWidth = hasLogo ? contentWidth - 17.5 : contentWidth;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titleLines = doc
    .splitTextToSize(headerTitle, textAvailableWidth)
    .slice(0, 2);
  const bannerHeight = titleLines.length > 1 ? 35 : 29;

  doc.setFillColor(15, 23, 42); // #0F172A
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');

  if (hasLogo && branding?.logoDataUrl) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, 5.5, 14, 14, 1.5, 1.5, 'F');
      doc.addImage(
        branding.logoDataUrl,
        detectImageFormat(branding.logoDataUrl),
        margin + 0.8,
        6.3,
        12.4,
        12.4
      );
    } catch {
      // Skip malformed logo
    }
  }

  const kickerPrefix = orgName
    ? `${orgName} · PRESENZA FEEDBACK`
    : 'PRESENZA · FEEDBACK & EVALUATION REPORT';
  const kickerText = doc.splitTextToSize(
    kickerPrefix,
    Math.max(50, textAvailableWidth - 52)
  )[0];

  doc.setTextColor(147, 197, 253);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(kickerText, textStartX, 8.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(generatedLabel, pageWidth - margin, 8.5, { align: 'right' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(titleLines, textStartX, 16.5);

  let cursorY = bannerHeight + 6;

  // Session & Filter Summary Card
  if (effectiveEvent || filterSummary) {
    const infoLines: string[] = [];
    if (effectiveEvent) {
      infoLines.push(
        `Session: ${effectiveEvent.category || 'Workshop'}  ·  Venue: ${
          effectiveEvent.venue || '—'
        }  ·  Date: ${effectiveEvent.eventDate || '—'}`
      );
      if (effectiveEvent.facilitators || effectiveEvent.topic) {
        infoLines.push(
          [
            effectiveEvent.facilitators
              ? `Facilitators: ${effectiveEvent.facilitators}`
              : '',
            effectiveEvent.topic ? `Topic: ${effectiveEvent.topic}` : '',
          ]
            .filter(Boolean)
            .join('  ·  ')
        );
      }
    }
    if (filterSummary) {
      infoLines.push(`Applied Filters: ${filterSummary}`);
    }

    const wrappedInfo = infoLines.flatMap((l) =>
      doc.splitTextToSize(l, contentWidth - 8)
    );
    const infoHeight = 5 + wrappedInfo.length * 4.4;
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, cursorY, contentWidth, infoHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(wrappedInfo, margin + 4, cursorY + 5);
    cursorY += infoHeight + 5;
  }

  // Compute Summary KPIs & Criterion Aggregation
  const totalResponses = submissions.length;
  const ratedSubs = submissions.filter((s) => s.averageRating > 0);
  const overallAvg =
    ratedSubs.length > 0
      ? ratedSubs.reduce((sum, s) => sum + s.averageRating, 0) / ratedSubs.length
      : 0;
  let positiveTicks = 0;
  let improvementTicks = 0;
  let commentCount = 0;

  const criterionAgg = new Map<
    string,
    { label: string; sum: number; count: number; dist: [number, number, number, number, number] }
  >();
  const positiveFreq = new Map<string, number>();
  const improvementFreq = new Map<string, number>();

  for (const sub of submissions) {
    if (sub.writtenComment && sub.writtenComment.trim().length > 0) {
      commentCount += 1;
    }
    for (const r of sub.ratings) {
      const key = r.label || r.criterionId;
      const entry = criterionAgg.get(key) || {
        label: r.label,
        sum: 0,
        count: 0,
        dist: [0, 0, 0, 0, 0],
      };
      entry.sum += r.score;
      entry.count += 1;
      const starIdx = Math.min(5, Math.max(1, Math.round(r.score))) - 1;
      entry.dist[starIdx] += 1;
      criterionAgg.set(key, entry);
    }
    for (const st of sub.selectedStatements) {
      if (st.sentiment === 'improvement') {
        improvementTicks += 1;
        improvementFreq.set(st.text, (improvementFreq.get(st.text) ?? 0) + 1);
      } else {
        positiveTicks += 1;
        positiveFreq.set(st.text, (positiveFreq.get(st.text) ?? 0) + 1);
      }
    }
  }

  const boxGap = 4;
  const boxWidth = (contentWidth - boxGap * 3) / 4;
  const boxHeight = 17;
  const kpis = [
    {
      label: 'Total Responses',
      value: String(totalResponses),
      color: [15, 23, 42] as const,
    },
    {
      label: 'Average Rating',
      value: ratedSubs.length > 0 ? `${overallAvg.toFixed(2)} / 5` : '—',
      color: [180, 83, 9] as const,
    },
    {
      label: 'Positive Highlights',
      value: String(positiveTicks),
      color: [21, 128, 61] as const,
    },
    {
      label: 'Comments / Suggestions',
      value: `${commentCount} / ${improvementTicks}`,
      color: [29, 78, 216] as const,
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (boxWidth + boxGap);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, cursorY, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, cursorY + 5.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 3, cursorY + 13);
  });

  cursorY += boxHeight + 6;

  const drawFooter = () => {
    const pageNum = doc.getNumberOfPages();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${orgName ? `${orgName} · ` : ''}PRESENZA · Feedback & Evaluation Report · Page ${pageNum}`,
      pageWidth / 2,
      pageHeight - 7,
      { align: 'center' }
    );
  };

  // Section 1: Rating Criteria Averages Table
  const criteriaRows = Array.from(criterionAgg.values())
    .map((c) => ({
      label: c.label,
      count: c.count,
      avg: c.count > 0 ? (c.sum / c.count).toFixed(2) : '0.00',
      distLabel: `5★:${c.dist[4]}  4★:${c.dist[3]}  3★:${c.dist[2]}  2★:${c.dist[1]}  1★:${c.dist[0]}`,
    }))
    .sort((a, b) => Number(b.avg) - Number(a.avg));

  if (criteriaRows.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Rating Criteria Breakdown', margin, cursorY);
    cursorY += 3;

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin, bottom: 16 },
      head: [['Rating Question / Criterion', 'Votes', 'Avg Score', 'Star Distribution']],
      body: criteriaRows.map((c) => [
        c.label,
        String(c.count),
        `${c.avg} / 5.00`,
        c.distLabel,
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        valign: 'middle',
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 'auto', fontStyle: 'bold' },
        1: { cellWidth: 16, halign: 'center' },
        2: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 58 },
      },
      didDrawPage: drawFooter,
    });

    const lastAutoTableY = (
      doc as unknown as { lastAutoTable?: { finalY?: number } }
    ).lastAutoTable?.finalY;
    cursorY = (lastAutoTableY ?? cursorY + 20) + 6;
  }

  // Section 2: Top Selected Checklist Statements
  const topPos = Array.from(positiveFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const topImp = Array.from(improvementFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (topPos.length > 0 || topImp.length > 0) {
    if (cursorY > pageHeight - 48) {
      doc.addPage('a4', 'portrait');
      cursorY = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Top Selected Checklist Feedback', margin, cursorY);
    cursorY += 3;

    const checklistRows: Array<[string, string, string]> = [
      ...topPos.map(([text, count]): [string, string, string] => [
        'Positive Highlight',
        text,
        String(count),
      ]),
      ...topImp.map(([text, count]): [string, string, string] => [
        'Improvement Suggestion',
        text,
        String(count),
      ]),
    ];

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin, bottom: 16 },
      head: [['Category', 'Checklist Statement', 'Selected By']],
      body: checklistRows,
      styles: {
        fontSize: 8,
        cellPadding: 2.1,
        valign: 'middle',
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 0) {
          const val = String(data.cell.raw || '');
          data.cell.styles.textColor =
            val === 'Positive Highlight' ? [21, 128, 61] : [180, 83, 9];
        }
      },
      didDrawPage: drawFooter,
    });

    const lastAutoTableY = (
      doc as unknown as { lastAutoTable?: { finalY?: number } }
    ).lastAutoTable?.finalY;
    cursorY = (lastAutoTableY ?? cursorY + 20) + 6;
  }

  // Section 3: Individual Participant Feedback & Evaluation Records
  if (cursorY > pageHeight - 45) {
    doc.addPage('a4', 'portrait');
    cursorY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Participant Feedback Records (${submissions.length})`,
    margin,
    cursorY
  );
  cursorY += 3;

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin, bottom: 16 },
    head: [
      [
        '#',
        'Participant',
        'Session & Date',
        'Avg & Scores',
        'Checklist Feedback',
        'Written Comments, Custom Q&A & File',
      ],
    ],
    body: submissions.map((sub, idx) => {
      const submittedTime = sub.serverTimestamp?.toDate
        ? sub.serverTimestamp.toDate().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : '';

      const participantInfo = [
        sub.participantName || 'Anonymous Participant',
        sub.participantDepartment || '',
        sub.participantEmail || '',
      ]
        .filter(Boolean)
        .join('\n');

      const sessionInfo = [
        sub.eventTitle,
        [sub.eventDate, submittedTime].filter(Boolean).join(' · '),
        sub.facilitatorName ? `Facilitator: ${sub.facilitatorName}` : '',
        sub.sessionTopic ? `Topic: ${sub.sessionTopic}` : '',
      ]
        .filter(Boolean)
        .join('\n');

      const ratingBreakdown = sub.ratings
        .map((r) => `• ${r.label}: ${r.score}/5`)
        .join('\n');
      const ratingCell = [
        sub.averageRating > 0
          ? `${sub.averageRating.toFixed(2)} / 5.00`
          : 'Not rated',
        ratingBreakdown,
      ]
        .filter(Boolean)
        .join('\n');

      const positiveList = sub.selectedStatements
        .filter((s) => s.sentiment === 'positive')
        .map((s) => `+ ${s.text}`);
      const improveList = sub.selectedStatements
        .filter((s) => s.sentiment === 'improvement')
        .map((s) => `! ${s.text}`);
      const checklistCell =
        [...positiveList, ...improveList].join('\n') || '—';

      const commentParts: string[] = [];
      if (sub.writtenComment && sub.writtenComment.trim()) {
        commentParts.push(`"${sub.writtenComment.trim()}"`);
      }
      if (sub.customAnswers && sub.customAnswers.length > 0) {
        sub.customAnswers.forEach((a) => {
          if (a.answer && a.answer.trim()) {
            commentParts.push(`${a.prompt}: ${a.answer.trim()}`);
          }
        });
      }
      if (sub.attachment) {
        commentParts.push(
          `Attachment: ${sub.attachment.fileName} (${sub.attachment.mimeType})`
        );
      }

      return [
        String(idx + 1),
        participantInfo,
        sessionInfo,
        ratingCell,
        checklistCell,
        commentParts.join('\n') || '—',
      ];
    }),
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      valign: 'top',
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 7, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 28, fontStyle: 'bold' },
      2: { cellWidth: 32 },
      3: { cellWidth: 33 },
      4: { cellWidth: 38 },
      5: { cellWidth: 'auto' },
    },
    didDrawPage: drawFooter,
  });

  if (submissions.length === 0) {
    drawFooter();
  }

  doc.save(
    `presenza-feedback-${slugify(filenamePrefix)}-${new Date()
      .toISOString()
      .slice(0, 10)}.pdf`
  );
}

