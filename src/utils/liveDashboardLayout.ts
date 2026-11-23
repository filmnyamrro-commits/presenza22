import type {
  AttendanceRecord,
  LiveBoardAnimationStyle,
  LiveBoardCardLayout,
  LiveBoardDisplayMode,
  LiveBoardSettings,
  LiveBoardSizeScale,
  LiveBoardThemeId,
} from '../types';

export const DEFAULT_LIVE_BOARD_SETTINGS: LiveBoardSettings = {
  animationStyle: 'zoom-bounce',
  animationDurationMs: 600,
  cardLayout: 'portrait-card',
  columnsMode: 'auto',
  manualColumns: 4,
  photoSize: 'auto',
  fontSize: 'auto',
  backgroundTheme: 'clean-light',
  displayMode: 'fit',
  rotationIntervalSec: 10,
  disableAnimations: false,
};

const VALID_ANIMATIONS: LiveBoardAnimationStyle[] = [
  'zoom-bounce',
  'slide-up',
  'slide-side',
  'fade-scale',
];
const VALID_LAYOUTS: LiveBoardCardLayout[] = [
  'portrait-card',
  'horizontal-tile',
  'compact-badge',
];
const VALID_SCALES: LiveBoardSizeScale[] = ['auto', 'sm', 'md', 'lg', 'xl'];
const VALID_THEMES: LiveBoardThemeId[] = [
  'clean-light',
  'slate-conference',
  'midnight-projector',
  'emerald-hall',
  'warm-ivory',
];
const VALID_DISPLAY_MODES: LiveBoardDisplayMode[] = [
  'fit',
  'auto-paginate',
  'rotating',
  'manual',
];

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, Math.round(val)));
}

export function mergeLiveBoardSettings(
  raw?: Partial<LiveBoardSettings> | null
): LiveBoardSettings {
  if (!raw) return { ...DEFAULT_LIVE_BOARD_SETTINGS };
  return {
    animationStyle: VALID_ANIMATIONS.includes(raw.animationStyle as LiveBoardAnimationStyle)
      ? (raw.animationStyle as LiveBoardAnimationStyle)
      : DEFAULT_LIVE_BOARD_SETTINGS.animationStyle,
    animationDurationMs: clampNumber(
      raw.animationDurationMs,
      250,
      1500,
      DEFAULT_LIVE_BOARD_SETTINGS.animationDurationMs
    ),
    cardLayout: VALID_LAYOUTS.includes(raw.cardLayout as LiveBoardCardLayout)
      ? (raw.cardLayout as LiveBoardCardLayout)
      : DEFAULT_LIVE_BOARD_SETTINGS.cardLayout,
    columnsMode: raw.columnsMode === 'manual' ? 'manual' : 'auto',
    manualColumns: clampNumber(
      raw.manualColumns,
      1,
      10,
      DEFAULT_LIVE_BOARD_SETTINGS.manualColumns
    ),
    photoSize: VALID_SCALES.includes(raw.photoSize as LiveBoardSizeScale)
      ? (raw.photoSize as LiveBoardSizeScale)
      : DEFAULT_LIVE_BOARD_SETTINGS.photoSize,
    fontSize: VALID_SCALES.includes(raw.fontSize as LiveBoardSizeScale)
      ? (raw.fontSize as LiveBoardSizeScale)
      : DEFAULT_LIVE_BOARD_SETTINGS.fontSize,
    backgroundTheme: VALID_THEMES.includes(raw.backgroundTheme as LiveBoardThemeId)
      ? (raw.backgroundTheme as LiveBoardThemeId)
      : DEFAULT_LIVE_BOARD_SETTINGS.backgroundTheme,
    displayMode: VALID_DISPLAY_MODES.includes(raw.displayMode as LiveBoardDisplayMode)
      ? (raw.displayMode as LiveBoardDisplayMode)
      : DEFAULT_LIVE_BOARD_SETTINGS.displayMode,
    rotationIntervalSec: clampNumber(
      raw.rotationIntervalSec,
      4,
      60,
      DEFAULT_LIVE_BOARD_SETTINGS.rotationIntervalSec
    ),
    disableAnimations: Boolean(raw.disableAnimations),
  };
}

export interface LiveBoardThemeSpec {
  id: LiveBoardThemeId;
  label: string;
  isDark: boolean;
  canvasBg: string;
  headerBg: string;
  headerBorder: string;
  headingText: string;
  mutedText: string;
  cardBg: string;
  cardBorder: string;
  rankBadgeBg: string;
  rankBadgeText: string;
  nameText: string;
  deptText: string;
  timeText: string;
  onTimeText: string;
  lateText: string;
  spotlightBorder: string;
  spotlightGlow: string;
  bannerBg: string;
  bannerText: string;
}

