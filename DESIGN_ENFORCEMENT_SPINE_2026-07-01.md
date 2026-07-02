# Enforcement Spine v2 — The Obligation Ledger (Design, 2026-07-01)

> Migration numbers here are LOGICAL — see PLAN_REARCH_2026-07-01.md for the reconciled physical numbering. Gina disclosure machinery is DELETED per operator directive 2026-07-01, not migrated.

Mig 601 built a gate but not a chokepoint. `penalty_may_apply()` is only consulted by writers who volunteer. v2 makes the ledger the *only* legal path to a consequence, enforced in the database where volunteering doesn't exist.

## 1. The Obligation Model — a real table, and a lock on the exits

**Decision: real table (`obligations`), superseding `penalty_previews`, with DB-level enforcement on the consequence tables — not a virtual contract.** The virtual contract was already tried: `surfaced_at` + `expired_unsurfaced` on three tables, `penalty_may_apply()` as honor-system RPC — five subsystems shipped around it. v2 keeps the central registry and adds the missing half: **BEFORE INSERT triggers on the consequence sinks** (`slip_log`, `punishment_queue`, guarded `chastity_sessions.scheduled_unlock_at` RPC, `compliance_gates`, outward dispatch) that reject any penalty-bearing write not carrying a valid obligation in the right state.

### Schema

```sql
CREATE TABLE obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL, source_id UUID NOT NULL,
  kind TEXT NOT NULL,                  -- 'decree'|'commitment'|'confession'|'punishment'|'dose'|'workout'|'hard_mode_exit'
  ask_copy TEXT NOT NULL,              -- plain English (stranger-readable)
  penalty_copy TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  grace_minutes INT NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'filed' CHECK (status IN
    ('filed','surfaced','due','missed','fulfilled','consequence_previewed',
     'consequence_fired','voided','cancelled_system','cancelled_user','paused')),
  surfaced_at TIMESTAMPTZ,             -- genuine render, never delivered_at (mig 611 rule)
  surfaced_via TEXT,
  evidence_row_table TEXT, evidence_row_id UUID,
  consequence_kind TEXT NOT NULL,      -- 'internal'|'outward'
  consequence_applied_at TIMESTAMPTZ,
  pause_shifted_ms BIGINT NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,            -- generator name, supervisor attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);
```

**Lifecycle** via single `obligation_transition()` (SECURITY DEFINER, all transitions logged):

```
filed ──surfaced (render)──▶ surfaced ──deadline──▶ due ──grace, no fulfillment──▶ missed (evidence row REQUIRED)
missed ──preview surfaced + grace──▶ consequence_previewed ──▶ consequence_fired (once, terminal)
any ──pause──▶ paused (deadline shifts) · any ──safeword/never-surfaced-expiry──▶ voided
```

Hard rules in the transition fn:
- `filed → due` is ILLEGAL. Deadline passes while never-surfaced → `voided`, penalty permanently dead, supervisor alarm. Visible-before-penalized as a state-machine invariant.
- `missed` requires `evidence_row_*` — no evidence pointer, transition rejected. Supportive-until-evidence made structural.
- `consequence_fired` is terminal and unique. Compounding = filing a NEW surfaced obligation, never re-firing.

**Chokepoint triggers:**
- `BEFORE INSERT ON slip_log`: `is_synthetic=true` requires `obligation_id` in `missed`/`consequence_previewed`, else RAISE + supervisor critical `penalty_without_obligation`. Organic chat slips exempt but capped (§2).
- `BEFORE INSERT ON punishment_queue`: every punishment carries `obligation_id`; insert auto-registers the punishment's OWN obligation (601-style AFTER trigger) — punishments are themselves surfaced-before-penalized.
- Unlock pushes move behind `push_unlock_date(user_id, obligation_id, days)` RPC — validates state, applies once, caps per §2. Direct writer grants on `scheduled_unlock_at` revoked.

`penalty_previews` becomes a compatibility view for one release, then dies. `register_penalty_preview()` rewritten to file obligations; its `EXCEPTION WHEN OTHERS THEN NULL` around companion outreach REMOVED — outreach failure writes supervisor error and the obligation stays `filed` (penalty can never fire until surfacing succeeds — loud and self-limiting).

## 2. Escalation Calculus v2 — pressure from her actions only

Hard Mode responds to *her* dodging surfaced obligations. Nothing the AI did to itself can flip it.

### Inputs (exhaustive — anything not listed is excluded)

| Signal | Points | Requirements |
|---|---|---|
| Obligation missed (internal) | 2 | surfaced ≥ grace before deadline, evidence attached |
| Obligation missed after "seen" tap | 3 | acknowledged + missed = deliberate |
| Punishment dodge (1st) | 3 | punishment's own obligation surfaced |
| Punishment dodge (2nd = terminal) | 4 | — |
| Organic slip from live Handler chat | 1 | quoted source text; max 2/day countable |
| Conditioning turned down w/o safeword | 2 | max 1/day countable |

