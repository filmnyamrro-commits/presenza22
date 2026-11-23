/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminConsole, { type AdminSectionTab } from './components/AdminConsole';
import ErrorBoundary from './components/ErrorBoundary';
import ParticipantCheckIn from './components/ParticipantCheckIn';
import ParticipantFeedback from './components/ParticipantFeedback';
import { auth, db, reportFirestoreError } from './firebase';
import { OperationType, type OrganizationBranding } from './types';
import { sanitizeEventIdParam } from './utils/qrUrl';

type ViewMode = 'checkin' | 'feedback' | 'admin';

const PRESENZA_NATIVE_LOGO_URL =
  '/assets/aistudio/Logo_Presenza__Kehadiran_Cerdas_Beraksen_Emas_259b7478.png';

function readInitialEventId(): string | null {
  const params = new URLSearchParams(window.location.search);
  const queryEvent = sanitizeEventIdParam(params.get('event'));
  if (queryEvent) return queryEvent;
  if (window.location.hash.startsWith('#event=')) {
    return sanitizeEventIdParam(
      decodeURIComponent(window.location.hash.slice('#event='.length))
    );
  }
  return null;
}

function readAdminSectionFromLocation(): AdminSectionTab {
  if (window.location.hash === '#admin/live-board') return 'live-board';
  if (window.location.hash === '#admin/feedback') return 'feedback';
  if (window.location.hash === '#admin/certificates') return 'certificates';
  if (window.location.hash === '#admin/voice') return 'voice';
  return 'attendance';
}

function isAdminLocation(): boolean {
  const path = window.location.pathname.replace(/\/+$/, '');
  return (
    window.location.hash.startsWith('#admin') ||
    path === '/admin'
  );
}

function isFeedbackQueryLocation(): boolean {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/\/+$/, '');
  return (
    params.get('view') === 'feedback' ||
    path === '/feedback' ||
    window.location.hash === '#feedback'
  );
}

function readInitialView(): ViewMode {
  const hasQrEvent = Boolean(readInitialEventId());
  if (hasQrEvent) {
    return isFeedbackQueryLocation() ? 'feedback' : 'checkin';
  }
  if (isFeedbackQueryLocation()) {
    return 'feedback';
  }
  if (isAdminLocation()) {
    return 'admin';
  }
  // Default landing dashboard before sign-in enters Sign-In Mode
  return 'admin';
}

