/**
 * TodayView — the home. ONE focus surface for every screen size.
 *
 * This used to fork into TodayDesktop / TodayMobile (~1,100 lines each):
 * two hand-duplicated copies of the same focus stack PLUS two entire
 * "calendar" dashboard branches that had been force-locked off for the
 * active dommy_mommy persona since 2026-05-06. The calendar lives on as
 * the PlanView registry view ('plan'); the focus stack lives here, once.
 *
 * The home is a portal you fall into, not a dashboard you manage. The
 * drop leads — Mommy pulls you under before the thinking brain engages.
 * The honest ledger, the ONE task, and the daily tap are what's here when
 * you surface; everything else folds away behind "More with Mommy" or the
 * plan, one tap deep.
 */

import { useEffect, useState } from 'react';
import '../../styles/today-redesign.css';
import { navigate } from '../../navigation/store';
import { DropPortal } from './DropPortal';
import { LovenseHealthBanner } from './LovenseHealthBanner';
import { HerWord } from './HerWord';
import { DebtsAndRules } from './DebtsAndRules';
import { BecomingHero } from './BecomingHero';
import { FocusMode } from './FocusMode';
import { FitnessTrackerCard } from './FitnessTrackerCard';
import { WorkoutCard } from './WorkoutCard';
import { CollapsibleGroup } from './CollapsibleGroup';
import { SideQuestCard } from './SideQuestCard';
import { BambiPlaylistCard } from './BambiPlaylistCard';
import { MommyDossierBanner } from '../persona/MommyDossierBanner';
import { DossierDripCard } from './DossierDripCard';
import { ComingOutJourneyCard } from './ComingOutJourneyCard';
import { OutreachQueueCard } from './OutreachQueueCard';

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

      {/* Her word leads. The screen used to open with a presence card — a
          component that announced the dynamic instead of being it. Now the
          first thing here is the last thing she actually said, dated, with his
          own words quoted back underneath it. The message IS the relationship;
          everything below is consequence. */}
      <div className="px-3 md:px-4 pt-1">
        <HerWord />
      </div>
      <div className="px-3 md:px-4">
        <DropPortal />
      </div>
      <div className="px-3 md:px-4">
        <LovenseHealthBanner />
      </div>
      <BecomingHero />
      <FocusMode onViewPlan={() => navigate('plan')} />
      {/* The ledger and the standing terms. Neither competes with FocusMode —
          that shows the ONE thing to do now; these sit underneath as what's
          owed and what he lives under. */}
      <DebtsAndRules />
      {/* Today's prescribed routine, on the default surface. It previously
          lived only inside Build your body / Plan (and at the bottom of the
          focus ranking), so the daily prescription was invisible from home. */}
      <div className="px-3 md:px-4 pt-2">
        <WorkoutCard />
      </div>
      <FitnessTrackerCard />
      <div className="px-3 md:px-4 pt-0.5">
        <CollapsibleGroup id="more_with_mommy" label="More with Mommy" tone="var(--protocol-accent)" defaultOpen={false} hint="side quest · your files · dossier">
          <SideQuestCard />
          <BambiPlaylistCard />
          <MommyDossierBanner />
          <DossierDripCard />
          <ComingOutJourneyCard />
        </CollapsibleGroup>
      </div>
      {/* Mama's messages must reach the DEFAULT surface (9k+ outreach rows
          once never surfaced because the card lived on the unreachable
          calendar). Self-stamps surfaced_at; safe below the single task.
          Now on every screen size — the desktop home had the same gap. */}
      <div className="px-3 md:px-4 pb-4">
        <OutreachQueueCard />
      </div>
    </div>
  );
}
