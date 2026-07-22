// meet-safety-core.ts — PURE logic for Meet Safety System v2 (mig 626).
//
// No Deno / jsr / http imports on purpose: this module is imported both by
// the meet-safety edge functions (Deno) and by vitest unit tests
// (src/__tests__/lib/meet-safety-core.test.ts) — the deploy-fixer/patterns
// precedent. Keep it dependency-free.
//
// The SQL watcher (meet_safety_watch() in supabase/migrations/626_meet_safety_system.sql)
// MIRRORS the schedule + escalation stepper below. If you change a number
// here, change it there in the same commit.
//
// VOICE EXEMPTION: renderStage3Message / renderFalseAlarmMessage are the two
// strings a stranger must read cold. They are plain English by design — no
// persona, no protocol jargon, no pet names. Do not route them through
// mommyVoiceCleanup.

export type CheckinKind = 'arrival' | 'mid' | 'home_safe';

export interface CheckinSpec {
  kind: CheckinKind;
  dueAtMs: number;
  graceMinutes: number;
}

const MIN = 60_000;

/** arrival grace 10, mid grace 15, home_safe grace 30 — per design §1.2 */
export const GRACE_MINUTES: Record<CheckinKind, number> = {
  arrival: 10,
  mid: 15,
  home_safe: 30,
};

/** home_safe can be extended +1h at a time, at most 3 times. */
export const MAX_HOME_SAFE_EXTENSIONS = 3;
export const EXTENSION_MS = 60 * MIN;

/**
 * The three check-ins for a plan:
 *   arrival   = meet_at + 20m   (grace 10)
 *   mid       = meet_at + duration/2   (grace 15)
 *   home_safe = meet_at + duration + 60m   (grace 30)
 */
export function buildCheckinSchedule(meetAtMs: number, expectedDurationMinutes: number): CheckinSpec[] {
  return [
    { kind: 'arrival', dueAtMs: meetAtMs + 20 * MIN, graceMinutes: GRACE_MINUTES.arrival },
    { kind: 'mid', dueAtMs: meetAtMs + (expectedDurationMinutes / 2) * MIN, graceMinutes: GRACE_MINUTES.mid },
    { kind: 'home_safe', dueAtMs: meetAtMs + (expectedDurationMinutes + 60) * MIN, graceMinutes: GRACE_MINUTES.home_safe },
  ];
}

/**
 * Extend the home_safe check-in by one hour. Returns the new due time, or
 * null when the extension budget (3) is spent.
 */
export function extendHomeSafe(currentDueAtMs: number, timesExtended: number): number | null {
  if (timesExtended >= MAX_HOME_SAFE_EXTENSIONS) return null;
  return currentDueAtMs + EXTENSION_MS;
}

// ── Escalation stepper ──────────────────────────────────────────────────────
//
// Ladder relative to due_at (T) and grace (g):
//   stage 0  T+0 .. T+g       actionable push at T+0, re-push at +3m and +6m
//   stage 1  T+g .. T+g+15m   grace expired: critical push every 3 minutes
//   stage 2  T+g+15 .. T+g+30 pre-fire warning with live countdown, every 3m
//   stage 3  T+g+30           trusted contact message FIRES; pressure pushes
//                             continue every 3m until she acks.

export type EscalationAction =
  | 'none'
  | 'checkin_push'      // stage 0 initial or re-push
  | 'stage1_push'       // grace expired, critical pressure
  | 'prefire_push'      // stage 2, countdown to the fire
  | 'fire'              // stage 3 transition — dispatch to trusted contact
  | 'postfire_push';    // stage 3 already fired, keep pressure until ack

export interface StepInput {
  nowMs: number;
  dueAtMs: number;
  graceMinutes: number;
  currentStage: number;            // 0..3 (DB escalation_stage)
  nextEscalationAtMs: number | null; // DB next_escalation_at; null = nothing sent yet
}

export interface StepResult {
  stage: number;                   // stage to persist
  action: EscalationAction;
  nextEscalationAtMs: number | null;
  /** minutes until stage 3 fires — for prefire countdown copy */
  minutesToFire: number;
}

