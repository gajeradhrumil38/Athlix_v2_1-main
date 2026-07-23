import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppIcon, IconName } from '../../config/icons';
import { AiChat } from '../ai/AiChat';
import { PostWorkoutCoachPill } from '../ai/PostWorkoutCoachPill';
import { ProgressBar } from './ProgressBar';
import { useAuth } from '../../contexts/AuthContext';

const navItems: { path: string; icon: IconName; label: string }[] = [
  { path: '/',          icon: 'Home',      label: 'Home'      },
  { path: '/calendar',  icon: 'Calendar',  label: 'Calendar'  },
  { path: '/log',       icon: 'Plus',      label: 'Log'       },
  { path: '/timeline',  icon: 'History',   label: 'Timeline'  },
  { path: '/progress',  icon: 'Trending',  label: 'Progress'  },
  { path: '/run',       icon: 'Run',       label: 'Run'       },
  { path: '/skincare',  icon: 'Skincare',  label: 'Skincare'  },
  { path: '/settings',  icon: 'Settings',  label: 'Settings'  },
];

// 4 items — center slot is the dedicated + FAB, not listed here
const mobileNavItems: { path: string; icon: IconName; label: string }[] = [
  { path: '/',         icon: 'Home',     label: 'Home'     },
  { path: '/progress', icon: 'Activity', label: 'Progress' },
  { path: '/run',      icon: 'Run',      label: 'Run'      },
  { path: '/calendar', icon: 'Calendar', label: 'Calendar' },
];

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const profileInitial = profile?.full_name?.trim().charAt(0).toUpperCase() || 'A';
  const [viewportHeight, setViewportHeight] = useState(
    typeof window === 'undefined' ? 0 : window.innerHeight,
  );
  const [tappedTab, setTappedTab] = useState<string | null>(null);
  const isImmersiveRoute = location.pathname === '/log' || location.pathname.startsWith('/run');
  const isHomeRoute = location.pathname === '/';
  const isHeaderlessRoute =
    location.pathname.startsWith('/calendar') ||
    location.pathname.startsWith('/settings');
  // Pages that manage their own internal padding — no wrapper padding needed
  const isSelfPaddedRoute =
    isHomeRoute ||
    location.pathname.startsWith('/calendar') ||
    location.pathname.startsWith('/progress') ||
    location.pathname.startsWith('/timeline') ||
    location.pathname.startsWith('/skincare');
  const swipeStartRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const tapTimerRef = useRef<number | null>(null);

  // Slot index in the 5-column nav (0,1 = left items; 2 = center +; 3,4 = right items)
  const activeNavSlot = useMemo(() => {
    const idx = mobileNavItems.findIndex((item) =>
      item.path === '/'
        ? location.pathname === '/'
        : location.pathname.startsWith(item.path),
    );
    if (idx === -1) return -1;
    // items 0,1 → slots 0,1 | items 2,3 → slots 3,4 (skip center slot 2)
    return idx < 2 ? idx : idx + 1;
  }, [location.pathname]);

  const currentPageLabel = useMemo(() => {
    if (location.pathname.startsWith('/settings/layout')) return 'Layout';
    if (location.pathname === '/') return 'Home';
    const route = navItems.find(
      (item) => item.path !== '/' && location.pathname.startsWith(item.path),
    );
    return route?.label || 'Athlix';
  }, [location.pathname]);

  const canGoBack = location.pathname !== '/';

  /* ── Viewport height (handles mobile browser chrome) ── */
  useEffect(() => {
    const update = () => {
      setViewportHeight(Math.round(window.visualViewport?.height || window.innerHeight));
    };
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    return () => { if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current); };
  }, []);

  // Mark <html> with lg-safari class so CSS can switch to the simplified SVG filter
  useEffect(() => {
    const ua = navigator.userAgent;
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua) || /iPad|iPhone|iPod/.test(ua);
    if (isSafari) document.documentElement.classList.add('lg-safari');
  }, []);

  /* ── Back navigation ─────────────────────────────────── */
  const handleBack = () => {
    if (!canGoBack) return;
    window.history.length > 1 ? navigate(-1) : navigate('/');
  };

  /* ── Left-edge swipe → back ──────────────────────────── */
  const handleTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (!canGoBack || e.touches.length !== 1) { swipeStartRef.current = null; return; }
    const touch = e.touches[0];
    if (touch.clientX > 28) { swipeStartRef.current = null; return; }
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY, ts: Date.now() };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = Math.abs(touch.clientY - start.y);
    const dt = Date.now() - start.ts;
    if (dx > 78 && dy < 56 && dt < 520) handleBack();
  };

  /* ── Tab tap feedback ───────────────────────────────── */
  const handleTabTap = (path: string) => {
    if (navigator.vibrate) navigator.vibrate(10);
    setTappedTab(path);
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    tapTimerRef.current = window.setTimeout(() => setTappedTab(null), 150);
  };

  return (
    <div
      className="flex bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden"
      style={viewportHeight > 0 ? { height: `${viewportHeight}px` } : undefined}
    >
      <ProgressBar />
      {/* ── Desktop sidebar ───────────────────────────── */}
      <aside
        className="hidden md:flex flex-col w-60 shrink-0"
        style={{ background: 'var(--bg-base)', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* Logo */}
        <div className="px-6 py-5 border-b border-[var(--border)]">
          <span
            className="text-[22px] font-black tracking-[0.10em] text-[var(--accent)]"
            style={{ fontFamily: '"Arial Black", sans-serif' }}
          >
            ATHLIX
          </span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/20'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                }`
              }
            >
              <AppIcon name={item.icon} size="md" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className="px-3 py-4 border-t border-[var(--border)] space-y-2">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('athlix:open-ai'))}
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-all duration-150"
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-lg shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
              </svg>
            </span>
            <span>AI Coach</span>
          </button>
          <p className="text-[11px] text-[var(--text-muted)] px-3">Track. Recover. Perform.</p>
        </div>
      </aside>

      {/* ── Mobile top header ─────────────────────────── */}
      {!isImmersiveRoute && !isHomeRoute && !isHeaderlessRoute && (
        <header
          className="md:hidden fixed top-0 left-0 right-0 z-[90] lg-nav"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            borderBottom: '1px solid rgba(255,255,255,0.10)',
          }}
        >
          <div className="flex h-[54px] items-center justify-between px-4">
            {/* Back button */}
            <button
              type="button"
              onClick={handleBack}
              disabled={!canGoBack}
              aria-label="Go back"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-all active:scale-95 disabled:opacity-30"
            >
              <AppIcon name="Back" size="md" />
            </button>

            {/* Page title */}
            <span className="text-[15px] font-semibold text-[var(--text-primary)] tracking-wide">
              {currentPageLabel}
            </span>

            {/* Profile avatar → Settings */}
            <button
              type="button"
              onClick={() => navigate('/settings')}
              aria-label="Open settings"
              className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-bold transition-all active:scale-95"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(200,255,0,0.25)' }}
            >
              {profileInitial}
            </button>
          </div>
        </header>
      )}

      {/* ── Main content ──────────────────────────────── */}
      <main
        className={`flex-1 flex flex-col h-full relative overflow-y-auto ${
          isImmersiveRoute
            ? ''
            : isHomeRoute
              ? 'pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-0'
              : isHeaderlessRoute
                ? 'pt-[env(safe-area-inset-top)] pb-[calc(88px+env(safe-area-inset-bottom))] md:pt-0 md:pb-0'
                : 'pt-[calc(54px+env(safe-area-inset-top))] pb-[calc(88px+env(safe-area-inset-bottom))] md:pt-0 md:pb-0'
        }`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`flex-1 w-full ${
            isImmersiveRoute || isSelfPaddedRoute
              ? ''
              : 'pt-4 pb-6 md:px-8 md:pt-8 md:pb-8'
          }`}
        >
          <Outlet />
        </div>
      </main>

      {/* ── AI Chat ──────────────────────────────────── */}
      {!isImmersiveRoute && <AiChat />}
      {/* PostWorkoutCoachPill now owns the floating AI-entry-point FAB too
          (idle state), replacing the standalone button that used to live here. */}
      <PostWorkoutCoachPill />

      {/* ── Mobile bottom nav ─────────────────────────── */}
      {!isImmersiveRoute && (
        <>
          {/* Distortion + blur zone above the pill — warps content entering the glass */}
          <div
            className="md:hidden fixed left-3 right-3 z-[97] pointer-events-none"
            style={{
              bottom: 'calc(76px + env(safe-area-inset-bottom))',
              height: 40,
              borderRadius: '20px 20px 0 0',
              backdropFilter: 'blur(18px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(18px) saturate(1.6)',
              maskImage: 'linear-gradient(to bottom, transparent, black)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black)',
            }}
          />
          {/* Dark scrim that fades page content into the blur zone */}
          <div
            className="md:hidden fixed left-0 right-0 z-[96] pointer-events-none"
            style={{
              bottom: 'calc(76px + env(safe-area-inset-bottom))',
              height: 56,
              background: 'linear-gradient(to bottom, transparent, rgba(3,5,8,0.88))',
            }}
          />

          {/* Floating liquid-glass pill nav */}
          <nav
            className="md:hidden fixed left-3 right-3 z-[98]"
            style={{ bottom: 'calc(10px + env(safe-area-inset-bottom))' }}
          >
            <div
              className="relative flex h-[66px] w-full items-center rounded-[33px]"
              style={{ overflow: 'visible' }}
            >
              {/* Glass shell — clips all layers to pill shape */}
              <div
                aria-hidden="true"
                className="pointer-events-none"
                style={{
                  position: 'absolute', inset: 0,
                  borderRadius: 33,
                  overflow: 'hidden',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.40), 0 0 0 1px rgba(255,255,255,0.06)',
                }}
              >
                {/* Layer 1 — backdrop blur + liquid displacement */}
                <div className="lg-distortion" />
                {/* Layer 2 — dark tint */}
                <div style={{ position: 'absolute', inset: 0, background: 'var(--lg-nav-bg)' }} />
              </div>
                  {/* Sliding active indicator — spans all 5 slots (20% each) */}
              {activeNavSlot >= 0 && (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 7,
                    bottom: 7,
                    left: `calc(${activeNavSlot * 20}% + 5px)`,
                    width: 'calc(20% - 10px)',
                    background: 'transparent',
                    borderRadius: 9999,
                    border: '1px solid rgba(255, 255, 255, 0.10)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
                    transition: 'left 0.40s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    pointerEvents: 'none',
                    zIndex: 0,
                  }}
                />
              )}

              {/* Left 2 nav items */}
              {mobileNavItems.slice(0, 2).map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => handleTabTap(item.path)}
                  className="relative flex flex-1 flex-col items-center justify-center gap-[4px] h-full"
                  style={{ zIndex: 1 }}
                >
                  {({ isActive }) => (
                    <>
                      <span style={{
                        display: 'block',
                        color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.40)',
                        filter: isActive ? 'drop-shadow(0 0 5px rgba(200,255,0,0.45))' : 'none',
                        transform: tappedTab === item.path ? 'scale(0.84)' : isActive ? 'scale(1.06)' : 'scale(1)',
                        transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), filter 0.22s ease, color 0.22s ease',
                      }}>
                        <AppIcon name={item.icon} size="lg" />
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: isActive ? 600 : 500, letterSpacing: '0.15px', lineHeight: 1, color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.38)', transition: 'color 0.22s ease' }}>
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}

              {/* Center + FAB slot — circle protrudes above the pill */}
              <div className="relative flex flex-1 items-center justify-center" style={{ zIndex: 2 }}>
                <NavLink
                  to="/log?plan=1"
                  onClick={() => { if (navigator.vibrate) navigator.vibrate(15); }}
                  aria-label="Start workout"
                  style={{
                    position: 'absolute',
                    top: '-22px',
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(200,255,0,0.45), 0 0 0 3px rgba(200,255,0,0.15)',
                    transition: 'transform 0.15s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.15s ease',
                  }}
                  className="active:scale-90"
                >
                  <AppIcon name="Plus" size="lg" />
                </NavLink>
              </div>

              {/* Right 2 nav items */}
              {mobileNavItems.slice(2, 4).map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => handleTabTap(item.path)}
                  className="relative flex flex-1 flex-col items-center justify-center gap-[4px] h-full"
                  style={{ zIndex: 1 }}
                >
                  {({ isActive }) => (
                    <>
                      <span style={{
                        display: 'block',
                        color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.40)',
                        filter: isActive ? 'drop-shadow(0 0 5px rgba(200,255,0,0.45))' : 'none',
                        transform: tappedTab === item.path ? 'scale(0.84)' : isActive ? 'scale(1.06)' : 'scale(1)',
                        transition: 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1), filter 0.22s ease, color 0.22s ease',
                      }}>
                        <AppIcon name={item.icon} size="lg" />
                      </span>
                      <span style={{ fontSize: '10px', fontWeight: isActive ? 600 : 500, letterSpacing: '0.15px', lineHeight: 1, color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.38)', transition: 'color 0.22s ease' }}>
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        </>
      )}

      {/* ── Toast notifications ───────────────────────── */}
      <Toaster
        position="top-center"
        gutter={8}
        toastOptions={{
          duration: 3000,
          style: {
            background: 'rgba(28, 28, 32, 0.94)',
            backdropFilter: 'blur(40px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
            color: 'var(--text-primary)',
            border: '1px solid rgba(255, 255, 255, 0.13)',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: 500,
            padding: '10px 14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.40), 0 1px 0 rgba(255,255,255,0.07) inset',
          },
          success: {
            iconTheme: { primary: 'var(--accent)', secondary: '#000' },
          },
          error: {
            iconTheme: { primary: 'var(--red)', secondary: '#fff' },
          },
        }}
      />
    </div>
  );
};
