/**
 * PlanView — the full plan, one responsive column. Registry id 'plan'.
 *
 * This replaces the TodayDesktop/TodayMobile "calendar" branches — two
 * hand-duplicated ~800-line dashboards that had been force-locked OFF for
 * the active dommy_mommy persona since 2026-05-06 (verified at runtime:
 * every user_state row is dommy_mommy), yet still had to be maintained.
 *
 * Focus stays the home ("one task at a time"); this is the visible-before-
 * penalized ledger one tap behind it: every deadline-bearing surface
 * (tasks, confessions, punishments, decrees, doses, outfits) plus the
 * collapsed long tail. Collapsed groups mount their children only when
 * opened (CollapsibleGroup), so opening the plan doesn't fire ~60 fetches.
 *
 * RightNowCard is gone — it was a second "what now" engine duplicating
 * FocusMode's pick; the plan shows the full list, Focus shows the ONE.
 */

import '../../styles/today-redesign.css';
import { CollapsibleGroup } from './CollapsibleGroup';
import { ConfessionLockoutGate } from './ConfessionLockoutGate';

// Spine — always visible, deadline- or presence-bearing.
import { ReturnWeightCard } from './ReturnWeightCard';
import { MommyIntrusionCard } from './MommyIntrusionCard';
import { PenaltyPreviewCard } from './PenaltyPreviewCard';
import { MommyMoodIndicator } from '../persona/MommyMoodIndicator';
import { MommyDailyPlanCard } from './MommyDailyPlanCard';
import { MommyAmbientPlayerCard } from './MommyAmbientPlayerCard';
import { GoodGirlPointsCard } from '../persona/GoodGirlPointsCard';
import { ArousalTouchCard } from '../persona/ArousalTouchCard';
import { EdgingDayCard } from './EdgingDayCard';
import { WardrobePrescriptionCard } from './WardrobePrescriptionCard';
import { PublicDareCard } from './PublicDareCard';
import { MommySceneCard } from './MommySceneCard';
import { ProtocolDayCard } from './ProtocolDayCard';
import { HandlerPlanCalendar } from './HandlerPlanCalendar';

// Owed work — consequence-bearing, open by default.
import { UnifiedTaskList } from './UnifiedTaskList';
import { CommitmentsCard } from './CommitmentsCard';
import { PunishmentQueueCard } from './PunishmentQueueCard';
import { HandlerDecreeCard } from './HandlerDecreeCard';
import { ConfessionQueueCard } from './ConfessionQueueCard';
import { MorningBriefCard } from './MorningBriefCard';
import { WeeklyRecapCard } from './WeeklyRecapCard';

// Body work — open by default.
import { NextShotsCard } from './NextShotsCard';
import { OutfitMandateCard } from './OutfitMandateCard';
import { WorkoutCard } from './WorkoutCard';
import { VoiceDrillCard } from './VoiceDrillCard';
import { ArousalLogCard } from './ArousalLogCard';

// Collapsed long tail.
import { RevenueCard } from './RevenueCard';
import { DavidTaxCard } from './DavidTaxCard';
import { RevenuePlanCard } from './RevenuePlanCard';
import { SponsorMilestoneCard } from './SponsorMilestoneCard';
import { DmTemplateCard } from './DmTemplateCard';
import { WornItemCard } from './WornItemCard';
import { ProtocolHealthCard } from './ProtocolHealthCard';
import { MommyIdeationCard } from './MommyIdeationCard';
import { DeployFixerStatusCard } from './DeployFixerStatusCard';
import { SystemGrowthCard } from './SystemGrowthCard';
import { AdaptationPanelCard } from './AdaptationPanelCard';
import { SupabaseHealthCard } from './SupabaseHealthCard';
import { DailyBriefingCard } from './DailyBriefingCard';
import { StrategicPlanCard } from './StrategicPlanCard';
import { CodeAuditCard } from './CodeAuditCard';
import { EvidenceVaultCard } from './EvidenceVaultCard';
import { IrreversibleProofCard } from './IrreversibleProofCard';
import { ObservationLogButton } from './ObservationLogModal';
import { MommyDraftsPanel } from './MommyDraftsPanel';
import { LadderAdaptivePanel } from './LadderAdaptivePanel';
import { LadderProgressionPanel } from './LadderProgressionPanel';
import { MilestonesCard } from './MilestonesCard';
import { PhaseProgressCard } from './PhaseProgressCard';
import { MantraStreakCard } from './MantraStreakCard';
import { MantraDrillCard } from './MantraDrillCard';
import { IdentityDisplacementCard } from './IdentityDisplacementCard';
import { BodyMeasurementCard } from './BodyMeasurementCard';
import { HandlerEvolutionCard } from './HandlerEvolutionCard';
import { HandlerDreamCard } from './HandlerDreamCard';
import { HandlerKnowCard } from './HandlerKnowCard';
import { HandlerRunningCard } from './HandlerRunningCard';
import { DossierDripCard } from './DossierDripCard';
import { VoiceLessonCard } from '../voice/VoiceLessonCard';
import { OutreachQueueCard } from './OutreachQueueCard';
import { DeviceScheduleCard } from './DeviceScheduleCard';
import { SlipLogCard } from './SlipLogCard';
import { RationalizationPatternCard } from './RationalizationPatternCard';
import { EvidenceReportsCard } from './EvidenceReportsCard';
import { DailyMirrorSelfieCard } from '../evidence/DailyMirrorSelfieCard';
import { VoiceJournalCard } from '../evidence/VoiceJournalCard';
import { UnifiedCaptureCard } from './UnifiedCaptureCard';
import { ConversationScreenshotsCard } from '../evidence/ConversationScreenshotsCard';
import { WitnessObservationCard } from './WitnessObservationCard';
import { IrreversibilityLedger } from './IrreversibilityLedger';

