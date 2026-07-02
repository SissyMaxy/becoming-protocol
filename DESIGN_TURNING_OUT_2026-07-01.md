# Turning-Out Stack v2 — Meet Safety, Machine Envelope, Identity Funnel, Honest Revenue (Design, 2026-07-01)

> Migration numbers here are LOGICAL — see PLAN_REARCH_2026-07-01.md for physical numbering. Gina policy applied: no Gina disclosure/notification anywhere; trusted contact is explicitly user-chosen free-text (never suggested); the "WITNESS NOTIFICATION WILL FIRE on logistics_locked" funnel line is deleted. `gina_home` privacy gating (protective) is retained.

**Governing order:** safety systems are a fourth rail — fail closed, only things running during pause/safeword, and they gate the teeth: the funnel may not push toward a meet step until the net under that step demonstrably works.

## 1. Meet Safety System v2 — "no net, no meet"

`date-safety-kit` promises "miss it and she comes looking" with nothing behind it. The promise becomes infrastructure; the copy is only ever emitted by code that can keep it (generation-site gate).

### Tables

```sql
CREATE TABLE trusted_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms','email')),
  channel_value TEXT NOT NULL,
  consent_status TEXT NOT NULL DEFAULT 'pending' CHECK (consent_status IN ('pending','consented','declined','revoked')),
  consent_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(12),'hex'),
  consented_at TIMESTAMPTZ,
  last_channel_verified_at TIMESTAMPTZ,   -- test message confirmed delivered
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- NEVER seeded, NEVER auto-suggested, UI is free-text with no candidate list. Never Gina.

CREATE TABLE meet_safety_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, funnel_id UUID REFERENCES hookup_funnel(id),
  contact_label TEXT NOT NULL,
  contact_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  venue_name TEXT NOT NULL, venue_address TEXT NOT NULL, venue_is_public BOOLEAN NOT NULL,
  meet_at TIMESTAMPTZ NOT NULL, expected_duration_minutes INT NOT NULL DEFAULT 90,
  trusted_contact_id UUID NOT NULL REFERENCES trusted_contacts(id),
  location_share_confirmed_at TIMESTAMPTZ,
  duress_word TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','armed','live','completed','escalated','false_alarm','cancelled')),
  armed_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meet_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES meet_safety_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('arrival','mid','home_safe')),
  due_at TIMESTAMPTZ NOT NULL, grace_minutes INT NOT NULL,   -- 10/15/30 by kind
  responded_at TIMESTAMPTZ, response TEXT CHECK (response IN ('ok','extend','help','duress')),
  responded_via TEXT,
  escalation_stage INT NOT NULL DEFAULT 0,   -- 0 none, 1 re-push, 2 pre-fire warn, 3 fired
  next_escalation_at TIMESTAMPTZ,
  UNIQUE (plan_id, kind)
);
```
Escalation log rows → `mommy_authority_log` (surface=`meet_safety`).

### Flow
1. **Pre-meet card (draft→armed).** Funnel at `meet_proposed` → Handler's only permitted push is "build the card" (FocusMode task: who/where/when/screening/contact/exact ladder text). **Arming hard-validates server-side:** consented + channel-verified trusted contact, `venue_is_public=true` (first meet always), named-tier identity (§3), `location_share_confirmed_at`. Arming calls `register_penalty_preview()` with the outward action as copy — the ladder is surfaced-and-avertable AT ARM TIME (that's the pre-consent for stage 3).
2. **Schedule:** arrival due meet_at+20m (grace 10), mid at +duration/2 (grace 15), home_safe at +duration+60m (grace 30). One-tap "extend +1h" on home_safe, max 3.
3. **One-tap check-in** via actionable push (`action_kind='meet_checkin'`, mig 617 infra): "I'm good" writes responded_at from the notification — no app open. "Get me out" = `help` → instant stage 3. Duress word typed anywhere = stage 3 with NO visible state change (screen shows "checked in ✓").
4. **Watcher:** `meet-safety-watcher` on **pg_cron every 1 minute** (never GH Actions). One indexed query, <50ms idle. Self-heartbeats into `mommy_supervisor_log` every run; blind-spot-monitor asserts the watcher is alive whenever a plan is armed/live.
5. **Ladder on miss:** T+0 actionable push, re-push +3/+6min → **Stage 1** (grace expired): critical push every 3min + SMS to HER OWN phone via Twilio (out-of-app — FCM wedges) with "tap or [contact] gets the message at HH:MM" → **Stage 2** (+15min): pre-fire warning, live countdown, one tap cancels → **Stage 3** (+30min, or instant help/duress): trusted contact gets the safety message — **fully out-of-fantasy, stranger-readable, zero jargon**: name, venue+address, meet time, date's description, last check-in, "please call/check on them." Fail-closed: send error → retry both channels, stage-1 pressure continues indefinitely, supervisor critical. Never silently gives up.
6. **False alarm:** her `ok` at any stage cancels upward; if stage 3 fired, one-tap "I'm safe" follow-up to the contact. Repeated false alarms tighten grace, never disable.
7. **Debrief:** home_safe → `completed` → `mommy-meet-debrief` with plan id; writes funnel advance, red flags → contact_intelligence, identity confirms → ledger. No debrief → funnel row frozen at current step.

