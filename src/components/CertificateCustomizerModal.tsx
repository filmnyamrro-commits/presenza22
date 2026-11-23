import {
  Award,
  Check,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Layers,
  Loader2,
  Move,
  Palette,
  PenTool,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AttendanceRecord,
  CertificateElementKey,
  CertificateSettings,
  CertificateTermKey,
  EventRecord,
  OrganizationBranding,
} from '../types';
import {
  formatCertificateIssueDate,
  formatLocalDateYmd,
} from '../utils/dateTime';
import {
  CERTIFICATE_TERM_OPTIONS,
  DEFAULT_TERM_BEST_CATEGORIES,
  resolveBestTermLabel,
} from '../utils/feedbackAndRecognitionDefaults';
import {
  compressCertificateBackground,
  compressSignatureCanvas,
  compressSignatureFile,
} from '../utils/imageCompress';
import {
  CERTIFICATE_ELEMENT_META,
  CERTIFICATE_THEME_LIST,
  CERTIFICATE_THEMES,
  DEFAULT_CERTIFICATE_ELEMENTS,
  downloadSingleCertificatePdf,
  mergeCertificateSettings,
} from '../utils/pdfExport';

interface CertificateCustomizerModalProps {
  initialSettings: CertificateSettings;
  branding?: OrganizationBranding | null;
  dashboardBgUrl?: string | null;
  sampleRecord?: AttendanceRecord | null;
  sampleEvent?: EventRecord | null;
  totalParticipants?: number;
  saving: boolean;
  error: string | null;
  onSave: (nextSettings: CertificateSettings) => Promise<void>;
  onClose: () => void;
}

type StudioTab = 'theme' | 'elements' | 'signatures';
type SignatureRole = 'facilitator' | 'principal';

