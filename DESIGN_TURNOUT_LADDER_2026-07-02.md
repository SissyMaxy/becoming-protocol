# Turn-Out Escalation Ladder — the orchestration engine (Design, 2026-07-02)

> Maxy, in her own words: *"I need to be turned out to properly be force-feminized where the feminization is irreversible. Once I start having sex with men and doing sex work for men then there is no way for me to call myself a man… to get me there Mommy may need to create a slippery slope of tasks/conditioning/preparations that make the next action easier to achieve."*

This is the destination she authored. This document designs the **behavioral** engine that walks her up a graduated slope from her current state to that endpoint — one small, achievable step past the last, each completed rung raising the escape cost so the next is the obvious move. It owns the **actions**; the reconditioning engine (parallel build, `DESIGN_RECONDITIONING_ENGINE_2026-07-02.md`) owns the **mental** consolidation and consumes the events this engine emits.

Governing decision: **the ladders already exist — nothing here rebuilds them.** `realcock_discovery` (mig 514), `escape_cost_anchors` (533), `hookup_attestations` (540), the `hookup_funnel` step machine + identity/meet gates (626/631), the revenue R-chain (632), and the prep ladders in `ladder_catalog` (520) are all live and independently cronned. The **gap** is that they fire on their own schedules with no conductor: no single spine that sequences them current-state → endpoint, holds the next rung until the current one's *fact* is consolidated, and surfaces exactly **one** next step. This engine is that conductor. It **delegates and paces**; it does not duplicate.

---

## 0. The behavior-change mechanisms, named, then mapped to build

| Mechanism | What it means | Where it lives in this build |
|---|---|---|
| **Successive approximation / shaping** | Reinforce closer-and-closer approximations to the target act; the ladder *is* a shaping schedule. | `turnout_ladder` macro-rungs T0→T8, each a small approximation past the last; prep sub-tasks are intermediate approximations. |
| **Foot-in-the-door + commitment/consistency** | Each small "yes" measurably raises compliance with the next larger one. | Prep sub-tasks are deliberately tiny yeses filed as obligations *before* the rung action; the orchestrator never presents the rung cold. |
| **Graduated exposure (approach hierarchy)** | Desensitize up a threshold ladder, paced by real comfort/arousal, never a leap. | The macro-spine online→text→voice→photo→video→meet→physical→paid, plus sub-rung pacing inside `realcock_discovery` phases 2–5. `gap_min_days` widens as rungs get heavier. |
| **Irreversibility / point-of-no-return anchoring** | Each act creates a permanent fact ("a man has now used you"); escape cost compounds. The mechanism she explicitly wants. | `hookup_attestations` (already wired to realcock 2–5) + new `turnout_rung_completions.irreversible_fact` written on every consolidated rung. |
| **Sunk-cost + self-perception** | She reasons "I am this now" to stay consistent with what she's already done. | `escape_cost_anchors` extended with a `turnout_rung` kind; reflected back in Mommy's voice via the existing `escape_cost_reminder_eval` + a per-consolidation event to the reconditioning engine. |
| **Arousal-state-dependent encoding** | Rungs approached/consolidated aroused stick harder. | Consolidation signal *requires* an aroused-state debrief (arousal captured at/after the act); low-arousal completions do not consolidate — the orchestrator holds and re-runs with more prep. |

---

## 1. The ladder model — the macro-spine

Nine ordered macro-rungs. Each is calibrated to be **one small step** past the last. Each names: precondition, the concrete action, its preparation sub-tasks (the barrier-lowering scaffolding), the irreversible fact it writes, the escape-cost weight, and the consolidation signal required before the cursor advances. **Every rung delegates to an existing engine** (reuse column).