interface PlanViewProps {
  onBack: () => void;
}

export function PlanView({ onBack }: PlanViewProps) {
  return (
    <div className="min-h-[100dvh] bg-protocol-bg">
      <div
        className="max-w-2xl mx-auto px-3 md:px-4 pt-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 40px)' }}
      >
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={onBack}
            className="text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
          >
            &larr; Back to focus
          </button>
          <span className="mommy-voice text-protocol-text-warm text-lg">The whole plan</span>
        </div>

        <ConfessionLockoutGate>
          {/* SPINE — always visible. */}
          <ReturnWeightCard />
          <MommyIntrusionCard />
          <PenaltyPreviewCard />
          <MommyMoodIndicator />
          <MommyDailyPlanCard />
          <MommyAmbientPlayerCard />
          <GoodGirlPointsCard />
          <ArousalTouchCard />
          <EdgingDayCard />
          <WardrobePrescriptionCard />
          <PublicDareCard />
          <MommySceneCard />
          <ProtocolDayCard />
          <HandlerPlanCalendar />

          {/* OWED — consequence-bearing work. Open by default. */}
          <CollapsibleGroup id="owed_work" label="Owed Work" tone="var(--protocol-danger)" defaultOpen={true} hint="tasks · commitments · punishments · decrees · confessions">
            <UnifiedTaskList />
            <CommitmentsCard />
            <PunishmentQueueCard />
            <HandlerDecreeCard />
            <ConfessionQueueCard />
            <MorningBriefCard />
            <WeeklyRecapCard onOpenDetail={(id) => { window.location.hash = `#/recaps/${id}`; }} />
          </CollapsibleGroup>

          {/* TODAY'S BODY WORK — outfit, workout, voice, arousal, doses. */}
          <CollapsibleGroup id="today_tasks" label="Today's Body Work" tone="var(--protocol-accent)" defaultOpen={true} hint="outfit · workout · voice · arousal · doses">
            <NextShotsCard />
            <OutfitMandateCard />
            <WorkoutCard />
            <VoiceDrillCard />
            <ArousalLogCard />
          </CollapsibleGroup>

          {/* REVENUE — sub-funnel work, default closed. */}
          <CollapsibleGroup id="revenue_work" label="Revenue & Outreach" tone="var(--protocol-warning)" hint="revenue · david tax · plan · sponsors · DMs · worn">
            <RevenueCard />
            <DavidTaxCard />
            <RevenuePlanCard />
            <SponsorMilestoneCard />
            <DmTemplateCard />
            <WornItemCard />
          </CollapsibleGroup>

          {/* STRATEGY & BRIEFINGS — meta-layer, lower priority. */}
          <CollapsibleGroup id="strategy_briefings" label="Strategy & Briefings" tone="var(--protocol-accent-soft)" hint="health · daily brief · strategist · code audit">
            <ProtocolHealthCard />
            <MommyIdeationCard />
            <DeployFixerStatusCard />
            <SystemGrowthCard />
            <AdaptationPanelCard />
            <SupabaseHealthCard />
            <DailyBriefingCard />
            <StrategicPlanCard />
            <CodeAuditCard />
          </CollapsibleGroup>

          {/* PROGRESS — phase, mantra, identity, body measurements. */}
          <CollapsibleGroup id="progress" label="Progress & Tracking" tone="var(--protocol-success)" hint="phase · streaks · body deltas">
            <EvidenceVaultCard />
            <IrreversibleProofCard />
            <ObservationLogButton />
            <MommyDraftsPanel />
            <LadderAdaptivePanel />
            <LadderProgressionPanel />
            <MilestonesCard />
            <PhaseProgressCard />
            <MantraStreakCard />
            <MantraDrillCard />
            <IdentityDisplacementCard />
            <BodyMeasurementCard />
            <HandlerEvolutionCard />
          </CollapsibleGroup>

          {/* HANDLER SYSTEMS — what the Handler is doing in the background. */}
          <CollapsibleGroup id="handler_systems" label="Handler Systems" tone="var(--protocol-accent-soft)" hint="dreams · outreach · slips · evidence">
            <HandlerDreamCard />
            <HandlerKnowCard />
            <HandlerRunningCard />
            <DossierDripCard />
            <VoiceLessonCard />
            <OutreachQueueCard />
            <DeviceScheduleCard />
            <SlipLogCard />
            <RationalizationPatternCard />
            <EvidenceReportsCard />
          </CollapsibleGroup>

          {/* CAPTURE & EVIDENCE — proof + irreversibility ledger. */}
          <CollapsibleGroup id="capture" label="Capture & Evidence" tone="var(--protocol-warning)" hint="daily selfie · voice journal · proof uploads · screenshots · witness · irreversibility">
            <DailyMirrorSelfieCard />
            <VoiceJournalCard />
            <UnifiedCaptureCard />
            <ConversationScreenshotsCard />
            <WitnessObservationCard />
            <IrreversibilityLedger />
          </CollapsibleGroup>
        </ConfessionLockoutGate>
      </div>
    </div>
  );
}