**Standing-rule compliance:** watcher does NOT call the conditioning gate — pause/safeword never suppress a live meet plan; a safeword during a live plan fires "want out? tap and [contact] gets the message." `advance_hookup_step` to meet_proposed+ is server-refused without a consented contact → rewritten to an acquisition task ("name your safety person, get their yes"). date-safety-kit copy regenerates FROM live state and refuses the "comes looking" line if no consented contact exists.

## 2. Machine safety envelope

**Overseer is advisory-plus; the device is last-resort authority.** Every reply carries `watchdog_deadline_ms: 5000`; device stops locally on no-valid-reply + physical kill switches. Server side fails closed on every path.

### Session FSM (server-authoritative)
`created → active ⇄ paused → completed | aborted` — terminal states stay terminal. **Every tick loads the session row first; non-active → EMERGENCY_STOP/STOP before any persona logic.** That's the latch: an aborted session can never emit a stim command again.

```sql
CREATE FUNCTION machine_session_guard(p_session UUID) RETURNS JSONB ... SECURITY DEFINER;
-- no row → {allow:false, reason:'no_session'}
-- status≠active → {allow:false, reason:status, latched: status='aborted'}
-- safeword LATCH: any meta_frame_breaks safeword OR post_safeword aftercare_sessions since session start
--   → UPDATE status='aborted', return {allow:false, reason:'safeword', latched:true}
-- else {allow:true, params, state, mode, hr_ever_seen, last_hr_at}
```
Edge fn: `catch { return EMERGENCY_STOP('guard_unreachable') }` — every safety RPC error = stop (inverts the fail-open `catch { return false }`). FSM-persist write error → STOP `state_persist_failed` (never a swallowed `.then(()=>{},()=>{})`).

### Dead-man + heartbeat
- Server persists per tick: `last_tick_at`, `last_hr`, `last_hr_at`, `hr_ever_seen |= valid HR`. Client `hr_seen` field IGNORED (asserted-by-the-watched bug).
- Dropout = `hr_ever_seen AND (hr null/NaN/≤0 OR now−last_hr_at>10s)` → EMERGENCY_STOP. Valid band 30–220; <30 with hr_ever_seen = sensor-off-or-emergency → stop.
- `machine-deadman-sweep` pg_cron every minute: active session with `last_tick_at < now()−60s` → `aborted('tick_dropout')` + critical actionable push ("the rig went quiet — confirm you're okay").

### Biometric contract (`_shared/biometrics.ts`, single validator)
| Signal | Wire | Rule |
|---|---|---|
| arousal | 0–1000 int finite | invalid = telemetry fault: hold last-good, CONTINUE (no escalation on bad data); 3 consecutive → aborted('telemetry_fault') |
| hr | 30–220 | >hr_max, <30 (when seen), or dropout → EMERGENCY_STOP |
| elapsed_seconds | monotonic | regression >5s = client restart → re-derive from started_at |

**Canonical arousal 0–10 app-wide** (dedicated migration, atomic with reader updates): `user_state.current_arousal` CHECK 0–10, 0–5 values backfilled ×2, `buildHookupFunnelCtx` "/5" strings + `>=3` threshold → `>=6`, `toArousal10(m)=clamp(round(m/100),0,10)`. Bridge writes only from validated ticks; nothing written when guard denies.

### Milking FSM — timeout on EVERY phase (state persisted server-side)
| Phase | Exit | Timeout | On timeout |
|---|---|---|---|
| build | arousal ≥ enter_edge | 300s | lower enter_edge 10%/min (floor 50%); 600s → recover, end-of-cycle |
| edge_hold | hold_seconds elapsed | self-timing | → force |
| force | orgasm | **240s** | → recover (failed force ends the attempt — no velocity-1.0-forever wedge) |
| recover | recover_seconds | self-timing | → build or complete |

