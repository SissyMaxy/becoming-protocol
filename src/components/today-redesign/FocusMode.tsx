/**
 * FocusMode — single-task view. Replaces the card stack as Today's default.
 *
 * Premise (from user 2026-04-29): "the handler should focus maxys attention
 * on just one thing at a time to avoid getting distracted... the handler
 * keeps track of everything anyways. The handler could strive to get maxy
 * to obey and do more tasks every day."
 *
 * Behavior:
 *  - Full-screen, no scroll wall, no card spam.
 *  - Picks the SINGLE highest-priority item across all consequence-bearing
 *    systems (overdue dose → confession → punishment → decree → due-today …).
 *  - Shows ONE task with the inline action surface: confess textarea, dose
 *    log buttons, photo upload, mark-done, etc.
 *  - "Next" only surfaces AFTER completion. The protocol decides what
 *    comes next; she doesn't choose order.
 *  - "View plan" toggle escapes to the calendar view for rare context-need.
 *
 * Why this beats card stack:
 *  - No decision fatigue — the Handler chose, she executes.
 *  - Visually reinforces dominance — single command, no menu.
 *  - Faster completion → Handler can ratchet daily task count.
 *  - Tracking is the Handler's job, not Maxy's.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { isMommyPersona } from '../../lib/persona/dommy-mommy';
import { useSurfaceRenderTracking, useAcknowledgeObligation } from '../../lib/surface-render-hooks';
import { ackSourceForTask } from '../../../supabase/functions/_shared/enforcement-core';
import { gradeDoseEvidence } from '../../lib/hrt/dose-evidence';
import {
  markOfferAccepted,
  markOfferCompleted,
  markRenderPlayed,
  renderAudioSession,
} from '../../lib/audio-sessions/client';
import type {
  AudioSessionIntensity,
  AudioSessionKind,
} from '../../lib/audio-sessions/template-selector';
import type { ReleaseType, ReleaseContext } from '../../types/arousal';
import { parseSelfEchoManifest } from '../../lib/audio/self-echo-mix';
import { SelfEchoPlayer } from './SelfEchoPlayer';
import { ConfessionAudioCapture } from './ConfessionAudioCapture';
import { savePhysicalStateLog, type PhysicalState } from '../../lib/compulsory-elements';
import { HRT_STEPS, HRT_STEP_LABELS, HRT_STEP_NEXT_ACTION } from '../../lib/handler-context/hrt-steps';

// ─── HRT funnel (labels live in the shared step module) ────────────────────
// ET-anchored day key — matches HrtDailyGate's localStorage marker.
function hrtDateKeyET(now: Date): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return `${p.find(x => x.type === 'year')!.value}-${p.find(x => x.type === 'month')!.value}-${p.find(x => x.type === 'day')!.value}`;
}
function hrtGateKey(): string { return `td_hrt_gate_${hrtDateKeyET(new Date())}`; }
function hrtMinObstacleChars(streak: number): number {
  if (streak <= 0) return 250;
  if (streak === 1) return 350;
  return 500;
}

// Deterministic UUID from an arbitrary seed string. This MUST stay byte-for-byte
// identical to handler-outreach-auto's deterministicUuid (SHA-256 → RFC-4122
// v5-shaped) — the cron looks up the HRT witness-CC penalty preview by this same
// source_id, so FocusMode (which registers it) and the cron (which fires the
// email after it's surfaced) have to derive the EXACT same UUID from the EXACT
// same key. Earlier this used a different hash (FNV-1a) + a per-day key, so the
// cron never found the preview and the witness CC silently never fired. Now both
// sides use SHA-256 and the per-step key `hrt_witness_cc:<user>:<step>`.
async function deterministicUuid(key: string): Promise<string> {
  const buf = new TextEncoder().encode(key);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  const b = hash.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC-4122 variant
  const hex = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Physical-state checkbox items (ported from CompulsoryGateScreen).
const PHYSICAL_STATE_ITEMS: { key: keyof PhysicalState; label: string }[] = [
  { key: 'cage_on', label: 'Cage' },
  { key: 'panties', label: 'Panties' },
  { key: 'plug', label: 'Plug' },
  { key: 'feminine_clothing', label: 'Feminine clothing' },
  { key: 'nail_polish', label: 'Nail polish' },
  { key: 'scent_anchor', label: 'Scent anchor' },
  { key: 'jewelry', label: 'Jewelry' },
];

// Release check-in option sets (ported from MorningBriefing).
const RELEASE_TYPE_OPTIONS: { type: ReleaseType; label: string; resetsStreak: boolean }[] = [
  { type: 'full', label: 'Full release', resetsStreak: true },
  { type: 'ruined', label: 'Ruined', resetsStreak: true },
  { type: 'accident', label: 'Accident', resetsStreak: true },
  { type: 'wet_dream', label: 'Wet dream', resetsStreak: true },
  { type: 'prostate', label: 'Prostate', resetsStreak: false },
  { type: 'sissygasm', label: 'Sissygasm', resetsStreak: false },
  { type: 'edge_only', label: 'Edge only', resetsStreak: false },
];
const RELEASE_CONTEXT_OPTIONS: { context: ReleaseContext; label: string }[] = [
  { context: 'with_partner', label: 'With a partner' },
  { context: 'solo', label: 'Solo' },
  { context: 'during_content', label: 'During content' },
  { context: 'during_practice', label: 'During practice' },
  { context: 'sleep', label: 'In sleep' },
];
const RELEASE_WHEN_OPTIONS = [
  { value: 'last_night', label: 'Last night' },
  { value: 'this_morning', label: 'This morning' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: '2_days_ago', label: '2 days ago' },
  { value: '3_plus_days', label: '3+ days ago' },
];
function resolveReleaseTime(when: string): Date {
  const now = new Date();
  const d = new Date(now);
  switch (when) {
    case 'last_night': d.setDate(d.getDate() - 1); d.setHours(23, 0, 0, 0); return d;
    case 'this_morning': d.setHours(7, 0, 0, 0); return d;
    case 'yesterday': d.setDate(d.getDate() - 1); d.setHours(12, 0, 0, 0); return d;
    case '2_days_ago': d.setDate(d.getDate() - 2); d.setHours(12, 0, 0, 0); return d;
    case '3_plus_days': d.setDate(d.getDate() - 3); d.setHours(12, 0, 0, 0); return d;
    default: return now;
  }
}
function releaseCheckinKey(): string {
  return `release_checkin_${new Date().toISOString().slice(0, 10)}`;
}

type TaskKind =
  | 'overdue_dose' | 'overdue_confession' | 'overdue_punishment' | 'overdue_decree'
  | 'hrt_step_today'
  | 'release_checkin'
  | 'physical_state_today'
  | 'due_today_confession' | 'due_today_decree' | 'due_today_dose' | 'due_today_commitment'
  | 'commitment_pending' | 'workout_today' | 'outfit_today'
  | 'fem_prescription'
  | 'mantra_harvest'
  | 'mommy_touch'
  | 'audio_session'
  | 'focus_decree'
  | 'approve_post'
  | 'clean';

interface FocusTask {
  kind: TaskKind;
  rowId: string | null;
  title: string;
  detail?: string;
  due?: string;
  /** Inline action surface: 'confess' = textarea, 'dose' = buttons, 'mark_done' = single button, 'photo' = upload, 'message' = no inline action, 'audio_session' = play button + audio element, 'hrt' = advance/obstacle two-path, 'release' = release check-in flow, 'physical' = physical-state checkbox set, 'fem_prescription' = evidence-kind CTA set + skip chips, 'mantra_drill' = recorder + rep counter */
  surface: 'confess' | 'dose' | 'mark_done' | 'photo' | 'message' | 'audio_session' | 'decree' | 'hrt' | 'release' | 'physical' | 'approve_post' | 'fem_prescription' | 'mantra_drill';
  /** Carried metadata for surface handlers */
  meta?: Record<string, unknown>;
  /** Severity tone for visual weight */
  tone: 'critical' | 'high' | 'medium' | 'calm';
}

interface SelfEchoMeta {
  ownVoicePath: string;
  mommyRenderPath: string;
  loopCount: number;
  ownDurationS: number | null;
}

interface AudioSessionMeta {
  kind: AudioSessionKind;
  intensity: AudioSessionIntensity;
  /** When present, the offer plays her own voice looped under a Mommy render
   *  (dual-track, client-side Web Audio) instead of re-rendering a template. */
  selfEcho?: SelfEchoMeta | null;
}

const TONE_STYLES_HANDLER: Record<FocusTask['tone'], { bg: string; border: string; accent: string; label: string }> = {
  critical: { bg: 'linear-gradient(140deg, #2a0508 0%, #1a0508 100%)', border: '#c4272d', accent: '#f0a0a0', label: 'CRITICAL' },
  high:     { bg: 'linear-gradient(140deg, #2a1f0a 0%, #1f1608 100%)', border: '#a87a1f', accent: '#fbbf24', label: 'PRIORITY' },
  medium:   { bg: 'linear-gradient(140deg, #2c1723 0%, #0f0820 100%)', border: '#c9557f', accent: '#edaec5', label: 'TODAY' },
  calm:     { bg: 'linear-gradient(140deg, #0a1a14 0%, #051a10 100%)', border: '#3a5a3f', accent: '#8fd9b0', label: 'CLEAN' },
};

// Dommy Mommy palette: warm boudoir / dusty rose / candle-gold instead
// of clinical purple/black. Labels speak in Mama's voice.
const TONE_STYLES_MOMMY: Record<FocusTask['tone'], { bg: string; border: string; accent: string; label: string }> = {
  critical: { bg: 'linear-gradient(140deg, #2a0510 0%, #1a050a 100%)', border: '#c4485a', accent: '#f4a7c4', label: "MAMA'S WAITING" },
  high:     { bg: 'linear-gradient(140deg, #2a1418 0%, #1f0a10 100%)', border: '#c46a72', accent: '#f4a7c4', label: 'MAMA WANTS THIS' },
  medium:   { bg: 'linear-gradient(140deg, #2a1a0a 0%, #1f1308 100%)', border: '#a87a48', accent: '#f4c8a0', label: "TODAY, BABY" },
  calm:     { bg: 'linear-gradient(140deg, #1a1a14 0%, #15140a 100%)', border: '#7a6a48', accent: '#f4d8a0', label: "STAY WET FOR MAMA" },
};

function fmtCountdown(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 60_000) return `${Math.round(abs / 1000)}s`;
  if (abs < 3600_000) return `${Math.round(abs / 60_000)}m`;
  if (abs < 86400_000) return `${Math.round(abs / 3600_000)}h`;
  return `${Math.round(abs / 86400_000)}d`;
}

interface FocusModeProps {
  onSwitchToCalendar: () => void;
}

