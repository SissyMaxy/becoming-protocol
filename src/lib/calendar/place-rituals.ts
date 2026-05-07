// Ritual placement — pure planning logic.
//
// Given a credentials row + the current "next 7 days" window + a set of
// already-placed events, decide which ritual events to create. Caller does
// the actual create-event API calls.
//
// Defaults (overridable per-user via calendar_credentials columns):
//   morning_ritual    06:30 local, 15 min
//   evening_reflection 21:00 local, 10 min
//
// Idempotency: we look at calendar_events_managed for the user; if a
// {date, event_type} pair already exists and isn't cancelled, we skip it.

import type { ManagedEventType } from './titles';

export interface CredentialsForPlacement {
  morning_ritual_local_time: string;       // "HH:MM"
  morning_ritual_duration_min: number;
  evening_reflection_local_time: string;   // "HH:MM"
  evening_reflection_duration_min: number;
  events_enabled: boolean;
}

export interface ExistingManagedEvent {
  event_type: ManagedEventType;
  starts_at: string; // ISO
}

export interface PlannedEvent {
  event_type: ManagedEventType;
  startsAtIso: string;
  endsAtIso: string;
  /** Local-day key (YYYY-MM-DD) for dedup. */
  dayKey: string;
}

export interface PlanRitualsParams {
  credentials: CredentialsForPlacement;
  existing: ExistingManagedEvent[];
  /** ISO start of the "today" boundary in user's local TZ (00:00). */
  todayLocalStartIso: string;
  /** Number of days ahead to fill, including today. Spec says 7. */
  daysAhead: number;
  /** IANA TZ name, used only for the dayKey computation. */
  timeZone: string;
}

function parseHHMM(s: string): { hh: number; mm: number } {
  const [hStr, mStr] = (s || '').split(':');
  const hh = parseInt(hStr, 10);
  const mm = parseInt(mStr, 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    throw new Error(`invalid HH:MM: ${s}`);
  }
  return { hh, mm };
}

function dayKeyFromIso(iso: string, _tz: string): string {
  // We treat the credential times as wall-clock hints in the user's local TZ.
  // The dayKey is the UTC date of the start instant — good enough for dedup
  // because we compute starts at consistent offsets per user.
  return iso.slice(0, 10);
}

function addMinutes(iso: string, minutes: number): string {
  const t = new Date(iso).getTime() + minutes * 60_000;
  return new Date(t).toISOString();
}

function setLocalTimeOnDate(
  baseIso: string,
  hh: number,
  mm: number,
  tz: string,
): string {
  // The base is "YYYY-MM-DDT00:00:00.000Z" (todayLocalStartIso advanced N days).
  // We want the same wall-clock day in the user's TZ at hh:mm local.
  //
  // Strategy: format the base as a date in tz, then build an ISO string
  // "YYYY-MM-DDTHH:MM:00" plus the tz offset *for that local day*. We compute
  // the offset by formatting the base instant in tz and reading back.
  const base = new Date(baseIso);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const localDate = fmt.format(base); // YYYY-MM-DD
  const naive = `${localDate}T${pad2(hh)}:${pad2(mm)}:00`;
  // Build by reverse: a Date constructed from the naive string is interpreted
  // as local-runtime time, which is wrong. We compute the offset in tz at the
  // naive instant and apply it.
  const offsetMin = tzOffsetMinutes(tz, new Date(`${naive}Z`));
  // naive in tz means: real UTC = naive - offset. offset is positive east of UTC.
  const naiveUtcMs = Date.parse(`${naive}Z`);
  const realMs = naiveUtcMs - offsetMin * 60_000;
  return new Date(realMs).toISOString();
}

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function tzOffsetMinutes(tz: string, atInstant: Date): number {
  // Returns the offset in minutes east of UTC for tz at atInstant.
  // Method: format the instant in both UTC and tz, diff the parts.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = fmt.formatToParts(atInstant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '0';
  const y = parseInt(get('year'), 10);
  const mo = parseInt(get('month'), 10);
  const d = parseInt(get('day'), 10);
  let h = parseInt(get('hour'), 10);
  if (h === 24) h = 0;
  const mi = parseInt(get('minute'), 10);
  const s = parseInt(get('second'), 10);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  return Math.round((asUtc - atInstant.getTime()) / 60_000);
}

export function planRituals(params: PlanRitualsParams): PlannedEvent[] {
  if (!params.credentials.events_enabled) return [];

  const { hh: mHh, mm: mMm } = parseHHMM(params.credentials.morning_ritual_local_time);
  const { hh: eHh, mm: eMm } = parseHHMM(params.credentials.evening_reflection_local_time);

  // Build a dedup set of existing {type, dayKey}.
  const existingKeys = new Set<string>();
  for (const ev of params.existing) {
    existingKeys.add(`${ev.event_type}|${dayKeyFromIso(ev.starts_at, params.timeZone)}`);
  }

  const planned: PlannedEvent[] = [];

  for (let d = 0; d < params.daysAhead; d++) {
    const dayBase = new Date(
      new Date(params.todayLocalStartIso).getTime() + d * 24 * 60 * 60_000,
    ).toISOString();

    const morningStart = setLocalTimeOnDate(dayBase, mHh, mMm, params.timeZone);
    const morningEnd = addMinutes(morningStart, params.credentials.morning_ritual_duration_min);
    const morningKey = `morning_ritual|${dayKeyFromIso(morningStart, params.timeZone)}`;
    if (!existingKeys.has(morningKey)) {
      planned.push({
        event_type: 'morning_ritual',
        startsAtIso: morningStart,
        endsAtIso: morningEnd,
        dayKey: morningStart.slice(0, 10),
      });
    }

    const eveningStart = setLocalTimeOnDate(dayBase, eHh, eMm, params.timeZone);
    const eveningEnd = addMinutes(eveningStart, params.credentials.evening_reflection_duration_min);
    const eveningKey = `evening_reflection|${dayKeyFromIso(eveningStart, params.timeZone)}`;
    if (!existingKeys.has(eveningKey)) {
      planned.push({
        event_type: 'evening_reflection',
        startsAtIso: eveningStart,
        endsAtIso: eveningEnd,
        dayKey: eveningStart.slice(0, 10),
      });
    }
  }

  return planned;
}