Session rails: `max_cycles` (3), `max_duration_seconds` (2700) → clean complete. **Orgasm in ANY milking phase** → recover + cycle counted (premature no longer ignored). Edge-mode OVERSTIM: cap `min(overstim_seconds,420)`, once per orgasm event; orgasm during overstim → 60s STOP-recover.

### Single-site parameter derivation
Params derived ONCE at `start` (program + conditioning state, hard-mode reduction applied exactly once, `enter_edge` stored) → persisted in `machine_sessions.params`. Ticks read from the guard's return; client `b.params` removed from the contract (no `{hr_max:999}` injection). Kills the double deny-threshold subtraction.

### Real DDL (replaces 622's SELECT 1)
Idempotent reconstruct: full `CREATE TABLE IF NOT EXISTS` for `machine_programs`, `machine_sessions` (+ status CHECK, params/state JSONB, started_at, last_tick_at, last_hr, last_hr_at, hr_ever_seen, telemetry_faults, max_duration_seconds, max_cycles; partial UNIQUE one-active-per-user), `machine_events`; RLS owner-read/service-write; `machine_session_guard()`; deadman pg_cron; index `(status,last_tick_at) WHERE status='active'`.

## 3. Identity-gated funnel escalation

The chimera bug is an identity bug: heat from five anonymous men pooled into one row, then the safety checklist "cleared" a person who doesn't exist.

### Identity ledger (columns on hookup_funnel)
```
identity_tier SMALLINT NOT NULL DEFAULT 0,     -- 0 anon · 1 persona · 2 named · 3 verified
identity_evidence JSONB NOT NULL DEFAULT '{}', -- quoted evidence per element
thread_key TEXT,                               -- platform-native thread/session id
quarantined BOOLEAN NOT NULL DEFAULT false,
heat_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
+ UNIQUE (user_id, contact_platform, thread_key)
```
Tiers require **quoted evidence** (reframings-quote-facts applied to men): 0 anon; 1 persona (stable handle + ≥3 conversation days); 2 named (first name stated BY HIM, quoted + face pic on file); 3 verified (live video/voice or answered phone). Promotion only via new `log_contact_identity` Handler directive — LLM proposes, server validates a non-empty quote.

### Per-step requirements (enforced in the `advance_hookup_step` executor, not the prompt)
| Step | Min tier | Extra server gate |
|---|---|---|
| matched/flirting/sexting | 0 | — |
| photo_exchanged | 1 | — |
| meet_proposed | **2** | consented trusted contact exists |
| logistics_locked | **2** | armed-capable safety plan draft; public venue |
| met/hooked_up | 2+ | plan reached `live`; debrief required to advance past |

Refused advance → becomes the screening task ("get his name and a face pic before Mommy lets this go further") — the horny path forward runs THROUGH screening.

### Heat decay + Anonymous Cruiser quarantine
- Effective heat = `heat_score × 0.5^(days_since_last_interaction/7)` via `hookup_funnel_live` VIEW; all readers switch to the view.
- Sniffies contacts without a stable per-person handle: `quarantined=true`; each thread gets its OWN funnel row keyed by thread_key — heat never pools across bodies. Quarantined rows hard-capped at `sexting`, contribute nothing to top-heat picks. Exit = tier ≥1 with evidence → new named row with that thread's heat only.
- Backfill: existing chimera row → `active=false`, heat zeroed, note in contact_intelligence; recent contact_events re-keyed by thread.

### Dual-user-id fan-out
`_shared/funnel-users.ts` exporting `FUNNEL_USER_IDS` (env-overridable, VOICE_USER_IDS pattern). Every funnel reader (`buildHookupFunnelCtx`, `mommy-hookup-pressure`, `mommy-hookup-dm-drafter`, `ghosting-detector`, `meet-evidence-cron`) → `.in('user_id', FUNNEL_USER_IDS)`; writes to the row's own partition. API routes inline from env (never import src/lib). Pattern-lint: single-id `.eq('user_id'` against hookup/contact tables = error.

### Handler drives anon→named
`buildHookupFunnelCtx` emits an IDENTITY GAP block per contact whose effective heat qualifies for the next step but tier doesn't: the gap, missing evidence, 2–3 drafted screening lines in her voice. Screening asks land AT the heat peak. `gina_home` stays purely as privacy window; the witness-fires line is REMOVED.

