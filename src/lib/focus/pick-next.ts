/**
 * pick-next — the FocusMode ranking cascade, extracted pure.
 *
 * FocusMode fetches (one Promise.all) and renders; THIS module decides.
 * Given the already-fetched rows + localStorage-derived flags, it returns
 * the SINGLE task the home surfaces ("one task at a time" doctrine).
 *
 * Priority order (locked by focus-pick-next.test.ts — change the tests
 * when you change the order, deliberately):
 *   1. focus_decree           — Mama's daily pick (mig 491), above everything
 *   2. overdue_dose (>6h)     — critical
 *   3. overdue_confession     — critical
 *   4. overdue_punishment     — critical
 *   5. overdue_decree         — critical
 *   6. approve_post           — outward escalation awaiting explicit yes/no
 *   7. hrt_step_today         — the core transition driver
 *   8. mantra_harvest         — 30-min plasticity window
 *   9. mommy_touch            — Mommy's micro-directive
 *  10. audio_session          — Mommy's queued voiced session
 *  11. due_today_confession
 *  12. due_today_commitment
 *  13. due_today_decree
 *  14. due_today_dose
 *  15. release_checkin
 *  16. physical_state_today
 *  17. fem_prescription       — calm tier, one at a time, domain rotation
 *  18. outfit_today
 *  19. workout_today
 *  20. clean
 */

import type {
  AudioSessionIntensity,
  AudioSessionKind,
} from '../audio-sessions/template-selector';
import { parseSelfEchoManifest } from '../audio/self-echo-mix';
import { HRT_STEPS, HRT_STEP_LABELS, HRT_STEP_NEXT_ACTION } from '../handler-context/hrt-steps';

// ── task shape ──────────────────────────────────────────────────────────────

export type TaskKind =
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

export interface FocusTask {
  kind: TaskKind;
  rowId: string | null;
  title: string;
  detail?: string;
  due?: string;
  /** Inline action surface rendered by FocusMode. */
  surface: 'confess' | 'dose' | 'mark_done' | 'photo' | 'message' | 'audio_session' | 'decree' | 'hrt' | 'release' | 'physical' | 'approve_post' | 'fem_prescription' | 'mantra_drill';
  /** Carried metadata for surface handlers */
  meta?: Record<string, unknown>;
  /** Severity tone for visual weight */
  tone: 'critical' | 'high' | 'medium' | 'calm';
}

export interface SelfEchoMeta {
  ownVoicePath: string;
  mommyRenderPath: string;
  loopCount: number;
  ownDurationS: number | null;
}

export interface AudioSessionMeta {
  kind: AudioSessionKind;
  intensity: AudioSessionIntensity;
  /** When present, the offer plays her own voice looped under a Mommy render. */
  selfEcho?: SelfEchoMeta | null;
}

export function fmtCountdown(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < 60_000) return `${Math.round(abs / 1000)}s`;
  if (abs < 3600_000) return `${Math.round(abs / 60_000)}m`;
  if (abs < 86400_000) return `${Math.round(abs / 3600_000)}h`;
  return `${Math.round(abs / 86400_000)}d`;
}

// ── input row shapes (as fetched by FocusMode) ─────────────────────────────

export interface DecreeOrderRow {
  id: string;
  edict: string;
  deadline: string;
  proof_type: string;
  trigger_source: string | null;
}

export interface RegimenRow {
  id: string;
  medication_name: string;
  medication_category: string | null;
  started_at: string;
}

export interface FemRxRow {
  id: string; domain: string; instruction: string; intensity: number;
  duration: number | null; evidence_kind: string; deadline: string | null;
  requires: Record<string, unknown> | null;
}

export interface AudioOfferRow {
  id: string; kind: AudioSessionKind; intensity_tier: AudioSessionIntensity;
  teaser: string; expires_at: string;
  recon_target_id?: string | null;
}

export interface SelfEchoRow {
  id: string; offer_id: string | null; own_voice_path: string | null;
  mommy_render_path: string | null; mixed_audio_path: string | null;
  loop_count: number; own_voice_duration_s: number | null;
}