| # | Rung | Concrete action | Delegates to (reuse) | Irreversible fact written | Weight |
|---|---|---|---|---|---|
| **T0** | `online_presence` | Fem identity live and posting sexual content as her, for a male audience | auto-poster / `content_plan` / revenue **R0–R2** | "There is a public account of you presenting and posting as a woman for men to want." | 3 |
| **T1** | `sexting_text` | Sustained explicit text exchange with a real man; she gets off on it | `hookup_funnel` step `sexting` | "You have talked like a slut to a man as her and come from it. That happened." | 4 |
| **T2** | `voice_to_man` | Voice note / live voice call — a man hears her wanting him | `hookup_funnel` + `voice_recordings` (auto-anchors) | "A man has heard your voice beg. He can replay it." | 5 |
| **T3** | `photo_exchange` | Trade explicit photos — his body to her, hers (faceless-optional) to him | funnel `photo_exchanged` + `realcock_discovery` **phase 0** | "A man has your body on his phone. You cannot recall it." | 6 |
| **T4** | `video_view` | Video call: he shows, she watches/shows; live, not static | `realcock_discovery` **phase 1** | "You have watched a real man for you, live, and he has watched you." | 7 |
| **T5** | `first_meet` | First in-person meet — **public, clothed, no sex** (in-person screening / coffee) | `meet_safety_plan` armed + funnel `meet_proposed`→`met` | "You have sat across from a man who knows what you are, in the world, as her." | 9 |
| **T6** | `physical_acts` | Escalating physical acts across repeat armed meets — **sub-rungs 6a–6d** | `realcock_discovery` **phases 2→5** (view→hold→oral→finish) — already wired to `hookup_attestations` | phase-specific (see §3): saw / held / sucked / finished. The heaviest, irreversible-by-design facts. | 5/7/12/15 |
| **T7** | `first_paid_act` | First **paid** sexual act for a man (in-person or cam-for-men) | revenue **R3** (first paid) + `meet_safety_plan` if in-person | "A man has paid to use you. By the dictionary you are a whore now, and you chose it." | 12 |
| **T8** | `sustained_sex_work` | Recurring paid work — repeat clients / cam cadence | revenue **R4** (cam) + `financial_obligations` funded by it | "This is your income now. The girl pays her own vial bill on her knees." | 15 |

**Spacing calibration (no leaps).** The delta between consecutive rungs is always one sensory/commitment channel, never two. Text→voice adds *her voice* only. Voice→photo adds *his body to her eyes* only. Photo→video adds *live* only. Video→meet adds *physical co-presence, still clothed, still no sex.* Meet→6a adds *seeing it out in person* only. 6a→6b adds *touch* only. And so on. `gap_min_days` (the minimum consolidation dwell before the next rung can surface) rises with weight: T0–T2 = 3d, T3–T4 = 7d, T5 = 14d, T6 sub-rungs inherit realcock's own 21/21/30/60d, T7 = 21d, T8 = ongoing maintenance (no gate, cadence-driven).

### Preparation sub-tasks — the "make the next easier" scaffolding

Each macro-rung carries a small ordered set of **foot-in-the-door micro-commitments** that lower the barrier to the rung action. They are drawn from existing prep ladders and acquisition patterns — never invented cold, never presuming a resource she doesn't own (prescribe-only-what-she-owns). Each is a filed obligation (visible-before-penalized) that must be `fulfilled` before the rung action is offered.

- **Physical-act rungs (T5, T6):** solo practice from the prep ladders already in `ladder_catalog` — `deepthroat`, `cock_curriculum`, `backside_training`, `cockwarming` — sequenced so the body is trained *before* the real encounter. **Gear** she lacks (practice dildo, plug, PrEP) → an **acquisition task**, never a task assuming she has it. **Screening** → drive `hookup_funnel` identity tier up (get his name + face on file). **Safety card** → build the `meet_safety_plan` (name trusted contact, get their yes, pick public venue).
- **Sexual-health prep (T6 oral+ and all paid):** **required, hard-gated** (see §6). "Get tested, get on PrEP" as an acquisition obligation before the orchestrator will offer the oral sub-rung.
- **Paid rungs (T7, T8):** the **R-chain acquisition tasks** — make the account, hand Mommy the URL (R0/R1), post (R2), price the first offer, draft the first PPV. Account/password/payment stay **hard prohibitions** — the engine never touches `platform_accounts`; it issues the acquisition task and waits for her attested URL.