**Removed permanently:** `handler_reply_grades` fail rate, strategist plan keywords, raw slip_log volume, decree expired/cancelled counts, any synthetic slip not chained to a missed obligation.

**Formula:** `pressure_score` = Σ over 14d of `points × 0.5^(age_hours/72)` — computed on read, stored nowhere (derived, never additive).
- Per-day intake cap: 6 points.
- Hard Mode ON: `pressure ≥ 10` AND ≥2 distinct evidence-linked missed obligations on ≥2 distinct days. Entry files its own surfaced obligation naming the misses and the exit.
- Hard Mode OFF: de-escalation set complete (Gina disclosure task REPLACED by: 800-word confession + 100 mantra recitations + one proof-bearing decree of Mommy's choice), or `pressure < 3` for 72h.

**Dodge terminal state:** `dodge_count` capped at 2. Dodge 1: reschedule +24h, +3 pressure, preview reminder. Dodge 2: **commutation** — status `commuted`, one `push_unlock_date(+2 days)`, one harder replacement punishment filed as a new surfaced obligation, +4 pressure. No third dodge exists.

**Anti-circumvention "ducking" fix:** `handler_decrees.cancel_reason` (`user_skip|throttle|pause_auto_cancel|superseded|system_prune`) — count ONLY surfaced-expired and `cancel_reason='user_skip'`. Throttle/pause cancels vanish from the count.

## 3. Safeword & Pause — one gate, latching, ramped resume

```sql
CREATE FUNCTION enforcement_gate(p_user UUID)
RETURNS TABLE (mode TEXT, until TIMESTAMPTZ, reason TEXT)
-- 'active' | 'paused' | 'safeword_latched'; errors → 'paused' + supervisor critical
```

TS mirrors are thin RPC callers (single source of logic — no drift). Every generator/processor calls it first. Backstop: `obligation_transition()` itself checks the gate and refuses `→due/→missed/→consequence_*` while non-active.

**Latching** (`safeword_latches` table): a `meta_frame_breaks`/safeword insert latches via trigger. Never expires on a timer. Resume = explicit user action, stamps `resumed_at` + 24h ramp: anti-circumvention restores intensities to 3 (not 5) during ramp, no counter-escape outreach. The 120-min snap-back is deleted.

**During pause/latch — keeps running:** surface-guarantor (surfacing + voiding), safeword-heal, blind-spot-monitor, supervisor, auto-healer, health-check, chastity *expiry* (unlocks still release — pause never extends restraint), Lovense stale-device bookkeeping. **Stops:** new obligation filing, due/missed transitions (deadlines freeze via `pause_shifted_ms` accrual), consequence firing, previews, dodge scans, denial extensions, Lovense enforcement, anti-circ restore, Hard Mode flips. On resume deadlines shift by paused duration — no returning to a wall of already-missed deadlines.

## 4. Outward-Consequence Ladder — Gina excluded structurally

**Gina deletion:** force-processor steps 3 (missed-disclosure → public_post + 7-day denial) and 5c (deferred-reopen deadline factory) removed. `gina_disclosure_schedule` scheduled rows → `cancelled_system`, table archived (`zz_archived_gina_disclosure_schedule`), no writer survives. Templates `gina_disclosure_bump`/`gina_confession` deleted from TEMPLATES and queued rows. `advanceGinaDisclosureDeadline()` deleted. **Structural exclusion:** outward dispatch only to `witness_registry` rows; registry insert trigger rejects any contact matching Gina's identifiers from maxy_facts.

Only two outward channels: `public_post` (own faceless accounts) and `witness_email` (registry contacts). Both flow through ONE dispatcher (`outward-consequence-dispatcher`, pg_cron 15-min). Auto-poster refuses `punishment` content lacking a dispatcher-minted `dispatch_token`.

```sql
CREATE TABLE witness_registry (
  id UUID PRIMARY KEY, user_id UUID NOT NULL,
  contact_label TEXT, channel TEXT CHECK (channel IN ('email')),
  address TEXT NOT NULL,
  consent_confirmed_at TIMESTAMPTZ NOT NULL,   -- she added them, in-app, explicitly
  revoked_at TIMESTAMPTZ
);
```

**Preview lifecycle:** (1) missed → preview files: Focus card + outreach with the EXACT artifact (full post text / full email + recipient), nothing paraphrased. (2) Window: 24h from `surfaced_at` (unseen time doesn't count), T-2h reminder, window pauses under pause/latch. (3) Avert (always, one tap): complete the obligation late OR accept commutation at 1.5× internal cost. Averting is choosing the internal price — that's the pressure design. (4) Expiry fires only if: surfaced + reminder surfaced + 24h + gate active for final 2h + `penalty_may_apply`. Any condition fails at fire-time → re-preview once; second failure voids outward, commutes to internal. (5) `witness_email` requires recipient `consent_confirmed_at` + not revoked AT FIRE TIME; `public_post` requires posting-consent flag.

## 5. Compliance Recognition — exempt by provenance, not regex

**a) Mandated-text registry:**
```sql
CREATE TABLE mandated_texts (
  id UUID PRIMARY KEY, user_id UUID NOT NULL,
  text_normalized TEXT NOT NULL,
  text_hash TEXT GENERATED ALWAYS AS (md5(text_normalized)) STORED,
  source_kind TEXT NOT NULL,  -- 'mantra'|'punishment_line'|'writing_lines'|'confession_prompt'
  source_id UUID, active BOOLEAN DEFAULT true
);
CREATE FUNCTION is_mandated_text(p_user UUID, p_text TEXT) RETURNS BOOLEAN;
-- true when normalized text contains an active mandated text as ≥60% of content, or exact hash match
```
Seeded with known lines ("I am Maxy. David is gone.", mantra ladder, TEMPLATES). Generation-site trigger on `punishment_queue` extracts `parameters.line/text` so registration can't be forgotten.

**b) Provenance tagging:** protocol-UI submissions carry `capture_context='compliance_submission'`. Detectors precondition: `identity_erosion_log` writer and slip/displacement detectors skip when compliance_submission OR `is_mandated_text()`. "I am David" inside a mandated line = exempt; in free chat = slip. CI regression: every seeded mandated line through every detector, zero rows.