export const LIVE_BOARD_THEMES: Record<LiveBoardThemeId, LiveBoardThemeSpec> = {
  'clean-light': {
    id: 'clean-light',
    label: 'Clean Daylight',
    isDark: false,
    canvasBg: 'bg-slate-50',
    headerBg: 'bg-white/95',
    headerBorder: 'border-slate-200',
    headingText: 'text-slate-900',
    mutedText: 'text-slate-600',
    cardBg: 'bg-white/95',
    cardBorder: 'border-slate-200',
    rankBadgeBg: 'bg-blue-700',
    rankBadgeText: 'text-white',
    nameText: 'text-slate-900',
    deptText: 'text-slate-600',
    timeText: 'text-slate-700',
    onTimeText: 'text-emerald-700',
    lateText: 'text-amber-700',
    spotlightBorder: 'border-blue-600',
    spotlightGlow: 'ring-2 ring-blue-500/40 bg-blue-50/90',
    bannerBg: 'bg-blue-700',
    bannerText: 'text-white',
  },
  'slate-conference': {
    id: 'slate-conference',
    label: 'Slate Conference',
    isDark: true,
    canvasBg: 'bg-slate-900',
    headerBg: 'bg-slate-900/95',
    headerBorder: 'border-slate-700',
    headingText: 'text-white',
    mutedText: 'text-slate-300',
    cardBg: 'bg-slate-800/95',
    cardBorder: 'border-slate-700',
    rankBadgeBg: 'bg-sky-500',
    rankBadgeText: 'text-slate-950',
    nameText: 'text-white',
    deptText: 'text-slate-300',
    timeText: 'text-sky-300',
    onTimeText: 'text-emerald-400',
    lateText: 'text-amber-400',
    spotlightBorder: 'border-sky-400',
    spotlightGlow: 'ring-2 ring-sky-400/50 bg-slate-800',
    bannerBg: 'bg-sky-500',
    bannerText: 'text-slate-950',
  },
  'midnight-projector': {
    id: 'midnight-projector',
    label: 'Midnight Projector',
    isDark: true,
    canvasBg: 'bg-slate-950',
    headerBg: 'bg-slate-950/95',
    headerBorder: 'border-slate-800',
    headingText: 'text-white',
    mutedText: 'text-slate-400',
    cardBg: 'bg-slate-900/95',
    cardBorder: 'border-slate-800',
    rankBadgeBg: 'bg-amber-400',
    rankBadgeText: 'text-slate-950',
    nameText: 'text-white',
    deptText: 'text-slate-300',
    timeText: 'text-amber-300',
    onTimeText: 'text-emerald-400',
    lateText: 'text-amber-400',
    spotlightBorder: 'border-amber-400',
    spotlightGlow: 'ring-2 ring-amber-400/50 bg-slate-900',
    bannerBg: 'bg-amber-400',
    bannerText: 'text-slate-950',
  },
  'emerald-hall': {
    id: 'emerald-hall',
    label: 'Emerald Auditorium',
    isDark: true,
    canvasBg: 'bg-emerald-950',
    headerBg: 'bg-emerald-950/95',
    headerBorder: 'border-emerald-800/80',
    headingText: 'text-emerald-50',
    mutedText: 'text-emerald-200/80',
    cardBg: 'bg-emerald-900/90',
    cardBorder: 'border-emerald-700/70',
    rankBadgeBg: 'bg-amber-400',
    rankBadgeText: 'text-slate-950',
    nameText: 'text-white',
    deptText: 'text-emerald-100/85',
    timeText: 'text-emerald-200',
    onTimeText: 'text-emerald-300',
    lateText: 'text-amber-300',
    spotlightBorder: 'border-amber-300',
    spotlightGlow: 'ring-2 ring-amber-300/50 bg-emerald-900',
    bannerBg: 'bg-amber-400',
    bannerText: 'text-slate-950',
  },
  'warm-ivory': {
    id: 'warm-ivory',
    label: 'Warm Ivory Paper',
    isDark: false,
    canvasBg: 'bg-stone-100',
    headerBg: 'bg-stone-50/95',
    headerBorder: 'border-stone-300',
    headingText: 'text-stone-900',
    mutedText: 'text-stone-600',
    cardBg: 'bg-white/95',
    cardBorder: 'border-stone-300/80',
    rankBadgeBg: 'bg-amber-700',
    rankBadgeText: 'text-white',
    nameText: 'text-stone-900',
    deptText: 'text-stone-600',
    timeText: 'text-stone-700',
    onTimeText: 'text-emerald-700',
    lateText: 'text-amber-800',
    spotlightBorder: 'border-amber-600',
    spotlightGlow: 'ring-2 ring-amber-500/40 bg-amber-50/90',
    bannerBg: 'bg-amber-700',
    bannerText: 'text-white',
  },
};