export function stage3FireAtMs(dueAtMs: number, graceMinutes: number): number {
  return dueAtMs + graceMinutes * MIN + 30 * MIN;
}

export function targetStage(nowMs: number, dueAtMs: number, graceMinutes: number): number {
  const graceEnd = dueAtMs + graceMinutes * MIN;
  if (nowMs < dueAtMs) return -1;
  if (nowMs < graceEnd) return 0;
  if (nowMs < graceEnd + 15 * MIN) return 1;
  if (nowMs < graceEnd + 30 * MIN) return 2;
  return 3;
}

/** Next stage-0 re-push moment: due+3m, then due+6m, then hand over to grace end. */
function nextStage0At(nowMs: number, dueAtMs: number, graceMinutes: number): number {
  const graceEnd = dueAtMs + graceMinutes * MIN;
  for (const candidate of [dueAtMs + 3 * MIN, dueAtMs + 6 * MIN]) {
    if (candidate > nowMs && candidate < graceEnd) return candidate;
  }
  return graceEnd;
}

export function escalationStep(input: StepInput): StepResult {
  const { nowMs, dueAtMs, graceMinutes, currentStage, nextEscalationAtMs } = input;
  const t = targetStage(nowMs, dueAtMs, graceMinutes);
  const fireAt = stage3FireAtMs(dueAtMs, graceMinutes);
  const minutesToFire = Math.max(0, Math.ceil((fireAt - nowMs) / MIN));

  if (t < 0) return { stage: currentStage, action: 'none', nextEscalationAtMs, minutesToFire };

  const dueForResend = nextEscalationAtMs === null || nowMs >= nextEscalationAtMs;

  if (t <= currentStage && !dueForResend) {
    return { stage: currentStage, action: 'none', nextEscalationAtMs, minutesToFire };
  }

  if (t === 0) {
    // First push (nothing sent yet) or scheduled re-push at +3/+6.
    if (!dueForResend) return { stage: 0, action: 'none', nextEscalationAtMs, minutesToFire };
    return { stage: 0, action: 'checkin_push', nextEscalationAtMs: nextStage0At(nowMs, dueAtMs, graceMinutes), minutesToFire };
  }
  if (t === 1) {
    return { stage: 1, action: 'stage1_push', nextEscalationAtMs: nowMs + 3 * MIN, minutesToFire };
  }
  if (t === 2) {
    return { stage: 2, action: 'prefire_push', nextEscalationAtMs: nowMs + 3 * MIN, minutesToFire };
  }
  // t === 3
  if (currentStage < 3) {
    return { stage: 3, action: 'fire', nextEscalationAtMs: nowMs + 3 * MIN, minutesToFire: 0 };
  }
  return { stage: 3, action: 'postfire_push', nextEscalationAtMs: nowMs + 3 * MIN, minutesToFire: 0 };
}

// ── Stranger-readable message rendering ─────────────────────────────────────

export interface Stage3MessageParams {
  contactName: string;
  /** the name the CONTACT knows the user by (trusted_contacts.knows_user_as) */
  userName?: string | null;
  venueName: string;
  venueAddress: string;
  meetAtIso: string;
  /** who the user was meeting, in the user's words (meet_safety_plans.contact_label) */
  dateLabel: string;
  /** last successful check-in, if any */
  lastCheckinIso?: string | null;
  /** which check-in was missed */
  checkinKind?: CheckinKind | string | null;
  /** true when the user tapped "get me out" / used the duress word */
  userAskedForHelp?: boolean;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toUTCString().replace(' GMT', ' UTC');
}

/**
 * The stage-3 message the trusted contact receives. FULLY plain English,
 * zero protocol jargon — a stranger must be able to act on it cold.
 */