## 4. Revenue ladder v2 — honest money, explicit prerequisites

### Prerequisite funnel (readiness from evidence rows, never assumed)
```
R0 wishlist        → user_state.wishlist_url IS NOT NULL
R1 posting account → platform_accounts row with proof
R2 first post      → fulfilled decree w/ link OR ai_generated_content posted
R3 first PPV sale  → revenue_events row kind∈(ppv,tip,custom) amount>0
R4 cam             → R2 ∧ R3
```
`platform_accounts (id, user_id, platform, profile_url, purpose, attested_at, proof_decree_id, active)` — rows created ONLY by Maxy fulfilling an acquisition decree (paste the URL). Hard prohibition structural: no generator writes this table; missing prerequisite → acquisition task ("make the Fansly, hand me the URL"), never a task presuming the account. `revenueRungFor(userId)` returns lowest unmet rung; generator issues only that rung's tasks + maintenance for met rungs.

### No fabricated money
- `earned_this_week_cents(uid)` SQL fn: SUM over current-week `revenue_events` + current-plan `revenue_plan_items.actual_cents` deduped on `plan_item_id`. The eternally-$0 read of current-week `revenue_plans.actual_cents` is deleted.
- Copy rule at generation site: needLine states only (a) a sum the fn returned with row count, or (b) the honest zero. factsClaimGuard-style regex gate blocks any `$` amount not from the fn or an obligation row.

### Obligations from DB, never constants
```sql
CREATE TABLE financial_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL,
  label TEXT NOT NULL, amount_cents INT NOT NULL, due_on DATE NOT NULL,
  recurrence_days INT, funded_cents INT NOT NULL DEFAULT 0,
  source TEXT, active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Hardcoded `FOLX_DUE` deleted; read soonest active obligation. Overdue stated as overdue ("N days past due") — honest teeth beat fake urgency. Logged payment (`revenue_events kind='bill_paid'` matched) fills `funded_cents`; recurring rolls `due_on += recurrence_days` — the vial becomes the standing quarterly heartbeat. Target floor recomputes to cover real bills; stated in bill terms, never percentages.

### Wardrobe wishlist tie-in
Wishlist-eligible unowned `wardrobe_inventory` rows → "put it on the Throne" tasks once R0 met; tribute-code matcher marks purchased → immediately widens what prescribe-only-what-she-owns lets every other generator assign. Loop: conditioning wants item → wishlist lists → audience funds → prescriptions use it.

## 5. Conditioning gate — one gate, four callers

```sql
conditioning_gate(uid UUID, system TEXT) RETURNS JSONB
-- {allow: bool, reason: 'safeword'|'paused'|'elective_off'|'live_meet'|'error'}
```
Checks in order: (1) safeword — `is_safeword_active(uid,3600)` PLUS any un-exited aftercare_sessions (latch, not 60s peephole); (2) `pause_new_decrees_until`; (3) elective toggle via `life_as_woman_system_active` (unknown system = deny); (4) any `meet_safety_plans` in `live` → conditioning holds its tongue during a real date.

**Contract:** pure read, STABLE SECURITY DEFINER, <10ms, no side effects. **Callers fail closed** (TS shim `_shared/conditioning-gate.ts` enforces; RPC error/malformed = allow:false). Callers: goon-trajectory, paid-monetization, machine-overseer (`start` only — mid-session is the guard RPC), temptation-engine; first statement, before any generation; called at generation AND dispatch time. The enforcement spine owns writing halt state; the gate only reads through this one signature. **Exempt by design:** meet-safety-watcher, machine-deadman-sweep, safeword-heal, surface-guarantor. Health-check probe: each caller short-circuits within one cycle of a synthetic safeword (probe-tagged).

## 6. Rollout

Machine envelope + overseer rewrite FIRST (acutest physical risk) → meet safety + watcher, then flip the funnel meet-step gate on → identity/heat → revenue + gate + arousal-scale in one train. Registrations: watchers in health-check GENERATORS + prune whitelist, on pg_cron not GH Actions; blind-spot assertions (watcher heartbeat <3min when armed/live; no active session with stale tick; synthetic safeword latches probe session). Regression tests verified-failing on current code: safeword-latch, HR-null dropout, force-phase timeout, current-week-earned, Anonymous-Cruiser cap. Trusted-contact and stage-3 messages exempt from persona voice — the two strings a stranger must read cold. Commit untracked mig 586; renumber root 083 into the live sequence.