export default function App() {
  const [view, setView] = useState<ViewMode>(readInitialView);
  const [adminSection, setAdminSection] = useState<AdminSectionTab>(
    readAdminSectionFromLocation
  );
  const [requestedEventId, setRequestedEventId] = useState<string | null>(
    readInitialEventId
  );
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [branding, setBranding] = useState<OrganizationBranding | null>(null);
  const [serverPublicAppUrl, setServerPublicAppUrl] = useState('');

  // When a participant enters via QR link (/?event=<id> or /?view=feedback&event=<id>), hide Admin menu controls
  const isQrParticipantView = Boolean(requestedEventId);
  // Before user sign-in on non-QR visits, lock Check-In, Feedback & Evaluation, and Certificates to Sign-In Mode
  const isLockedToSignIn = !isQrParticipantView && !user;
  const effectiveView: ViewMode = isLockedToSignIn ? 'admin' : view;

  useEffect(() => {
    let active = true;
    fetch('/api/public/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { publicAppUrl?: string } | null) => {
        if (active && data && typeof data.publicAppUrl === 'string' && data.publicAppUrl.trim()) {
          setServerPublicAppUrl(data.publicAppUrl.trim());
        }
      })
      .catch(() => {
        // Ignore when static hosting does not expose /api/public/config
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      doc(db, 'branding', 'default'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as {
            organizationName?: string;
            logoDataUrl?: string;
            publicAppUrl?: string;
          };
          setBranding({
            organizationName: (data.organizationName || '').trim(),
            logoDataUrl: data.logoDataUrl || '',
            publicAppUrl:
              typeof data.publicAppUrl === 'string'
                ? data.publicAppUrl.trim()
                : '',
          });
        } else {
          setBranding(null);
        }
      },
      (error) => {
        reportFirestoreError(error, OperationType.GET, 'branding/default');
      }
    );
    return () => unsubscribe();
  }, []);

  const effectiveBranding: OrganizationBranding | null =
    branding || serverPublicAppUrl
      ? {
          organizationName: branding?.organizationName || '',
          logoDataUrl: branding?.logoDataUrl || '',
          publicAppUrl: branding?.publicAppUrl || serverPublicAppUrl || '',
        }
      : null;

  useEffect(() => {
    const syncFromLocation = () => {
      const ev = readInitialEventId();
      setRequestedEventId(ev);
      if (ev) {
        setView(isFeedbackQueryLocation() ? 'feedback' : 'checkin');
      } else if (isFeedbackQueryLocation()) {
        setView('feedback');
      } else if (isAdminLocation()) {
        setView('admin');
        setAdminSection(readAdminSectionFromLocation());
      } else {
        setView('admin');
      }
    };
    window.addEventListener('hashchange', syncFromLocation);
    window.addEventListener('popstate', syncFromLocation);
    return () => {
      window.removeEventListener('hashchange', syncFromLocation);
      window.removeEventListener('popstate', syncFromLocation);
    };
  }, []);

  const navigateToView = (
    nextView: ViewMode,
    nextAdminSection?: AdminSectionTab
  ) => {
    if (isLockedToSignIn && nextView !== 'admin') {
      return;
    }
    if (isLockedToSignIn && nextAdminSection === 'certificates') {
      return;
    }
    setView(nextView);
    if (nextView === 'admin') {
      const targetSec = isLockedToSignIn
        ? 'attendance'
        : nextAdminSection ?? adminSection;
      setAdminSection(targetSec);
      const hash =
        targetSec === 'live-board'
          ? '#admin/live-board'
          : targetSec === 'feedback'
          ? '#admin/feedback'
          : targetSec === 'certificates'
          ? '#admin/certificates'
          : targetSec === 'voice'
          ? '#admin/voice'
          : '#admin';
      window.history.replaceState(null, '', `/${hash}`);
    } else if (nextView === 'feedback') {
      const search = requestedEventId
        ? `?view=feedback&event=${encodeURIComponent(requestedEventId)}`
        : '?view=feedback';
      window.history.replaceState(null, '', `/${search}`);
    } else {
      const search = requestedEventId
        ? `?event=${encodeURIComponent(requestedEventId)}`
        : '';
      window.history.replaceState(null, '', `/${search}`);
    }
  };

  const handleSelectEventId = (eventId: string | null) => {
    if (isLockedToSignIn && !eventId) {
      navigateToView('admin', 'attendance');
      return;
    }
    setRequestedEventId(eventId);
    setView('checkin');
    const nextUrl = eventId ? `/?event=${encodeURIComponent(eventId)}` : '/';
    window.history.replaceState(null, '', nextUrl);
  };

  const handleOpenFeedbackEvent = (eventId?: string | null) => {
    const targetId = eventId ?? null;
    if (isLockedToSignIn && !targetId) {
      navigateToView('admin', 'attendance');
      return;
    }
    setRequestedEventId(targetId);
    setView('feedback');
    const nextUrl = targetId
      ? `/?view=feedback&event=${encodeURIComponent(targetId)}`
      : '/?view=feedback';
    window.history.replaceState(null, '', nextUrl);
  };

  const orgName = branding?.organizationName?.trim() || '';
  const logoUrl = branding?.logoDataUrl || '';

  return (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                if (!isQrParticipantView) {
                  setRequestedEventId(null);
                }
                if (isLockedToSignIn) {
                  navigateToView('admin', 'attendance');
                  return;
                }
                navigateToView(
                  effectiveView === 'feedback' && isQrParticipantView
                    ? 'feedback'
                    : 'checkin'
                );
              }}
              className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 md:flex-initial"
            >
              <img
                src={logoUrl || PRESENZA_NATIVE_LOGO_URL}
                alt={orgName ? `${orgName} logo` : 'PRESENZA logo'}
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg object-contain bg-white border border-slate-200 p-0.5 shrink-0"
              />
              <div className="min-w-0 flex flex-col leading-tight">
                {orgName ? (
                  <>
                    <span className="font-display text-sm sm:text-base font-extrabold tracking-tight text-slate-900 truncate max-w-full sm:max-w-[280px]">
                      {orgName}
                    </span>
                    <span className="text-[11px] font-bold tracking-wider text-blue-700 uppercase">
                      PRESENZA
                    </span>
                  </>
                ) : (
                  <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
                    PRESENZA
                  </span>
                )}
              </div>
            </a>

            {isQrParticipantView ? (
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSelectEventId(requestedEventId)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    effectiveView === 'checkin'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  Check-In
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenFeedbackEvent(requestedEventId)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    effectiveView === 'feedback'
                      ? 'bg-blue-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="sm:hidden">Feedback</span>
                  <span className="hidden sm:inline">Feedback &amp; Evaluation</span>
                </button>
              </div>
            ) : (
              <>
                <nav
                  className="hidden md:flex items-center gap-5 text-sm font-medium"
                  aria-label="Primary navigation"
                >
                  <button
                    type="button"
                    disabled={isLockedToSignIn}
                    aria-disabled={isLockedToSignIn}
                    title={
                      isLockedToSignIn
                        ? 'Sign in to unlock Participant Check-In'
                        : undefined
                    }
                    onClick={() => navigateToView('checkin')}
                    className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                      isLockedToSignIn
                        ? 'border-transparent text-slate-400 cursor-not-allowed'
                        : effectiveView === 'checkin'
                        ? 'border-blue-700 text-slate-900 font-semibold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isLockedToSignIn && (
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span>Participant Check-In</span>
                  </button>
                  <button
                    type="button"
                    disabled={isLockedToSignIn}
                    aria-disabled={isLockedToSignIn}
                    title={
                      isLockedToSignIn
                        ? 'Sign in to unlock Feedback & Evaluation'
                        : undefined
                    }
                    onClick={() => navigateToView('feedback')}
                    className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                      isLockedToSignIn
                        ? 'border-transparent text-slate-400 cursor-not-allowed'
                        : effectiveView === 'feedback'
                        ? 'border-blue-700 text-slate-900 font-semibold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isLockedToSignIn && (
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span>Feedback &amp; Evaluation</span>
                  </button>
                  <button
                    type="button"
                    disabled={isLockedToSignIn}
                    aria-disabled={isLockedToSignIn}
                    title={
                      isLockedToSignIn
                        ? 'Sign in to unlock Certificates & Recognition'
                        : undefined
                    }
                    onClick={() => navigateToView('admin', 'certificates')}
                    className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 ${
                      isLockedToSignIn
                        ? 'border-transparent text-slate-400 cursor-not-allowed'
                        : effectiveView === 'admin' && adminSection === 'certificates'
                        ? 'border-amber-600 text-slate-900 font-semibold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isLockedToSignIn && (
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span>Certificates &amp; Recognition</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToView('admin', 'attendance')}
                    className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                      effectiveView === 'admin' &&
                      (isLockedToSignIn || adminSection !== 'certificates')
                        ? 'border-blue-700 text-slate-900 font-semibold'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {isLockedToSignIn ? 'Sign In' : 'Admin Console'}
                  </button>
                </nav>

                <div className="flex items-center shrink-0">
                  {isLockedToSignIn ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Sign-In Mode</span>
                    </span>
                  ) : effectiveView !== 'admin' ? (
                    <button
                      type="button"
                      onClick={() => navigateToView('admin', 'attendance')}
                      className="min-h-[40px] px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      Admin Console
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigateToView('checkin')}
                      className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      Check-In Form
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Mobile Quick Nav Bar when not in QR lock */}
          {!isQrParticipantView && (
            <div className="md:hidden border-t border-slate-100 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto bg-white">
              <button
                type="button"
                disabled={isLockedToSignIn}
                aria-disabled={isLockedToSignIn}
                onClick={() => navigateToView('checkin')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 ${
                  isLockedToSignIn
                    ? 'text-slate-400 bg-slate-50 cursor-not-allowed'
                    : effectiveView === 'checkin'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {isLockedToSignIn && (
                  <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                )}
                <span>Check-In</span>
              </button>
              <button
                type="button"
                disabled={isLockedToSignIn}
                aria-disabled={isLockedToSignIn}
                onClick={() => navigateToView('feedback')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 ${
                  isLockedToSignIn
                    ? 'text-slate-400 bg-slate-50 cursor-not-allowed'
                    : effectiveView === 'feedback'
                    ? 'bg-blue-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {isLockedToSignIn && (
                  <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                )}
                <span>Feedback &amp; Evaluation</span>
              </button>
              <button
                type="button"
                disabled={isLockedToSignIn}
                aria-disabled={isLockedToSignIn}
                onClick={() => navigateToView('admin', 'certificates')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 ${
                  isLockedToSignIn
                    ? 'text-slate-400 bg-slate-50 cursor-not-allowed'
                    : effectiveView === 'admin' && adminSection === 'certificates'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {isLockedToSignIn && (
                  <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                )}
                <span>Certificates &amp; Recognition</span>
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 relative z-10">
          {effectiveView === 'checkin' ? (
            <ParticipantCheckIn
              requestedEventId={requestedEventId}
              user={user}
              onSelectEventId={handleSelectEventId}
              onGoToFeedback={(eventId) => handleOpenFeedbackEvent(eventId)}
              onGoToAdmin={
                isQrParticipantView
                  ? undefined
                  : () => navigateToView('admin', 'attendance')
              }
            />
          ) : effectiveView === 'feedback' ? (
            <ParticipantFeedback
              requestedEventId={requestedEventId}
              user={user}
              onSelectEventId={(eventId) => handleOpenFeedbackEvent(eventId)}
              onGoToCheckIn={(eventId) =>
                handleSelectEventId(eventId ?? null)
              }
              onGoToAdmin={
                isQrParticipantView
                  ? undefined
                  : () => navigateToView('admin', 'feedback')
              }
            />
          ) : (
            <AdminConsole
              user={user}
              authReady={authReady}
              branding={effectiveBranding}
              activeSection={adminSection}
              onChangeSection={(sec) => {
                setAdminSection(sec);
                const hash =
                  sec === 'live-board'
                    ? '#admin/live-board'
                    : sec === 'feedback'
                    ? '#admin/feedback'
                    : sec === 'certificates'
                    ? '#admin/certificates'
                    : sec === 'voice'
                    ? '#admin/voice'
                    : '#admin';
                window.history.replaceState(null, '', `/${hash}`);
              }}
              onOpenCheckIn={(eventId) => handleSelectEventId(eventId)}
              onOpenFeedbackForm={(eventId) => handleOpenFeedbackEvent(eventId)}
            />
          )}
        </main>

        <footer className="relative z-10 border-t border-slate-200 bg-white/95 backdrop-blur-xs py-5 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 text-xs text-slate-500">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {orgName && (
                  <>
                    <span className="font-semibold text-slate-700">
                      {orgName}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                  </>
                )}
                <span className="font-display font-extrabold tracking-tight text-slate-900">
                  PRESENZA
                </span>
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                DIGITAL ATTENDANCE SYSTEM
              </div>
              <p className="text-xs font-semibold text-slate-800">
                Presence Made Simple.
              </p>
              <p className="text-xs text-slate-600">
                A smarter way to check in, track attendance, and stay connected.
              </p>
              <div className="pt-0.5 text-[11px] font-bold tracking-widest text-slate-500 uppercase">
                SMART • SIMPLE • SEAMLESS
              </div>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2 sm:text-right">
              <img
                src={PRESENZA_NATIVE_LOGO_URL}
                alt="PRESENZA Smart Attendance"
                className="h-14 sm:h-16 w-auto object-contain mix-blend-multiply"
              />
              <span>
                Instant QR attendance check-in &amp; evaluation · No participant login required
              </span>
            </div>
          </div>
        </footer>
        </div>
    </ErrorBoundary>
  );
}
