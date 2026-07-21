/**
 * TodayView — the home, stripped to the body program (operator order,
 * 2026-07-21: "hide everything in the UI and only show me this").
 *
 * The full focus-stack home (HerWord / DropPortal / FocusMode / ledger /
 * legacy WorkoutCard / More-with-Mommy / outreach) lives in git history at
 * cf23f22^ — restore by reverting this file. Until then the only thing on
 * the default surface is the train-day arc: her voice → warm-up → the work
 * → cooldown → the shot (BodyProgramCard).
 *
 * The settings/menu button stays — the exit is never hidden.
 */

import { useEffect, useState } from 'react';
import '../../styles/today-redesign.css';
import { navigate } from '../../navigation/store';
import { BodyProgramCard } from './BodyProgramCard';

interface TodayViewProps {
  onExit?: () => void;
}

export function TodayView(_props: TodayViewProps) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const openSettings = () => navigate(null);

  return (
    <div
      className="max-w-[720px] mx-auto"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 8px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 24px)',
      }}
    >
      {isMobile && (
        <div className="relative px-3">
          <button
            onClick={openSettings}
            aria-label="menu and settings"
            className="absolute top-0 right-3 z-[5] w-8 h-8 rounded-lg border border-protocol-surface-light text-protocol-text-muted flex items-center justify-center bg-transparent cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      )}

      <div className="pt-10 md:pt-4">
        <BodyProgramCard />
      </div>
    </div>
  );
}