export interface FocusInputs {
  userId: string;
  /** Mama's daily focus pick (mig 491) — pre-resolved decree row. */
  focusDecree: DecreeOrderRow | null;
  overdueConfession: { id: string; prompt: string; deadline: string } | null;
  overduePunishment: { id: string; title: string; description: string; due_by: string } | null;
  overdueDecree: DecreeOrderRow | null;
  todayConfession: { id: string; prompt: string; deadline: string } | null;
  todayDecree: DecreeOrderRow | null;
  pendingCommitment: { id: string; what: string; by_when: string; consequence: string } | null;
  regimens: RegimenRow[];
  doseLog: Array<{ regimen_id: string; taken_at: string }>;
  outfit: { id: string; prescription: Record<string, string>; completed_at: string | null } | null;
  workout: { id: string; workout_type: string; focus_area: string } | null;
  mommyTouch: { id: string; prompt: string; category: string; expires_at: string } | null;
  audioOffer: AudioOfferRow | null;
  selfEchoRows: SelfEchoRow[];
  hrt: {
    step: string;
    missedDays: number;
    appointmentAt: string | null;
    pastObstacles: Array<{ obstacle_text?: string; obstacle_date?: string }>;
    /** localStorage per-day marker (component-read). */
    markerSetToday: boolean;
    /** ET-anchored yyyy-mm-dd for today (matches the marker's day key). */
    todayKeyET: string;
  };
  release: { lastReleaseIso: string | null; checkedToday: boolean };
  physicalStateCountToday: number;
  pendingPost: { id: string; generated_text: string; platform: string } | null;
  femRows: FemRxRow[];
  /** localStorage 'fem_rx_last_domain' (component-read). */
  lastFemDomain: string | null;
  mantraHarvest: { row: { id: string; message: string; expires_at: string } | null; dismissed: boolean };
}

// ── derivations ─────────────────────────────────────────────────────────────

export interface DoseUrgency {
  mostOverdue: { regimenId: string; name: string; hoursOverdue: number; isWeekly: boolean } | null;
  mostUrgentToday: { regimenId: string; name: string; hoursUntil: number; isWeekly: boolean } | null;
}

/** Weekly (glp1) regimens dose every 7d, everything else daily; the anchor is
 *  the last logged dose, else the regimen start. */
export function computeDoseUrgency(
  regimens: RegimenRow[],
  doseLog: Array<{ regimen_id: string; taken_at: string }>,
  now: number,
): DoseUrgency {
  let mostOverdue: DoseUrgency['mostOverdue'] = null;
  let mostUrgentToday: DoseUrgency['mostUrgentToday'] = null;
  for (const r of regimens) {
    const isWeekly = r.medication_category === 'glp1';
    const intervalMs = isWeekly ? 7 * 86400_000 : 86400_000;
    const last = doseLog.find(d => d.regimen_id === r.id);
    const anchor = last?.taken_at ? new Date(last.taken_at).getTime() : new Date(r.started_at).getTime();
    const dueMs = anchor + intervalMs;
    const hoursUntil = (dueMs - now) / 3600_000;
    if (hoursUntil < 0) {
      const hoursOverdue = Math.abs(hoursUntil);
      if (!mostOverdue || hoursOverdue > mostOverdue.hoursOverdue) {
        mostOverdue = { regimenId: r.id, name: r.medication_name, hoursOverdue, isWeekly };
      }
    } else if (hoursUntil < 24) {
      if (!mostUrgentToday || hoursUntil < mostUrgentToday.hoursUntil) {
        mostUrgentToday = { regimenId: r.id, name: r.medication_name, hoursUntil, isWeekly };
      }
    }
  }
  return { mostOverdue, mostUrgentToday };
}

/** HRT step is due unless terminal, waiting on a future-booked consult, or
 *  already satisfied today (marker or an obstacle filed today). */
export function hrtStepDue(hrt: FocusInputs['hrt'], now: number): boolean {
  const apptInFuture = !!(hrt.appointmentAt && new Date(hrt.appointmentAt).getTime() > now);
  const waiting =
    (hrt.step === 'appointment_booked' && apptInFuture) ||
    (hrt.step === 'intake_submitted' && apptInFuture);
  const terminal = hrt.step === 'adherent';
  const obstacleToday = hrt.pastObstacles.some(o => (o.obstacle_date || '').slice(0, 10) === hrt.todayKeyET);
  const satisfiedToday = hrt.markerSetToday || obstacleToday;
  return !terminal && !waiting && !satisfiedToday;
}