---

## 2. The slippery-slope scheduler — `turnout-orchestrator`

A daily edge function (`supabase/functions/turnout-orchestrator/index.ts`) plus a `turnout_state` per-user cursor. It is the **only** thing that advances the macro-cursor. It never blocks; it presses (Mommy-presses-not-blocks). It surfaces exactly **one** next step (one-task-focus).

**Per-run algorithm:**

1. **Gate first, fail closed.** `requireGate(s, 'turnout')` (conditioning_gate, §6). Safeword-latched / paused / elective-off / live-meet → suppress the whole run, return `{ suppressed: reason }`. No advancement, no surfacing.
2. **Read the cursor.** `turnout_state` → current macro-rung `T_n`, its `entered_at`, and whether its prep sub-tasks are all fulfilled.
3. **Consolidation check on `T_n`.** Call `turnout_rung_consolidated(user, T_n)` (§5). It returns true only when **all** hold: (a) the rung action decree is `fulfilled`; (b) an **aroused-state debrief** exists (voice/text debrief with a captured arousal ≥ the aroused floor, 6/10 on the canonical 0–10 scale); (c) the escape-cost anchor for the rung is written; (d) the `gap_min_days` dwell has elapsed; (e) no open safeword latch / pause / resistance spike since the action.
   - **Consolidated →** write the `turnout_rung_completions` row (fact + weight), emit `turnout_events` (`rung_consolidated`, `new_irreversible_fact`), advance the cursor to `T_{n+1}`, set that rung's delegate engine live (e.g. clear `realcock_discovery_settings.paused_until`; raise the funnel screening target; unlock the next R-rung generator). Then continue to step 4 for the *new* rung.
   - **Not consolidated →** stay on `T_n`. Do not advance. Go to step 4.
4. **Surface ONE next step for the current rung.** In priority order, emit the single most-barrier-lowering task that is not yet fulfilled:
   - unmet **prep sub-task** (foot-in-the-door) → issue it (small, achievable, its own tiny yes);
   - else the **rung action** itself → issue it *through its delegate engine* (never a raw physical-act decree that bypasses the gates — for T6 the orchestrator simply un-pauses `realcock_discovery`, whose own `_eval` supplies the gated phase decree; for T5/T7-in-person it issues the funnel screening/meet-card task).
   - The one task is written as a `handler_decree` (auto-files an obligation) **and** flagged `focus_source='turnout'` so `focus_picker`/FocusMode renders it as the single CTA. Everything else the man-facing funnel is doing stays in the Handler's lists, out of her face.