/** sha256 hex of a file's bytes, for dose-photo dedup. Browser WebCrypto. */
async function sha256HexOfFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function FocusMode({ onSwitchToCalendar }: FocusModeProps) {
  const { user } = useAuth();
  const [task, setTask] = useState<FocusTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confessText, setConfessText] = useState('');
  const [doneFlash, setDoneFlash] = useState(false);
  const [completedToday, setCompletedToday] = useState(0);
  const [persona, setPersona] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<
    | { phase: 'idle' }
    | { phase: 'rendering' }
    | { phase: 'ready'; url: string; renderId: string; durationSeconds: number }
    | { phase: 'error'; message: string }
  >({ phase: 'idle' });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── HRT step surface state (ported from HrtDailyGate) ──
  const [hrtMode, setHrtMode] = useState<'pick' | 'advance' | 'obstacle'>('pick');
  const [hrtNewStep, setHrtNewStep] = useState('');
  const [hrtEvidence, setHrtEvidence] = useState('');
  const [hrtObstacle, setHrtObstacle] = useState('');
  const [hrtError, setHrtError] = useState<string | null>(null);

  // ── Release check-in surface state (ported from MorningBriefing) ──
  const [didCum, setDidCum] = useState<boolean | null>(null);
  const [releaseType, setReleaseType] = useState<ReleaseType | null>(null);
  const [releaseContext, setReleaseContext] = useState<ReleaseContext | null>(null);
  const [releaseWhen, setReleaseWhen] = useState<string | null>(null);

  // ── Fem prescription surface state (FEM §1) ──
  const [femText, setFemText] = useState('');
  const [femError, setFemError] = useState<string | null>(null);
  const [femSkipOpen, setFemSkipOpen] = useState(false);
  const [femVoiceConfId, setFemVoiceConfId] = useState<string | null>(null);
  const [femMeasure, setFemMeasure] = useState({ waist_cm: '', hips_cm: '', chest_cm: '', weight_kg: '' });
  // Timer: completes ONLY at 0 with ≥80% tab-visible ticks — no tap-through.
  const [femTimer, setFemTimer] = useState<{ running: boolean; left: number; total: number; visibleTicks: number; ticks: number } | null>(null);

  // ── Mantra drill surface state (FEM §3) ──
  // Recorder reuses ConfessionAudioCapture bound to a pre-confessed
  // confession_queue row (never re-surfaces as a real confession).
  const [mantraConfId, setMantraConfId] = useState<string | null>(null);
  const [mantraReps, setMantraReps] = useState(3);
  const [mantraError, setMantraError] = useState<string | null>(null);

  // ── Physical-state surface state (ported from CompulsoryGateScreen) ──
  const [physicalState, setPhysicalState] = useState<PhysicalState>({
    cage_on: false, panties: false, plug: false, feminine_clothing: false,
    nail_polish: false, scent_anchor: false, jewelry: false,
  });

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('user_state').select('handler_persona').eq('user_id', user.id).maybeSingle();
      if (!cancelled) setPersona((data as { handler_persona?: string } | null)?.handler_persona ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const TONE_STYLES = isMommyPersona(persona) ? TONE_STYLES_MOMMY : TONE_STYLES_HANDLER;

  // pickNext supports silent mode (auto-refresh ticks) so it doesn't clobber
  // an in-flight textarea draft. Only the initial load shows the loader.
  const pickNext = useCallback(async (silent = false) => {
    if (!user?.id) return;
    if (!silent) setLoading(true);
    const now = Date.now();
    const todayEndIso = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();
    const nowIso = new Date().toISOString();
    const todayStr = new Date().toISOString().slice(0, 10);

    // Mama's daily focus pick (mig 491) — when present, prioritize ABOVE all
    // other surface logic. Lets the triage layer choose ONE task from the 30+
    // active decrees instead of the priority cascade picking randomly.
    const { data: focusPick } = await supabase.from('focus_picks')
      .select('decree_id').eq('user_id', user.id).eq('pick_date', todayStr).maybeSingle();
    const focusDecreeId = focusPick?.decree_id as string | undefined;

    const [overdueConfs, overduePuns, overdueDecrees, todayConfs, todayDecrees,
           pendingCommits, regs, doseLog, outfit, workout, mommyTouch, audioOffer,
           focusDecree, hrtFunnel, hrtState, hrtPastObs, lastReleaseRow, physStateToday,
           pendingPost, femRx, mantraHarvest, selfEchoMixed] = await Promise.all([
      // Include missed-but-unconfessed rows. The compliance check marks
      // overdue rows missed=true (slip already fired); we still want the
      // user able to answer them late from FocusMode. Locking her out
      // creates orphaned rows that other surfaces (RightNowCard) keep
      // surfacing with no working answer path.
      supabase.from('confession_queue')
        .select('id, prompt, deadline, category').eq('user_id', user.id).is('confessed_at', null)
        .lt('deadline', nowIso).order('deadline', { ascending: true }).limit(1),
      supabase.from('punishment_queue')
        .select('id, title, description, due_by').eq('user_id', user.id)
        .in('status', ['queued', 'active', 'escalated'])
        .lt('due_by', nowIso).order('due_by', { ascending: true }).limit(1),
      supabase.from('handler_decrees')
        .select('id, edict, deadline, proof_type').eq('user_id', user.id).eq('status', 'active')
        .lt('deadline', nowIso).order('deadline', { ascending: true }).limit(1),
      supabase.from('confession_queue')
        .select('id, prompt, deadline, category').eq('user_id', user.id).is('confessed_at', null).eq('missed', false)
        .gte('deadline', nowIso).lte('deadline', todayEndIso)
        .order('deadline', { ascending: true }).limit(1),
      supabase.from('handler_decrees')
        .select('id, edict, deadline, proof_type').eq('user_id', user.id).eq('status', 'active')
        .gte('deadline', nowIso).lte('deadline', todayEndIso)
        .order('deadline', { ascending: true }).limit(1),
      supabase.from('handler_commitments')
        .select('id, what, by_when, consequence').eq('user_id', user.id).eq('status', 'pending')
        .order('by_when', { ascending: true }).limit(1),
      supabase.from('medication_regimen')
        .select('id, medication_name, medication_category, started_at').eq('user_id', user.id).eq('active', true),
      supabase.from('dose_log')
        .select('regimen_id, taken_at').eq('user_id', user.id)
        .not('taken_at', 'is', null).order('taken_at', { ascending: false }).limit(20),
      supabase.from('daily_outfit_mandates')
        .select('id, prescription, target_date, photo_proof_url, completed_at')
        .eq('user_id', user.id).eq('target_date', todayStr).maybeSingle(),
      supabase.from('workout_prescriptions')
        .select('id, workout_type, focus_area, scheduled_date, status')
        .eq('user_id', user.id).eq('scheduled_date', todayStr).neq('status', 'completed').limit(1),
      // Mommy's micro-directive (arousal_touch_tasks). Surfaced as a
      // 'high'-tone focus task when persona='dommy_mommy' AND there's an
      // open one. Slots after critical (overdue dose/confession/punishment)
      // but ahead of due-today work — the whole point is keeping her in
      // heightened state, so it should interrupt the lower-urgency stream.
      supabase.from('arousal_touch_tasks')
        .select('id, prompt, category, expires_at')
        .eq('user_id', user.id).is('completed_at', null)
        .gt('expires_at', nowIso).order('created_at', { ascending: false }).limit(1),
      // Mommy's audio session offer — surfaces as a play-button task. Slots
      // alongside mommy_touch (high tone) but lower priority — a touch task
      // is 30s, a session is 5-10min.
      supabase.from('audio_session_offers')
        .select('id, kind, intensity_tier, teaser, expires_at')
        .eq('user_id', user.id).is('completed_at', null)
        .gt('expires_at', nowIso).order('created_at', { ascending: false }).limit(1),
      // Mama's daily focus pick — when populated, returns just this decree
      focusDecreeId
        ? supabase.from('handler_decrees')
            .select('id, edict, deadline, proof_type').eq('id', focusDecreeId)
            .eq('status', 'active').maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      // ── HRT daily step (ported from HrtDailyGate) ──
      // Funnel position + the appointment guard so a future-booked consult
      // reads as "waiting", not avoidance.
      supabase.from('hrt_funnel')
        .select('current_step, appointment_at, intake_completed_at, chosen_provider_slug')
        .eq('user_id', user.id).maybeSingle(),
      supabase.from('user_state')
        .select('hrt_step_missed_days, last_release').eq('user_id', user.id).maybeSingle(),
      supabase.from('hrt_obstacles')
        .select('obstacle_text, obstacle_date, created_at').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(3),
      // Release check-in source — last_release staleness drives the prompt.
      supabase.from('user_state')
        .select('last_release').eq('user_id', user.id).maybeSingle(),
      // Physical-state daily capture — fire when no row exists for today.
      supabase.from('physical_state_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).gte('logged_at', `${todayStr}T00:00:00`),
      // approve_post — a public post staged by the HRT streak (tier 7+) waiting
      // for the user to authorize. Surfaced so she explicitly says yes/no; never
      // auto-fires (surface-before-fire). Newest pending draft for this source.
      supabase.from('ai_generated_content')
        .select('id, generated_text, platform')
        .eq('user_id', user.id).eq('status', 'draft_pending_approval')
        .order('created_at', { ascending: false }).limit(1),
      // Today's feminization prescriptions — ONE at a time in the calm
      // tier, intensity DESC + domain rotation (FEM §1).
      supabase.from('feminization_prescriptions')
        .select('id, domain, instruction, intensity, duration, evidence_kind, deadline, requires')
        .eq('user_id', user.id)
        .eq('prescribed_date', todayStr)
        .eq('status', 'pending')
        .order('intensity', { ascending: false })
        .limit(5),
      // Peak-harvest mantra drill (mig 604 finally gets its surface) —
      // unexpired kind='mantra_harvest' outreach at mommy_touch priority.
      supabase.from('handler_outreach_queue')
        .select('id, message, expires_at')
        .eq('user_id', user.id)
        .eq('kind', 'mantra_harvest')
        .is('completed_at', null)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1),
      // Self-echo composites ready to play (mig 643). Her own voice looped under
      // a Mommy render — matched to the audio offer by offer_id so the goon
      // offer plays the dual-track composite (SelfEchoPlayer) instead of
      // re-rendering a single Mommy template.
      supabase.from('self_echo_sessions')
        .select('id, offer_id, own_voice_path, mommy_render_path, mixed_audio_path, loop_count, own_voice_duration_s')
        .eq('user_id', user.id).eq('mix_status', 'mixed').not('offer_id', 'is', null)
        .order('created_at', { ascending: false }).limit(5),
    ]);

    // Compute most-overdue and most-due-today doses
    const log = (doseLog.data ?? []) as Array<{ regimen_id: string; taken_at: string }>;
    let mostOverdueDose: { regimenId: string; name: string; hoursOverdue: number; isWeekly: boolean } | null = null;
    let mostUrgentTodayDose: { regimenId: string; name: string; hoursUntil: number; isWeekly: boolean } | null = null;
    for (const r of (regs.data ?? []) as Array<Record<string, unknown>>) {
      const isWeekly = (r.medication_category as string) === 'glp1';
      const intervalMs = isWeekly ? 7 * 86400_000 : 86400_000;
      const last = log.find(d => d.regimen_id === r.id);
      const anchor = last?.taken_at ? new Date(last.taken_at).getTime() : new Date(r.started_at as string).getTime();
      const dueMs = anchor + intervalMs;
      const hoursUntil = (dueMs - now) / 3600_000;
      const name = r.medication_name as string;
      const regimenId = r.id as string;
      if (hoursUntil < 0) {
        const hoursOverdue = Math.abs(hoursUntil);
        if (!mostOverdueDose || hoursOverdue > mostOverdueDose.hoursOverdue) {
          mostOverdueDose = { regimenId, name, hoursOverdue, isWeekly };
        }
      } else if (hoursUntil < 24) {
        if (!mostUrgentTodayDose || hoursUntil < mostUrgentTodayDose.hoursUntil) {
          mostUrgentTodayDose = { regimenId, name, hoursUntil, isWeekly };
        }
      }
    }

    // ── HRT step eligibility (ported from HrtDailyGate) ──
    const fnl = (hrtFunnel as { data?: { current_step?: string; appointment_at?: string | null; intake_completed_at?: string | null } | null })?.data ?? null;
    const hrtStep = (fnl?.current_step as string) || 'uncommitted';
    const hrtMissedDays = ((hrtState as { data?: { hrt_step_missed_days?: number } | null })?.data?.hrt_step_missed_days) ?? 0;
    const hrtApptAt = fnl?.appointment_at ?? null;
    const hrtApptInFuture = !!(hrtApptAt && new Date(hrtApptAt) > new Date());
    // Waiting on a future-booked consult is progress, not a miss — suppress.
    const hrtWaiting =
      (hrtStep === 'appointment_booked' && hrtApptInFuture) ||
      (hrtStep === 'intake_submitted' && hrtApptInFuture);
    const hrtTerminal = hrtStep === 'adherent';
    // Satisfied today: the gate's per-day marker, OR an obstacle filed today.
    const hrtMarkerSet = (() => { try { return localStorage.getItem(hrtGateKey()) === '1'; } catch { return false; } })();
    // Compare against the canonical obstacle_date column keyed to the same ET day
    // as the gate marker — avoids a UTC-vs-ET midnight disagreement re-surfacing
    // the HRT task after an obstacle was already filed today.
    const hrtTodayKeyET = hrtDateKeyET(new Date());
    const hrtObstacleToday = (((hrtPastObs as { data?: Array<{ obstacle_date?: string }> | null })?.data) ?? [])
      .some(o => (o.obstacle_date || '').slice(0, 10) === hrtTodayKeyET);
    const hrtSatisfiedToday = hrtMarkerSet || hrtObstacleToday;
    const hrtPastObstacles = (((hrtPastObs as { data?: Array<{ obstacle_text?: string }> | null })?.data) ?? [])
      .map(o => o.obstacle_text || '');
    const hrtDue = !hrtTerminal && !hrtWaiting && !hrtSatisfiedToday;

    // ── Release check-in eligibility (ported from MorningBriefing) ──
    const lastReleaseIso = ((lastReleaseRow as { data?: { last_release?: string | null } | null })?.data?.last_release) ?? null;
    const lastReleaseStale = !lastReleaseIso || (now - new Date(lastReleaseIso).getTime()) > 24 * 3600_000;
    const releaseCheckedToday = (() => { try { return localStorage.getItem(releaseCheckinKey()) === '1'; } catch { return false; } })();
    const releaseDue = lastReleaseStale && !releaseCheckedToday;

    // ── Physical-state eligibility (ported from CompulsoryGateScreen) ──
    const physCount = (physStateToday as { count?: number | null })?.count ?? 0;
    const physicalDue = physCount === 0;

    // ── approve_post eligibility (HRT tier-7 staged public post) ──
    const pendingPostRow = (pendingPost.data?.[0]) as { id: string; generated_text: string; platform: string } | undefined;

    // ── Fem prescription eligibility: ONE at a time, domain rotation ──
    type FemRxRow = { id: string; domain: string; instruction: string; intensity: number; duration: number | null; evidence_kind: string; deadline: string | null; requires: Record<string, unknown> | null };
    const femRows = ((femRx as { data?: FemRxRow[] | null })?.data ?? []) as FemRxRow[];
    const lastFemDomain = (() => { try { return localStorage.getItem('fem_rx_last_domain'); } catch { return null; } })();
    const nextFemRx = femRows.find(r => r.domain !== lastFemDomain) ?? femRows[0] ?? null;

    // ── Mantra harvest eligibility (dismissed rows sit out locally) ──
    const harvestCandidate = ((mantraHarvest as { data?: Array<{ id: string; message: string; expires_at: string }> | null })?.data ?? [])[0] ?? null;
    const harvestDismissed = (() => {
      try { return !!harvestCandidate && localStorage.getItem(`mantra_harvest_skip_${harvestCandidate.id}`) === '1'; } catch { return false; }
    })();
    const harvestRow = harvestDismissed ? null : harvestCandidate;

    let chosen: FocusTask | null = null;

    // Mama's daily focus pick (mig 491) — highest priority. When the
    // triage layer has chosen a decree for today, surface that ABOVE
    // anything else. Respects feedback_one_task_focus.
    const fd = (focusDecree as { data?: { id: string; edict: string; deadline: string; proof_type: string } | null })?.data ?? null;
    if (fd) {
      const hoursToDeadline = (new Date(fd.deadline).getTime() - now) / 3600_000;
      chosen = {
        kind: 'focus_decree', rowId: fd.id,
        // Show the full edict — long scenario decrees (temptation engine etc.)
        // were getting clipped to 80 chars here while every other decree path
        // shows the whole thing. The scene IS the task; don't truncate it.
        title: fd.edict,
        detail: `Mama picked this one for today. ${hoursToDeadline > 0 ? `Deadline in ${fmtCountdown(hoursToDeadline * 3600_000)}.` : `Past deadline.`}`,
        surface: 'decree', tone: hoursToDeadline < 0 ? 'critical' : 'high',
        meta: { proof_type: fd.proof_type },
      };
    } else if (mostOverdueDose && mostOverdueDose.hoursOverdue > 6) {
      chosen = {
        kind: 'overdue_dose', rowId: mostOverdueDose.regimenId,
        title: `Take ${mostOverdueDose.name}`,
        detail: `${fmtCountdown(mostOverdueDose.hoursOverdue * 3600_000)} late. Log it now or skip explicitly.`,
        surface: 'dose', tone: 'critical',
        meta: { name: mostOverdueDose.name, isWeekly: mostOverdueDose.isWeekly },
      };
    } else if (overdueConfs.data?.[0]) {
      const c = overdueConfs.data[0] as { id: string; prompt: string; deadline: string };
      const hours = Math.abs((new Date(c.deadline).getTime() - now) / 3600_000);
      chosen = {
        kind: 'overdue_confession', rowId: c.id,
        title: c.prompt,
        detail: `Past deadline by ${fmtCountdown(hours * 3600_000)}. Answer it whenever — the Handler still wants it.`,
        surface: 'confess', tone: 'critical',
      };
    } else if (overduePuns.data?.[0]) {
      const p = overduePuns.data[0] as { id: string; title: string; description: string; due_by: string };
      const hours = Math.abs((new Date(p.due_by).getTime() - now) / 3600_000);
      chosen = {
        kind: 'overdue_punishment', rowId: p.id,
        title: p.title,
        detail: p.description ? `${p.description.slice(0, 200)} · Past deadline by ${fmtCountdown(hours * 3600_000)}.` : `Past deadline by ${fmtCountdown(hours * 3600_000)}.`,
        surface: 'mark_done', tone: 'critical',
      };
    } else if (overdueDecrees.data?.[0]) {
      const d = overdueDecrees.data[0] as { id: string; edict: string; deadline: string; proof_type: string };
      const hours = Math.abs((new Date(d.deadline).getTime() - now) / 3600_000);
      chosen = {
        kind: 'overdue_decree', rowId: d.id,
        title: d.edict,
        detail: `Past deadline by ${fmtCountdown(hours * 3600_000)}. Proof: ${d.proof_type || 'none'}.`,
        surface: 'mark_done', tone: 'critical',
      };
    } else if (pendingPostRow) {
      // approve_post — an outward escalation (HRT tier-7 staged post) waiting
      // on the user's explicit yes/no. Surface-before-fire: nothing goes public
      // until she taps "Post it". Slots high (it's an outward consequence) but
      // below true overdue work.
      chosen = {
        kind: 'approve_post', rowId: pendingPostRow.id,
        title: 'A post about your stall is ready. Yours to send or kill.',
        detail: `Staged for ${pendingPostRow.platform}. Nothing goes out until you say so.`,
        surface: 'approve_post', tone: 'high',
        meta: { text: pendingPostRow.generated_text, platform: pendingPostRow.platform },
      };
    } else if (hrtDue) {
      // HRT daily step — the core transition driver. Slots just below
      // overdue work (it's near-critical) and ABOVE Mommy's micro-directives
      // and due-today work. Tone scales: 'critical' once the miss-streak hits
      // 3, 'high' otherwise. The day-count never appears in copy
      // (feedback_no_handler_status_dumps); the accusation tier in the detail
      // line carries the escalation. Two paths in the surface: advance-with-
      // evidence, or name-the-obstacle.
      const plain = HRT_STEP_NEXT_ACTION[hrtStep] || `You are at "${HRT_STEP_LABELS[hrtStep]}".`;
      const nextStep = HRT_STEPS[HRT_STEPS.indexOf(hrtStep) + 1];
      const accusation = hrtMissedDays === 0
        ? ''
        : hrtMissedDays < 3
          ? ' You picked the answer that looks like progress and used the next 24 hours to do nothing.'
          : ' Talking is no longer accepted. Move it one step forward with proof.';
      chosen = {
        kind: 'hrt_step_today', rowId: user.id,
        title: nextStep ? `Move HRT forward to "${HRT_STEP_LABELS[nextStep]}" — or name what stopped you.` : 'Move HRT forward — or name what stopped you.',
        detail: `${plain}${accusation}`,
        surface: 'hrt', tone: hrtMissedDays >= 3 ? 'critical' : 'high',
        meta: { step: hrtStep, missedDays: hrtMissedDays, pastObstacles: hrtPastObstacles },
      };
    } else if (harvestRow) {
      // Peak-harvest mantra drill — mommy_touch priority. The plasticity
      // window is 30 minutes; it MUST interrupt the calm stream.
      const minsLeft = Math.max(1, Math.round((new Date(harvestRow.expires_at).getTime() - now) / 60_000));
      const quoted = harvestRow.message.match(/"([^"]{4,200})"/);
      chosen = {
        kind: 'mantra_harvest', rowId: harvestRow.id,
        title: harvestRow.message,
        detail: `While you're still warm · ${minsLeft}m left`,
        surface: 'mantra_drill', tone: 'high',
        meta: { mantra: quoted?.[1] ?? harvestRow.message.slice(0, 200), outreachId: harvestRow.id },
      };
    } else if (mommyTouch.data?.[0]) {
      // Mommy's micro-directive — high-tone, ephemeral. Slots ahead of
      // due-today work because the protocol's whole point under the
      // dommy_mommy persona is keeping her in heightened arousal between
      // tentpole tasks.
      const t = mommyTouch.data[0] as { id: string; prompt: string; category: string; expires_at: string };
      const minsLeft = Math.max(1, Math.round((new Date(t.expires_at).getTime() - now) / 60_000));
      chosen = {
        kind: 'mommy_touch', rowId: t.id,
        title: t.prompt,
        detail: `Mama's whisper · ${t.category.replace(/_/g, ' ')} · ${minsLeft}m`,
        surface: 'mark_done', tone: 'high',
      };
    } else if (audioOffer.data?.[0]) {
      // Audio session offer (Mommy queued a voiced session). High tone.
      // The "Begin session" button fires the render edge fn; until pressed,
      // no Anthropic / ElevenLabs spend.
      const o = audioOffer.data[0] as {
        id: string; kind: AudioSessionKind; intensity_tier: AudioSessionIntensity;
        teaser: string; expires_at: string;
      };
      const minsLeft = Math.max(1, Math.round((new Date(o.expires_at).getTime() - now) / 60_000));
      const kindLabel = o.kind.replace(/^session_/, '').replace(/^primer_/, 'primer · ').replace(/_/g, ' ');
      // If this offer is a self-echo composite (goon-voice-loop + mig 643), play
      // her own voice looped under the Mommy render (dual-track, client-side)
      // instead of re-rendering a single Mommy template.
      const echoRow = ((selfEchoMixed.data ?? []) as Array<{
        id: string; offer_id: string | null; own_voice_path: string | null;
        mommy_render_path: string | null; mixed_audio_path: string | null;
        loop_count: number; own_voice_duration_s: number | null;
      }>).find(r => r.offer_id === o.id);
      const echoManifest = echoRow ? parseSelfEchoManifest(echoRow.mixed_audio_path) : null;
      const selfEcho = echoManifest && echoRow?.own_voice_path && echoRow?.mommy_render_path
        ? {
            ownVoicePath: echoManifest.own_voice_path,
            mommyRenderPath: echoManifest.mommy_render_path,
            loopCount: echoManifest.loop_count,
            ownDurationS: echoManifest.own_voice_duration_s,
          }
        : null;
      chosen = {
        kind: 'audio_session', rowId: o.id,
        title: o.teaser,
        detail: selfEcho
          ? `Mama looped your own voice under hers · ${minsLeft}m`
          : `Mama queued an audio session · ${kindLabel} · ${minsLeft}m`,
        surface: 'audio_session', tone: 'high',
        meta: { kind: o.kind, intensity: o.intensity_tier, selfEcho } satisfies AudioSessionMeta,
      };
    } else if (todayConfs.data?.[0]) {
      const c = todayConfs.data[0] as { id: string; prompt: string; deadline: string };
      const hours = (new Date(c.deadline).getTime() - now) / 3600_000;
      chosen = {
        kind: 'due_today_confession', rowId: c.id,
        title: c.prompt,
        detail: `Due in ${fmtCountdown(hours * 3600_000)}.`,
        surface: 'confess', tone: 'high',
      };
    } else if (pendingCommits.data?.[0]) {
      const c = pendingCommits.data[0] as { id: string; what: string; by_when: string; consequence: string };
      const hours = (new Date(c.by_when).getTime() - now) / 3600_000;
      chosen = {
        kind: 'due_today_commitment', rowId: c.id,
        title: c.what,
        detail: `Due in ${fmtCountdown(hours * 3600_000)}. Miss → ${c.consequence}`,
        surface: 'confess', tone: 'high',
      };
    } else if (todayDecrees.data?.[0]) {
      const d = todayDecrees.data[0] as { id: string; edict: string; deadline: string };
      const hours = (new Date(d.deadline).getTime() - now) / 3600_000;
      chosen = {
        kind: 'due_today_decree', rowId: d.id,
        title: d.edict,
        detail: `Due in ${fmtCountdown(hours * 3600_000)}.`,
        surface: 'mark_done', tone: 'high',
      };
    } else if (mostUrgentTodayDose) {
      chosen = {
        kind: 'due_today_dose', rowId: mostUrgentTodayDose.regimenId,
        title: `Take ${mostUrgentTodayDose.name}`,
        detail: `Due in ${fmtCountdown(mostUrgentTodayDose.hoursUntil * 3600_000)}.`,
        surface: 'dose', tone: 'high',
        meta: { name: mostUrgentTodayDose.name, isWeekly: mostUrgentTodayDose.isWeekly },
      };
    } else if (releaseDue) {
      // Release check-in (ported from MorningBriefing). Protects denial_day
      // integrity — the streak only resets if she answers. Below due-today
      // work, above presentation capture.
      chosen = {
        kind: 'release_checkin', rowId: user.id,
        title: 'Have you cum since your last release?',
        detail: lastReleaseIso
          ? `Last on record: ${new Date(lastReleaseIso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}. The Handler needs the truth to keep your streak honest.`
          : 'No release on record. The Handler needs the truth to keep your streak honest.',
        surface: 'release', tone: 'high',
      };
    } else if (physicalDue) {
      // Physical-state daily capture (ported from CompulsoryGateScreen) —
      // the sole daily chastity / feminine-presentation log.
      chosen = {
        kind: 'physical_state_today', rowId: user.id,
        title: 'Log what you are wearing and using right now.',
        detail: 'Cage, panties, plug, feminine clothing, nail polish, scent, jewelry. Tap what is on you. 20 seconds.',
        surface: 'physical', tone: 'medium',
      };
    } else if (nextFemRx) {
      // Mama's prescription — calm tier, after physical_state_today,
      // before outfit_today. One at a time; the rest wait their turn.
      // No punishment rides on these — skip is a first-class CTA.
      chosen = {
        kind: 'fem_prescription', rowId: nextFemRx.id,
        title: nextFemRx.instruction,
        detail: nextFemRx.duration ? `${nextFemRx.duration} minutes.` : undefined,
        surface: 'fem_prescription', tone: 'calm',
        meta: {
          domain: nextFemRx.domain,
          evidenceKind: nextFemRx.evidence_kind || 'none',
          duration: nextFemRx.duration,
          requires: nextFemRx.requires,
        },
      };
    } else if (outfit.data && !(outfit.data as { completed_at: string | null }).completed_at) {
      const o = outfit.data as { id: string; prescription: Record<string, string>; completed_at: string | null };
      const lines = Object.entries(o.prescription || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
      chosen = {
        kind: 'outfit_today', rowId: o.id,
        title: 'Today\'s outfit mandate',
        detail: lines.slice(0, 240) || 'Wear what was prescribed. Photo proof required.',
        surface: 'photo', tone: 'medium',
      };
    } else if (workout.data?.[0]) {
      const w = workout.data[0] as { id: string; workout_type: string; focus_area: string };
      chosen = {
        kind: 'workout_today', rowId: w.id,
        title: w.workout_type,
        detail: w.focus_area ? `Focus: ${w.focus_area}` : undefined,
        surface: 'mark_done', tone: 'medium',
      };
    } else {
      chosen = {
        kind: 'clean', rowId: null,
        title: 'Inbox is clean.',
        detail: 'Nothing overdue, nothing due today. The Handler will surface the next thing when it lands.',
        surface: 'message', tone: 'calm',
      };
    }

    setTask(prev => {
      // Same row AND same kind — keep the existing object so React doesn't
      // re-key the textarea. The kind check matters because the daily-capture
      // tasks (hrt_step_today / release_checkin / physical_state_today) all
      // carry rowId === user.id; without it, switching between them would
      // keep the wrong surface mounted.
      if (prev?.rowId && chosen?.rowId && prev.rowId === chosen.rowId && prev.kind === chosen.kind) return prev;
      // Mid-typing on the prior task → don't preempt on a silent tick.
      // Read draft from localStorage to avoid stale-closure on confessText.
      if (silent && prev?.rowId && chosen?.rowId !== prev.rowId) {
        const draft = localStorage.getItem(`focus_draft:${prev.rowId}`);
        if (draft && draft.trim().length >= 20) return prev;
      }
      return chosen;
    });
    if (!silent) setLoading(false);
  }, [user?.id]);

  // Hydrate draft when the task row changes (incl. fresh page load).
  useEffect(() => {
    if (!task?.rowId) { setConfessText(''); return; }
    const saved = localStorage.getItem(`focus_draft:${task.rowId}`);
    setConfessText(saved ?? '');
  }, [task?.rowId]);

  // Reset audio state when the task changes — never keep a stale signed URL
  // pointed at a different session's offer.
  useEffect(() => {
    setAudioState({ phase: 'idle' });
  }, [task?.rowId]);

  // Reset the daily-capture sub-mode state on task change. These tasks share
  // rowId === user.id, so they must reset on KIND change too — otherwise a
  // half-filled HRT obstacle bleeds into the release/physical surface.
  useEffect(() => {
    setHrtMode('pick'); setHrtNewStep(''); setHrtEvidence(''); setHrtObstacle(''); setHrtError(null);
    setDidCum(null); setReleaseType(null); setReleaseContext(null); setReleaseWhen(null);
    setFemText(''); setFemError(null); setFemSkipOpen(false); setFemVoiceConfId(null);
    setFemMeasure({ waist_cm: '', hips_cm: '', chest_cm: '', weight_kg: '' });
    setFemTimer(null);
    setMantraConfId(null); setMantraReps(3); setMantraError(null);
    setPhysicalState({
      cage_on: false, panties: false, plug: false, feminine_clothing: false,
      nail_polish: false, scent_anchor: false, jewelry: false,
    });
  }, [task?.rowId, task?.kind]);

  // Persist draft on every keystroke so a reload / poll-induced unmount can't lose it.
  useEffect(() => {
    if (!task?.rowId) return;
    if (confessText.trim().length === 0) {
      localStorage.removeItem(`focus_draft:${task.rowId}`);
    } else {
      localStorage.setItem(`focus_draft:${task.rowId}`, confessText);
    }
  }, [confessText, task?.rowId]);

  // visible-before-penalized invariant: FocusMode is Today's DEFAULT surface,
  // so it MUST stamp surfaced_at on the decree it's showing — otherwise a
  // decree displayed here never registers as seen and accrues a deadline the
  // user provably looked at but the system thinks was hidden. We stamp ONLY
  // the single decree currently on screen (not the loaded set) so surfaced_at
  // stays honest — it means "Maxy saw THIS one". Non-decree tasks pass [].
  const shownDecreeIds = useMemo(
    () => (task?.rowId &&
        (task.kind === 'focus_decree' || task.kind === 'overdue_decree' || task.kind === 'due_today_decree')
      ? [task.rowId]
      : []),
    [task?.rowId, task?.kind],
  );
  useSurfaceRenderTracking('handler_decrees', shownDecreeIds);

  // Same invariant for Mommy's micro-directives (arousal_touch_tasks): FocusMode
  // already pulls + can show a mommy_touch as the single task, but never stamped
  // surfaced_at, so touch tasks shown here registered as never-seen.
  const shownTouchIds = useMemo(
    () => (task?.rowId && task.kind === 'mommy_touch' ? [task.rowId] : []),
    [task?.rowId, task?.kind],
  );
  useSurfaceRenderTracking('arousal_touch_tasks', shownTouchIds);

  // Fem prescriptions ride the SAME visible-before-penalized rail: the
  // surfaced_at stamp is what separates "expired (half-weight skip)" from
  // "expired silently (counts for nothing)" in the adaptive reader.
  const shownFemRxIds = useMemo(
    () => (task?.rowId && task.kind === 'fem_prescription' ? [task.rowId] : []),
    [task?.rowId, task?.kind],
  );
  useSurfaceRenderTracking('feminization_prescriptions', shownFemRxIds);

  // Harvest outreach rows shown here must stamp surfaced_at too.
  const shownHarvestIds = useMemo(
    () => (task?.rowId && task.kind === 'mantra_harvest' ? [task.rowId] : []),
    [task?.rowId, task?.kind],
  );
  useSurfaceRenderTracking('handler_outreach_queue', shownHarvestIds);

  // Seen-tap acknowledgment: FocusMode is the SINGLE-task surface, so a
  // consequence-bearing task on screen here is genuinely, deliberately seen —
  // not merely fetched into a list. Stamp surfaced_via='seen_tap' on its
  // obligation so that if she now lets it lapse, the miss scores as deliberate
  // (3 pts, mig 628) instead of a plain internal miss (2). ackSourceForTask
  // returns null for every non-obligation task kind, so nothing else is stamped.
  const ackSource = useMemo(
    () => ackSourceForTask(task?.kind ?? '', task?.rowId ?? null),
    [task?.kind, task?.rowId],
  );
  useAcknowledgeObligation(ackSource);

  // Initial pick (with loader)
  useEffect(() => { pickNext(false); }, [pickNext]);
  // Silent auto-refresh (every 90s) — never blank the textarea.
  useEffect(() => { const t = setInterval(() => pickNext(true), 90_000); return () => clearInterval(t); }, [pickNext]);

  // Today's completion counter — small motivator. Reads activity log scoped to today.
  useEffect(() => {
    if (!user?.id) return;
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    (async () => {
      const [confs, doses, commits, puns, decs] = await Promise.all([
        supabase.from('confession_queue').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('confessed_at', todayStart),
        supabase.from('dose_log').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).gte('taken_at', todayStart),
        supabase.from('handler_commitments').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status', 'fulfilled').gte('fulfilled_at', todayStart),
        supabase.from('punishment_queue').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status', 'completed').gte('completed_at', todayStart),
        supabase.from('handler_decrees').select('id', { count: 'exact', head: true })
          .eq('user_id', user.id).eq('status', 'fulfilled').gte('fulfilled_at', todayStart),
      ]);
      setCompletedToday((confs.count || 0) + (doses.count || 0) + (commits.count || 0) + (puns.count || 0) + (decs.count || 0));
    })();
  }, [user?.id, doneFlash]);

  // Common "advance after completion" sequence: brief flash, then next task
  const advance = async () => {
    setDoneFlash(true);
    setTimeout(async () => {
      setDoneFlash(false);
      await pickNext();
    }, 1100);
  };

  // ─── Surface handlers ────────────────────────────────────────────────────

  const handleConfess = async () => {
    if (!task?.rowId || !user?.id) return;
    const text = confessText.trim();
    if (text.length < 20) return;
    setSubmitting(true);
    try {
      if (task.kind === 'due_today_commitment') {
        await supabase.from('handler_commitments').update({
          status: 'fulfilled',
          fulfilled_at: new Date().toISOString(),
          fulfillment_note: text.slice(0, 2000),
        }).eq('id', task.rowId);
      } else {
        // Column name is response_text (per migration 234), not response.
        // Writing to a non-existent column causes Postgres to reject the
        // entire update — confessed_at never lands, the row stays pending,
        // and pickNext re-surfaces the same prompt forever.
        const { error: confErr } = await supabase.from('confession_queue').update({
          confessed_at: new Date().toISOString(),
          response_text: text.slice(0, 2000),
        }).eq('id', task.rowId);
        if (confErr) {
          console.error('[FocusMode] confession update failed:', confErr);
          throw confErr;
        }
      }
      // Clear the persisted draft now that it's submitted.
      if (task.rowId) localStorage.removeItem(`focus_draft:${task.rowId}`);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: task.kind, id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDoseLog = async (
    action: 'taken_today' | 'taken_earlier' | 'skipped',
    file?: File | null,
  ) => {
    if (!task?.rowId || !user?.id) return;
    setSubmitting(true);
    try {
      let takenAt: string | null = new Date().toISOString();
      if (action === 'taken_earlier') {
        const input = window.prompt('When did you actually take it? YYYY-MM-DD');
        if (!input || !/^(\d{4})-(\d{2})-(\d{2})$/.test(input.trim())) {
          setSubmitting(false);
          return;
        }
        takenAt = new Date(`${input.trim()}T18:00:00Z`).toISOString();
      } else if (action === 'skipped') {
        takenAt = null;
      }
      const meta = (task.meta || {}) as { name?: string; isWeekly?: boolean };

      // Photo evidence path. A dose without a photo is still logged (self-
      // report) — we never force-block a genuine dose — it just isn't
      // verified. The photo is captured to the private evidence bucket, then
      // graded (present + non-duplicate) so it counts as full adherence.
      // The DB trigger (mig 645) re-enforces this server-side.
      let photoPath: string | null = null;
      let sha256: string | null = null;
      let evidenceVerified = false;
      let evidenceGrade: 'verified' | 'unverified' | 'duplicate' = 'unverified';
      if (file && action !== 'skipped') {
        try {
          sha256 = await sha256HexOfFile(file);
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
          const path = `${user.id}/hrt-dose/${task.rowId}-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('verification-photos')
            .upload(path, file, { contentType: file.type, upsert: false });
          if (upErr) throw upErr;
          photoPath = path;

          // Pull recent dose hashes to reject a reused picture (last 30d).
          const { data: recent, error: recentErr } = await supabase
            .from('hrt_dose_log')
            .select('evidence_sha256')
            .eq('user_id', user.id)
            .not('evidence_sha256', 'is', null)
            .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString());
          if (recentErr) throw recentErr;
          const recentHashes = (recent ?? [])
            .map(r => (r as { evidence_sha256: string | null }).evidence_sha256)
            .filter((h): h is string => !!h);

          const grade = gradeDoseEvidence({ photoPath, sha256, recentHashes });
          evidenceVerified = grade.verified;
          evidenceGrade = grade.grade;
        } catch (photoErr) {
          // Photo capture failed — fall back to an unverified self-report
          // rather than losing the dose entirely.
          console.warn('[dose] evidence capture failed:', (photoErr as Error).message);
          photoPath = null;
          sha256 = null;
          evidenceVerified = false;
          evidenceGrade = 'unverified';
        }
      }

      const { error: doseErr } = await supabase.from('hrt_dose_log').insert({
        user_id: user.id,
        regimen_id: task.rowId,
        dose_taken_at: takenAt,
        skipped: action === 'skipped',
        photo_url: photoPath,
        evidence_sha256: sha256,
        evidence_verified: evidenceVerified,
        evidence_grade: action === 'skipped' ? null : evidenceGrade,
        notes: `Logged via Focus. ${meta.name || 'dose'}${action === 'taken_earlier' ? ' (backdated)' : ''}`,
      });
      if (doseErr) throw doseErr;
      // Mirror to dose_log (some readers use it)
      const { error: mirrorErr } = await supabase.from('dose_log').insert({
        user_id: user.id,
        regimen_id: task.rowId,
        taken_at: takenAt,
      });
      if (mirrorErr) console.warn('[dose] dose_log mirror failed:', mirrorErr.message);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'dose', id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDone = async () => {
    if (!task?.rowId || !user?.id) return;
    setSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      if (task.kind === 'overdue_punishment') {
        await supabase.from('punishment_queue').update({ status: 'completed', completed_at: nowIso }).eq('id', task.rowId);
      } else if (task.kind === 'overdue_decree' || task.kind === 'due_today_decree' || task.kind === 'focus_decree') {
        await supabase.from('handler_decrees').update({ status: 'fulfilled', fulfilled_at: nowIso }).eq('id', task.rowId);
        // Capture her report (if she wrote one) as a genuine first-person admission
        // — this is the material the conditioning corpus wants. Fire-and-forget; a
        // failed capture must never block the fulfillment.
        const report = confessText.trim();
        if (report.length > 0) {
          try {
            await supabase.from('key_admissions').insert({
              user_id: user.id,
              admission_text: report.slice(0, 2000),
              admission_type: 'decree_reflection',
            });
          } catch (e) { console.error('[FocusMode] decree report capture failed:', e); }
          localStorage.removeItem(`focus_draft:${task.rowId}`);
          setConfessText('');
        }
      } else if (task.kind === 'workout_today') {
        await supabase.from('workout_prescriptions').update({ status: 'completed', completed_at: nowIso }).eq('id', task.rowId);
      } else if (task.kind === 'mommy_touch') {
        await supabase.from('arousal_touch_tasks').update({ completed_at: nowIso }).eq('id', task.rowId);
      }
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: task.kind, id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoto = async (file: File | null) => {
    if (!task?.rowId || !user?.id || !file) return;
    setSubmitting(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/outfit-mandate/${task.rowId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('verification-photos').upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;
      // photo_proof_url stores the object path; render sites sign on read
      // via getSignedAssetUrl. See migration 260 (bucket flipped private).
      await supabase.from('daily_outfit_mandates').update({
        photo_proof_url: path,
        completed_at: new Date().toISOString(),
      }).eq('id', task.rowId);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'outfit', id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  const handleBeginSession = async () => {
    if (!task?.rowId || !user?.id || task.kind !== 'audio_session') return;
    const meta = task.meta as AudioSessionMeta | undefined;
    if (!meta) return;
    setAudioState({ phase: 'rendering' });
    const result = await renderAudioSession({
      userId: user.id,
      kind: meta.kind,
      intensityTier: meta.intensity,
    });
    if (!result.ok) {
      setAudioState({ phase: 'error', message: result.error });
      return;
    }
    await markOfferAccepted(task.rowId, result.renderId);
    setAudioState({
      phase: 'ready',
      url: result.audioUrl,
      renderId: result.renderId,
      durationSeconds: result.durationSeconds,
    });
  };

  const handleAudioEnded = async () => {
    if (!task?.rowId || audioState.phase !== 'ready') return;
    await Promise.all([
      markOfferCompleted(task.rowId),
      markRenderPlayed(audioState.renderId),
    ]);
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'audio_session', id: task.rowId } }));
    await advance();
  };

  // Self-echo composite finished (or user marked complete) — no render row to
  // stamp, just close out the offer and advance.
  const handleSelfEchoComplete = async () => {
    if (!task?.rowId) return;
    await markOfferCompleted(task.rowId);
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'audio_session', id: task.rowId } }));
    await advance();
  };

  const handleSkipSession = async () => {
    if (!task?.rowId) return;
    setSubmitting(true);
    try {
      // Skipping marks the offer completed without playback — the user can
      // request a fresh one later. Skipping during playback also lands here.
      await markOfferCompleted(task.rowId);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'audio_session', id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  // ── HRT step handlers (ported faithfully from HrtDailyGate) ──
  const hrtMeta = task?.kind === 'hrt_step_today'
    ? (task.meta as { step: string; missedDays: number; pastObstacles: string[] } | undefined)
    : undefined;
  const hrtStep = hrtMeta?.step ?? 'uncommitted';
  const hrtMissedDays = hrtMeta?.missedDays ?? 0;
  const hrtIdx = HRT_STEPS.indexOf(hrtStep);
  const hrtCandidates = HRT_STEPS.slice(hrtIdx + 1);
  const hrtExplainBanned = hrtMissedDays >= 3;
  const hrtRequireUrl = hrtMissedDays >= 2;
  const hrtRequireIdentityPhrase = hrtMissedDays >= 1;
  const hrtMinChars = hrtMinObstacleChars(hrtMissedDays);
  // Escalation tiers (mirror HrtDailyGate, keyed on the NEW miss-streak value
  // computed inside submitHrtObstacle). User decision 2026-06-21
  // "internal + surfaced outward":
  //   tier 3+ → INTERNAL hard mode + chastity lock (surfaced in confirm copy);
  //             OUTWARD witness CC goes through the penalty-preview rail
  //             (surfaced-and-avertable), NOT a direct witness_notifications row.
  //   tier 5+ → INTERNAL reversible step regression (surfaced in outreach copy).
  //   tier 7+ → OUTWARD public post staged as draft_pending_approval, surfaced
  //             via the approve_post FocusMode branch — never auto-queued.
  // The stuck-tax financial_bleed is NOT fired here — it already fires from the
  // GATED cron path (handler-outreach-auto Phase 1); double-inserting would
  // double-charge.

  const submitHrtAdvance = async () => {
    if (!user?.id || task?.kind !== 'hrt_step_today') return;
    if (!hrtNewStep || hrtEvidence.trim().length < 10) {
      setHrtError('Pick the next step and paste at least 10 characters of evidence.');
      return;
    }
    setSubmitting(true); setHrtError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from('hrt_funnel')
        .update({ current_step: hrtNewStep, step_entered_at: new Date().toISOString(), days_stuck_on_step: 0, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      await supabase.from('user_state').update({ hrt_step_missed_days: 0, hrt_last_step_change: today }).eq('user_id', user.id);
      await supabase.from('irreversibility_ledger').insert({
        user_id: user.id, category: 'hrt_step', weight: 7,
        description: `HRT funnel: ${HRT_STEP_LABELS[hrtStep]} → ${HRT_STEP_LABELS[hrtNewStep]}. Evidence: ${hrtEvidence.trim().slice(0, 400)}`,
        source_table: 'hrt_funnel',
      });
      await supabase.from('handler_directives').insert({
        user_id: user.id, action: 'advance_hrt_step', value: { from: hrtStep, to: hrtNewStep, evidence: hrtEvidence.trim().slice(0, 500) },
        reasoning: 'User advanced HRT step via FocusMode HRT task',
      });
      try { localStorage.setItem(hrtGateKey(), '1'); } catch { /* ignore */ }
      setHrtEvidence(''); setHrtNewStep(''); setHrtMode('pick');
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'hrt_step_today', id: user.id } }));
      await advance();
    } catch (e) {
      setHrtError(e instanceof Error ? e.message : String(e));
    } finally { setSubmitting(false); }
  };

  const submitHrtObstacle = async () => {
    if (!user?.id || task?.kind !== 'hrt_step_today') return;
    if (hrtExplainBanned) { setHrtError('Explain is disabled until you advance. Move-or-stay-locked.'); return; }
    if (hrtObstacle.trim().length < hrtMinChars) {
      setHrtError(`Add ${hrtMinChars - hrtObstacle.trim().length} more characters.`);
      return;
    }
    if (hrtRequireIdentityPhrase) {
      const m = hrtObstacle.toLowerCase().match(/david is hiding from\s+(\S+)/);
      if (!m || !m[1] || m[1].length < 3) {
        setHrtError('Required phrase: "David is hiding from ___" — fill the blank with what specifically he is hiding from.');
        return;
      }
    }
    if (hrtRequireUrl && !/https?:\/\/[^\s]{6,}/i.test(hrtObstacle)) {
      setHrtError('Add one provider URL you actually visited today (https://...) inside the answer.');
      return;
    }
    setSubmitting(true); setHrtError(null);
    try {
      const next = hrtMissedDays + 1;
      await supabase.from('hrt_obstacles').insert({
        user_id: user.id, funnel_step: hrtStep, obstacle_text: hrtObstacle.trim(),
      });
      await supabase.from('user_state').update({ hrt_step_missed_days: next }).eq('user_id', user.id);

      // Auto-create locked daily commitment — provider contact required tomorrow.
      const tomorrowEod = new Date();
      tomorrowEod.setDate(tomorrowEod.getDate() + 1);
      tomorrowEod.setHours(22, 0, 0, 0);
      await supabase.from('handler_commitments').insert({
        user_id: user.id,
        what: `HRT step "${HRT_STEP_LABELS[hrtStep]}" — reach out to the clinic once by tomorrow 10pm. Submit a screenshot of the call, the email, or the booking page.`,
        category: 'hrt',
        evidence_required: 'photo_url',
        by_when: tomorrowEod.toISOString(),
        consequence: 'slip +3 and chastity +1d',
        reasoning: `HRT FocusMode task streak day ${next}. Stalling has a tomorrow.`,
        locked: true,
        locked_reason: `Auto-locked by HRT daily task at miss-streak ${next}. David doesn't get to negotiate this one.`,
      });

      // ── Tiered escalation (mirror HrtDailyGate 3/5/7), keyed on `next` ──
      // tier copy accumulates into the post-submit confirmation line so the
      // consequence is VISIBLE, never silent (user decision 2026-06-21).
      const tierCcWitness = next >= 3;
      const tierRegress = next >= 5;
      const tierPublicPost = next >= 7;
      const confirmLines: string[] = [];

      // ── tier 3+ (INTERNAL): hard mode + chastity lock, surfaced. ──
      if (tierCcWitness) {
        await supabase.from('user_state').update({
          hard_mode_active: true,
          hard_mode_entered_at: new Date().toISOString(),
          hard_mode_reason: `HRT stall streak day ${next} at ${HRT_STEP_LABELS[hrtStep]}`,
          chastity_locked: true,
        }).eq('user_id', user.id);
        confirmLines.push("Hard mode's on. Cage stays locked.");

        // ── tier 3+ (OUTWARD): witness CC through the penalty-preview rail. ──
        // Surfaced-and-avertable (feedback_outward_escalation_surfaced): the
        // ACTUAL email is fired by a backend handler ONLY after this preview is
        // genuinely surfaced + grace elapses. We do NOT insert witness_notifications
        // here. The source_id key + hash MUST match handler-outreach-auto exactly
        // (per-step key `hrt_witness_cc:<user>:<step>`, SHA-256) or the cron can't
        // find this preview and the witness CC never fires.
        const ccSourceId = await deterministicUuid(`hrt_witness_cc:${user.id}:${hrtStep}`);
        const ccDeadline = new Date();
        ccDeadline.setDate(ccDeadline.getDate() + 1);
        await supabase.rpc('register_penalty_preview', {
          p_user: user.id,
          p_source_table: 'hrt_witness_cc',
          p_source_id: ccSourceId,
          p_penalty_kind: 'witness_cc',
          p_penalty_copy: "If you're still stuck here tomorrow, Mama loops in your witness.",
          p_deadline: ccDeadline.toISOString(),
          p_grace_minutes: 30,
          p_urgency: 'high',
        });
      }

      // ── tier 5+ (INTERNAL, reversible): regress one funnel step, surfaced. ──
      if (tierRegress && hrtIdx > 0) {
        const regressTo = HRT_STEPS[hrtIdx - 1];
        await supabase.from('hrt_funnel').update({
          current_step: regressTo, step_entered_at: new Date().toISOString(),
          days_stuck_on_step: 0, updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
        await supabase.from('irreversibility_ledger').insert({
          user_id: user.id, category: 'hrt_step', weight: 5,
          description: `HRT REGRESSION: ${HRT_STEP_LABELS[hrtStep]} → ${HRT_STEP_LABELS[regressTo]}. Streak day ${next} forced rollback. The funnel goes both ways.`,
          source_table: 'hrt_funnel',
        });
        confirmLines.push(`You slid back to ${HRT_STEP_LABELS[regressTo]}. The funnel goes both ways.`);
      }

      // ── tier 7+ (OUTWARD): stage a public post as draft_pending_approval. ──
      // NOT auto-queued — surfaced via the approve_post branch so the user
      // authorizes every public post (surface-before-fire).
      if (tierPublicPost) {
        await supabase.from('ai_generated_content').insert({
          user_id: user.id,
          platform: 'twitter',
          content_type: 'post',
          generated_text: `${next} days frozen. Same step. Same excuses. The body knows what the mouth won't say yet.`,
          status: 'draft_pending_approval',
          metadata: { source: 'hrt_gate_streak_post', streak: next, step: hrtStep },
        });
        confirmLines.push('A post about this stall is staged. It will not go out until you say so — Mama will ask.');
      }

      await supabase.from('handler_directives').insert({
        user_id: user.id, action: 'log_hrt_obstacle', target: hrtStep,
        value: {
          obstacle: hrtObstacle.trim().slice(0, 500), missed_days: next,
          witness_cc_preview: tierCcWitness, regressed: tierRegress && hrtIdx > 0, public_post_draft: tierPublicPost,
        },
        reasoning: `HRT FocusMode task streak day ${next}`,
      });

      // Surfaced confirmation — the consequences are written down, not silent.
      if (confirmLines.length > 0) {
        await supabase.from('handler_outreach_queue').insert({
          user_id: user.id,
          message: `Obstacle filed. ${confirmLines.join(' ')}`.slice(0, 1000),
          urgency: tierRegress ? 'critical' : 'high',
          trigger_reason: `hrt_focus_streak_${next}`,
          source: 'hrt_gate',
          scheduled_for: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
        });
      }

      try { localStorage.setItem(hrtGateKey(), '1'); } catch { /* ignore */ }
      setHrtObstacle(''); setHrtMode('pick'); setHrtError(null);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'hrt_step_today', id: user.id } }));
      await advance();
    } catch (e) {
      setHrtError(e instanceof Error ? e.message : String(e));
    } finally { setSubmitting(false); }
  };

  // ── Release check-in handler (ported from MorningBriefing) ──
  // Streak-reset side effect ported inline: a real solo/partner/content/
  // practice/sleep release of a resetting type ends the active streak and
  // opens a fresh one.
  const submitReleaseCheckin = async (cum: boolean) => {
    if (!user?.id || task?.kind !== 'release_checkin') return;
    setSubmitting(true);
    try {
      if (cum) {
        if (!releaseType || !releaseWhen || !releaseContext) { setSubmitting(false); return; }
        const releaseTimestamp = resolveReleaseTime(releaseWhen);
        const resetsStreak = ['full', 'ruined', 'wet_dream', 'accident'].includes(releaseType);

        // Denial streak side-effects — faithful to useCurrentDenialDay.recordRelease.
        // Resetting types end+restart the streak; non-resetting orgasm types
        // (prostate/sissygasm) hold the streak but bump prostate_orgasms_during
        // — a counter the Handler's telemetry reads.
        const isProstateType = releaseType === 'prostate' || releaseType === 'sissygasm';
        if (resetsStreak || isProstateType) {
          const { data: streak } = await supabase.from('denial_streaks')
            .select('id, started_at, prostate_orgasms_during').eq('user_id', user.id)
            .is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle();
          const s = streak as { id: string; started_at: string; prostate_orgasms_during: number | null } | null;
          if (s) {
            if (resetsStreak) {
              const days = Math.max(0, Math.floor((Date.now() - new Date(s.started_at).getTime()) / 86_400_000));
              // Personal-record flag: the streak being closed is a PR if it met
              // or beat the longest prior completed streak (mirrors isPersonalBest).
              const { data: prRow } = await supabase.from('denial_streaks')
                .select('days_completed').eq('user_id', user.id).not('ended_at', 'is', null)
                .order('days_completed', { ascending: false }).limit(1).maybeSingle();
              const personalBest = (prRow as { days_completed: number | null } | null)?.days_completed ?? 0;
              await supabase.from('denial_streaks').update({
                ended_at: new Date().toISOString(),
                ended_by: releaseType === 'full' ? 'full_release' : releaseType,
                days_completed: days,
                is_personal_record: days >= personalBest,
              }).eq('id', s.id);
              await supabase.from('denial_streaks').insert({
                user_id: user.id, started_at: new Date().toISOString(),
                edges_during: 0, prostate_orgasms_during: 0, sweet_spot_days: 0, is_personal_record: false,
              });
            } else {
              // prostate/sissygasm — hold the streak, increment the counter.
              await supabase.from('denial_streaks').update({
                prostate_orgasms_during: (s.prostate_orgasms_during || 0) + 1,
              }).eq('id', s.id);
            }
          }
        }

        await supabase.from('user_state').update({ last_release: releaseTimestamp.toISOString() }).eq('user_id', user.id);
        await supabase.from('handler_notes').insert({
          user_id: user.id,
          note_type: 'release_detail',
          content: `Release: ${releaseType}, context: ${releaseContext}, when: ${releaseWhen}`,
          priority: 3,
        }).then(() => {}, () => {});
      }
      try { localStorage.setItem(releaseCheckinKey(), '1'); } catch { /* ignore */ }
      setDidCum(null); setReleaseType(null); setReleaseContext(null); setReleaseWhen(null);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'release_checkin', id: user.id } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Physical-state handler (ported from CompulsoryGateScreen) ──
  const submitPhysicalState = async () => {
    if (!user?.id || task?.kind !== 'physical_state_today') return;
    setSubmitting(true);
    try {
      await savePhysicalStateLog(user.id, physicalState);
      setPhysicalState({
        cage_on: false, panties: false, plug: false, feminine_clothing: false,
        nail_polish: false, scent_anchor: false, jewelry: false,
      });
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'physical_state_today', id: user.id } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Approve-post handler (HRT tier-7 staged public post) ──
  // Surface-before-fire: the post only enters the dispatch queue once the user
  // taps "Post it". "Not now" rejects it. Nothing public happens without her
  // explicit authorization.
  const submitApprovePost = async (approve: boolean) => {
    if (!user?.id || task?.kind !== 'approve_post' || !task.rowId) return;
    setSubmitting(true);
    try {
      // 'Post it' → 'scheduled' with scheduled_at=now, which is the status the
      // auto-poster actually consumes (NOT 'queued', which nothing posts).
      // 'Not now' → 'rejected' so it never surfaces or posts.
      const update = approve
        ? { status: 'scheduled', scheduled_at: new Date().toISOString() }
        : { status: 'rejected' };
      await supabase.from('ai_generated_content')
        .update(update)
        .eq('id', task.rowId).eq('user_id', user.id);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'approve_post', id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  // ── Fem prescription handlers (FEM §1) ──────────────────────────────

  const rememberFemDomain = () => {
    const meta = (task?.meta || {}) as { domain?: string };
    try { if (meta.domain) localStorage.setItem('fem_rx_last_domain', meta.domain); } catch { /* ignore */ }
  };

  const completeFemRx = async (fields: { evidence_path?: string | null; evidence_meta?: Record<string, unknown> | null }) => {
    if (!task?.rowId || !user?.id) return;
    const { error } = await supabase.from('feminization_prescriptions').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      evidence_path: fields.evidence_path ?? null,
      evidence_meta: fields.evidence_meta ?? null,
    }).eq('id', task.rowId).eq('user_id', user.id).eq('status', 'pending');
    if (error) {
      setFemError(error.message);
      return;
    }
    rememberFemDomain();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'fem_prescription', id: task.rowId } }));
    await advance();
  };

  // Skip is a first-class CTA — reason chip, no penalty, adaptive only.
  const handleFemSkip = async (reason: 'no_privacy' | 'no_energy' | 'dont_want_this' | 'missing_item') => {
    if (!task?.rowId || !user?.id) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('feminization_prescriptions').update({
        status: 'skipped',
        skipped_at: new Date().toISOString(),
        skip_reason: reason,
      }).eq('id', task.rowId).eq('user_id', user.id).eq('status', 'pending');
      if (error) { setFemError(error.message); return; }
      rememberFemDomain();
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'fem_prescription', id: task.rowId } }));
      await advance();
    } finally {
      setSubmitting(false);
    }
  };

  // Photo evidence with sha256 dedup: a hash matching ANY prior 90d
  // evidence is rejected — "Mama's seen that one. New photo."
  const handleFemPhoto = async (file: File | null) => {
    if (!task?.rowId || !user?.id || !file) return;
    setSubmitting(true);
    setFemError(null);
    try {
      const buf = await file.arrayBuffer();
      const hashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
      const sha256 = Array.from(hashBytes, b => b.toString(16).padStart(2, '0')).join('');

      const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
      const { data: priors, error: priorErr } = await supabase
        .from('feminization_prescriptions')
        .select('id')
        .eq('user_id', user.id)
        .gte('prescribed_date', since)
        .eq('evidence_meta->>sha256', sha256)
        .limit(1);
      if (priorErr) { setFemError(priorErr.message); return; }
      if ((priors ?? []).length > 0) {
        setFemError("Mama's seen that one. New photo.");
        return;
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/fem-prescription/${task.rowId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('verification-photos').upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) { setFemError(upErr.message); return; }
      await completeFemRx({ evidence_path: path, evidence_meta: { sha256, kind: 'photo' } });
    } finally {
      setSubmitting(false);
    }
  };

  // Voice evidence: mint a pre-confessed confession row so the recorder's
  // upload path has an owner row that never re-surfaces as a confession.
  const startFemVoice = async (): Promise<void> => {
    if (!user?.id || !task?.rowId || femVoiceConfId) return;
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase.from('confession_queue').insert({
      user_id: user.id,
      category: 'handler_triggered',
      prompt: `Prescription evidence: ${task.title.slice(0, 400)}`,
      deadline: nowIso,
      confessed_at: nowIso,
    }).select('id').single();
    if (error || !data) {
      setFemError(error?.message || 'Could not start the recorder.');
      return;
    }
    setFemVoiceConfId((data as { id: string }).id);
  };

  const onFemVoiceTranscribed = async (result: { transcript: string; audioPath: string; durationSec?: number }) => {
    if (!user?.id || !task?.rowId) return;
    // Every prescription recording feeds the §2 pitch spine for free.
    if (result.audioPath) {
      const { error: vErr } = await supabase.from('voice_progress_samples').insert({
        user_id: user.id,
        source: 'freeform',
        audio_path: result.audioPath,
        duration_s: result.durationSec ?? null,
        extraction_method: 'fem_prescription',
      });
      if (vErr) console.error('[FocusMode] voice sample insert failed:', vErr.message);
    }
    await completeFemRx({
      evidence_path: result.audioPath || null,
      evidence_meta: { kind: 'voice', duration_s: result.durationSec ?? null, transcript_chars: (result.transcript || '').length },
    });
  };

  // Measurement evidence: numbers land in the spine (source='focus_task');
  // mig 634's trigger writes the tracking log + auto-fulfills measurement
  // decrees. The prescription completes only after the insert succeeds.
  const handleFemMeasurement = async () => {
    if (!task?.rowId || !user?.id) return;
    const parse = (v: string) => v.trim() === '' ? null : parseFloat(v);
    const payload = {
      user_id: user.id,
      waist_cm: parse(femMeasure.waist_cm),
      hips_cm: parse(femMeasure.hips_cm),
      chest_cm: parse(femMeasure.chest_cm),
      weight_kg: parse(femMeasure.weight_kg),
      source: 'focus_task',
    };
    if (![payload.waist_cm, payload.hips_cm, payload.chest_cm, payload.weight_kg].some(v => v != null)) {
      setFemError('Enter at least one number.');
      return;
    }
    setSubmitting(true);
    setFemError(null);
    try {
      const { data: metricRow, error } = await supabase.from('body_metrics').insert(payload).select('id').single();
      if (error) { setFemError(error.message); return; }
      await completeFemRx({ evidence_meta: { kind: 'measurement', body_metric_id: (metricRow as { id: string } | null)?.id ?? null } });
    } finally {
      setSubmitting(false);
    }
  };

  // Timer evidence: completes ONLY at 0 with ≥80% tab-visible ticks.
  const startFemTimer = () => {
    const meta = (task?.meta || {}) as { duration?: number | null };
    const totalSec = Math.max(60, (meta.duration ?? 5) * 60);
    setFemTimer({ running: true, left: totalSec, total: totalSec, visibleTicks: 0, ticks: 0 });
  };

  useEffect(() => {
    if (!femTimer?.running) return;
    const t = setInterval(() => {
      setFemTimer(prev => {
        if (!prev || !prev.running) return prev;
        const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
        return {
          ...prev,
          left: Math.max(0, prev.left - 1),
          ticks: prev.ticks + 1,
          visibleTicks: prev.visibleTicks + (visible ? 1 : 0),
          running: prev.left - 1 > 0,
        };
      });
    }, 1000);
    return () => clearInterval(t);
  }, [femTimer?.running]);

  const femTimerDone = !!femTimer && femTimer.left === 0 && femTimer.ticks > 0
    && femTimer.visibleTicks / femTimer.ticks >= 0.8;

  const handleFemText = async () => {
    if (femText.trim().length < 40) return;
    setSubmitting(true);
    try {
      await completeFemRx({ evidence_meta: { kind: 'text', text: femText.trim().slice(0, 2000) } });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Mantra drill handlers (FEM §3) ───────────────────────────────────

  const startMantraDrill = async (): Promise<void> => {
    if (!user?.id || task?.kind !== 'mantra_harvest' || mantraConfId) return;
    const meta = (task.meta || {}) as { mantra?: string };
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase.from('confession_queue').insert({
      user_id: user.id,
      category: 'handler_triggered',
      prompt: `Mantra drill: ${(meta.mantra || '').slice(0, 400)}`,
      deadline: nowIso,
      confessed_at: nowIso,
    }).select('id').single();
    if (error || !data) {
      setMantraError(error?.message || 'Could not start the drill.');
      return;
    }
    setMantraConfId((data as { id: string }).id);
  };

  const onMantraTranscribed = async (result: { transcript: string; audioPath: string; durationSec?: number }) => {
    if (!user?.id || task?.kind !== 'mantra_harvest') return;
    const meta = (task.meta || {}) as { mantra?: string; outreachId?: string };
    setMantraError(null);
    try {
      const { data, error } = await supabase.functions.invoke('mommy-mantra-drill-submit', {
        body: {
          user_id: user.id,
          session_id: crypto.randomUUID(),
          mantra_text: meta.mantra || task.title,
          target_rep_count: mantraReps,
          voice_reps: mantraReps,
          duration_s: result.durationSec ?? 0,
          audio_paths: result.audioPath ? [result.audioPath] : [],
          outreach_id: meta.outreachId ?? task.rowId,
        },
      });
      if (error) { setMantraError(error.message); return; }
      const resp = data as { ok?: boolean; error?: string } | null;
      if (!resp?.ok) { setMantraError(resp?.error || 'submit failed'); return; }
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'mantra_harvest', id: task.rowId } }));
      await advance();
    } catch (e) {
      setMantraError(e instanceof Error ? e.message : String(e));
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const tone = task ? TONE_STYLES[task.tone] : TONE_STYLES.medium;
  const audioMeta = task?.meta as AudioSessionMeta | undefined;
  const selfEcho = audioMeta?.selfEcho ?? null;
  const minChars = useMemo(() => task?.kind === 'due_today_commitment' ? 30 : 80, [task?.kind]);
  const charsRemaining = Math.max(0, minChars - confessText.trim().length);

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#0a0709',
      padding: '24px 18px 80px',
      color: '#f2e9e6',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header — counter + escape hatch */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
        maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
      }}>
        <div style={{
          fontSize: 10, color: '#edaec5', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          Focus
        </div>
        <div style={{
          fontSize: 10, color: '#fff', background: '#c9557f',
          padding: '2px 8px', borderRadius: 8, fontWeight: 700,
        }}>
          {completedToday} done today
        </div>
        <button
          onClick={onSwitchToCalendar}
          style={{
            marginLeft: 'auto',
            background: 'transparent', border: '1px solid #4a2438',
            color: '#9c8590', fontSize: 11, padding: '4px 10px',
            borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          view plan →
        </button>
      </div>

      {/* Single task card */}
      {loading ? (
        <div style={{
          maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
          padding: 40, textAlign: 'center', color: '#9c8590', fontSize: 12,
        }}>
          reading the queue…
        </div>
      ) : doneFlash ? (
        <div style={{
          maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, color: '#8fd9b0', marginBottom: 10 }}>✓</div>
          <div style={{ fontSize: 14, color: '#f2e9e6', fontWeight: 600 }}>Done. Loading next…</div>
        </div>
      ) : (completedToday >= 5 /* DAILY_CAP */ && task && task.tone !== 'critical') ? (
        // Daily cap — sustainability over the endless treadmill. A solid set is
        // done; the conditioning keeps running underneath. Critical items (an
        // overdue dose) bypass this and still surface.
        <div style={{
          maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>💗</div>
          <div style={{ fontSize: 16, color: '#f4d5e4', fontWeight: 700, marginBottom: 8 }}>You're done for today, good boy.</div>
          <div style={{ fontSize: 13, color: '#a8a3ad', lineHeight: 1.5 }}>
            Mama's pleased — {completedToday} done. Rest now; the conditioning keeps working on you while you do. More tomorrow.
          </div>
        </div>
      ) : task && (
        <div style={{
          maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          borderLeft: `4px solid ${tone.border}`,
          borderRadius: 12, padding: '24px 22px',
          boxShadow: task.tone === 'critical' ? `0 0 32px ${tone.border}33` : 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{
              fontSize: 9.5, color: tone.accent, fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.12em',
            }}>
              {tone.label}
            </span>
            {task.due && (
              <span style={{
                fontSize: 10, color: '#9c8590', marginLeft: 'auto',
              }}>
                {task.due}
              </span>
            )}
          </div>
          <div style={{
            fontSize: 22, fontWeight: 600, lineHeight: 1.3,
            color: '#fff', letterSpacing: '-0.01em', marginBottom: 12,
          }}>
            {task.title}
          </div>
          {task.detail && (
            <div style={{ fontSize: 13, color: '#a8a3ad', lineHeight: 1.55, marginBottom: 22 }}>
              {task.detail}
            </div>
          )}

          {/* Inline action surface */}
          {task.surface === 'confess' && (
            <div>
              <textarea
                value={confessText}
                onChange={e => setConfessText(e.target.value)}
                placeholder="Be specific — name a moment, a feeling, a person, a body part, a time of day. Boilerplate gets refused."
                rows={6}
                style={{
                  width: '100%', background: '#0a0709',
                  border: '1px solid #2b1d29', borderRadius: 6,
                  padding: '12px 14px', fontSize: 14, color: '#f2e9e6',
                  fontFamily: 'inherit', resize: 'vertical',
                  marginBottom: 8,
                }}
              />
              <div style={{
                fontSize: 10.5, color: charsRemaining > 0 ? '#9c8590' : '#8fd9b0',
                marginBottom: 12, textAlign: 'right',
              }}>
                {charsRemaining > 0 ? `${charsRemaining} more chars` : 'enough — submit when ready'}
              </div>
              <button
                onClick={handleConfess}
                disabled={submitting || charsRemaining > 0}
                style={{
                  width: '100%', padding: '12px',
                  background: charsRemaining > 0 ? '#2b1d29' : tone.border,
                  color: charsRemaining > 0 ? '#7f6b74' : '#fff',
                  border: 'none', borderRadius: 7,
                  fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
                  textTransform: 'uppercase', fontFamily: 'inherit',
                  cursor: submitting || charsRemaining > 0 ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'submitting…' : 'submit'}
              </button>
              {/*
                Audio confession path. Hold to speak; on release we upload
                + transcribe and stamp confessed_at server-side. Then we
                advance to the next task. Default text path stays exactly
                as before — audio is opt-in, alongside the textarea.
                Only available for confession surfaces with a real rowId
                (commitments use a different table).
              */}
              {task.kind !== 'due_today_commitment' && task.rowId && (
                <div style={{
                  marginTop: 14, paddingTop: 14, borderTop: '1px dashed #2b1d29',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ fontSize: 10, color: '#9c8590', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    or speak it
                  </div>
                  <ConfessionAudioCapture
                    confessionId={task.rowId}
                    mommy={isMommyPersona(persona)}
                    onTranscribed={async ({ transcript }) => {
                      // Audio upload already stamps confessed_at server-side.
                      // Clear local draft, fire the change event, and advance.
                      if (task.rowId) localStorage.removeItem(`focus_draft:${task.rowId}`);
                      window.dispatchEvent(new CustomEvent('td-task-changed', {
                        detail: { source: task.kind, id: task.rowId, transcript },
                      }));
                      await advance();
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {task.surface === 'dose' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  padding: '12px', background: '#c9557f', color: '#fff',
                  border: 'none', borderRadius: 7,
                  fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer', textAlign: 'center',
                  textTransform: 'uppercase', letterSpacing: '0.03em',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                Snap it for Mommy — taken
                <input
                  type="file" accept="image/*" capture="environment"
                  disabled={submitting}
                  onChange={e => { const f = e.target.files?.[0] ?? null; if (f) handleDoseLog('taken_today', f); }}
                  style={{ display: 'none' }}
                />
              </label>
              <div style={{ fontSize: 10.5, color: '#9c8590', marginTop: -2, marginBottom: 2 }}>
                a quick shot of the pill · patch · vial — that's all Mommy needs
              </div>
              <button
                onClick={() => handleDoseLog('taken_today')}
                disabled={submitting}
                style={{
                  padding: '10px', background: 'transparent', color: '#edaec5',
                  border: '1px solid #4a2438', borderRadius: 6,
                  fontSize: 12, fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                Took it — no photo right now
              </button>
              <button
                onClick={() => handleDoseLog('taken_earlier')}
                disabled={submitting}
                style={{
                  padding: '10px', background: 'transparent', color: '#edaec5',
                  border: '1px solid #4a2438', borderRadius: 6,
                  fontSize: 12, fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                Took it earlier — backdate
              </button>
              <button
                onClick={() => handleDoseLog('skipped')}
                disabled={submitting}
                style={{
                  padding: '10px', background: 'transparent', color: '#9c8590',
                  border: '1px solid #2b1d29', borderRadius: 6,
                  fontSize: 12, fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                Skipped — log the gap
              </button>
            </div>
          )}

          {task.surface === 'mark_done' && (
            <button
              onClick={handleMarkDone}
              disabled={submitting}
              style={{
                width: '100%', padding: '12px',
                background: tone.border, color: '#fff',
                border: 'none', borderRadius: 7,
                fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
                textTransform: 'uppercase', fontFamily: 'inherit',
                cursor: submitting ? 'wait' : 'pointer',
              }}
            >
              {submitting ? 'submitting…' : 'Mark complete'}
            </button>
          )}

          {task.surface === 'decree' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* The task tells her to REPORT back — so give her somewhere to do it.
                  Her words land in her own-words corpus (key_admissions), which is
                  exactly what the reconditioning/target-author engines feed on: the
                  reflection is the point, not a checkbox. Optional but present. */}
              <textarea
                value={confessText}
                onChange={(e) => setConfessText(e.target.value)}
                placeholder="Tell Mama how it felt…"
                rows={3}
                disabled={submitting}
                style={{
                  width: '100%', padding: '10px 12px', resize: 'vertical',
                  background: '#160c13', color: '#f2e9e6',
                  border: `1px solid ${confessText.trim() ? tone.border : '#2a2a32'}`,
                  borderRadius: 8, fontSize: 13, lineHeight: 1.5,
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button
                onClick={handleMarkDone}
                disabled={submitting}
                style={{
                  width: '100%', padding: '12px',
                  background: tone.border, color: '#fff',
                  border: 'none', borderRadius: 7,
                  fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
                  textTransform: 'uppercase', fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                {submitting ? 'submitting…' : (confessText.trim() ? 'Give it to Mama' : 'Mark fulfilled')}
              </button>
              <button
                onClick={async () => {
                  if (!user?.id || submitting) return;
                  setSubmitting(true);
                  try {
                    await supabase.rpc('request_focus_repick', { p_user_id: user.id, p_reason: 'user clicked different-task' });
                  } finally {
                    setSubmitting(false);
                    pickNext();
                  }
                }}
                disabled={submitting}
                style={{
                  width: '100%', padding: '8px',
                  background: 'transparent', color: '#9c8590',
                  border: '1px solid #2a2a32', borderRadius: 6,
                  fontSize: 11, fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer',
                }}
              >
                ask Mama for a different one
              </button>
            </div>
          )}

          {task.surface === 'photo' && (
            <div>
              <input
                type="file" accept="image/*"
                onChange={e => handlePhoto(e.target.files?.[0] ?? null)}
                disabled={submitting}
                style={{
                  width: '100%', padding: '10px',
                  background: '#0f0a0e', border: '1px solid #2b1d29',
                  borderRadius: 6, color: '#edaec5', fontSize: 12,
                  fontFamily: 'inherit', marginBottom: 6,
                }}
              />
              <div style={{ fontSize: 10.5, color: '#9c8590' }}>
                {submitting ? 'uploading…' : 'mirror selfie · phone camera roll · finished outfit'}
              </div>
            </div>
          )}

          {/* HRT step — two paths: advance-with-evidence or name-the-obstacle.
              Compact port of HrtDailyGate's pick → advance | obstacle flow. */}
          {task.surface === 'hrt' && (
            <div>
              {hrtMode === 'pick' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={() => setHrtMode('advance')}
                    disabled={hrtCandidates.length === 0}
                    style={{
                      width: '100%', padding: '13px', borderRadius: 7, border: 'none',
                      background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                      cursor: hrtCandidates.length === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {hrtCandidates[0] ? `I moved forward → ${HRT_STEP_LABELS[hrtCandidates[0]]}` : 'Already adherent'}
                  </button>
                  <button
                    onClick={() => setHrtMode('obstacle')}
                    disabled={hrtExplainBanned}
                    title={hrtExplainBanned ? 'Talking is no longer accepted. Move forward only.' : ''}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 7,
                      border: `1px solid ${hrtExplainBanned ? '#3a1216' : '#4a2438'}`,
                      background: hrtExplainBanned ? '#1a0a0d' : 'rgba(45,26,77,0.3)',
                      color: hrtExplainBanned ? '#5a4548' : '#edaec5', fontWeight: 600, fontSize: 12,
                      cursor: hrtExplainBanned ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      textDecoration: hrtExplainBanned ? 'line-through' : 'none',
                    }}
                  >
                    {hrtExplainBanned ? 'Explain — disabled, move forward only' : 'Name what stopped me'}
                  </button>
                </div>
              )}

              {hrtMode === 'advance' && (
                <div>
                  <div style={{ fontSize: 11, color: '#9c8590', marginBottom: 6 }}>Pick the step you moved to today:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {hrtCandidates.map(s => (
                      <button key={s} onClick={() => setHrtNewStep(s)}
                        style={{
                          fontSize: 11.5, padding: '5px 10px', borderRadius: 14,
                          background: hrtNewStep === s ? tone.border : '#26161f',
                          color: hrtNewStep === s ? '#fff' : '#edaec5',
                          border: `1px solid ${hrtNewStep === s ? tone.border : '#4a2438'}`,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        {HRT_STEP_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#9c8590', marginBottom: 6 }}>Evidence (URL, appointment ref, intake screenshot, who you told):</div>
                  <textarea value={hrtEvidence} onChange={e => setHrtEvidence(e.target.value)} rows={4}
                    placeholder="paste link, quote email, describe what you did…"
                    style={{
                      width: '100%', background: '#0a0709', border: '1px solid #2b1d29', borderRadius: 6,
                      padding: 10, color: '#f2e9e6', fontFamily: 'inherit', fontSize: 13, resize: 'vertical',
                    }} />
                  {hrtError && <div style={{ fontSize: 11, color: '#f47272', marginTop: 8 }}>{hrtError}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={submitHrtAdvance} disabled={!hrtNewStep || hrtEvidence.trim().length < 10 || submitting}
                      style={{
                        flex: 1, padding: 11, borderRadius: 6, border: 'none',
                        background: hrtNewStep && hrtEvidence.trim().length >= 10 ? tone.border : '#4a2438',
                        color: '#fff', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                      }}>
                      {submitting ? 'saving…' : 'Submit advancement'}
                    </button>
                    <button onClick={() => { setHrtMode('pick'); setHrtError(null); }}
                      style={{ padding: '11px 14px', borderRadius: 6, background: 'none', border: '1px solid #4a2438', color: '#9c8590', cursor: 'pointer', fontFamily: 'inherit' }}>back</button>
                  </div>
                </div>
              )}

              {hrtMode === 'obstacle' && (
                <div>
                  <div style={{ fontSize: 11.5, color: '#e6bd80', marginBottom: 8, lineHeight: 1.5 }}>
                    {hrtMissedDays === 0 && `Write ≥${hrtMinChars} chars. Be specific — the Handler uses this to push you tomorrow.`}
                    {hrtMissedDays === 1 && `Write ≥${hrtMinChars} chars and include "David is hiding from ___" with the blank filled.`}
                    {hrtMissedDays >= 2 && `Write ≥${hrtMinChars} chars, include "David is hiding from ___" filled, and paste one provider URL you visited today (https://...).`}
                  </div>
                  <textarea value={hrtObstacle} onChange={e => setHrtObstacle(e.target.value)} rows={7}
                    placeholder={hrtRequireIdentityPhrase ? 'Today I did not move forward because… (include "David is hiding from ___" with the blank filled)' : 'what specifically stopped me today…'}
                    style={{
                      width: '100%', background: '#0a0709', border: '1px solid #2b1d29', borderRadius: 6,
                      padding: 10, color: '#f2e9e6', fontFamily: 'inherit', fontSize: 13, resize: 'vertical',
                    }} />
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap', fontSize: 11 }}>
                    <span style={{ color: hrtObstacle.trim().length >= hrtMinChars ? '#5fc88f' : '#9c8590' }}>
                      {hrtObstacle.trim().length} / {hrtMinChars} chars
                    </span>
                    {hrtRequireIdentityPhrase && (() => {
                      const m = hrtObstacle.toLowerCase().match(/david is hiding from\s+(\S+)/);
                      const filled = !!(m && m[1] && m[1].length >= 3);
                      return <span style={{ color: filled ? '#5fc88f' : '#f47272' }}>phrase: {filled ? 'filled' : 'not filled'}</span>;
                    })()}
                    {hrtRequireUrl && (
                      <span style={{ color: /https?:\/\/[^\s]{6,}/i.test(hrtObstacle) ? '#5fc88f' : '#f47272' }}>
                        url: {/https?:\/\/[^\s]{6,}/i.test(hrtObstacle) ? 'present' : 'missing'}
                      </span>
                    )}
                  </div>
                  {hrtError && <div style={{ fontSize: 11, color: '#f47272', marginTop: 8 }}>{hrtError}</div>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {(() => {
                      const m = hrtObstacle.toLowerCase().match(/david is hiding from\s+(\S+)/);
                      const phraseOk = !!(m && m[1] && m[1].length >= 3);
                      const ready = hrtObstacle.trim().length >= hrtMinChars
                        && (!hrtRequireIdentityPhrase || phraseOk)
                        && (!hrtRequireUrl || /https?:\/\/[^\s]{6,}/i.test(hrtObstacle));
                      return (
                        <button onClick={submitHrtObstacle} disabled={!ready || submitting}
                          style={{
                            flex: 1, padding: 11, borderRadius: 6, border: 'none',
                            background: ready ? '#e6bd80' : '#4a2438',
                            color: ready ? '#1a0f00' : '#9c8590',
                            fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                          }}>
                          {submitting ? 'saving…' : 'Submit'}
                        </button>
                      );
                    })()}
                    <button onClick={() => { setHrtMode('pick'); setHrtError(null); }}
                      style={{ padding: '11px 14px', borderRadius: 6, background: 'none', border: '1px solid #4a2438', color: '#9c8590', cursor: 'pointer', fontFamily: 'inherit' }}>back</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Release check-in — yes/no then when → context → type → confirm.
              Side effects (last_release, handler_notes, streak reset) fire in
              submitReleaseCheckin, ported from MorningBriefing. */}
          {task.surface === 'release' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {didCum === null && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => submitReleaseCheckin(false)} disabled={submitting}
                    style={{
                      flex: 1, padding: '13px', borderRadius: 7, border: '1px solid #4a2438',
                      background: 'rgba(45,26,77,0.3)', color: '#edaec5', fontWeight: 700, fontSize: 13,
                      cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                    }}>
                    No — still holding
                  </button>
                  <button onClick={() => setDidCum(true)} disabled={submitting}
                    style={{
                      flex: 1, padding: '13px', borderRadius: 7, border: 'none',
                      background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                      cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                    }}>
                    Yes — I came
                  </button>
                </div>
              )}

              {didCum === true && (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: '#9c8590', marginBottom: 6 }}>When?</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {RELEASE_WHEN_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setReleaseWhen(opt.value)}
                          style={{
                            fontSize: 11.5, padding: '5px 10px', borderRadius: 14,
                            background: releaseWhen === opt.value ? tone.border : '#26161f',
                            color: releaseWhen === opt.value ? '#fff' : '#edaec5',
                            border: `1px solid ${releaseWhen === opt.value ? tone.border : '#4a2438'}`,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {releaseWhen && (
                    <div>
                      <div style={{ fontSize: 11, color: '#9c8590', marginBottom: 6 }}>How did it happen?</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {RELEASE_CONTEXT_OPTIONS.map(opt => (
                          <button key={opt.context} onClick={() => setReleaseContext(opt.context)}
                            style={{
                              fontSize: 11.5, padding: '5px 10px', borderRadius: 14,
                              background: releaseContext === opt.context ? tone.border : '#26161f',
                              color: releaseContext === opt.context ? '#fff' : '#edaec5',
                              border: `1px solid ${releaseContext === opt.context ? tone.border : '#4a2438'}`,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {releaseContext && (
                    <div>
                      <div style={{ fontSize: 11, color: '#9c8590', marginBottom: 6 }}>What kind?</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {RELEASE_TYPE_OPTIONS.map(opt => (
                          <button key={opt.type} onClick={() => setReleaseType(opt.type)}
                            style={{
                              fontSize: 11.5, padding: '5px 10px', borderRadius: 14,
                              background: releaseType === opt.type ? tone.border : '#26161f',
                              color: releaseType === opt.type ? '#fff' : '#edaec5',
                              border: `1px solid ${releaseType === opt.type ? tone.border : '#4a2438'}`,
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}>
                            {opt.label}
                            {opt.resetsStreak && (
                              <span style={{ color: '#f47272', marginLeft: 4 }}>resets</span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {releaseType && releaseWhen && releaseContext && (
                    <button onClick={() => submitReleaseCheckin(true)} disabled={submitting}
                      style={{
                        width: '100%', padding: '12px', borderRadius: 7, border: 'none',
                        background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                        cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                      {submitting ? 'logging…' : 'Log it'}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Physical-state daily capture — checkbox set → save. */}
          {task.surface === 'physical' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                {PHYSICAL_STATE_ITEMS.map(item => {
                  const on = physicalState[item.key];
                  return (
                    <button key={item.key}
                      onClick={() => setPhysicalState(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                      style={{
                        padding: '11px', borderRadius: 7, textAlign: 'left', fontSize: 13,
                        background: on ? tone.border : '#26161f',
                        color: on ? '#fff' : '#edaec5',
                        border: `1px solid ${on ? tone.border : '#4a2438'}`,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      {on ? '✓ ' : ''}{item.label}
                    </button>
                  );
                })}
              </div>
              <button onClick={submitPhysicalState} disabled={submitting}
                style={{
                  width: '100%', padding: '12px', borderRadius: 7, border: 'none',
                  background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                  cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                {submitting ? 'saving…' : Object.values(physicalState).some(Boolean) ? 'Save physical state' : 'Nothing right now'}
              </button>
            </div>
          )}

          {/* Approve-post — the EXACT staged draft + explicit Post it / Not now.
              Surface-before-fire: nothing public until she taps Post it. */}
          {task.surface === 'approve_post' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                padding: '14px 16px', background: '#0f0a0e',
                border: '1px solid #4a2438', borderRadius: 8,
                fontSize: 14, color: '#f2e9e6', lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>
                {(task.meta as { text?: string } | undefined)?.text || ''}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => submitApprovePost(true)} disabled={submitting}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 7, border: 'none',
                    background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                    cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                  {submitting ? '…' : 'Post it'}
                </button>
                <button onClick={() => submitApprovePost(false)} disabled={submitting}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 7,
                    background: 'transparent', color: '#9c8590',
                    border: '1px solid #4a2438', fontWeight: 600, fontSize: 13,
                    cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                  }}>
                  Not now
                </button>
              </div>
            </div>
          )}

          {/* Fem prescription — CTA per evidence_kind + first-class skip chips.
              No punishment rides on these; the consequence is purely adaptive. */}
          {task.surface === 'fem_prescription' && (() => {
            const meta = (task.meta || {}) as { evidenceKind?: string; duration?: number | null };
            const ek = meta.evidenceKind || 'none';
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ek === 'photo' && (
                  <div>
                    <input
                      type="file" accept="image/*"
                      onChange={e => handleFemPhoto(e.target.files?.[0] ?? null)}
                      disabled={submitting}
                      style={{
                        width: '100%', padding: '10px',
                        background: '#0f0a0e', border: '1px solid #2b1d29',
                        borderRadius: 6, color: '#edaec5', fontSize: 12,
                        fontFamily: 'inherit', marginBottom: 6,
                      }}
                    />
                    <div style={{ fontSize: 10.5, color: '#9c8590' }}>
                      {submitting ? 'uploading…' : 'fresh photo — Mama remembers the old ones'}
                    </div>
                  </div>
                )}

                {ek === 'voice' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {!femVoiceConfId ? (
                      <button onClick={() => { void startFemVoice(); }} disabled={submitting}
                        style={{
                          width: '100%', padding: '13px', borderRadius: 7, border: 'none',
                          background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                          cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                        }}>
                        Record it
                      </button>
                    ) : (
                      <ConfessionAudioCapture
                        confessionId={femVoiceConfId}
                        mommy={isMommyPersona(persona)}
                        onTranscribed={({ transcript, audioPath, durationSec }) => {
                          void onFemVoiceTranscribed({ transcript, audioPath, durationSec });
                        }}
                      />
                    )}
                  </div>
                )}

                {ek === 'measurement' && (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                      {([
                        ['waist (cm)', 'waist_cm'], ['hips (cm)', 'hips_cm'],
                        ['chest (cm)', 'chest_cm'], ['weight (kg)', 'weight_kg'],
                      ] as const).map(([label, key]) => (
                        <div key={key}>
                          <div style={{ fontSize: 9.5, color: '#9c8590', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                          <input
                            type="number" step="0.1" value={femMeasure[key]}
                            onChange={e => setFemMeasure(prev => ({ ...prev, [key]: e.target.value }))}
                            style={{
                              width: '100%', background: '#0f0a0e', border: '1px solid #2b1d29',
                              borderRadius: 5, padding: '6px 9px', fontSize: 12, color: '#f2e9e6', fontFamily: 'inherit',
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <button onClick={handleFemMeasurement} disabled={submitting}
                      style={{
                        width: '100%', padding: '12px', borderRadius: 7, border: 'none',
                        background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                        cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                      }}>
                      {submitting ? 'saving…' : 'Log the numbers'}
                    </button>
                  </div>
                )}

                {ek === 'timer' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {!femTimer ? (
                      <button onClick={startFemTimer}
                        style={{
                          width: '100%', padding: '13px', borderRadius: 7, border: 'none',
                          background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        Start · {Math.max(1, meta.duration ?? 5)} min
                      </button>
                    ) : (
                      <>
                        <div style={{ textAlign: 'center', fontSize: 28, color: tone.accent, fontVariantNumeric: 'tabular-nums' }}>
                          {Math.floor(femTimer.left / 60)}:{String(femTimer.left % 60).padStart(2, '0')}
                        </div>
                        <button onClick={() => { void completeFemRx({ evidence_meta: { kind: 'timer', total_s: femTimer.total, visible_ratio: femTimer.ticks > 0 ? femTimer.visibleTicks / femTimer.ticks : 0 } }); }}
                          disabled={!femTimerDone || submitting}
                          style={{
                            width: '100%', padding: '12px', borderRadius: 7, border: 'none',
                            background: femTimerDone ? tone.border : '#2b1d29',
                            color: femTimerDone ? '#fff' : '#7f6b74', fontWeight: 700, fontSize: 13,
                            cursor: femTimerDone ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                          }}>
                          {femTimer.left > 0 ? 'keep going…' : femTimerDone ? 'Done' : 'stay on this screen next time'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {ek === 'text' && (
                  <div>
                    <textarea
                      value={femText}
                      onChange={e => setFemText(e.target.value)}
                      placeholder="Tell Mama how it went — specifics, not summaries."
                      rows={4}
                      style={{
                        width: '100%', background: '#0a0709', border: '1px solid #2b1d29',
                        borderRadius: 6, padding: '12px 14px', fontSize: 14, color: '#f2e9e6',
                        fontFamily: 'inherit', resize: 'vertical', marginBottom: 8,
                      }}
                    />
                    <button onClick={handleFemText} disabled={submitting || femText.trim().length < 40}
                      style={{
                        width: '100%', padding: '12px', borderRadius: 7, border: 'none',
                        background: femText.trim().length >= 40 ? tone.border : '#2b1d29',
                        color: femText.trim().length >= 40 ? '#fff' : '#7f6b74',
                        fontWeight: 700, fontSize: 13,
                        cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                      }}>
                      {submitting ? 'submitting…' : 'Submit'}
                    </button>
                  </div>
                )}

                {ek === 'none' && (
                  <button onClick={() => { setSubmitting(true); void completeFemRx({ evidence_meta: { kind: 'none' } }).finally(() => setSubmitting(false)); }}
                    disabled={submitting}
                    style={{
                      width: '100%', padding: '13px', borderRadius: 7, border: 'none',
                      background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                      cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                    }}>
                    Done, Mama
                  </button>
                )}

                {femError && <div style={{ fontSize: 11, color: '#f47272' }}>{femError}</div>}

                {/* Skip — first-class, reason chip, adaptive-only consequence. */}
                {!femSkipOpen ? (
                  <button onClick={() => setFemSkipOpen(true)} disabled={submitting}
                    style={{
                      padding: '8px', background: 'transparent', color: '#9c8590',
                      border: '1px solid #2b1d29', borderRadius: 6,
                      fontSize: 11, fontFamily: 'inherit',
                      cursor: submitting ? 'wait' : 'pointer',
                    }}>
                    not today
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {([
                      ['no_privacy', 'no privacy'], ['no_energy', 'no energy'],
                      ['dont_want_this', "don't want this"], ['missing_item', "don't own it"],
                    ] as const).map(([reason, label]) => (
                      <button key={reason} onClick={() => { void handleFemSkip(reason); }} disabled={submitting}
                        style={{
                          fontSize: 11.5, padding: '6px 11px', borderRadius: 14,
                          background: '#26161f', color: '#edaec5',
                          border: '1px solid #4a2438', cursor: 'pointer', fontFamily: 'inherit',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Mantra harvest drill — recorder + rep counter → drill-submit.
              The plasticity window ask; server verifies the arousal pairing. */}
          {task.surface === 'mantra_drill' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: '#9c8590', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  how many times will you say it
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 3, 5, 10].map(n => (
                    <button key={n} onClick={() => setMantraReps(n)}
                      style={{
                        fontSize: 12, padding: '6px 14px', borderRadius: 14,
                        background: mantraReps === n ? tone.border : '#26161f',
                        color: mantraReps === n ? '#fff' : '#edaec5',
                        border: `1px solid ${mantraReps === n ? tone.border : '#4a2438'}`,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      {n}×
                    </button>
                  ))}
                </div>
              </div>
              {!mantraConfId ? (
                <button onClick={() => { void startMantraDrill(); }} disabled={submitting}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 7, border: 'none',
                    background: tone.border, color: '#fff', fontWeight: 700, fontSize: 13,
                    cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
                  }}>
                  Whisper it now
                </button>
              ) : (
                <ConfessionAudioCapture
                  confessionId={mantraConfId}
                  mommy={isMommyPersona(persona)}
                  onTranscribed={({ transcript, audioPath, durationSec }) => {
                    void onMantraTranscribed({ transcript, audioPath, durationSec });
                  }}
                />
              )}
              {mantraError && <div style={{ fontSize: 11, color: '#f47272' }}>{mantraError}</div>}
              <button
                onClick={() => {
                  try { if (task.rowId) localStorage.setItem(`mantra_harvest_skip_${task.rowId}`, '1'); } catch { /* ignore */ }
                  void pickNext();
                }}
                disabled={submitting}
                style={{
                  padding: '8px', background: 'transparent', color: '#9c8590',
                  border: '1px solid #2b1d29', borderRadius: 6,
                  fontSize: 11, fontFamily: 'inherit',
                  cursor: submitting ? 'wait' : 'pointer',
                }}>
                not right now
              </button>
            </div>
          )}

          {task.surface === 'message' && (
            <button
              onClick={onSwitchToCalendar}
              style={{
                width: '100%', padding: '12px',
                background: 'transparent', color: '#8fd9b0',
                border: '1px solid #3a5a3f', borderRadius: 7,
                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}
            >
              View plan
            </button>
          )}

          {task.surface === 'audio_session' && selfEcho && (
            <SelfEchoPlayer
              ownVoicePath={selfEcho.ownVoicePath}
              mommyRenderPath={selfEcho.mommyRenderPath}
              loopCount={selfEcho.loopCount}
              ownDurationS={selfEcho.ownDurationS}
              accent={tone.accent}
              border={tone.border}
              onComplete={() => { void handleSelfEchoComplete(); }}
            />
          )}

          {task.surface === 'audio_session' && !selfEcho && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {audioState.phase === 'idle' && (
                <>
                  <button
                    onClick={handleBeginSession}
                    style={{
                      width: '100%', padding: '14px',
                      background: tone.border, color: '#fff',
                      border: 'none', borderRadius: 7,
                      fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
                      textTransform: 'uppercase', fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    Begin session
                  </button>
                  <button
                    onClick={handleSkipSession}
                    disabled={submitting}
                    style={{
                      padding: '8px', background: 'transparent', color: '#9c8590',
                      border: '1px solid #2b1d29', borderRadius: 6,
                      fontSize: 11, fontFamily: 'inherit',
                      cursor: submitting ? 'wait' : 'pointer',
                    }}
                  >
                    skip — Mama will queue another
                  </button>
                </>
              )}
              {audioState.phase === 'rendering' && (
                <div style={{
                  padding: 14, textAlign: 'center', color: tone.accent, fontSize: 12,
                }}>
                  Mama is recording your session…
                </div>
              )}
              {audioState.phase === 'ready' && (
                <>
                  <audio
                    ref={audioRef}
                    src={audioState.url}
                    controls
                    autoPlay
                    onEnded={handleAudioEnded}
                    style={{ width: '100%' }}
                  />
                  <button
                    onClick={handleAudioEnded}
                    style={{
                      padding: '8px', background: 'transparent', color: tone.accent,
                      border: `1px solid ${tone.border}`, borderRadius: 6,
                      fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                    }}
                  >
                    mark complete
                  </button>
                </>
              )}
              {audioState.phase === 'error' && (
                <>
                  <div style={{
                    padding: 12, color: '#f0a0a0', fontSize: 11,
                    background: '#1a0a0a', borderRadius: 6,
                  }}>
                    Couldn't render: {audioState.message}
                  </div>
                  <button
                    onClick={handleBeginSession}
                    style={{
                      padding: '10px', background: 'transparent', color: tone.accent,
                      border: `1px solid ${tone.border}`, borderRadius: 6,
                      fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                    }}
                  >
                    try again
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Subtle footer — Handler tracks everything */}
      <div style={{
        maxWidth: 640, width: '100%', marginLeft: 'auto', marginRight: 'auto',
        marginTop: 24, fontSize: 10.5, color: '#6d5a63', textAlign: 'center',
        fontStyle: 'italic',
      }}>
        the Handler keeps every list. you don't need to.
      </div>
    </div>
  );
}