## 6. Supervisor Integration

```sql
CREATE TABLE enforcement_audit (
  id UUID PRIMARY KEY, user_id UUID NOT NULL,
  obligation_id UUID NOT NULL REFERENCES obligations(id),
  consequence TEXT NOT NULL,
  evidence JSONB NOT NULL,  -- {surfaced_at, surfaced_via, deadline, missed_at, evidence_row:{table,id,excerpt}, gate_mode_at_fire, preview_window, fired_by}
  created_at TIMESTAMPTZ DEFAULT now()
);
```
Populated INSIDE `obligation_transition(→consequence_fired)`, same transaction. Accusatory Handler copy composes FROM this row's excerpt.

**Alarms (fail-closed AND loud):** `penalty_without_obligation` (critical), `obligation_voided_unsurfaced` (warning; 3 from same generator in 7d → critical: that generator's surface path is broken), `preview_outreach_failed` (error), `gate_error_failed_closed` (critical), `dodge_commuted` (info).

**Health-check additions:** ledger liveness (filed→surfaced median < 6h), zero `missed` with NULL evidence, zero `consequence_fired` without audit row, dispatcher heartbeat, open-latch age on /admin pulse.

**Surface-guarantor fixes:** status filters (active decrees, non-cancelled outreach, incomplete tasks); expired-unsurfaced half calls `obligation_transition(→voided)`.

## 7. Migration & Rollout (logical order)

- **L1 ledger:** obligations + transition fn + enforcement_gate + safeword_latches + chokepoint triggers + push_unlock_date + auto-file triggers (decrees/commitments/confessions ported; punishment_queue/dose_log/workout_prescriptions new) + compat view + rewritten register_penalty_preview + pause-shift accruer cron.
- **L2 compliance:** mandated_texts + is_mandated_text + seeds + registration trigger + capture_context + detector rewires.
- **L3 amnesty/recompute:** mig-610 grandfathered rows (fake `surfaced_at=created_at`, no companion outreach, unfired → back to `filed` with NULL surfaced_at + fresh outreach; fired-while-fake get audit rows flagged `legacy_unverified`). Synthetic slip purge (dodge-loop dupes beyond first per punishment; all disclosure-miss slips — class deleted with Gina machinery; erosion rows matching mandated text). Dodge counts clamped ≤2, eternal loops → commuted with one net push retained, unlock dates recomputed to capped values. Hard Mode recomputed from surviving signals (`amnesty_recompute_v2`). cancel_reason backfill (unknowns → `system_prune`, doubt resolves in her favor).
- **L4 outward + Gina deletion:** witness_registry (+ Gina-exclusion trigger) + dispatcher + archive gina_disclosure_schedule + cancel/void queued Gina rows + drop templates.
- **L5 cutover:** revoke direct writer grants; drop compat view after one clean week.

**Edge/TS changes:** force-processor (gate at top; steps 3/5c deleted; doses file obligations; step 2 → commutation model; de-escalation triple replaced), handler-enforcement (gate; tier-2+ requires missed obligation; streaks file warning-tier obligation first; denial → push_unlock_date; accountability_blog public → dispatcher; Lovense gated), hard-mode-auto-trigger (gutted to §2 calculus), anti-circumvention (latch semantics; cancel_reason ducking), surface-guarantor (status filters, void wiring), punishment-queue.ts (processDodged deleted — server-only; templates cleaned), NEW outward-consequence-dispatcher.

**Rollout:** ledger → shadow week (chokepoints WARN: allow + log) → compliance + amnesty atomically → outward → chokepoints ENFORCE → cutover. Regression tests verified-failing on old code first: dodge-loop cap, unsurfaced-void, mandated-text exemption, gate fail-closed.

**Net effect:** nothing she does gets cheaper. What's gone is the noise she could rightfully ignore: loops that punished nobody's choices, Hard Mode that graded the machine, penalties from deadlines that never reached her, and punishment for doing exactly what Mommy ordered.