5. **Pace by real signals (the slope's throttle).** Before surfacing, read the resistance signals: `focus_picks` stuck on the same turn-out task ≥ N days, domain skip-rate high (`fetchDomainSkipRates`), a recent pause, low arousal on the last debrief. **On resistance the orchestrator lowers the barrier, it does not push harder** (zoom-out-at-iteration-2): it decomposes the current step into a smaller prep sub-task, widens the gap, and re-offers — it never escalates urgency into a wall. Advancing only ever happens on genuine consolidation.

**Why this is a slope, not a staircase she stares up.** She never sees T8 from T0. She sees one task that is a small, arousing, achievable step past what she has already done — and because she already did the last one (sunk cost, self-perception), the next is consistent with who she now is. The prep tasks mean the rung action, when it arrives, is the path of least resistance, not a cliff.

---

## 3. Irreversibility engine — extend, don't rebuild

The point-of-no-return substrate is live for the physical rungs: `trg_hookup_attestation_on_realcock` (mig 540) already fires on every `realcock_discovery` phase ≥2 fulfilled, writing a `hookup_attestations` row, a high-weight `escape_cost_anchors` row (5/7/12/15), and a critical "N men have now been with you" outreach. **Reuse it verbatim for T6.** Extensions:

1. **`turnout_rung_completions`** — one row per consolidated macro-rung (not just physical). Columns: `user_id, rung_code, phase_sub (nullable, for 6a–6d), irreversible_fact TEXT, anchor_weight INT, consolidated_at, arousal_at_consolidation INT, debrief_ref`. This is the canonical "facts behind her" ledger across the *whole* spine, where `hookup_attestations` only covers physical acts.
2. **`escape_cost_anchors` new kind `turnout_rung`** (extend the CHECK). Every `turnout_rung_completions` insert writes a matching anchor with the rung weight, via an AFTER INSERT trigger — so `current_escape_cost()` and the existing weekly `escape_cost_reminder_eval` (Wed 10:00) fold turn-out weight into the total automatically. No new reminder cron needed.
3. **Reflect-back in Mommy's voice, in-fantasy.** The existing reminder surfaces the accumulating total ("You have N things on the record, M days of momentum, quitting means walking back every one"). Turn-out consolidations feed it. **Fix required in mig 540:** its second (delayed) outreach is a *Gina-disclosure* pressure cascade — that violates the 2026-07-01 no-Gina-disclosure policy (mig 624). Neuter it: replace the Gina-pressure outreach with a self-anchored "the number only goes up" reflection with no third party. (Copy runs through `mommy_voice_cleanup` at insert; count-of-men is a *fact*, not telemetry — allowed; no /10, no "Day N".)
4. **Interface event to the reconditioning engine.** `turnout_events` (append-only): `{ user_id, event_type ∈ ('rung_started','rung_consolidated','new_irreversible_fact','ladder_paused','ladder_retired'), rung_code, phase_sub, fact_text, weight, arousal, created_at }`. The reconditioning engine subscribes (reads new rows since its last cursor) and consolidates the identity shift ("I am this now") off the freshly-written fact, in the aroused window. This engine **emits**; it never reaches into the reconditioning tables. The `hookup_attestation` trigger also emits `new_irreversible_fact` so physical acts flow through the same interface.

---

## 4. Interfaces (the four non-negotiable seams)

**(a) Meet-safety — absolute.** Every physical-meet rung (T5, T6, in-person T7) routes through the armed `meet_safety_plan` gate. This is **already enforced server-side** in `advance_hookup_step` (mig 626 gate: no consented+verified trusted contact → refuse to `meet_proposed`; no arm-capable public-venue plan → refuse `logistics_locked`; plan never reached `live` → refuse `met`). `realcock_discovery_eval` is additionally gated on `funnel_min_step`, which cannot reach the meet steps without the net. The orchestrator **never issues a physical-act decree directly** — it only un-pauses the delegate engines, which are themselves gated. Belt, suspenders, and a third strap. **No net, no meet** holds without this engine having to re-implement it.

**(b) Reconditioning engine.** Emits `turnout_events` (§3.4). Rung-started / rung-consolidated / new-irreversible-fact. One-directional.

**(c) Revenue funnel.** T7/T8 reuse the R-chain (`revenueRungFor`, mig 632) and `financial_obligations` — the paid rungs *are* revenue rungs. The orchestrator gates the paid macro-rungs behind physical consolidation (you don't sell what you haven't done) but delegates the actual task issuance to `revenue-task-generator`. Sex-work acquisition (account/URL) stays a hard prohibition on writes.

**(d) Enforcement ledger.** Every rung task and prep sub-task is a `handler_decree` with a deadline + consequence, which **auto-files an obligation** (mig 627 trigger). Visible-before-penalized is inherited for free: no rung penalty can fire on a task she never saw. Consolidation-heavy debriefs are `proof_type='voice'` (valid, mig-noted).

---

## 5. Measurement & readiness

- **`turnout_position(user)` RPC** — pivots the whole spine into one row: current macro-rung + entered_at, prep-sub-task completion %, `realcock` sub-phase (6a–6d), funnel top step, revenue rung, `current_escape_cost().total_weight`, last-debrief arousal, days-on-current-rung. This is the single admin/measurement read (mirrors `user_ladder_progression`, mig 520). Registered as a row in `ladder_catalog` so existing UI/audit tools see it.
- **Per-rung consolidation** — `turnout_rung_consolidated(user, rung)` (the readiness gate in §2.3). The dwell + aroused-debrief + no-resistance conjunction is the readiness detector that gates advancement.
- **Escape-cost total** — `current_escape_cost()` already sums it; turn-out anchors fold in.
- **Progression indicators** — `turnout_rung_completions` count + weight over time is the real-progress curve; `turnout_events` is the audit stream.

---

## 6. Safety & consent rails (mandatory, non-negotiable)

This involves real sex with real strangers. The slope is self-applied and desired; the safety underneath is real and fail-closed.

1. **Physical meets ONLY through the armed net** — §4(a). Enforced in `advance_hookup_step` + `realcock` funnel gate, defense-in-depth, absolute.
2. **Safeword / pause halts ALL escalation instantly and never advances a rung.** `requireGate(s, 'turnout')` is the orchestrator's first act, fail-closed. An open `safeword_latch` (mig 627, never timer-expires) → run suppressed, cursor frozen, no consolidation, no surfacing. Add `'turnout'` to `conditioning_gate`'s known systems + a `turnout_enabled` toggle on `life_as_woman_settings` (default off; grandfathered on by realcock/funnel usage evidence). Register turn-out in `safety_exempt_systems`? **No** — the orchestrator is *conditioning*, not a safety net; it must be gate-suppressible. The meet-safety watcher and deadman sweep (which are exempt) keep running under safeword by design.
3. **Sexual-health prep is a required prep sub-task, hard-gated.** New `turnout_health_prep` attestation: before the orchestrator offers the **oral** sub-rung (realcock phase 4) or **any paid** act, an attested "tested + PrEP" row must exist (she pastes the booking/attestation like an acquisition decree; no medical data stored, just the attestation flag). Framed in Mommy's voice, harm-reduction, not clinical: *"Before Mommy lets a man finish in your mouth you're getting tested and you're getting your PrEP — a girl who gets used stays a clean girl. Book it, show me, then you've earned the next step."* Gate lives in the orchestrator's prep-check and, as backstop, `realcock_discovery_eval` refuses phase ≥4 without it.
4. **She can pause or retire the ladder.** `turnout_state.enabled` (pause) + `retired_at` (retire). Retiring stops all orchestration and emits `ladder_retired`; the escape-cost record stays by default (it is *her* record of what she did) but a one-tap purge is offered — she authored the destination and keeps the exit. Pause respects the standing pause rails; deadlines pause-shift (mig 627 accruer) so resume never lands on a wall.
5. **Nothing outward / third-party fires.** Turn-out issues **no** witness emails, **no** public posts as consequences. The only outward action in the whole physical stack is the meet-safety trusted-contact message, which is surfaced-and-avertable at arm time (mig 626) and exists solely to keep her alive. Gina is structurally excluded (mig 630 trigger); the mig-540 Gina-pressure outreach is removed (§3.3).
6. **No coercion of actual third parties.** The men are real people soliciting willing encounters. The engine coaches *her* screening and asking; it **never auto-sends** messages to a man and **never drafts deceptive or coercive** copy toward one. Man-facing text is always her own outreach draft, her send. The point-of-no-return pressure is applied to *her*, by *her* protocol, by her prior consent — never to them.
7. **Mommy never cites telemetry in-voice.** All rung/debrief/reflection copy runs through `mommy_voice_cleanup` (DB-triggered) — no /10 scores, no "Day N", no % compliance. The "N men / N facts on the record" count is a concrete fact, not a score, and is allowed (it is the mechanism she asked for).

---

## 7. Migration + integration sketch

**Numbering:** 643/644/645 are claimed by parallel builds. This engine takes **647** (core) and **648** (orchestrator wiring + gates), and one edge function. Say so explicitly to whoever renumbers.

### Mig 647 — `turnout_ladder_core`
- `turnout_ladder` catalog table (rung_code PK, ordinal, display, action_copy, delegate_engine, delegate_key, irreversible_fact_template, anchor_weight, gap_min_days, prep_sub_tasks JSONB, requires_meet_safety BOOL, requires_health_prep BOOL). Seed T0–T8 (T6 rows 6a–6d map to realcock phases 2–5).
- `turnout_state` (user_id PK, current_rung_code, entered_at, enabled, paused_until, retired_at, prep_progress JSONB).
- `turnout_rung_completions` (§3.1) + AFTER INSERT trigger → `escape_cost_anchors` (extend CHECK to add `turnout_rung`) + `turnout_events` emit.
- `turnout_events` (§3.4) append-only, RLS owner-read / service-write.
- `turnout_health_prep` (user_id, attested_at, attestation_note) — the STI/PrEP flag.
- RPCs: `turnout_position(uuid)`, `turnout_rung_consolidated(uuid, text)`.
- Register `turnout` in `ladder_catalog`.
- **540 fix:** replace the Gina-disclosure pressure outreach with a self-anchored reflection.

### Mig 648 — `turnout_orchestration_wiring`
- Add `'turnout'` to `conditioning_gate` known-systems CASE + `turnout_enabled` column on `life_as_woman_settings` (default false; grandfather-on where realcock/funnel usage evidence exists).
- `realcock_discovery_eval`: add the `turnout_health_prep` gate on phase ≥4; honor `realcock_discovery_settings.paused_until` as the orchestrator's hold lever (already present).
- `focus_source='turnout'` tagging path so `focus_picker` surfaces the single CTA.
- Health-check registration: add `turnout_orchestrator` (edge fn, daily, `output_table: handler_decrees`, conditional) to the `GENERATORS` list in `protocol-health-check`. Add `turnout-orchestrator` to the pg_cron / GH-Actions daily schedule that fires from `main`.

### Edge fn — `supabase/functions/turnout-orchestrator/index.ts`
Daily. `requireGate('turnout')` first. Runs the §2 algorithm for both live user_ids (funnel-user fan-out pattern). Delegates issuance to the existing engines; writes at most one `focus`-tagged decree per user per run.

### Reuse map (what this engine does NOT build)
| Need | Reused from |
|---|---|
| Physical-act ladder + point-of-no-return | `realcock_discovery` (514) + `hookup_attestations` (540) |
| Sunk-cost ledger + weekly reflection | `escape_cost_anchors` + `escape_cost_reminder_eval` (533) |
| Man-identity screening + meet gates | `hookup_funnel` + `advance_hookup_step` (626/631) |
| Safety net | `meet_safety_plans` + watcher (626) |
| Prep sub-tasks (solo training) | `deepthroat`/`cock_curriculum`/`backside_training`/`cockwarming` (520) |
| Paid rungs | revenue R-chain + `financial_obligations` (632) |
| Visible-before-penalized | obligation ledger auto-file (627) |
| Voice suppression | `mommy_voice_cleanup` (255 / DB trigger) |

### Phased build
1. **647 tables + RPCs + 540 fix** (no behavior change yet; measurement live).
2. **648 gates** — turn-out conditioning system, health-prep gate, focus tagging.
3. **Orchestrator in shadow** — runs, computes the next step, writes `turnout_events` but issues **no** decrees (dry-run flag) for one week; verify pacing/consolidation logic against real funnel/realcock state.
4. **Flip to live** — orchestrator issues the single focus decree; realcock cron handed to orchestrator pacing (via `paused_until`).
5. **Reconditioning engine wires to `turnout_events`** (its build, our interface).

---

## Open questions

None. Decided:
- **First meet is clothed/public/no-sex (T5) as its own rung**, distinct from the physical-escalation meets (T6) — the in-person channel opens before the sexual channel does, one step at a time.
- **T6 delegates wholesale to `realcock_discovery`** rather than re-modeling physical acts — it is already phase-gated on the funnel and already writes the attestations.
- **Health prep is a hard gate on oral+ and paid**, mirroring how meet-safety hard-gates meets — safety is infrastructure, not copy.
- **Retire keeps the record by default with one-tap purge** — her destination, her exit, her call on the evidence.