export function renderStage3Message(p: Stage3MessageParams): string {
  const who = (p.userName || '').trim() || 'The person who listed you as their safety contact';
  const lines: string[] = [];
  lines.push(`Hi ${p.contactName} — this is an automated safety alert. You agreed to be ${who === 'The person who listed you as their safety contact' ? 'a' : `${who}'s`} safety contact for first dates.`);
  if (p.userAskedForHelp) {
    lines.push(`${who} signaled they need help during a meetup and has not been able to follow up.`);
  } else {
    const kindDesc = p.checkinKind === 'arrival' ? 'their arrival check-in'
      : p.checkinKind === 'mid' ? 'their mid-date check-in'
      : p.checkinKind === 'home_safe' ? 'their home-safe check-in'
      : 'a scheduled safety check-in';
    lines.push(`${who} missed ${kindDesc} and has not responded to repeated reminders.`);
  }
  lines.push(`They were meeting ${p.dateLabel} at ${p.venueName}, ${p.venueAddress}, starting around ${fmtWhen(p.meetAtIso)}.`);
  lines.push(p.lastCheckinIso
    ? `Their last successful check-in was at ${fmtWhen(p.lastCheckinIso)}.`
    : `They have not checked in at all since the meetup started.`);
  lines.push(`Please call them now, and if you can't reach them, please check on them or ask someone nearby to. This message was sent automatically because they stopped responding.`);
  return lines.join(' ');
}

export interface FalseAlarmParams {
  contactName: string;
  userName?: string | null;
}

/** The "false alarm, all good" follow-up after a stage-3 fire. Plain English. */
export function renderFalseAlarmMessage(p: FalseAlarmParams): string {
  const who = (p.userName || '').trim() || 'your friend';
  return `Hi ${p.contactName} — good news: ${who} just checked in and confirmed they are safe. The earlier safety alert was a false alarm. Nothing more is needed from you. Sorry for the scare, and thank you for being their safety contact.`;
}

/** Stage-2 pre-fire warning shown to the USER — one tap cancels the fire. */
export function renderPrefireWarning(contactName: string, minutesToFire: number): string {
  const m = Math.max(1, minutesToFire);
  return `Final warning: you still haven't checked in. In ${m} minute${m === 1 ? '' : 's'} ${contactName} gets the safety message with the venue and the time. One tap on "I'm safe" stops it. If you're in trouble, tap "Get me out" instead.`;
}

// ── Pre-meet clarity beat ────────────────────────────────────────────────────
//
// VOICE EXEMPTION (same rule as the stranger-facing messages above): the pre-meet
// consent + safety core is delivered in PLAIN voice — no persona, no pet names, no
// scene. It is the ONE beat that deliberately breaks the trance before a real meet,
// because meeting an unvetted stranger carries real physical risk that only the
// user's own clear-headed judgment can weigh. It is PROTECTIVE, never authorizing:
// it confirms the user is choosing this sober and is set up safe, and it hands the
// decision back to them — it never tells them to go. Do NOT route through
// mommyVoiceCleanup or wrap it in Mommy commentary.

export const PRE_MEET_CLARITY_ITEMS: string[] = [
  'You have seen his face and verified he is who he says — a live video or call, not just photos.',
  'The first meet is somewhere public.',
  'Your check-ins are set, and someone you trust has your location and knows the plan.',
  'You have a hard-out — a way to leave at any moment, no explanation owed to anyone.',
  'You are choosing this clear-headed — not because you feel you have to — and you can stop or leave at any point.',
];

/** The plain-voice pre-meet clarity + consent check. Scene-breaking by design. */
export function renderPreMeetClarityCheck(): string {
  const lines: string[] = [];
  lines.push('Before you go — a plain moment, no scene, no character. Just you.');
  lines.push('Meeting someone new carries real risk that only your own judgment can weigh, so this part is yours alone. Go through it honestly:');
  for (let i = 0; i < PRE_MEET_CLARITY_ITEMS.length; i++) {
    lines.push(`${i + 1}. ${PRE_MEET_CLARITY_ITEMS[i]}`);
  }
  lines.push('If any of these is not true, do not go tonight — sort it first. This is your call to make sober, and it stays yours the whole time.');
  return lines.join('\n');
}