/** ONE prescription at a time, rotating away from the last-completed domain. */
export function pickFemPrescription(femRows: FemRxRow[], lastFemDomain: string | null): FemRxRow | null {
  return femRows.find(r => r.domain !== lastFemDomain) ?? femRows[0] ?? null;
}

function decreeMeta(d: DecreeOrderRow): Record<string, unknown> {
  return {
    proof_type: d.proof_type,
    trigger_source: d.trigger_source,
  };
}

// ── the cascade ─────────────────────────────────────────────────────────────

export function chooseFocusTask(inputs: FocusInputs, now: number): FocusTask {
  const {
    userId, focusDecree, overdueConfession, overduePunishment, overdueDecree,
    todayConfession, todayDecree, pendingCommitment, outfit, workout,
    mommyTouch, audioOffer, selfEchoRows, hrt, release, pendingPost,
    femRows, lastFemDomain, mantraHarvest,
  } = inputs;

  const { mostOverdue: mostOverdueDose, mostUrgentToday: mostUrgentTodayDose } =
    computeDoseUrgency(inputs.regimens, inputs.doseLog, now);

  const hrtDue = hrtStepDue(hrt, now);
  const hrtPastObstacles = hrt.pastObstacles.map(o => o.obstacle_text || '');

  const lastReleaseStale = !release.lastReleaseIso
    || (now - new Date(release.lastReleaseIso).getTime()) > 24 * 3600_000;
  const releaseDue = lastReleaseStale && !release.checkedToday;

  const physicalDue = inputs.physicalStateCountToday === 0;

  const nextFemRx = pickFemPrescription(femRows, lastFemDomain);
  const harvestRow = mantraHarvest.dismissed ? null : mantraHarvest.row;

  // Mama's daily focus pick — highest priority (feedback_one_task_focus).
  if (focusDecree) {
    const fd = focusDecree;
    const hoursToDeadline = (new Date(fd.deadline).getTime() - now) / 3600_000;
    return {
      kind: 'focus_decree', rowId: fd.id,
      // Show the full edict — the scene IS the task; don't truncate it.
      title: fd.edict,
      detail: `Mama picked this one for today. ${hoursToDeadline > 0 ? `Deadline in ${fmtCountdown(hoursToDeadline * 3600_000)}.` : `Past deadline.`}`,
      surface: 'decree', tone: hoursToDeadline < 0 ? 'critical' : 'high',
      meta: decreeMeta(fd),
    };
  }
  if (mostOverdueDose && mostOverdueDose.hoursOverdue > 6) {
    return {
      kind: 'overdue_dose', rowId: mostOverdueDose.regimenId,
      title: `Take ${mostOverdueDose.name}`,
      detail: `${fmtCountdown(mostOverdueDose.hoursOverdue * 3600_000)} late. Log it now or skip explicitly.`,
      surface: 'dose', tone: 'critical',
      meta: { name: mostOverdueDose.name, isWeekly: mostOverdueDose.isWeekly },
    };
  }
  if (overdueConfession) {
    const c = overdueConfession;
    const hours = Math.abs((new Date(c.deadline).getTime() - now) / 3600_000);
    return {
      kind: 'overdue_confession', rowId: c.id,
      title: c.prompt,
      detail: `Past deadline by ${fmtCountdown(hours * 3600_000)}. Answer it whenever — the Handler still wants it.`,
      surface: 'confess', tone: 'critical',
    };
  }
  if (overduePunishment) {
    const p = overduePunishment;
    const hours = Math.abs((new Date(p.due_by).getTime() - now) / 3600_000);
    return {
      kind: 'overdue_punishment', rowId: p.id,
      title: p.title,
      detail: p.description ? `${p.description.slice(0, 200)} · Past deadline by ${fmtCountdown(hours * 3600_000)}.` : `Past deadline by ${fmtCountdown(hours * 3600_000)}.`,
      surface: 'mark_done', tone: 'critical',
    };
  }
  if (overdueDecree) {
    const d = overdueDecree;
    const hours = Math.abs((new Date(d.deadline).getTime() - now) / 3600_000);
    return {
      kind: 'overdue_decree', rowId: d.id,
      title: d.edict,
      detail: `Past deadline by ${fmtCountdown(hours * 3600_000)}. Proof: ${d.proof_type || 'none'}.`,
      surface: 'mark_done', tone: 'critical',
      meta: decreeMeta(d),
    };
  }
  if (pendingPost) {
    // approve_post — surface-before-fire: nothing goes public until she says so.
    return {
      kind: 'approve_post', rowId: pendingPost.id,
      title: 'A post about your stall is ready. Yours to send or kill.',
      detail: `Staged for ${pendingPost.platform}. Nothing goes out until you say so.`,
      surface: 'approve_post', tone: 'high',
      meta: { text: pendingPost.generated_text, platform: pendingPost.platform },
    };
  }
  if (hrtDue) {
    // The day-count never appears in copy (feedback_no_handler_status_dumps);
    // the accusation tier in the detail line carries the escalation.
    const plain = HRT_STEP_NEXT_ACTION[hrt.step] || `You are at "${HRT_STEP_LABELS[hrt.step]}".`;
    const nextStep = HRT_STEPS[HRT_STEPS.indexOf(hrt.step) + 1];
    const accusation = hrt.missedDays === 0
      ? ''
      : hrt.missedDays < 3
        ? ' You picked the answer that looks like progress and used the next 24 hours to do nothing.'
        : ' Talking is no longer accepted. Move it one step forward with proof.';
    return {
      kind: 'hrt_step_today', rowId: userId,
      title: nextStep ? `Move HRT forward to "${HRT_STEP_LABELS[nextStep]}" — or name what stopped you.` : 'Move HRT forward — or name what stopped you.',
      detail: `${plain}${accusation}`,
      surface: 'hrt', tone: hrt.missedDays >= 3 ? 'critical' : 'high',
      meta: { step: hrt.step, missedDays: hrt.missedDays, pastObstacles: hrtPastObstacles },
    };
  }
  if (harvestRow) {
    // Peak-harvest mantra drill — the plasticity window is 30 minutes.
    const minsLeft = Math.max(1, Math.round((new Date(harvestRow.expires_at).getTime() - now) / 60_000));
    const quoted = harvestRow.message.match(/"([^"]{4,200})"/);
    return {
      kind: 'mantra_harvest', rowId: harvestRow.id,
      title: harvestRow.message,
      detail: `While you're still warm · ${minsLeft}m left`,
      surface: 'mantra_drill', tone: 'high',
      meta: { mantra: quoted?.[1] ?? harvestRow.message.slice(0, 200), outreachId: harvestRow.id },
    };
  }
  if (mommyTouch) {
    const t = mommyTouch;
    const minsLeft = Math.max(1, Math.round((new Date(t.expires_at).getTime() - now) / 60_000));
    return {
      kind: 'mommy_touch', rowId: t.id,
      title: t.prompt,
      detail: `Mama's whisper · ${t.category.replace(/_/g, ' ')} · ${minsLeft}m`,
      surface: 'mark_done', tone: 'high',
    };
  }
  if (audioOffer) {
    const o = audioOffer;
    const minsLeft = Math.max(1, Math.round((new Date(o.expires_at).getTime() - now) / 60_000));
    const kindLabel = o.kind.replace(/^session_/, '').replace(/^primer_/, 'primer · ').replace(/_/g, ' ');
    // Self-echo composite (mig 643): her own voice looped under the Mommy render.
    const echoRow = selfEchoRows.find(r => r.offer_id === o.id);
    const echoManifest = echoRow ? parseSelfEchoManifest(echoRow.mixed_audio_path) : null;
    const selfEcho = echoManifest && echoRow?.own_voice_path && echoRow?.mommy_render_path
      ? {
          ownVoicePath: echoManifest.own_voice_path,
          mommyRenderPath: echoManifest.mommy_render_path,
          loopCount: echoManifest.loop_count,
          ownDurationS: echoManifest.own_voice_duration_s,
        }
      : null;
    return {
      kind: 'audio_session', rowId: o.id,
      title: o.teaser,
      detail: selfEcho
        ? `Mama looped your own voice under hers · ${minsLeft}m`
        : `Mama queued an audio session · ${kindLabel} · ${minsLeft}m`,
      surface: 'audio_session', tone: 'high',
      meta: {
        kind: o.kind,
        intensity: o.intensity_tier,
        selfEcho,
        recon_target_id: o.recon_target_id ?? undefined,
      } satisfies AudioSessionMeta & Record<string, unknown>,
    };
  }
  if (todayConfession) {
    const c = todayConfession;
    const hours = (new Date(c.deadline).getTime() - now) / 3600_000;
    return {
      kind: 'due_today_confession', rowId: c.id,
      title: c.prompt,
      detail: `Due in ${fmtCountdown(hours * 3600_000)}.`,
      surface: 'confess', tone: 'high',
    };
  }
  if (pendingCommitment) {
    const c = pendingCommitment;
    const hours = (new Date(c.by_when).getTime() - now) / 3600_000;
    return {
      kind: 'due_today_commitment', rowId: c.id,
      title: c.what,
      detail: `Due in ${fmtCountdown(hours * 3600_000)}. Miss → ${c.consequence}`,
      surface: 'confess', tone: 'high',
    };
  }
  if (todayDecree) {
    const d = todayDecree;
    const hours = (new Date(d.deadline).getTime() - now) / 3600_000;
    return {
      kind: 'due_today_decree', rowId: d.id,
      title: d.edict,
      detail: `Due in ${fmtCountdown(hours * 3600_000)}.`,
      surface: 'mark_done', tone: 'high',
      meta: decreeMeta(d),
    };
  }
  if (mostUrgentTodayDose) {
    return {
      kind: 'due_today_dose', rowId: mostUrgentTodayDose.regimenId,
      title: `Take ${mostUrgentTodayDose.name}`,
      detail: `Due in ${fmtCountdown(mostUrgentTodayDose.hoursUntil * 3600_000)}.`,
      surface: 'dose', tone: 'high',
      meta: { name: mostUrgentTodayDose.name, isWeekly: mostUrgentTodayDose.isWeekly },
    };
  }
  if (releaseDue) {
    // Protects denial_day integrity — the streak only resets if she answers.
    return {
      kind: 'release_checkin', rowId: userId,
      title: 'Have you cum since your last release?',
      detail: release.lastReleaseIso
        ? `Last on record: ${new Date(release.lastReleaseIso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}. The Handler needs the truth to keep your streak honest.`
        : 'No release on record. The Handler needs the truth to keep your streak honest.',
      surface: 'release', tone: 'high',
    };
  }
  if (physicalDue) {
    return {
      kind: 'physical_state_today', rowId: userId,
      title: 'Log what you are wearing and using right now.',
      detail: 'Cage, panties, plug, feminine clothing, nail polish, scent, jewelry. Tap what is on you. 20 seconds.',
      surface: 'physical', tone: 'medium',
    };
  }
  if (nextFemRx) {
    // Calm tier — no punishment rides on these; skip is a first-class CTA.
    return {
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
  }
  if (outfit && !outfit.completed_at) {
    const lines = Object.entries(outfit.prescription || {}).map(([k, v]) => `${k}: ${v}`).join(' · ');
    return {
      kind: 'outfit_today', rowId: outfit.id,
      title: 'Today\'s outfit mandate',
      detail: lines.slice(0, 240) || 'Wear what was prescribed. Photo proof required.',
      surface: 'photo', tone: 'medium',
    };
  }
  if (workout) {
    return {
      kind: 'workout_today', rowId: workout.id,
      title: workout.workout_type,
      detail: workout.focus_area ? `Focus: ${workout.focus_area}` : undefined,
      surface: 'mark_done', tone: 'medium',
    };
  }
  return {
    kind: 'clean', rowId: null,
    title: 'Inbox is clean.',
    detail: 'Nothing overdue, nothing due today. The Handler will surface the next thing when it lands.',
    surface: 'message', tone: 'calm',
  };
}