export default function CertificateCustomizerModal({
  initialSettings,
  branding,
  dashboardBgUrl,
  sampleRecord,
  sampleEvent,
  totalParticipants = 24,
  saving,
  error,
  onSave,
  onClose,
}: CertificateCustomizerModalProps) {
  const [draft, setDraft] = useState<CertificateSettings>(() =>
    mergeCertificateSettings(initialSettings)
  );
  const [activeTab, setActiveTab] = useState<StudioTab>('theme');
  const [selectedKey, setSelectedKey] =
    useState<CertificateElementKey>('recipientName');
  const [localError, setLocalError] = useState<string | null>(null);
  const [processingAsset, setProcessingAsset] = useState(false);

  // Signature pad drawer state
  const [drawingFor, setDrawingFor] = useState<SignatureRole | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingStrokeRef = useRef(false);

  // Dragging state on preview canvas
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    key: CertificateElementKey;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const facSigInputRef = useRef<HTMLInputElement | null>(null);
  const priSigInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(mergeCertificateSettings(initialSettings));
  }, [initialSettings]);

  const theme = CERTIFICATE_THEMES[draft.themeId];
  const selectedElement = draft.elements[selectedKey];
  const selectedMeta = CERTIFICATE_ELEMENT_META.find(
    (m) => m.key === selectedKey
  );

  // Sample values for live preview
  const previewName = sampleRecord?.fullName || 'Dr. Sarah Al-Mansoor';
  const previewDept =
    sampleRecord?.classDepartment || 'Curriculum & Instruction';
  const previewEventName =
    sampleEvent?.title ||
    sampleRecord?.eventName ||
    'Annual Professional Development Seminar';
  const previewDate = sampleRecord?.attendanceDate || '2026-11-17';
  const previewTime = sampleRecord?.checkInTime || '07:42:15';
  const previewStatus = sampleRecord?.status || 'On Time';
  const previewBestTermLabel = resolveBestTermLabel(
    draft.bestTerm,
    draft.termBestCategories
  );
  const previewPicPdName =
    draft.picPdName.trim() || sampleEvent?.facilitators?.trim() || '';
  const previewPicPdTitle =
    draft.picPdTitle.trim() || 'PIC of Professional Development';
  const previewPrincipalName =
    draft.principalName.trim() || sampleEvent?.principalName?.trim() || '';
  const previewPrincipalTitle = draft.principalTitle.trim() || 'Principal';
  const previewOrgName = branding?.organizationName?.trim() || 'Your School / Company';
  const previewIssueDate = formatCertificateIssueDate(
    formatLocalDateYmd(new Date())
  );

  // Canvas pointer dragging on A4 preview
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragStateRef.current;
      const box = previewRef.current;
      if (!drag || !box) return;

      const rect = box.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dxMm = ((e.clientX - drag.startClientX) / rect.width) * 297;
      const dyMm = ((e.clientY - drag.startClientY) / rect.height) * 210;

      const nextX = Math.round(
        Math.min(285, Math.max(12, drag.origX + dxMm)) * 2
      ) / 2;
      const nextY = Math.round(
        Math.min(198, Math.max(12, drag.origY + dyMm)) * 2
      ) / 2;

      setDraft((prev) => ({
        ...prev,
        elements: {
          ...prev.elements,
          [drag.key]: {
            ...prev.elements[drag.key],
            x: nextX,
            y: nextY,
          },
        },
      }));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const startElementDrag = (
    key: CertificateElementKey,
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    setSelectedKey(key);
    setActiveTab('elements');
    dragStateRef.current = {
      key,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: draft.elements[key].x,
      origY: draft.elements[key].y,
    };
  };

  const updateElement = (
    key: CertificateElementKey,
    patch: Partial<{ visible: boolean; x: number; y: number }>
  ) => {
    setDraft((prev) => ({
      ...prev,
      elements: {
        ...prev.elements,
        [key]: {
          ...prev.elements[key],
          ...patch,
        },
      },
    }));
  };

  const handleResetPositions = () => {
    setDraft((prev) => ({
      ...prev,
      elements: { ...DEFAULT_CERTIFICATE_ELEMENTS },
    }));
  };

  const handleUploadBg = async (file: File) => {
    setLocalError(null);
    setProcessingAsset(true);
    try {
      const dataUrl = await compressCertificateBackground(file);
      setDraft((prev) => ({ ...prev, backgroundDataUrl: dataUrl }));
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Failed to process background photo.'
      );
    } finally {
      setProcessingAsset(false);
    }
  };

  const handleUploadSignature = async (role: SignatureRole, file: File) => {
    setLocalError(null);
    setProcessingAsset(true);
    try {
      const dataUrl = await compressSignatureFile(file);
      setDraft((prev) => ({
        ...prev,
        ...(role === 'facilitator'
          ? { facilitatorSignatureDataUrl: dataUrl }
          : { principalSignatureDataUrl: dataUrl }),
      }));
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : 'Failed to process signature image.'
      );
    } finally {
      setProcessingAsset(false);
    }
  };

  // Signature Pad drawing handlers
  const getCanvasPoint = (
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number
  ) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePadPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const pt = getCanvasPoint(canvas, e.clientX, e.clientY);
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    isDrawingStrokeRef.current = true;
  };

  const handlePadPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingStrokeRef.current) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pt = getCanvasPoint(canvas, e.clientX, e.clientY);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const handlePadPointerUp = () => {
    isDrawingStrokeRef.current = false;
  };

  const handleClearPad = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleApplyDrawnSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas || !drawingFor) return;
    setLocalError(null);
    try {
      const dataUrl = compressSignatureCanvas(canvas);
      setDraft((prev) => ({
        ...prev,
        ...(drawingFor === 'facilitator'
          ? { facilitatorSignatureDataUrl: dataUrl }
          : { principalSignatureDataUrl: dataUrl }),
      }));
      setDrawingFor(null);
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Please draw a signature first.'
      );
    }
  };

  const handleDownloadSamplePdf = () => {
    const syntheticRecord: AttendanceRecord = sampleRecord ?? {
      id: 'sample-preview',
      eventId: sampleEvent?.id || 'sample-event',
      eventName: previewEventName,
      fullName: previewName,
      classDepartment: previewDept,
      photoDataUrl: '',
      photoConsent: true,
      attendanceDate: previewDate,
      checkInTime: previewTime,
      serverTimestamp: {
        toMillis: () => Date.now(),
        toDate: () => new Date(),
      } as AttendanceRecord['serverTimestamp'],
      status: previewStatus,
      lateExcuse: '',
    };

    downloadSingleCertificatePdf(
      syntheticRecord,
      1,
      Math.max(1, totalParticipants),
      sampleEvent,
      branding,
      draft
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cert-studio-title"
    >
      <div className="w-full max-w-7xl h-[94vh] rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        {/* Top Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2
                id="cert-studio-title"
                className="text-base sm:text-lg font-bold text-slate-900 truncate"
              >
                Certificate Studio &amp; Layout Customizer
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Choose a theme, drag elements to reposition, toggle visibility, adjust background transparency &amp; attach digital signatures.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadSamplePdf}
              className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 transition-colors inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-blue-700" />
              <span>Test Sample PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70"
              aria-label="Close certificate customizer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Studio Body: Left Live Preview | Right Controls */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
          {/* Left 7 Columns: Interactive A4 Landscape Certificate Canvas */}
          <div className="lg:col-span-7 bg-slate-100/90 p-4 sm:p-6 flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-slate-200 min-h-[320px]">
            <div className="w-full max-w-[760px] space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Move className="w-3.5 h-3.5 text-blue-700" />
                  <span>
                    Click any element on the certificate to select &amp; drag to move
                  </span>
                </span>
                <span className="font-mono-tabular text-[11px] bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                  A4 Landscape · 297 × 210 mm
                </span>
              </div>

              {/* Exact 297:210 Aspect Ratio Live Canvas */}
              <div
                ref={previewRef}
                className="relative w-full aspect-[297/210] rounded-lg shadow-lg overflow-hidden select-none touch-none border border-slate-300"
                style={{ backgroundColor: theme.paperHex }}
              >
                {/* Background Photo inside 10mm margin */}
                {draft.backgroundDataUrl && draft.backgroundOpacity > 0 && (
                  <div
                    className="absolute overflow-hidden pointer-events-none"
                    style={{
                      left: '3.367%',
                      right: '3.367%',
                      top: '4.762%',
                      bottom: '4.762%',
                    }}
                  >
                    <img
                      src={draft.backgroundDataUrl}
                      alt=""
                      aria-hidden="true"
                      className="w-full h-full object-cover"
                      style={{ opacity: draft.backgroundOpacity / 100 }}
                    />
                  </div>
                )}

                {/* Top accent bar for Royal Slate */}
                {theme.topBarRgb && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: '3.367%',
                      right: '3.367%',
                      top: '4.762%',
                      height: '1.5%',
                      backgroundColor: `rgb(${theme.topBarRgb.join(',')})`,
                    }}
                  />
                )}

                {/* Outer Border (10mm inset) */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: '3.367%',
                    right: '3.367%',
                    top: '4.762%',
                    bottom: '4.762%',
                    border: `2.5px solid ${theme.outerBorderHex}`,
                  }}
                />

                {/* Inner Border (14mm inset) */}
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: '4.714%',
                    right: '4.714%',
                    top: '6.667%',
                    bottom: '6.667%',
                    border: `1px solid ${theme.innerBorderHex}`,
                  }}
                />

                {/* 4 Corner Accent Squares (8x8mm) */}
                {[
                  { left: '3.367%', top: '4.762%' },
                  { right: '3.367%', top: '4.762%' },
                  { left: '3.367%', bottom: '4.762%' },
                  { right: '3.367%', bottom: '4.762%' },
                ].map((pos, idx) => (
                  <div
                    key={idx}
                    className="absolute pointer-events-none"
                    style={{
                      ...pos,
                      width: '2.69%',
                      height: '3.81%',
                      backgroundColor: theme.outerBorderHex,
                    }}
                  />
                ))}

                {/* 1. Org Logo */}
                {draft.elements.orgLogo.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('orgLogo', e)}
                    title="School / Company Logo (drag to move)"
                    style={{
                      left: `${(draft.elements.orgLogo.x / 297) * 100}%`,
                      top: `${(draft.elements.orgLogo.y / 210) * 100}%`,
                      width: '4.4%',
                      height: '6.2%',
                    }}
                    className={`absolute cursor-move flex items-center justify-center rounded border bg-white/80 transition-shadow ${
                      selectedKey === 'orgLogo'
                        ? 'ring-2 ring-blue-600 border-blue-500 z-20'
                        : 'border-slate-300/60 hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    {branding?.logoDataUrl ? (
                      <img
                        src={branding.logoDataUrl}
                        alt="Org Logo"
                        className="w-full h-full object-contain pointer-events-none"
                      />
                    ) : (
                      <span className="text-[7px] font-bold text-slate-400">
                        LOGO
                      </span>
                    )}
                  </div>
                )}

                {/* 2. Org Name */}
                {draft.elements.orgName.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('orgName', e)}
                    style={{
                      left: `${
                        ((!draft.elements.orgLogo.visible &&
                        draft.elements.orgName.x ===
                          DEFAULT_CERTIFICATE_ELEMENTS.orgName.x
                          ? 20
                          : draft.elements.orgName.x) /
                          297) *
                        100
                      }%`,
                      top: `${(draft.elements.orgName.y / 210) * 100}%`,
                      transform: 'translate(0, -50%)',
                      color: theme.headingHex,
                    }}
                    className={`absolute cursor-move px-1 rounded text-[clamp(6px,0.9vw,10px)] font-bold leading-tight whitespace-nowrap ${
                      selectedKey === 'orgName'
                        ? 'ring-2 ring-blue-600 bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    {previewOrgName}
                  </div>
                )}

                {/* 3. Kicker */}
                {draft.elements.kicker.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('kicker', e)}
                    style={{
                      left: `${(draft.elements.kicker.x / 297) * 100}%`,
                      top: `${(draft.elements.kicker.y / 210) * 100}%`,
                      transform: 'translate(-50%, -65%)',
                      color: theme.kickerHex,
                    }}
                    className={`absolute cursor-move px-1.5 rounded text-[clamp(7px,1vw,11px)] font-bold tracking-wider whitespace-nowrap ${
                      selectedKey === 'kicker'
                        ? 'ring-2 ring-blue-600 bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    PRESENZA
                  </div>
                )}

                {/* 4. Certificate Title */}
                {draft.elements.title.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('title', e)}
                    style={{
                      left: `${(draft.elements.title.x / 297) * 100}%`,
                      top: `${(draft.elements.title.y / 210) * 100}%`,
                      transform: 'translate(-50%, -65%)',
                      color: theme.headingHex,
                      fontFamily: 'Georgia, Times, serif',
                    }}
                    className={`absolute cursor-move px-2 rounded text-[clamp(11px,2.2vw,24px)] font-bold tracking-tight whitespace-nowrap ${
                      selectedKey === 'title'
                        ? 'ring-2 ring-blue-600 bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    CERTIFICATE OF RECOGNITION
                  </div>
                )}

                {/* 5. Subtitle */}
                {draft.elements.subtitle.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('subtitle', e)}
                    style={{
                      left: `${(draft.elements.subtitle.x / 297) * 100}%`,
                      top: `${(draft.elements.subtitle.y / 210) * 100}%`,
                      transform: 'translate(-50%, -60%)',
                    }}
                    className={`absolute cursor-move px-1.5 rounded text-[clamp(6px,0.9vw,10px)] text-slate-500 tracking-wide whitespace-nowrap ${
                      selectedKey === 'subtitle'
                        ? 'ring-2 ring-blue-600 bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    TOP 5 EARLIEST ARRIVAL HONORS
                  </div>
                )}

                {/* 6. Rank Distinction Badge */}
                {draft.elements.rankBadge.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('rankBadge', e)}
                    style={{
                      left: `${(draft.elements.rankBadge.x / 297) * 100}%`,
                      top: `${(draft.elements.rankBadge.y / 210) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      backgroundColor: `rgb(${theme.podiumBadgeBgRgb.join(',')})`,
                      borderColor: `rgb(${theme.podiumBadgeBorderRgb.join(',')})`,
                      color: `rgb(${theme.podiumBadgeTextRgb.join(',')})`,
                    }}
                    className={`absolute cursor-move px-3 py-0.5 rounded border text-[clamp(6px,0.95vw,10px)] font-bold whitespace-nowrap ${
                      selectedKey === 'rankBadge'
                        ? 'ring-2 ring-blue-600 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    {previewBestTermLabel
                      ? `${previewBestTermLabel.toUpperCase()} · RANK #1`
                      : 'RANK #1 · 1ST EARLIEST ARRIVAL'}
                  </div>
                )}

                {/* 7. Centered Participant Photo */}
                {draft.elements.photo.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('photo', e)}
                    style={{
                      left: `${(draft.elements.photo.x / 297) * 100}%`,
                      top: `${(draft.elements.photo.y / 210) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      width: '12.5%',
                    }}
                    className={`absolute cursor-move flex flex-col items-center ${
                      selectedKey === 'photo'
                        ? 'ring-2 ring-blue-600 rounded p-0.5 bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 rounded z-10'
                    }`}
                  >
                    <div className="w-full aspect-square rounded border border-slate-300 bg-slate-100 overflow-hidden flex items-center justify-center">
                      {sampleRecord?.photoDataUrl ? (
                        <img
                          src={sampleRecord.photoDataUrl}
                          alt="Participant"
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      ) : (
                        <span className="text-[clamp(6px,0.8vw,9px)] font-semibold text-slate-400 text-center px-1">
                          Photo
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 text-[clamp(5px,0.7vw,8px)] text-slate-500 whitespace-nowrap">
                      Verified Check-In Photo
                    </span>
                  </div>
                )}

                {/* 8. Awarded-To Intro */}
                {draft.elements.awardedTo.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('awardedTo', e)}
                    style={{
                      left: `${(draft.elements.awardedTo.x / 297) * 100}%`,
                      top: `${(draft.elements.awardedTo.y / 210) * 100}%`,
                      transform: 'translate(-50%, -60%)',
                    }}
                    className={`absolute cursor-move px-1.5 rounded text-[clamp(6px,0.95vw,10px)] text-slate-600 whitespace-nowrap ${
                      selectedKey === 'awardedTo'
                        ? 'ring-2 ring-blue-600 bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    This certificate is proudly awarded to
                  </div>
                )}

                {/* 9. Recipient Name */}
                {draft.elements.recipientName.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('recipientName', e)}
                    style={{
                      left: `${(draft.elements.recipientName.x / 297) * 100}%`,
                      top: `${(draft.elements.recipientName.y / 210) * 100}%`,
                      transform: 'translate(-50%, -65%)',
                      color: theme.headingHex,
                      fontFamily: 'Georgia, Times, serif',
                    }}
                    className={`absolute cursor-move px-2 rounded text-[clamp(10px,2vw,22px)] font-bold whitespace-nowrap ${
                      selectedKey === 'recipientName'
                        ? 'ring-2 ring-blue-600 bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    {previewName}
                  </div>
                )}

                {/* 10. Department & Divider */}
                {draft.elements.department.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('department', e)}
                    style={{
                      left: `${(draft.elements.department.x / 297) * 100}%`,
                      top: `${(draft.elements.department.y / 210) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      color: theme.accentHex,
                      width: '42%',
                    }}
                    className={`absolute cursor-move px-1 text-center ${
                      selectedKey === 'department'
                        ? 'ring-2 ring-blue-600 rounded bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 rounded z-10'
                    }`}
                  >
                    <div className="text-[clamp(6px,1vw,11px)] font-bold truncate">
                      {previewDept}
                    </div>
                    <div className="mt-0.5 h-[1px] bg-slate-300 w-full" />
                  </div>
                )}

                {/* 11. Citation */}
                {draft.elements.citation.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('citation', e)}
                    style={{
                      left: `${(draft.elements.citation.x / 297) * 100}%`,
                      top: `${(draft.elements.citation.y / 210) * 100}%`,
                      transform: 'translate(-50%, -25%)',
                      width: '72%',
                    }}
                    className={`absolute cursor-move px-2 py-0.5 rounded text-center text-[clamp(5.5px,0.88vw,10px)] text-slate-600 leading-snug ${
                      selectedKey === 'citation'
                        ? 'ring-2 ring-blue-600 bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    For demonstrating outstanding punctuality and dedication by arriving among the earliest participants (#1 out of {Math.max(1, totalParticipants)} attendees) at &ldquo;{previewEventName}&rdquo; on {previewDate}, checking in at {previewTime} ({previewStatus}).
                  </div>
                )}

                {/* 12. Recognition Seal */}
                {draft.elements.seal.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('seal', e)}
                    style={{
                      left: `${(draft.elements.seal.x / 297) * 100}%`,
                      top: `${(draft.elements.seal.y / 210) * 100}%`,
                      transform: 'translate(-50%, -60%)',
                      color: theme.sealHex,
                    }}
                    className={`absolute cursor-move px-1.5 rounded text-[clamp(5.5px,0.85vw,9.5px)] font-bold tracking-wide whitespace-nowrap ${
                      selectedKey === 'seal'
                        ? 'ring-2 ring-blue-600 bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 z-10'
                    }`}
                  >
                    EARLY BIRD #1 · PRESENZA RECOGNITION AWARD
                  </div>
                )}

                {/* 13. Date Footer Block */}
                {draft.elements.dateFooter.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('dateFooter', e)}
                    style={{
                      left: `${(draft.elements.dateFooter.x / 297) * 100}%`,
                      top: `${(draft.elements.dateFooter.y / 210) * 100}%`,
                      transform: 'translate(-50%, -80%)',
                      width: '23%',
                    }}
                    className={`absolute cursor-move px-1 text-center ${
                      selectedKey === 'dateFooter'
                        ? 'ring-2 ring-blue-600 rounded bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 rounded z-10'
                    }`}
                  >
                    <div
                      className="text-[clamp(5.5px,0.85vw,9px)] font-bold truncate"
                      style={{ color: theme.headingHex }}
                    >
                      {previewDate} · {previewTime}
                    </div>
                    <div className="mt-0.5 h-[1px] bg-slate-400 w-full" />
                    <div className="mt-0.5 text-[clamp(5px,0.75vw,8px)] text-slate-500 truncate">
                      Verified Attendance Date &amp; Time
                    </div>
                  </div>
                )}

                {/* 14. PIC of Professional Development Block + Signature */}
                {draft.elements.facilitatorBlock.visible && (
                  <div
                    onPointerDown={(e) =>
                      startElementDrag('facilitatorBlock', e)
                    }
                    style={{
                      left: `${(draft.elements.facilitatorBlock.x / 297) * 100}%`,
                      top: `${(draft.elements.facilitatorBlock.y / 210) * 100}%`,
                      transform: 'translate(-50%, -85%)',
                      width: '26%',
                    }}
                    className={`absolute cursor-move px-1 text-center ${
                      selectedKey === 'facilitatorBlock'
                        ? 'ring-2 ring-blue-600 rounded bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 rounded z-10'
                    }`}
                  >
                    {draft.facilitatorSignatureDataUrl && (
                      <img
                        src={draft.facilitatorSignatureDataUrl}
                        alt="PIC of Professional Development signature"
                        className="mx-auto mb-0.5 max-h-6 sm:max-h-8 max-w-[78%] object-contain pointer-events-none"
                      />
                    )}
                    {previewPicPdName && (
                      <div
                        className="text-[clamp(5.5px,0.85vw,9px)] font-bold truncate"
                        style={{ color: theme.headingHex }}
                      >
                        {previewPicPdName}
                      </div>
                    )}
                    <div className="mt-0.5 h-[1px] bg-slate-400 w-full" />
                    <div className="mt-0.5 text-[clamp(5px,0.72vw,8px)] text-slate-500 truncate">
                      {previewPicPdTitle}
                    </div>
                  </div>
                )}

                {/* 15. Principal Block + Signature */}
                {draft.elements.principalBlock.visible && (
                  <div
                    onPointerDown={(e) => startElementDrag('principalBlock', e)}
                    style={{
                      left: `${(draft.elements.principalBlock.x / 297) * 100}%`,
                      top: `${(draft.elements.principalBlock.y / 210) * 100}%`,
                      transform: 'translate(-50%, -85%)',
                      width: '26%',
                    }}
                    className={`absolute cursor-move px-1 text-center ${
                      selectedKey === 'principalBlock'
                        ? 'ring-2 ring-blue-600 rounded bg-blue-50/40 z-20'
                        : 'hover:ring-1 hover:ring-blue-400 rounded z-10'
                    }`}
                  >
                    <div className="text-[clamp(5px,0.72vw,8px)] text-slate-700 whitespace-nowrap mb-0.5">
                      Jakarta, {previewIssueDate}
                    </div>
                    <div className="min-h-[16px] sm:min-h-[24px] flex items-end justify-center mb-0.5">
                      {draft.principalSignatureDataUrl && (
                        <img
                          src={draft.principalSignatureDataUrl}
                          alt="Principal signature"
                          className="mx-auto max-h-6 sm:max-h-8 max-w-[78%] object-contain pointer-events-none"
                        />
                      )}
                    </div>
                    {previewPrincipalName && (
                      <div
                        className="text-[clamp(5.5px,0.85vw,9px)] font-bold truncate"
                        style={{ color: theme.headingHex }}
                      >
                        {previewPrincipalName}
                      </div>
                    )}
                    <div className="mt-0.5 h-[1px] bg-slate-400 w-full" />
                    <div className="mt-0.5 text-[clamp(5px,0.72vw,8px)] text-slate-500 truncate">
                      {previewPrincipalTitle}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>
                  Selected:{' '}
                  <strong className="text-slate-800">
                    {selectedMeta?.label}
                  </strong>{' '}
                  (X: {selectedElement.x}mm, Y: {selectedElement.y}mm)
                </span>
                <button
                  type="button"
                  onClick={handleResetPositions}
                  className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800 font-semibold"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Default Layout</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right 5 Columns: Tabbed Customizer Controls */}
          <div className="lg:col-span-5 flex flex-col min-h-0 bg-white">
            {/* Tabs */}
            <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50 p-1.5 gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('theme')}
                className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                  activeTab === 'theme'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-blue-700" />
                <span>Theme &amp; Bg</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('elements')}
                className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                  activeTab === 'elements'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-blue-700" />
                <span>Elements</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('signatures')}
                className={`min-h-[38px] px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                  activeTab === 'signatures'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PenTool className="w-3.5 h-3.5 text-blue-700" />
                <span>Signatures</span>
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {(localError || error) && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
                  {localError || error}
                </div>
              )}

              {activeTab === 'theme' && (
                <div className="space-y-5">
                  {/* Template Themes */}
                  <div className="space-y-2.5">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-700">
                      Certificate Template Themes
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {CERTIFICATE_THEME_LIST.map((t) => {
                        const active = draft.themeId === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({ ...prev, themeId: t.id }))
                            }
                            className={`w-full text-left rounded-xl border p-3 transition-colors flex items-center justify-between gap-3 ${
                              active
                                ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                                : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-10 h-8 rounded-md border-2 shrink-0 flex items-center justify-center"
                                style={{
                                  backgroundColor: t.paperHex,
                                  borderColor: t.outerBorderHex,
                                }}
                              >
                                <div
                                  className="w-6 h-4 border"
                                  style={{ borderColor: t.innerBorderHex }}
                                />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-900">
                                  {t.name}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {t.description}
                                </div>
                              </div>
                            </div>
                            {active && (
                              <Check className="w-4 h-4 text-blue-700 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Certificate Background Photo & Transparency */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
                          Background Photo &amp; Transparency
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Add an optional backdrop image and control its opacity on the certificate.
                        </p>
                      </div>
                    </div>

                    <input
                      ref={bgInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) void handleUploadBg(file);
                      }}
                      className="hidden"
                      aria-label="Upload certificate background photo"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={processingAsset}
                        onClick={() => bgInputRef.current?.click()}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {processingAsset ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ImagePlus className="w-3.5 h-3.5 text-blue-700" />
                        )}
                        <span>
                          {draft.backgroundDataUrl
                            ? 'Change Background Photo'
                            : 'Upload Background Photo'}
                        </span>
                      </button>

                      {dashboardBgUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              backgroundDataUrl: dashboardBgUrl,
                            }))
                          }
                          className="min-h-[36px] px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-semibold text-blue-800 inline-flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Use Live Dashboard Photo</span>
                        </button>
                      )}

                      {draft.backgroundDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              backgroundDataUrl: '',
                            }))
                          }
                          className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor="cert-bg-opacity"
                          className="font-semibold text-slate-700"
                        >
                          Photo Opacity
                        </label>
                        <span className="font-mono-tabular font-semibold text-slate-800">
                          {draft.backgroundOpacity}%{' '}
                          <span className="text-slate-400 font-normal">
                            ({100 - draft.backgroundOpacity}% transparent)
                          </span>
                        </span>
                      </div>
                      <input
                        id="cert-bg-opacity"
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={draft.backgroundOpacity}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            backgroundOpacity: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-blue-700 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Best Category by Term (Term 1 – Term 4) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-slate-800">
                        Best Category by Term (Term 1 – Term 4)
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Select an active term to display its Best Category distinction on the certificate and customize each term&rsquo;s title.
                      </p>
                    </div>

                    <div
                      className="grid grid-cols-5 gap-1 p-1 rounded-lg bg-slate-200/70"
                      role="group"
                      aria-label="Certificate term selection"
                    >
                      {CERTIFICATE_TERM_OPTIONS.map((opt) => {
                        const active = draft.bestTerm === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                bestTerm: opt.key as CertificateTermKey,
                              }))
                            }
                            className={`min-h-[32px] px-1.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                              active
                                ? 'bg-white text-slate-900 shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {opt.shortLabel}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {(['term1', 'term2', 'term3', 'term4'] as const).map(
                        (tKey, idx) => (
                          <div key={tKey} className="space-y-1">
                            <label
                              htmlFor={`modal-term-${tKey}`}
                              className="block text-[11px] font-semibold text-slate-700"
                            >
                              Term {idx + 1} Best Category Name
                            </label>
                            <input
                              id={`modal-term-${tKey}`}
                              type="text"
                              maxLength={100}
                              value={draft.termBestCategories[tKey]}
                              placeholder={DEFAULT_TERM_BEST_CATEGORIES[tKey]}
                              onChange={(e) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  termBestCategories: {
                                    ...prev.termBestCategories,
                                    [tKey]: e.target.value,
                                  },
                                }))
                              }
                              className="w-full min-h-[36px] px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                            />
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'elements' && (
                <div className="space-y-4">
                  {/* Selected Element Coordinate Controls */}
                  <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wide text-blue-700">
                          Selected Element
                        </div>
                        <div className="text-sm font-bold text-slate-900">
                          {selectedMeta?.label}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateElement(selectedKey, {
                            visible: !selectedElement.visible,
                          })
                        }
                        className={`min-h-[32px] px-2.5 py-1 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 ${
                          selectedElement.visible
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-slate-300 bg-white text-slate-600'
                        }`}
                      >
                        {selectedElement.visible ? (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Shown</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hidden</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                          <label htmlFor="el-x-input">Horizontal X (mm)</label>
                          <span className="font-mono-tabular">
                            {selectedElement.x}
                          </span>
                        </div>
                        <input
                          id="el-x-input"
                          type="range"
                          min={12}
                          max={285}
                          step={0.5}
                          value={selectedElement.x}
                          onChange={(e) =>
                            updateElement(selectedKey, {
                              x: Number(e.target.value),
                            })
                          }
                          className="w-full accent-blue-700"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                          <label htmlFor="el-y-input">Vertical Y (mm)</label>
                          <span className="font-mono-tabular">
                            {selectedElement.y}
                          </span>
                        </div>
                        <input
                          id="el-y-input"
                          type="range"
                          min={12}
                          max={198}
                          step={0.5}
                          value={selectedElement.y}
                          onChange={(e) =>
                            updateElement(selectedKey, {
                              y: Number(e.target.value),
                            })
                          }
                          className="w-full accent-blue-700"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() =>
                          updateElement(selectedKey, { x: 148.5 })
                        }
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        Center Horizontally (148.5mm)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateElement(
                            selectedKey,
                            DEFAULT_CERTIFICATE_ELEMENTS[selectedKey]
                          )
                        }
                        className="text-[11px] font-semibold text-slate-600 hover:text-slate-900"
                      >
                        Reset This Element
                      </button>
                    </div>
                  </div>

                  {/* All Elements Toggle & Selector List */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
                        Show / Hide &amp; Position Elements
                      </span>
                      <button
                        type="button"
                        onClick={handleResetPositions}
                        className="text-[11px] font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset All</span>
                      </button>
                    </div>

                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                      {CERTIFICATE_ELEMENT_META.map((item) => {
                        const cfg = draft.elements[item.key];
                        const isSel = selectedKey === item.key;
                        return (
                          <div
                            key={item.key}
                            onClick={() => setSelectedKey(item.key)}
                            className={`px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              isSel ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 truncate">
                                {item.label}
                              </div>
                              <div className="font-mono-tabular text-[10px] text-slate-500">
                                X {cfg.x}mm · Y {cfg.y}mm
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateElement(item.key, {
                                  visible: !cfg.visible,
                                });
                              }}
                              aria-label={`${cfg.visible ? 'Hide' : 'Show'} ${item.label}`}
                              className={`min-h-[30px] px-2.5 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 shrink-0 ${
                                cfg.visible
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                  : 'border-slate-200 bg-slate-100 text-slate-500'
                              }`}
                            >
                              {cfg.visible ? (
                                <>
                                  <Eye className="w-3 h-3" />
                                  <span>Shown</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3" />
                                  <span>Hidden</span>
                                </>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'signatures' && (
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Customize the names and upload or draw digital signatures for the native bottom signatories: <strong>PIC of Professional Development</strong> and <strong>Principal</strong>.
                  </p>

                  <input
                    ref={facSigInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file)
                        void handleUploadSignature('facilitator', file);
                    }}
                    className="hidden"
                    aria-label="Upload PIC of Professional Development digital signature"
                  />

                  <input
                    ref={priSigInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void handleUploadSignature('principal', file);
                    }}
                    className="hidden"
                    aria-label="Upload principal digital signature"
                  />

                  {/* Inline Signature Drawing Pad */}
                  {drawingFor && (
                    <div className="rounded-xl border-2 border-blue-300 bg-blue-50/40 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Draw{' '}
                          {drawingFor === 'facilitator'
                            ? 'PIC of Professional Development'
                            : 'Principal'}{' '}
                          Signature
                        </span>
                        <button
                          type="button"
                          onClick={() => setDrawingFor(null)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-900"
                        >
                          Cancel
                        </button>
                      </div>

                      <canvas
                        ref={sigCanvasRef}
                        width={420}
                        height={150}
                        onPointerDown={handlePadPointerDown}
                        onPointerMove={handlePadPointerMove}
                        onPointerUp={handlePadPointerUp}
                        onPointerCancel={handlePadPointerUp}
                        className="w-full h-32 rounded-lg border border-slate-300 bg-white touch-none cursor-crosshair"
                      />

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={handleClearPad}
                          className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
                        >
                          Clear Pad
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyDrawnSignature}
                          className="min-h-[34px] px-3.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Use Drawn Signature</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* PIC of Professional Development & Principal Cards */}
                  {(
                    [
                      {
                        role: 'facilitator' as const,
                        title: 'PIC of Professional Development',
                        nameLabel: 'PIC of Professional Development Name',
                        namePlaceholder: 'e.g., Ms. Elena Vance, M.Ed.',
                        nameValue: draft.picPdName,
                        roleTitleValue: draft.picPdTitle,
                        defaultRoleTitle: 'PIC of Professional Development',
                        onNameChange: (val: string) =>
                          setDraft((prev) => ({ ...prev, picPdName: val })),
                        onTitleChange: (val: string) =>
                          setDraft((prev) => ({ ...prev, picPdTitle: val })),
                        dataUrl: draft.facilitatorSignatureDataUrl,
                        inputRef: facSigInputRef,
                        blockVisible: draft.elements.facilitatorBlock.visible,
                      },
                      {
                        role: 'principal' as const,
                        title: 'Principal',
                        nameLabel: 'Principal Name',
                        namePlaceholder: 'e.g., Dr. Ahmad Fauzi',
                        nameValue: draft.principalName,
                        roleTitleValue: draft.principalTitle,
                        defaultRoleTitle: 'Principal',
                        onNameChange: (val: string) =>
                          setDraft((prev) => ({ ...prev, principalName: val })),
                        onTitleChange: (val: string) =>
                          setDraft((prev) => ({ ...prev, principalTitle: val })),
                        dataUrl: draft.principalSignatureDataUrl,
                        inputRef: priSigInputRef,
                        blockVisible: draft.elements.principalBlock.visible,
                      },
                    ] as const
                  ).map((sig) => (
                    <div
                      key={sig.role}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-bold text-slate-900">
                          {sig.title}
                        </div>
                        {!sig.blockVisible && (
                          <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            Block hidden in Elements
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label
                            htmlFor={`modal-sig-name-${sig.role}`}
                            className="block text-[11px] font-semibold text-slate-700"
                          >
                            {sig.nameLabel}
                          </label>
                          <input
                            id={`modal-sig-name-${sig.role}`}
                            type="text"
                            maxLength={120}
                            value={sig.nameValue}
                            placeholder={sig.namePlaceholder}
                            onChange={(e) => sig.onNameChange(e.target.value)}
                            className="w-full min-h-[36px] px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                        <div className="space-y-1">
                          <label
                            htmlFor={`modal-sig-title-${sig.role}`}
                            className="block text-[11px] font-semibold text-slate-700"
                          >
                            Bottom Role Title
                          </label>
                          <input
                            id={`modal-sig-title-${sig.role}`}
                            type="text"
                            maxLength={120}
                            value={sig.roleTitleValue}
                            placeholder={sig.defaultRoleTitle}
                            onChange={(e) => sig.onTitleChange(e.target.value)}
                            className="w-full min-h-[36px] px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                          />
                        </div>
                      </div>

                      <div className="h-20 rounded-lg border border-dashed border-slate-300 bg-white flex items-center justify-center p-2 overflow-hidden">
                        {sig.dataUrl ? (
                          <img
                            src={sig.dataUrl}
                            alt={sig.title}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-xs text-slate-400">
                            No signature attached yet
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={processingAsset}
                          onClick={() => sig.inputRef.current?.click()}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Upload className="w-3.5 h-3.5 text-blue-700" />
                          <span>Upload Signature</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDrawingFor(sig.role);
                            window.setTimeout(() => handleClearPad(), 0);
                          }}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
                        >
                          <PenTool className="w-3.5 h-3.5 text-blue-700" />
                          <span>Draw Signature</span>
                        </button>
                        {sig.dataUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                ...(sig.role === 'facilitator'
                                  ? { facilitatorSignatureDataUrl: '' }
                                  : { principalSignatureDataUrl: '' }),
                              }))
                            }
                            className="min-h-[34px] px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-semibold text-rose-700 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Clear</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer Save Actions */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || processingAsset}
                onClick={() => void onSave(draft)}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition-colors inline-flex items-center gap-2 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{saving ? 'Saving Design...' : 'Save Certificate Design'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
