/**
 * TodayDesktop — Direction A, refined dark cinematic. Fixed 180px left rail
 * + content stack: banner, page header, 4-col stat grid, 3 card rows, full-width
 * aesthetic target. All data real-time via useTodayData.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/today-redesign.css';
import { useTodayData } from './useTodayData';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { ConditioningOverlay, morphPronouns } from './ConditioningOverlay';
import { LovenseHealthBanner } from './LovenseHealthBanner';
import { WitnessObservationCard } from './WitnessObservationCard';
import { IrreversibilityLedger } from './IrreversibilityLedger';
import { HandlerRunningCard } from './HandlerRunningCard';
import { GinaCaptureCard } from './GinaCaptureCard';
import { GinaWindowIndicator } from './GinaWindowIndicator';
import { CommitmentsCard } from './CommitmentsCard';
import { GinaPlaybookCard } from './GinaPlaybookCard';
import { BodyMeasurementCard } from './BodyMeasurementCard';
import { HandlerEvolutionCard } from './HandlerEvolutionCard';
import { UnifiedCaptureCard } from './UnifiedCaptureCard';
import { ConversationScreenshotsCard } from '../evidence/ConversationScreenshotsCard';
import { DailyMirrorSelfieCard } from '../evidence/DailyMirrorSelfieCard';
import { VoiceJournalCard } from '../evidence/VoiceJournalCard';
import { DisclosureDraftsCard } from './DisclosureDraftsCard';
import { ProtocolDayCard } from './ProtocolDayCard';
import { HandlerKnowCard } from './HandlerKnowCard';
import { ComingOutVaultCard } from './ComingOutVaultCard';
import { EvidenceReportsCard } from './EvidenceReportsCard';
import { PhaseProgressCard } from './PhaseProgressCard';
import { VoiceDrillCard } from './VoiceDrillCard';
import { OutfitMandateCard } from './OutfitMandateCard';
import { WorkoutCard } from './WorkoutCard';
import { ConfessionQueueCard } from './ConfessionQueueCard';
import { HandlerDecreeCard } from './HandlerDecreeCard';
import { UnifiedTaskList } from './UnifiedTaskList';
import { RevenueCard } from './RevenueCard';
import { CollapsibleGroup } from './CollapsibleGroup';
import { DavidTaxCard } from './DavidTaxCard';
import { RevenuePlanCard } from './RevenuePlanCard';
import { NextShotsCard } from './NextShotsCard';
import { SponsorMilestoneCard } from './SponsorMilestoneCard';
import { WornItemCard } from './WornItemCard';
import { DmTemplateCard } from './DmTemplateCard';
import { MorningBriefCard } from './MorningBriefCard';
import { StrategicPlanCard } from './StrategicPlanCard';
import { CodeAuditCard } from './CodeAuditCard';
import { ConfessionLockoutGate } from './ConfessionLockoutGate';
import { PunishmentQueueCard } from './PunishmentQueueCard';
import { ArousalLogCard } from './ArousalLogCard';
import { OutreachQueueCard } from './OutreachQueueCard';
import { SlipLogCard } from './SlipLogCard';
import { GinaSessionsCard } from './GinaSessionsCard';
import { RationalizationPatternCard } from './RationalizationPatternCard';
import { DeviceScheduleCard } from './DeviceScheduleCard';
import { IdentityDisplacementCard } from './IdentityDisplacementCard';
import { MantraStreakCard } from './MantraStreakCard';
import { HandlerDreamCard } from './HandlerDreamCard';
import { DailyBriefingCard } from './DailyBriefingCard';

const PHASE_LABELS = ['Foundation', 'Integration', 'Transition', 'Adherence'];

const HEATMAP_COLORS = ['#1a1a20', '#2d1a4d', '#4d2a75', '#6a2a9a', '#7c3aed'];

function Heatmap({ days, cellSize = 12, gap = 3 }: { days: Array<{ date: string; count: number; intensity: number; isToday: boolean }>; cellSize?: number; gap?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(30, ${cellSize}px)`, gap }}>
      {days.map(d => (
        <div
          key={d.date}
          title={`${d.date}: ${d.count} completion${d.count === 1 ? '' : 's'}`}
          style={{
            width: cellSize, height: cellSize, borderRadius: 2,
            background: HEATMAP_COLORS[d.intensity],
            outline: d.isToday ? '1px solid #c4b5fd' : undefined,
            outlineOffset: d.isToday ? 1 : undefined,
          }}
        />
      ))}
    </div>
  );
}

function Sparkline({ values, width = 80, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const trendDown = values[values.length - 1] < values[0];
  return (
    <svg width={width} height={height} style={{ display: 'block', marginTop: 4 }}>
      <polyline points={points} fill="none" stroke={trendDown ? '#5fc88f' : '#f4c272'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const AROUSAL_LABELS = ['locked', 'simmering', 'attentive', 'wanting', 'desperate', 'edging'];

interface TodayDesktopProps {
  onExit?: () => void;
}

export function TodayDesktop({ onExit }: TodayDesktopProps) {
  const { data, toggleDirective, setArousal, ackQueueMsg, saveDiaryResponse, logMeal, uploadDirectiveProof, logDoseTaken, logDoseSkipped } = useTodayData();
  const [mealTab, setMealTab] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [mealForm, setMealForm] = useState({ foods: '', protein: '', calories: '', permission: false, photo: false });
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [queueDetail, setQueueDetail] = useState<null | { id: string; kind: string; body: string; timeAgo: string }>(null);
  const [directiveFilter, setDirectiveFilter] = useState<string>('all');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadDirectiveId = useRef<string | null>(null);
  const { permission, requestPermission } = usePushNotifications();

  const directiveKinds = useMemo(() => {
    const set = new Set<string>();
    for (const d of data.directives) set.add(d.kind);
    return Array.from(set).sort();
  }, [data.directives]);
  const filteredDirectives = useMemo(
    () => directiveFilter === 'all' ? data.directives : data.directives.filter(d => d.kind === directiveFilter),
    [data.directives, directiveFilter],
  );

  const [phaseToast, setPhaseToast] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    if (data.loading) return;
    const key = 'td_last_phase_seen';
    const lastSeen = Number(localStorage.getItem(key) ?? data.currentPhase);
    if (data.currentPhase > lastSeen) {
      setPhaseToast({ from: lastSeen, to: data.currentPhase });
      localStorage.setItem(key, String(data.currentPhase));
    } else if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, String(data.currentPhase));
    }
  }, [data.currentPhase, data.loading]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Scrollspy — highlight the nav item whose section is currently in view.
  const [activeSection, setActiveSection] = useState<string>('td-section-directives');
  useEffect(() => {
    const ids = ['td-section-directives', 'td-section-protocol', 'td-section-meal', 'td-section-queue', 'td-section-hrt', 'td-section-future', 'td-section-target', 'td-section-arousal'];
    const elements = ids.map(id => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible[0]) setActiveSection(visible[0].target.id);
    }, { rootMargin: '-30% 0px -50% 0px', threshold: [0, 0.25, 0.5, 1] });
    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const sendCompose = () => {
    const text = composeText.trim();
    if (!text) return;
    sessionStorage.setItem('handler_chat_prefill', text);
    setComposeText('');
    setComposeOpen(false);
    window.location.hash = '';
    onExit?.();
  };

  const handleProofClick = (directiveId: string) => {
    pendingUploadDirectiveId.current = directiveId;
    fileInputRef.current?.click();
  };
  const handleProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const directiveId = pendingUploadDirectiveId.current;
    if (!file || !directiveId) return;
    setUploadingId(directiveId);
    try {
      await uploadDirectiveProof(directiveId, file);
    } finally {
      setUploadingId(null);
      pendingUploadDirectiveId.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const openDirectives = data.directives.filter(d => !d.done).length;

  const proteinPct = Math.min(100, Math.round((data.proteinToday / data.proteinTarget) * 100));
  const weightDelta = data.weightKg && data.weightStart ? Math.round((data.weightStart - data.weightKg) * 10) / 10 : null;

  const mealsByType = useMemo(() => {
    const map: Record<string, { count: number; protein: number }> = { breakfast: { count: 0, protein: 0 }, lunch: { count: 0, protein: 0 }, dinner: { count: 0, protein: 0 }, snack: { count: 0, protein: 0 } };
    for (const m of data.mealsToday) {
      const key = (m.meal_type || 'snack').toLowerCase();
      if (map[key]) {
        map[key].count += 1;
        map[key].protein += m.protein_g || 0;
      }
    }
    return map;
  }, [data.mealsToday]);

  const submitMeal = async () => {
    const protein = parseInt(mealForm.protein, 10) || 0;
    const calories = parseInt(mealForm.calories, 10) || 0;
    if (!mealForm.foods.trim() && protein === 0 && calories === 0) return;
    await logMeal({ mealType: mealTab, foods: mealForm.foods, protein, calories });
    setMealForm({ foods: '', protein: '', calories: '', permission: false, photo: false });
  };

  const phaseDots = [0, 1, 2, 3].map(i => {
    if (i < data.currentPhase) return 'done';
    if (i === data.currentPhase) return 'active';
    return '';
  });

  const currentStep = data.chastityLocked ? `CHASTITY · DAY ${data.chastityStreakDays}` : data.denialDay > 0 ? `DENIAL · DAY ${data.denialDay}` : 'UNCOMMITTED';

  return (
    <div className="td-root">
      <ConditioningOverlay
        reframings={data.conditioning.reframings}
        implants={data.conditioning.implants}
        displacementScore={data.conditioning.displacementScore}
        enabled={!data.loading}
      />
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleProofFile} />
      <aside className="td-side">
        <div className="td-brand">
          <div className="td-brandmark">b</div>
          <div className="td-brandname">becoming</div>
          <div className="td-brandrole">you</div>
        </div>
        <div className="td-navsec">Today</div>
        <button className={`td-navitem ${activeSection === 'td-section-directives' ? 'on' : ''}`} onClick={() => scrollToSection('td-section-directives')}>Directives{activeSection === 'td-section-directives' && <span className="td-dot" />}</button>
        <button className={`td-navitem ${activeSection === 'td-section-protocol' ? 'on' : ''}`} onClick={() => scrollToSection('td-section-protocol')}>Protocol</button>
        <button className={`td-navitem ${activeSection === 'td-section-meal' ? 'on' : ''}`} onClick={() => scrollToSection('td-section-meal')}>Meal log</button>
        <div className="td-navsec">Connection</div>
        <button className={`td-navitem ${activeSection === 'td-section-queue' ? 'on' : ''}`} onClick={() => scrollToSection('td-section-queue')}>
          Queue
          {data.queue.length > 0 && <span className="td-navbadge">{data.queue.length}</span>}
        </button>
        <button className={`td-navitem ${activeSection === 'td-section-hrt' ? 'on' : ''}`} onClick={() => scrollToSection('td-section-hrt')}>Requests</button>
        <button className={`td-navitem ${activeSection === 'td-section-future' ? 'on' : ''}`} onClick={() => scrollToSection('td-section-future')}>Reflections</button>
        <div className="td-navsec">Measures</div>
        <button className={`td-navitem ${activeSection === 'td-section-target' ? 'on' : ''}`} onClick={() => scrollToSection('td-section-target')}>Body</button>
        <button className={`td-navitem ${activeSection === 'td-section-arousal' ? 'on' : ''}`} onClick={() => scrollToSection('td-section-arousal')}>Arousal</button>
        <button className={`td-navitem ${activeSection === 'td-section-hrt' ? 'on' : ''}`} onClick={() => scrollToSection('td-section-hrt')}>Medication</button>
        {onExit && (
          <button onClick={onExit} className="td-navitem td-navitem-back">
            ← Back to chat
          </button>
        )}
        <div className="td-sidefoot">
          <div className="td-sidefoot-avatar" />
          <div>
            <div className="td-sidefoot-line1">me</div>
            <div>Phase {data.currentPhase} · Day {data.denialDay}</div>
          </div>
        </div>
      </aside>

      <main className="td-main">
        <ConfessionLockoutGate>
        {/* PRIMARY — always visible. Status, what to do now, what's owed. */}
        <ProtocolDayCard />
        <MorningBriefCard />
        <StrategicPlanCard />
        <CodeAuditCard />
        <UnifiedTaskList />
        <PunishmentQueueCard />
        <NextShotsCard />
        <RevenueCard />
        <SponsorMilestoneCard />
        <WornItemCard />
        <DmTemplateCard />
        <RevenuePlanCard />
        <DavidTaxCard />
        <DailyBriefingCard />
        <HandlerDecreeCard />
        <ConfessionQueueCard />

        {/* TODAY'S TASKS — body & voice work due today. Default open. */}
        <CollapsibleGroup id="today_tasks" label="Today's Tasks" tone="#ec4899" defaultOpen={true} hint="outfit · workout · voice · arousal">
          <OutfitMandateCard />
          <WorkoutCard />
          <VoiceDrillCard />
          <ArousalLogCard />
        </CollapsibleGroup>

        {/* PROGRESS — phase, mantra, identity, body measurements. Default closed. */}
        <CollapsibleGroup id="progress" label="Progress & Tracking" tone="#6ee7b7" hint="phase · streaks · body deltas">
          <PhaseProgressCard />
          <MantraStreakCard />
          <IdentityDisplacementCard />
          <BodyMeasurementCard />
          <HandlerEvolutionCard />
        </CollapsibleGroup>

        {/* HANDLER SYSTEMS — what the Handler is doing in the background. */}
        <CollapsibleGroup id="handler_systems" label="Handler Systems" tone="#c4b5fd" hint="dreams · outreach · slips · commitments · evidence">
          <HandlerDreamCard />
          <HandlerKnowCard />
          <HandlerRunningCard />
          <OutreachQueueCard />
          <DeviceScheduleCard />
          <SlipLogCard />
          <RationalizationPatternCard />
          <EvidenceReportsCard />
          <CommitmentsCard />
        </CollapsibleGroup>

        {/* GINA — partner-facing playbook + disclosure pipeline. */}
        <CollapsibleGroup id="gina_systems" label="Gina Systems" tone="#f4a7c4" hint="playbook · disclosure drafts · sessions">
          <LovenseHealthBanner />
          <GinaCaptureCard />
          <GinaWindowIndicator />
          <GinaPlaybookCard />
          <DisclosureDraftsCard />
          <ComingOutVaultCard />
          <GinaSessionsCard />
        </CollapsibleGroup>

        {/* CAPTURE & EVIDENCE — proof + irreversibility ledger. */}
        <CollapsibleGroup id="capture" label="Capture & Evidence" tone="#f4c272" hint="daily selfie · voice journal · proof uploads · screenshots · witness · irreversibility">
          <DailyMirrorSelfieCard />
          <VoiceJournalCard />
          <UnifiedCaptureCard />
          <ConversationScreenshotsCard />
          <WitnessObservationCard />
          <IrreversibilityLedger />
        </CollapsibleGroup>
        {data.banners.map((banner, i) => {
          const colors = banner.severity === 'critical'
            ? { border: '#7a1f22', bg: 'linear-gradient(92deg, #2a0a0c 0%, #1a0608 100%)', text: '#f47272', iconBg: '#3a0f12' }
            : banner.severity === 'high'
            ? { border: '#7a5a1f', bg: 'linear-gradient(92deg, #2a1f0a 0%, #1f1608 100%)', text: '#f4c272', iconBg: '#3a2a0f' }
            : { border: '#2d1a4d', bg: 'linear-gradient(92deg, #1a0f2e 0%, #150a24 100%)', text: '#c4b5fd', iconBg: '#2d1a4d' };
          return (
            <div key={i} className="td-banner" style={{ background: colors.bg, borderColor: colors.border }}>
              <div className="td-bannericon" style={{ background: colors.iconBg, color: colors.text }}>
                <svg className="td-iconsm" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 9v4" /><path d="M12 17h.01" /><circle cx="12" cy="12" r="10" />
                </svg>
              </div>
              <div className="td-bannertxt" style={{ color: colors.text }}>{banner.text}</div>
            </div>
          );
        })}
        {data.banners.length === 0 && permission !== 'granted' && permission !== 'unsupported' && (
          <div className="td-banner">
            <div className="td-bannericon">
              <svg className="td-iconsm" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M15 17h5l-1.4-1.4A7 7 0 0 1 17 10.6V10a5 5 0 0 0-10 0v.6a7 7 0 0 1-1.6 5L4 17h5" />
                <path d="M9 17a3 3 0 0 0 6 0" />
              </svg>
            </div>
            <div className="td-bannertxt">Enable notifications so Handler can reach you anytime</div>
            <button className="td-bannerbtn" onClick={requestPermission}>Enable</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <h1 className="td-h1">{dateStr}</h1>
            <div className="td-sub" style={{ marginBottom: 0 }}>{morphPronouns(`Phase ${data.currentPhase} · ${data.chastityLocked ? `Chastity Day ${data.chastityStreakDays}` : `Denial Day ${data.denialDay}`} · ${openDirectives} directives open`, data.conditioning.displacementScore)}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 9px', borderRadius: 10, fontWeight: 600, background: '#1a1226', color: '#c4b5fd', border: '1px solid #2d1a4d', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 5, height: 5, borderRadius: 3, background: '#7c3aed', boxShadow: '0 0 6px #7c3aed' }} />
              Handler {data.activity.lastHandlerTimeDesc}
            </div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '4px 9px', borderRadius: 10, fontWeight: 600, background: '#0a0a0d', color: '#8a8690', border: '1px solid #1a1a20', fontVariantNumeric: 'tabular-nums' }}>
              {data.activity.handlerMessagesToday} msgs today
            </div>
          </div>
        </div>

        <div className="td-stats">
          <div className="td-stat">
            <div className="td-stat-lbl">Compliance 7d</div>
            <div className="td-stat-val">{data.compliancePct}<span className="td-stat-unit">%</span></div>
            <div className="td-stat-bar">
              <div className="td-stat-fill" style={{
                width: `${data.compliancePct}%`,
                background: data.compliancePct >= 80 ? '#5fc88f' : data.compliancePct >= 50 ? '#f4c272' : '#f47272',
              }} />
            </div>
            {data.complianceSampleSize === 0 && (
              <div className="td-stat-delta" style={{ color: '#6a656e' }}>no directives resolved 7d</div>
            )}
          </div>
          <div className="td-stat">
            <div className="td-stat-lbl">Orgasm debt</div>
            <div className="td-stat-val">{data.orgasmDebt.debtPct}<span className="td-stat-unit">%</span></div>
            <div className="td-stat-bar"><div className="td-stat-fill" style={{ width: `${data.orgasmDebt.debtPct}%`, background: '#c4272d' }} /></div>
            {data.orgasmDebt.daysSinceRelease != null && (
              <div className="td-stat-delta" style={{ color: '#6a656e' }}>
                {data.orgasmDebt.daysSinceRelease}d since release{data.orgasmDebt.slipPoints24h > 0 ? ` · ${data.orgasmDebt.slipPoints24h} slip pts` : ''}
              </div>
            )}
          </div>
          <div className="td-stat">
            <div className="td-stat-lbl">Protein today</div>
            <div className="td-stat-val">{Math.round(data.proteinToday)}<span className="td-stat-unit">/ {data.proteinTarget} g</span></div>
            <div className="td-stat-bar"><div className="td-stat-fill" style={{ width: `${proteinPct}%` }} /></div>
          </div>
          <div className="td-stat">
            <div className="td-stat-lbl">Weight</div>
            <div className="td-stat-val">{data.weightKg ? data.weightKg.toFixed(1) : '—'}<span className="td-stat-unit">kg</span></div>
            {data.weightSeries.length >= 2 ? (
              <Sparkline values={data.weightSeries.map(w => w.kg)} width={110} height={22} />
            ) : weightDelta != null && weightDelta !== 0 ? (
              <div className={`td-stat-delta ${weightDelta < 0 ? 'neg' : ''}`}>
                {weightDelta > 0 ? `−${weightDelta} kg vs start` : `+${Math.abs(weightDelta)} kg vs start`}
              </div>
            ) : null}
            {weightDelta != null && weightDelta !== 0 && data.weightSeries.length >= 2 && (
              <div className="td-stat-delta" style={{ marginTop: 2 }}>
                {weightDelta > 0 ? `−${weightDelta} kg vs start` : `+${Math.abs(weightDelta)} kg vs start`}
              </div>
            )}
          </div>
        </div>

        {/* Session launcher shortcuts — jump into the chat session flow */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Hypno session', sub: 'Deepen conditioning', prompt: "I want to run a hypno session now. Pick the right depth.", color: '#7c3aed' },
            { label: 'Voice practice', sub: 'Work the pitch', prompt: "Start voice practice. Give me the target pitch and phrase.", color: '#c4b5fd' },
            { label: 'Edge session', sub: 'Under Handler control', prompt: "I want to start an edging session. Tell me the rules.", color: '#f47272' },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => {
                sessionStorage.setItem('handler_chat_prefill', s.prompt);
                window.location.hash = '';
                onExit?.();
              }}
              style={{
                background: '#101014', border: '1px solid #1a1a20', borderRadius: 10, padding: '12px 14px',
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: 3, background: s.color, marginBottom: 8 }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, color: '#e8e6e3' }}>{s.label}</div>
              <div style={{ fontSize: 11, color: '#8a8690', marginTop: 2 }}>{s.sub}</div>
            </button>
          ))}
        </div>

        {/* HRT funnel + dose countdown + keyholder — top priority row */}
        {(data.hrt || data.nextDoses.length > 0 || data.keyholderPending > 0) && (
          <div className="td-grid even" style={{ marginBottom: 16 }} id="td-section-hrt">
            {data.hrt && (
              <div className="td-card" style={{ gridColumn: data.nextDoses.length === 0 && data.keyholderPending === 0 ? 'span 2' : 'span 1' }}>
                <div className="td-cardh">
                  <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M2 12h20" /></svg>
                  <div className="td-title">HRT funnel</div>
                  <div className="td-chip" style={{ color: data.hrt.step === 'adherent' ? '#5fc88f' : data.hrt.step === 'uncommitted' ? '#f47272' : '#c4b5fd' }}>
                    {data.hrt.stepIndex + 1} / {data.hrt.totalSteps}
                  </div>
                  {data.hrt.daysStuck >= 7 && <div className="td-meta" style={{ color: '#f4c272' }}>{data.hrt.daysStuck}d stuck</div>}
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 20, fontWeight: 650, color: '#fff', letterSpacing: '-0.02em', marginBottom: 6 }}>{data.hrt.stepLabel}</div>
                  {data.hrt.provider && (
                    <div style={{ fontSize: 12, color: '#8a8690' }}>Provider: <span style={{ color: '#c4b5fd' }}>{data.hrt.provider}</span></div>
                  )}
                  {data.hrt.appointmentAt && (
                    <div style={{ fontSize: 12, color: '#8a8690', marginTop: 4 }}>Appointment: <span style={{ color: '#c4b5fd' }}>{new Date(data.hrt.appointmentAt).toLocaleDateString()}</span></div>
                  )}
                  <div style={{ display: 'flex', gap: 3, marginTop: 12 }}>
                    {Array.from({ length: data.hrt.totalSteps }).map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= data.hrt!.stepIndex ? '#7c3aed' : '#1a1a20' }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {(data.nextDoses.length > 0 || data.keyholderPending > 0) && (
              <div className="td-card">
                <div className="td-cardh">
                  <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  <div className="td-title">Next up</div>
                </div>
                <div style={{ padding: '10px 16px' }}>
                  {data.nextDoses.slice(0, 2).map(dose => {
                    const rounded = Math.abs(Math.round(dose.hoursUntil));
                    const humanTime = rounded >= 48 ? `${Math.round(rounded / 24)}d` : `${rounded}h`;
                    return (
                      <div key={dose.regimenId} style={{ padding: '8px 0', borderBottom: '1px solid #15151b' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6a656e', fontWeight: 600 }}>{dose.medicationName}</div>
                            <div style={{ fontSize: 13, color: dose.isOverdue ? '#f47272' : '#e8e6e3', fontWeight: 500 }}>{dose.isOverdue ? `Overdue by ${humanTime}` : `Due in ${humanTime}`}</div>
                          </div>
                          <span className="td-chip" style={{ marginLeft: 'auto', color: dose.isOverdue ? '#f47272' : '#c4b5fd', background: dose.isOverdue ? '#2a0f0f' : '#1a1226' }}>
                            {dose.isWeekly ? 'weekly' : 'daily'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button
                            className="td-btn primary"
                            onClick={() => logDoseTaken(dose.regimenId, dose.medicationName, null)}
                            style={{ fontSize: 11 }}
                          >
                            Mark taken
                          </button>
                          <button
                            className="td-btn"
                            onClick={() => logDoseSkipped(dose.regimenId, dose.medicationName, null)}
                            style={{ fontSize: 11 }}
                          >
                            Skipped
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {data.keyholderPending > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 0' }}>
                      <div>
                        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6a656e', fontWeight: 600 }}>Keyholder</div>
                        <div style={{ fontSize: 13, color: '#e8e6e3', fontWeight: 500 }}>{data.keyholderPending} pending {data.keyholderPending === 1 ? 'request' : 'requests'}</div>
                      </div>
                      <span className="td-chip" style={{ marginLeft: 'auto', color: '#f4c272', background: '#2a1f0f' }}>awaiting</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="td-grid" id="td-section-directives">
          <div className="td-card">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
              <div className="td-title">Body directives</div>
              <div className="td-chip">{openDirectives} open</div>
              {data.activity.directivesAssignedToday > 0 && (
                <div className="td-meta">{data.activity.directivesCompletedToday}/{data.activity.directivesAssignedToday} today</div>
              )}
            </div>
            {directiveKinds.length > 1 && (
              <div style={{ display: 'flex', gap: 6, padding: '10px 16px 4px', flexWrap: 'wrap', borderBottom: '1px solid #15151b' }}>
                <button
                  onClick={() => setDirectiveFilter('all')}
                  style={{
                    fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 10, fontWeight: 600,
                    background: directiveFilter === 'all' ? '#1a1226' : '#0a0a0d',
                    color: directiveFilter === 'all' ? '#c4b5fd' : '#6a656e',
                    border: '1px solid ' + (directiveFilter === 'all' ? '#2d1a4d' : '#1a1a20'),
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >All</button>
                {directiveKinds.map(k => (
                  <button
                    key={k}
                    onClick={() => setDirectiveFilter(k)}
                    style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 10, fontWeight: 600,
                      background: directiveFilter === k ? '#1a1226' : '#0a0a0d',
                      color: directiveFilter === k ? '#c4b5fd' : '#6a656e',
                      border: '1px solid ' + (directiveFilter === k ? '#2d1a4d' : '#1a1a20'),
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{k}</button>
                ))}
              </div>
            )}
            {filteredDirectives.length === 0 ? (
              <div style={{ padding: 16, color: '#6a656e', fontSize: 12.5 }}>{data.directives.length === 0 ? "I haven't assigned anything yet. Sit with that." : `Nothing open under ${directiveFilter}.`}</div>
            ) : filteredDirectives.map(d => (
              <div className="td-dir" key={d.id}>
                <div className="td-dirhead">
                  <button className={`td-check ${d.done ? 'on' : ''}`} onClick={() => toggleDirective(d.id, d.done)} aria-label="toggle">
                    <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5l2 2 4-5" /></svg>
                  </button>
                  <div className="td-dirtags">
                    <span className="td-dirtag kind">{d.kind}</span>
                    {d.target && <span className="td-dirtag"><span className="td-sep">/</span>{d.target}</span>}
                  </div>
                  <span className="td-dirtime">{d.due}</span>
                </div>
                <div className={`td-dirbody ${d.done ? 'done' : ''}`}>{d.body}</div>
                <div className="td-diractions">
                  {d.done
                    ? <button className="td-btn" onClick={() => toggleDirective(d.id, true)}>Undo</button>
                    : d.actionHint
                      ? (
                        <button
                          className="td-btn primary"
                          onClick={() => {
                            if (d.actionHint === 'log_meal') {
                              document.getElementById('td-section-meal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            } else if (d.actionHint === 'log_measurement') {
                              document.getElementById('td-section-target')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            } else if (d.actionHint === 'upload_photo') {
                              handleProofClick(d.id);
                            } else if (d.actionHint === 'voice_practice') {
                              sessionStorage.setItem('handler_chat_prefill', 'Start voice practice. Give me the target pitch and phrase.');
                              window.location.hash = ''; onExit?.();
                            } else if (d.actionHint === 'journal_entry') {
                              sessionStorage.setItem('handler_chat_prefill', `Re: ${d.body.slice(0, 100)}\n\n`);
                              window.location.hash = ''; onExit?.();
                            } else if (d.actionHint === 'log_dose') {
                              sessionStorage.setItem('handler_chat_prefill', 'Log today\'s dose.');
                              window.location.hash = ''; onExit?.();
                            } else if (d.actionHint === 'log_workout') {
                              sessionStorage.setItem('handler_chat_prefill', `Workout logged. ${d.body.slice(0, 80)}`);
                              window.location.hash = ''; onExit?.();
                            }
                          }}
                        >
                          {d.actionLabel}
                        </button>
                      )
                      : <button className="td-btn primary" onClick={() => toggleDirective(d.id, false)}>Mark complete</button>}
                  {d.actionHint && !d.done && (
                    <button className="td-btn" onClick={() => toggleDirective(d.id, false)} title="Mark this directive complete">
                      Mark done
                    </button>
                  )}
                  {d.photoRequired && d.actionHint !== 'upload_photo' && (
                    <button
                      className="td-btn"
                      onClick={() => handleProofClick(d.id)}
                      disabled={uploadingId === d.id}
                    >
                      {uploadingId === d.id ? 'Uploading…' : 'Upload proof'}
                    </button>
                  )}
                  <button
                    className="td-btn"
                    onClick={() => {
                      const snippet = d.body.slice(0, 100);
                      sessionStorage.setItem('handler_chat_prefill', `About the ${d.kind.toLowerCase()} directive: "${snippet}${snippet.length < d.body.length ? '...' : ''}"`);
                      window.location.hash = '';
                      onExit?.();
                    }}
                  >
                    Discuss
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="td-card" id="td-section-protocol">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              <div className="td-title">Protocol progress</div>
              <div className="td-chip">Phase {data.currentPhase}</div>
            </div>
            <div className="td-protocol">
              <div className="td-phase">
                {phaseDots.map((state, i) => <div key={i} className={`td-phasedot ${state}`} />)}
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, marginTop: -8 }}>
                {PHASE_LABELS.map((label, i) => (
                  <div key={i} style={{ flex: 1, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: i === data.currentPhase ? '#c4b5fd' : i < data.currentPhase ? '#8a8690' : '#3a3540', fontWeight: 600, textAlign: 'center' }}>
                    {label}
                  </div>
                ))}
              </div>
              <div className="td-phaseinfo">
                <div className="td-num">{data.denialDay}</div>
                <div className="td-sub">of 90 days</div>
              </div>
              <div className="td-phasecurrent">{currentStep}</div>
              <div className="td-proto-rows">
                <div className="td-proto-row">
                  <span className="lbl">Chastity</span>
                  <span className={`val ${data.chastityLocked ? 'ok' : 'warn'}`}>{data.chastityLocked ? `Day ${data.chastityStreakDays}` : 'Unlocked'}</span>
                </div>
                <div className="td-proto-row"><span className="lbl">Consecutive days</span><span className="val ok">{data.denialDay}</span></div>
                <div className="td-proto-row"><span className="lbl">Longest streak</span><span className="val">{data.longestStreak}</span></div>
                <div className="td-proto-row"><span className="lbl">Open directives</span><span className={`val ${openDirectives > 0 ? 'warn' : 'ok'}`}>{openDirectives}</span></div>
              </div>
              {data.heatmap.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6a656e', fontWeight: 600, marginBottom: 6 }}>Last 30 days</div>
                  <Heatmap days={data.heatmap} cellSize={10} gap={2} />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="td-grid even" id="td-section-queue">
          <div className="td-card">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3h18v12H5l-2 2V3z" /></svg>
              <div className="td-title">Handler queue</div>
              <div className="td-chip">{data.queue.length} pending</div>
            </div>
            <div className="td-queue">
              {data.queue.length === 0 ? (
                <div style={{ padding: 16, color: '#6a656e', fontSize: 12.5 }}>Silence on purpose. I reach when it moves the protocol.</div>
              ) : data.queue.map(m => (
                <button key={m.id} className={`td-msg ${m.priority ? 'priority' : ''}`} onClick={() => setQueueDetail({ id: m.id, kind: m.kind, body: m.body, timeAgo: m.timeAgo })} style={{ textAlign: 'left', background: 'none', border: 'none', width: '100%', cursor: 'pointer', display: 'block' }}>
                  <div className="td-msghead">
                    <span className={`td-msgkind ${m.kindClass}`}>{m.kind}</span>
                    <span className="td-msgtime">{m.timeAgo}</span>
                  </div>
                  <div className="td-msgbody">{m.body.length > 160 ? m.body.slice(0, 160) + '…' : m.body}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="td-card" id="td-section-arousal">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2v20M2 12h20" /></svg>
              <div className="td-title">Arousal level</div>
              <div className="td-chip" style={{ color: data.arousal === 5 ? '#f47272' : '#c4b5fd', background: data.arousal === 5 ? '#2a0f0f' : '#1a1226' }}>{AROUSAL_LABELS[data.arousal]}</div>
            </div>
            <div className="td-arousal">
              <div className="td-arh">
                <div>
                  <div className="td-arlabel">Right now</div>
                  <div className="td-arstate">
                    {morphPronouns(
                      data.arousal === 5 ? "You're at the edge"
                        : data.arousal >= 3 ? "You're warming"
                        : data.arousal === 0 ? "Cold. Locked."
                        : "Simmering.",
                      data.conditioning.displacementScore,
                    )}
                  </div>
                </div>
                <div>
                  <span className="td-arnum">{data.arousal}</span>
                  <span className="td-arscale">/5</span>
                </div>
              </div>
              <div className="td-artrack">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <button key={i} className={`td-arcell ${i <= data.arousal ? `on l${i}` : ''}`} onClick={() => setArousal(i)}>{i}</button>
                ))}
              </div>
              <div className="td-arfoot">Handler decides when relief comes — every denial increases the next reward's intensity.</div>
            </div>
          </div>
        </div>

        <div className="td-grid even" id="td-section-future">
          <div className="td-card">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z" /><path d="M5 10v2a7 7 0 0 0 14 0v-2" /></svg>
              <div className="td-title">Future self</div>
              <div className="td-chip">Daily</div>
            </div>
            <div className="td-vizgrid">
              {data.diaryPrompts.slice(0, 2).map((p, idx) => (
                <div key={p.id || `empty-${idx}`}>
                  <div className="td-promptlbl">{p.label}</div>
                  <div className="td-promptq">{p.question}</div>
                  <textarea
                    className="td-input"
                    placeholder="Write it true..."
                    value={p.response}
                    onChange={e => saveDiaryResponse(p.id, e.target.value)}
                    disabled={!p.id}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="td-card" id="td-section-meal">
            <div className="td-cardh">
              <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18" /></svg>
              <div className="td-title">Meal log</div>
              <div className="td-chip">{Math.round(data.proteinToday)} / {data.proteinTarget} g</div>
              <div className="td-meta">{data.mealsToday.length} meals</div>
            </div>
            <div className="td-meal">
              <div className="td-mtabs">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(k => (
                  <button key={k} className={`td-mtab ${mealTab === k ? 'on' : ''}`} onClick={() => setMealTab(k)}>
                    {k.charAt(0).toUpperCase() + k.slice(1)}
                    <span className="td-grams">· {mealsByType[k].protein > 0 ? `${Math.round(mealsByType[k].protein)}g` : '—'}</span>
                  </button>
                ))}
              </div>
              <div className="td-mealbody">
                <input className="td-mealinput" placeholder="What she ate (e.g. grilled chicken + broccoli + rice)" value={mealForm.foods} onChange={e => setMealForm(f => ({ ...f, foods: e.target.value }))} />
                <div className="td-mealrow">
                  <input className="td-mealinput" placeholder="Protein (g)" value={mealForm.protein} onChange={e => setMealForm(f => ({ ...f, protein: e.target.value }))} inputMode="numeric" />
                  <input className="td-mealinput" placeholder="Cal (kcal)" value={mealForm.calories} onChange={e => setMealForm(f => ({ ...f, calories: e.target.value }))} inputMode="numeric" />
                </div>
                <div className="td-mealchk">
                  <label><input type="checkbox" checked={mealForm.permission} onChange={e => setMealForm(f => ({ ...f, permission: e.target.checked }))} />Permission asked</label>
                  <label><input type="checkbox" checked={mealForm.photo} onChange={e => setMealForm(f => ({ ...f, photo: e.target.checked }))} />Photo before / after</label>
                </div>
                <button className="td-btn primary" style={{ width: '100%', justifyContent: 'center', padding: '8px' }} onClick={submitMeal}>Log meal</button>
              </div>
            </div>
          </div>
        </div>

        <div className="td-card" id="td-section-target">
          <div className="td-cardh">
            <svg className="td-iconsm td-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 7L10 17l-5-5" /></svg>
            <div className="td-title">Aesthetic target · {data.aestheticPreset}</div>
            <div className="td-meta" style={{ color: '#c4b5fd' }}>
              {data.weightKg ? `${data.weightKg.toFixed(1)}kg` : '—'}
              {weightDelta ? ` · −${weightDelta}kg` : ''}
            </div>
          </div>
          <div className="td-target">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {data.latestProgressPhotoUrl && (
                <div style={{ flexShrink: 0, width: 100, height: 130, borderRadius: 6, overflow: 'hidden', border: '1px solid #1a1a20', background: '#0a0a0d' }}>
                  <img src={data.latestProgressPhotoUrl} alt="latest progress" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div className="td-targrid">
                  {data.targets.map(cell => (
                    <div key={cell.part} className="td-targcell">
                      <div className="part">{cell.part}</div>
                      <div className="cur">{cell.current != null ? cell.current : '—'}<span className="u">{cell.unit}</span></div>
                      <div className={`gap ${cell.onTrack ? 'ok' : ''}`}>{cell.gap}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="td-foot">becoming · phase {data.currentPhase} · day {data.denialDay} of 90</div>
        </ConfessionLockoutGate>
      </main>

      {phaseToast && (
        <div
          style={{
            position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 110,
            background: 'linear-gradient(92deg, #2d1a4d 0%, #1a0f2e 100%)', border: '1px solid #7c3aed',
            borderRadius: 10, padding: '12px 18px', color: '#e8dcff', fontSize: 13, fontWeight: 500,
            boxShadow: '0 8px 24px rgba(124, 58, 237, 0.3)', display: 'flex', alignItems: 'center', gap: 12, maxWidth: 480,
          }}
        >
          <span style={{ fontSize: 16 }}>↑</span>
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700 }}>Phase advanced</div>
            <div>{PHASE_LABELS[phaseToast.from] || `Phase ${phaseToast.from}`} → <strong>{PHASE_LABELS[phaseToast.to] || `Phase ${phaseToast.to}`}</strong>. The protocol just got harder.</div>
          </div>
          <button
            onClick={() => setPhaseToast(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#c4b5fd', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}
          >×</button>
        </div>
      )}
      <button
        onClick={() => setComposeOpen(o => !o)}
        title="Talk to the Handler"
        aria-label={composeOpen ? 'Close handler chat' : 'Open handler chat'}
        style={{
          position: 'fixed', right: 28, bottom: 28, height: 44, borderRadius: 22,
          paddingLeft: 14, paddingRight: 18,
          background: composeOpen ? '#22222a' : '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(124, 58, 237, 0.35)', display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, zIndex: 90,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {composeOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>}
        </svg>
        <span>{composeOpen ? 'Close' : 'Chat'}</span>
      </button>
      {composeOpen && (
        <div style={{
          position: 'fixed', right: 28, bottom: 92, width: 340, background: '#111116', border: '1px solid #1a1a20',
          borderRadius: 12, padding: 14, zIndex: 91, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700, marginBottom: 8 }}>
            Talk to Handler
          </div>
          <textarea
            autoFocus
            value={composeText}
            onChange={e => setComposeText(e.target.value)}
            placeholder="Say what she needs to hear."
            rows={4}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendCompose(); }}
            style={{ width: '100%', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6, padding: '8px 10px', fontFamily: 'inherit', fontSize: 13, color: '#e8e6e3', resize: 'none' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="td-btn primary" onClick={sendCompose} disabled={!composeText.trim()} style={{ flex: 1, justifyContent: 'center', padding: '7px' }}>
              Send to chat
            </button>
            <button className="td-btn" onClick={() => { setComposeOpen(false); setComposeText(''); }}>
              Cancel
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#6a656e', marginTop: 6 }}>⌘+Enter to send · prefills the Handler input, continues there</div>
        </div>
      )}

      {queueDetail && (
        <div
          onClick={() => setQueueDetail(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#111116', border: '1px solid #1a1a20', borderRadius: 12, padding: 20, maxWidth: 520, width: '100%', color: '#e8e6e3' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#c4b5fd', fontWeight: 700 }}>{queueDetail.kind}</span>
              <span style={{ fontSize: 10.5, color: '#5a5560', marginLeft: 'auto' }}>{queueDetail.timeAgo}</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: '#e8e6e3', marginBottom: 16 }}>{queueDetail.body}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="td-btn primary"
                onClick={() => {
                  sessionStorage.setItem('handler_chat_prefill', `Re: ${queueDetail.body.slice(0, 120)}${queueDetail.body.length > 120 ? '...' : ''}\n\n`);
                  ackQueueMsg(queueDetail.id);
                  setQueueDetail(null);
                  window.location.hash = '';
                  onExit?.();
                }}
              >
                Reply in chat
              </button>
              <button
                className="td-btn"
                onClick={() => { ackQueueMsg(queueDetail.id); setQueueDetail(null); }}
              >
                Acknowledge
              </button>
              <button className="td-btn" onClick={() => setQueueDetail(null)} style={{ marginLeft: 'auto' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