/**
 * Deterministic chronological arrival sort:
 * Confirmed Firebase serverTimestamp ascending; ties broken cleanly by attendance record ID.
 */
export function sortAttendancesChronologically(
  records: AttendanceRecord[]
): AttendanceRecord[] {
  return [...records].sort((a, b) => {
    const at = a.serverTimestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.serverTimestamp?.toMillis?.() ?? Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });
}

export interface AdaptiveGridMetrics {
  columns: number;
  rowsPerPage: number;
  pageSize: number;
  cellWidthPx: number;
  cellHeightPx: number;
  photoPx: number;
  rankPx: number;
  namePx: number;
  deptPx: number;
  timePx: number;
  paddingPx: number;
  gapPx: number;
  requiresScroll: boolean;
}

const SCALE_MULTIPLIER: Record<LiveBoardSizeScale, number> = {
  auto: 1,
  sm: 0.78,
  md: 1,
  lg: 1.22,
  xl: 1.44,
};

export function computeAdaptiveGridMetrics(params: {
  totalCount: number;
  containerWidth: number;
  containerHeight: number;
  settings: LiveBoardSettings;
}): AdaptiveGridMetrics {
  const { totalCount, settings } = params;
  const width = Math.max(280, params.containerWidth || 1024);
  const height = Math.max(240, params.containerHeight || 620);
  const count = Math.max(1, totalCount);
  const isPhone = width < 640;
  const gapPx = width < 640 ? 8 : count > 36 ? 8 : count > 16 ? 12 : 16;

  let columns = 1;
  let rowsPerPage = 1;
  let pageSize = count;
  let requiresScroll = false;

  if (settings.displayMode === 'fit') {
    if (settings.columnsMode === 'manual') {
      columns = Math.min(Math.max(1, settings.manualColumns), isPhone ? 2 : 10);
    } else {
      const minCardW =
        settings.cardLayout === 'horizontal-tile'
          ? isPhone
            ? 240
            : count > 36
            ? 180
            : 220
          : settings.cardLayout === 'compact-badge'
          ? isPhone
            ? 140
            : count > 40
            ? 140
            : 170
          : isPhone
          ? 135
          : count > 45
          ? 110
          : count > 20
          ? 135
          : 170;

      const maxColsByWidth = Math.max(
        1,
        Math.floor((width + gapPx) / (minCardW + gapPx))
      );
      const maxCols = Math.min(isPhone ? 2 : 10, count, maxColsByWidth);

      const layoutAspect =
        settings.cardLayout === 'portrait-card'
          ? 1.05
          : settings.cardLayout === 'horizontal-tile'
          ? 0.45
          : 0.4;

      let bestCols = 1;
      let bestScore = -1;

      for (let c = 1; c <= maxCols; c++) {
        const rows = Math.ceil(count / c);
        const cw = (width - gapPx * (c - 1)) / c;
        const ch = (height - gapPx * (rows - 1)) / rows;
        // Favor balanced cells where card dimensions match layout proportions cleanly
        const effectiveSize = Math.min(cw * layoutAspect, ch);
        const aspectRatioPenalty =
          cw / Math.max(40, ch) > 4.2 ? 0.65 : 1;
        const score = effectiveSize * aspectRatioPenalty;
        if (score > bestScore) {
          bestScore = score;
          bestCols = c;
        }
      }
      columns = bestCols;
    }

    rowsPerPage = Math.max(1, Math.ceil(count / columns));
    pageSize = count;
  } else {
    // Paginated / Rotating / Manual modes
    const targetCardW =
      settings.cardLayout === 'horizontal-tile'
        ? isPhone
          ? 280
          : 310
        : settings.cardLayout === 'compact-badge'
        ? isPhone
          ? 160
          : 235
        : isPhone
        ? 160
        : 225;

    if (settings.columnsMode === 'manual') {
      columns = Math.min(Math.max(1, settings.manualColumns), isPhone ? 2 : 10);
    } else {
      columns = Math.max(
        1,
        Math.min(
          isPhone ? 2 : 7,
          count,
          Math.floor((width + gapPx) / (targetCardW + gapPx))
        )
      );
    }

    const baseCardH =
      settings.cardLayout === 'portrait-card'
        ? 210
        : settings.cardLayout === 'horizontal-tile'
        ? 98
        : 76;

    const scaledTargetH =
      baseCardH *
      Math.max(
        SCALE_MULTIPLIER[settings.photoSize],
        SCALE_MULTIPLIER[settings.fontSize] * 0.9
      );

    rowsPerPage = Math.max(
      1,
      Math.min(8, Math.floor((height + gapPx) / (scaledTargetH + gapPx)))
    );
    pageSize = Math.max(1, columns * rowsPerPage);
  }

  const displayedRows =
    settings.displayMode === 'fit'
      ? rowsPerPage
      : Math.min(rowsPerPage, Math.ceil(Math.min(count, pageSize) / columns));

  const cellWidthPx = Math.max(
    110,
    Math.floor((width - gapPx * (columns - 1)) / columns)
  );
  const rawCellHeight = Math.floor(
    (height - gapPx * (displayedRows - 1)) / Math.max(1, displayedRows)
  );

  const minReadableCellH =
    settings.cardLayout === 'portrait-card'
      ? 112
      : settings.cardLayout === 'horizontal-tile'
      ? 68
      : 54;

  if (settings.displayMode === 'fit' && rawCellHeight < minReadableCellH) {
    requiresScroll = true;
  }

  const cellHeightPx = Math.max(minReadableCellH, rawCellHeight);
  const paddingPx = Math.round(
    Math.min(18, Math.max(6, Math.min(cellWidthPx, cellHeightPx) * 0.075))
  );

  let autoPhotoPx = 56;
  let autoNamePx = 15;
  let autoDeptPx = 12;
  let autoTimePx = 11;
  let autoRankPx = 11;

  if (settings.cardLayout === 'portrait-card') {
    const innerH = Math.max(60, cellHeightPx - paddingPx * 2);
    const innerW = Math.max(70, cellWidthPx - paddingPx * 2);
    autoPhotoPx = Math.min(
      144,
      Math.max(38, Math.min(innerW * 0.56, innerH * 0.46))
    );
    autoNamePx = Math.min(22, Math.max(11, cellWidthPx * 0.072));
    autoDeptPx = Math.min(15, Math.max(10, autoNamePx * 0.78));
    autoTimePx = Math.min(13, Math.max(10, autoNamePx * 0.72));
    autoRankPx = Math.min(14, Math.max(10, autoNamePx * 0.72));
  } else if (settings.cardLayout === 'horizontal-tile') {
    const innerH = Math.max(44, cellHeightPx - paddingPx * 2);
    autoPhotoPx = Math.min(96, Math.max(40, innerH * 0.78));
    autoNamePx = Math.min(20, Math.max(12, cellHeightPx * 0.17));
    autoDeptPx = Math.min(14, Math.max(10, autoNamePx * 0.8));
    autoTimePx = Math.min(13, Math.max(10, autoNamePx * 0.75));
    autoRankPx = Math.min(13, Math.max(10, autoNamePx * 0.74));
  } else {
    // compact-badge
    const innerH = Math.max(36, cellHeightPx - paddingPx * 2);
    autoPhotoPx = Math.min(58, Math.max(32, innerH * 0.76));
    autoNamePx = Math.min(16, Math.max(11, cellHeightPx * 0.21));
    autoDeptPx = Math.min(13, Math.max(9.5, autoNamePx * 0.8));
    autoTimePx = Math.min(12, Math.max(9.5, autoNamePx * 0.75));
    autoRankPx = Math.min(12, Math.max(9.5, autoNamePx * 0.75));
  }

  const photoMult = SCALE_MULTIPLIER[settings.photoSize];
  const fontMult = SCALE_MULTIPLIER[settings.fontSize];

  const maxAllowedPhoto =
    settings.cardLayout === 'portrait-card'
      ? Math.max(38, cellHeightPx * 0.54)
      : Math.max(32, cellHeightPx - paddingPx * 2);

  const photoPx = Math.round(
    Math.min(176, maxAllowedPhoto, Math.max(32, autoPhotoPx * photoMult))
  );
  const namePx = Math.round(Math.min(26, Math.max(11, autoNamePx * fontMult)));
  const deptPx = Math.round(Math.min(18, Math.max(9.5, autoDeptPx * fontMult)));
  const timePx = Math.round(Math.min(16, Math.max(9.5, autoTimePx * fontMult)));
  const rankPx = Math.round(Math.min(16, Math.max(9.5, autoRankPx * fontMult)));

  return {
    columns,
    rowsPerPage,
    pageSize,
    cellWidthPx,
    cellHeightPx,
    photoPx,
    rankPx,
    namePx,
    deptPx,
    timePx,
    paddingPx,
    gapPx,
    requiresScroll,
  };
}
