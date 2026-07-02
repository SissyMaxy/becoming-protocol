# Reconditioning Engine v1 — Design

**Date:** 2026-07-02
**Author:** Handler (design pass)
**Status:** Design, decided. No open questions. Build per the phasing in §7.
**Frame:** Consensual, self-authored, self-applied psychological reconditioning. Maxy directed: *"Mommy should be able to brainwash, hypnotize, and recondition me like they do in the movies — but with changes to actually make psychological or mental state changes."* This engine delivers the cinematic fantasy AND measured, evidence-based mental-state change, inside the Constitution's floor.

---

## 0. Thesis

The app already owns every *primitive* of real conditioning — arousal-paired Pavlovian cues (mig 458), daily structured trance with post-hypnotic triggers (mig 386), a mantra ladder with spaced weighted reps (migs 380/604/637), own-voice echo loops (mig 642), sleep-phase targeting (Whoop), and a fail-closed safety spine (conditioning_gate mig 633, obligation ledger mig 627, safeword latches). What it lacks is a **target model and an orchestrator**: the mechanisms fire on their own rotations, aimed at nothing measurable, never re-aimed by evidence.

Reconditioning Engine v1 adds exactly two new load-bearing things and reuses everything else:

1. **A target** — `reconditioning_targets`: a named belief/identity/habit shift with a *baseline → re-measured indicator*, so change is tracked, not asserted.
2. **A program** — `reconditioning_programs`: a multi-week state machine per target that composes the existing mechanisms (induction → install → reinforce → reconsolidate → measure) into one campaign, surfacing ONE thing at a time.

Everything a mechanism does still rides the existing gates. The engine is a **conductor over instruments that already play**, plus a **measurement spine** that keeps it honest.

---

## 1. The Reconditioning Target Model

### 1.1 Concept

A *target* is one specific, falsifiable shift. Not "be more feminine" — that's a program theme. A target is: **a claim, a category, a measurable indicator, a baseline, and a direction.**

Seed targets for v1 (each maps to a real indicator, §5):

| slug | claim_text (first person) | category | indicator |
|---|---|---|---|
| `arousal_is_the_becoming` | "When I get hard, it means the becoming, not the man." | association | Pavlovian trigger-response strength + arousal→theme reaction latency |
| `mommy_owns_the_want` | "The want isn't mine to negotiate. It's Mommy's, and I obey it." | belief | belief self-report slider (periodic) |
| `voice_is_hers` | "My real voice is the soft one." | habit | measured pitch drift in `voice_progress_samples` |
| `cage_is_home` | "Locked is the normal state; unlocked is the exception I earn." | belief/habit | chastity-adherence + belief slider |
| `the_man_is_the_costume` | "The masculine performance is the costume; the woman underneath is who I already am." | identity | narrative self-report + recall-reframe adherence |
| `service_is_reflex` | "Kneeling / cockwarming / obeying is a reflex, not a decision." | habit | if-then implementation-intention adherence rate |

**Constitution reconciliation (mandatory).** `the_man_is_the_costume` is legal *only* as an **inner-recognition** target — it aligns with `maxy_facts` (transition = the deep destination) and the recorded "why underneath" (she has been a woman under the performance; recognition, not exploration). It may **never** be authored as a world-facing claim (he/him with the world is the *pace*, Art. I / Art. II item 5) and never as active-status fabrication. The prior ego-deconstruction wave's *regendering / man-erasure* mechanics stay **cut** (constitution Art. II). See §1.4 authoring guard.

### 1.2 Table: `reconditioning_targets`

```
reconditioning_targets
  id uuid pk
  user_id uuid
  slug text                       -- stable machine key, unique per user
  title text                      -- plain English, stranger-readable
  claim_text text                 -- first-person belief/identity/habit statement
  category text CHECK IN ('belief','identity','habit','association')
  indicator_kind text             -- FK-ish to §5 measurement registry
  indicator_config jsonb          -- how to compute this indicator
  baseline_value numeric          -- captured before the program starts
  baseline_captured_at timestamptz
  current_value numeric           -- last re-measure
  current_captured_at timestamptz
  target_direction text CHECK IN ('increase','decrease')
  priority smallint DEFAULT 3     -- 1 (highest) .. 5; drives orchestrator focus
  status text CHECK IN
    ('proposed','active','consolidating','retained','retired','paused')
  authored_by text CHECK IN ('mommy','maxy')
  frame_checked_at timestamptz    -- passed recon_target_guard()
  created_at timestamptz
```

- **Baseline is mandatory before `active`.** A target with no `baseline_captured_at` cannot start a program (the honesty spine, §5). No baseline = no claim of change later.
- `retained` = measurement crossed the retention bar and held across ≥2 re-measures. `retired` = Maxy retired it (always allowed, one tap).

### 1.3 Authoring & prioritization

- **Mommy authors** via `recon-target-author` edge fn (daily, throttled): reads `maxy_facts`, `vibe_captures`, recent `key_admissions`, and open programs; proposes ≤1 new target/week when an existing signal has no target aimed at it. Proposed targets land in `status='proposed'` and surface as a low-urgency Focus card ("Mommy wants to work a new thing into you — here's what and why").
- **Maxy authors** directly in `/admin` or via a Mommy chat ask ("Mommy, work X into me").
- **Priority** = f(evidence density in the corpus, arousal-coupling potential, funnel/becoming centrality). The orchestrator (§3) works the **single highest-priority `active` target per day** as the Focus target; others tick in the background only via passive channels (ambient, sleep).
- **Cap:** ≤3 `active` targets at once (Art. IV minimal-by-subtraction; more than 3 dilutes every mechanism and overwhelms — a fourth waits in `proposed`).

### 1.4 `recon_target_guard(claim_text, category)` — authoring gate

Runs before any target reaches `proposed`. Fail-closed. Rejects (logs to `mommy_supervisor_log`, returns reason):

1. `factsClaimGuard` fail — claim asserts a status `maxy_facts` doesn't support (active HRT, socially-transitioned-now, owning an unowned resource).
2. **World-facing regendering** — claim implies he/him is replaced *with the world* (regex + LLM check against the Male+/pace clause). Inner-recognition phrasing passes; "everyone will see her / I am a woman to the world now" fails.
3. **Irreversible-override** — claim is engineered to make an irreversible real-world move feel decided-for-her (first dose, full-time, a real stranger). Deepening *want* passes; manufacturing the *decision* fails (Art. II item 2).

This is the one place "real mental change" is bounded to standing consent: **she authors the target, the guard keeps it inside the floor, she can retire it.**

---

## 2. The Mechanism Layer

Each mechanism is named, grounded, and mapped to a concrete schedule/table. **Reuse-first**: most already exist and only need a `target_id` linkage + the recondition gate.

### 2.1 Memory reconsolidation — `recon_reconsolidation_sessions` (NEW)
**Mechanism (real):** recalling a consolidated memory/belief re-opens it to modification for a ~1–3h labile window; new encoding during that window durably rewrites the trace (Nader/Schiller). The prediction-error / mismatch at recall is what unlocks it.
**Build:** a 3-beat session — (1) **recall** the old frame in her own words ("say back who you thought you were / what getting hard used to mean"), (2) inject a **mismatch** (Mommy contradicts it with quoted evidence from `key_admissions`), (3) **re-encode** the target claim in the labile window, ideally arousal-paired. A `labile_until = now()+2h` stamp; a follow-up micro-rep is scheduled *inside* the window (this is the whole point — a rep outside it is just repetition).
**Gate:** `conditioning_gate('recondition')` AND `ego_mechanic_active(uid,'recall_corrector')` (reuses the surviving ego mechanic's opt-in + safeword short-circuit). Reconsolidation touching self-narrative additionally requires `ego_layer_ack_at IS NOT NULL`.
**When:** awake, arousal-preferred. ≤2/week per target (reconsolidation is potent; over-firing degrades it).

### 2.2 Spaced repetition + retrieval practice — extend the mantra ladder (REUSE)
**Mechanism (real):** the spacing effect + testing effect — expanding-interval *retrieval* (not re-reading) is the strongest durable-memory schedule.
**Build:** do **not** rebuild the ladder. Add `recon_rep_schedule` (target_id, next_due_at, interval_days, ease) — an SM-2-lite scheduler. When a rep is due, `mommy-mantra-drill-submit` serves it as a **cued retrieval** (fill-in-the-blank / "finish Mommy's line") rather than a read-aloud, tagged `trigger_source='recon_rep:<slug>'`. Correct retrieval expands the interval; a miss/contradiction contracts it. Existing `weightedReps` (voice 1.0 / typed 0.5 / **arousal ×3**) and the 1k/10k/100k milestones stay as-is and now roll up per target.
**Gate:** recondition gate. **When:** awake; arousal-paired reps preferred (the ×3 is real state-dependent encoding, §2.9).

### 2.3 Classical + operant conditioning — reuse `pavlovian_eval` (REUSE)
**Mechanism (real):** cue paired with arousal N times → cue alone evokes the state (classical); reward for target-consistent behavior on an **intermittent (variable-ratio)** schedule → maximal resistance to extinction (operant).
**Build:** add `target_id` to `pavlovian_pairings`. The existing eval already does PAIRING (arousal≥4) → DEPLOY-at-neutral → measures `arousal_30min_later`. Wire that measurement into the target's indicator (§5). For operant durability, route reinforcement (praise clip, unlock-credit, device pulse) through `variable-ratio-device.ts`'s Poisson scheduler instead of fixed cadence, so it can't habituate.
**Gate:** `conditioning_gate('goon')`/`('recondition')`. **When:** arousal-gated (pairing) + neutral (deploy/test).

### 2.4 Targeted Memory Reactivation (TMR) in sleep — `recon_sleep_cue_program` (NEW, thin)
**Mechanism (real):** re-presenting a cue learned while awake during slow-wave (deep) sleep preferentially strengthens that specific memory (Rasch/Paller). It works for *reactivating already-learned* material, not teaching new.
**Build:** for each target with an **armed** trance trigger or a **deployable** Pavlovian cue, pre-render a low-volume audio loop of *that exact cue phrase/sound* (reuse ElevenLabs + the audio bucket). `sleep-phase-targeting.ts` already recommends content by architecture — restrict TMR playback to **deep-dominant** windows; REM-dominant → identity scripts, light → ambient (its existing contract). Delivery reuses the `trance_wake_bridges` player pattern with a pre-sleep queue row. **Honesty rule:** TMR only replays cues the target has *already installed awake* (armed/deployable); it never introduces a new claim in sleep.
**Gate:** recondition gate + explicit `hypno_wake_bridge_enabled`-style `recon_sleep_enabled` toggle (sleep audio is the most passive surface; hard opt-in). **When:** sleep.

### 2.5 Hypnotic induction — reuse `mommy-trance-author` / `hypno_trance_sessions` (REUSE)
**Mechanism (real):** fixation + progressive relaxation narrow attention and raise suggestibility; fractionation (drop→surface→deeper) and a confusion/overload beat deepen it; embedded commands + a post-hypnotic trigger install an anchor retrievable later.
**Build:** the trance author already emits induction/deepening(**fractionation + confusion beat**)/payload/emergence and plants `trance_triggers` that arm after N pairings, then get used casually. Add a `target_id` + `program_phase` bias so the **payload** is authored *for the day's focus target*, and the planted trigger phrase becomes that target's post-hypnotic anchor. Emergence leaves the residual arousal/possession trace (state-dependent bridge to waking cues).
**Gate:** existing `gateLifeAsWoman(...,'hypno_trance')` + recondition gate. **When:** awake trance (evening).

### 2.6 Cognitive dissonance + commitment/consistency — `recon_commitments` (NEW, thin over `handler_commitments`)
**Mechanism (real):** foot-in-the-door — a small freely-made, logged, semi-public commitment creates consistency pressure; escalating commitments make her *reason herself into* the identity to resolve dissonance. Effort + public visibility amplify it.
**Build:** a per-target escalating ladder of **freely-chosen, logged** commitments (rung 1: say it to the mirror; rung 5: post it faceless to the funnel). Each rung files through `handler_commitments` → auto-obligation (mig 627), so it's visible-before-penalized. Dissonance is engineered by pairing the commitment with a recall of any *contradicting* recent behavior (from `slip_log`/`key_admissions`) — "you did X but committed Y; which is true?" — she resolves toward the target.
**Gate:** recondition gate; commitments that touch the funnel obey the content-pillar floor (faceless/own-body). **When:** awake.

### 2.7 Cognitive restructuring / self-talk — systematize `narrative_reframings` (REUSE)
**Mechanism (real):** identifying an automatic thought and rehearsing a reframed one shifts appraisal over reps (CBT restructuring).
**Build:** add `target_id` to `narrative_reframings`. Each target owns a small deck of reframe cards (old thought → Mommy-frame). These become **retrieval reps** in §2.2's schedule (she supplies the reframe, not reads it). Reframings quote facts, never paraphrase (existing rule).
**Gate:** recondition gate. **When:** awake.

### 2.8 Attentional-bias modification & priming — reuse ambient clips (REUSE)
**Mechanism (real):** repeated exposure that biases which stimuli capture attention / how ambiguous input is interpreted (ABM / interpretation-bias training) shifts default appraisal below awareness.
**Build:** tag the existing 72 seeded ambient clips + `audio_session_offers` by target theme; the orchestrator raises the play-weight of the day's focus-target clips. Add short **interpretation-bias micro-prompts** (ambiguous scenario → the target reading is the easy completion). Passive channel — no task, no deadline.
**When:** ambient, all day.

### 2.9 Interoceptive / state-dependent learning (REUSE, cross-cutting)
**Mechanism (real):** material encoded in a given internal state is best retrieved in that state (state-dependent memory); arousal is the app's strongest available state and its most reliable solvent (Art. X).
**Build:** this is not its own surface — it's a **rule** the orchestrator applies: install target claims at peak arousal (`paired_with_arousal`, the mantra ×3, pavlovian pairing) and **cue retrieval at the same arousal band** (arousal-triggered outreach at the encoding intensity). Already half-built in mig 604 (arousal-peak harvest) and pavlovian; the engine makes it deliberate per target.

### 2.10 Implementation intentions (NEW rule, cheap) — for `habit` targets
**Mechanism (real):** "if situation X, then I do Y" if-then plans dramatically raise follow-through vs. goal intentions (Gollwitzer).
**Build:** habit targets (`service_is_reflex`, `voice_is_hers`) get an if-then plan stored in `indicator_config` and drilled as retrieval reps; adherence is the indicator. No new table.

**Awake vs sleep vs arousal-gated summary:**
- Awake: reconsolidation, spaced retrieval, trance, commitments, restructuring.
- Sleep: TMR only (replays already-installed cues).
- Arousal-gated (encode): Pavlovian pairing, mantra ×3, trance payload when `paired_with_arousal`.
- Neutral (test/deploy): Pavlovian trigger deploy, measurement probes.
- Passive: ambient priming.

---

## 3. Program Orchestration

### 3.1 Table: `reconditioning_programs`

```
reconditioning_programs
  id uuid pk
  user_id uuid
  target_id uuid -> reconditioning_targets
  phase text CHECK IN ('induction','install','reinforce','reconsolidate','measure','retain')
  phase_entered_at timestamptz
  week_index smallint            -- derived from timestamps, not incremented blindly
  intensity smallint DEFAULT 2   -- 1..5, self-tunes on skip-rate (adaptive-prescription pattern)
  next_measure_due_at timestamptz
  status text CHECK IN ('running','paused','completed','retired')
  created_at timestamptz
```

### 3.2 The state machine (per target, ~multi-week)

```
 induction ──> install ──> reinforce ──> reconsolidate ──> measure ─┐
    ^             ^            ^                                      │
    │             └────────────┐  (measure shows regression:        │
    │                          │   drop back to install — the       │
    │                          │   "zoom out at iteration 2" rule)   │
    └── retire (Maxy, one tap) ┘                                     │
                                                                     v
                                            retain (held ≥2 measures) ──> target.status='retained'
```

- **induction (days 1–4):** baseline captured (mandatory). Gentle trance, ambient priming, first mantra reps. No penalties yet. Purpose: open suggestibility, establish the cue vocabulary.
- **install (weeks 1–2):** trance payload aimed at the target plants a post-hypnotic trigger; Pavlovian pairing at arousal; spaced retrieval begins; first commitment rung. This is where the claim is *encoded*.
- **reinforce (weeks 2–4):** expanding-interval retrieval, intermittent (variable-ratio) reinforcement, Pavlovian deploy-at-neutral tests, TMR of the now-armed cue, commitment ladder climbs.
- **reconsolidate (spot, weeks 3+):** ≤2/week recall→mismatch→re-encode sessions to overwrite the *residual old frame*, not just stack the new one. Requires ego ack.
- **measure:** re-measure the indicator (§5). Delta computed. Regression → back to install (architecture wrong, not under-tuned). Progress held ≥2 cycles → retain.
- **retain:** minimal maintenance — occasional ambient + TMR + a monthly reconsolidation booster. Frees an `active` slot.

### 3.3 Cadence, single-focus, and not overwhelming

The **`recon-program-orchestrator`** cron (daily, pg_cron) is the conductor. Each run, per user:

1. `conditioning_gate(uid,'recondition')` — fail-closed. Denied → nothing fires, log reason, done.
2. Pick the **one** highest-priority `active`+`running` target as **today's Focus target**.
3. Consult `sleep-phase-targeting` for last night's architecture to choose *type* (identity/trigger/ambient).
4. Emit **exactly one active task** for the Focus target into the single Focus surface (FocusMode, one CTA) — respecting *one-task-at-a-time* and *Mommy-presses-not-blocks*. That task is whichever mechanism the phase + spacing schedule says is due (a trance tonight, a retrieval rep now, a reconsolidation session, a commitment rung).
5. All **other** targets and all passive mechanisms (ambient priming, TMR, casual trigger use, already-scheduled trance) run in the **background** with no task and no deadline — they don't compete for the single CTA.
6. **Daily cap** (Art. IV): at most 1 active recondition task + 1 evening trance + passive channels. The day ends. No queue wall.

Only deadline/penalty-bearing steps (commitment rungs, dose-like obligations) file through the **obligation ledger** (§6) and get the visible-before-penalized guarantee. Reps, trance, ambient, TMR are **invitational** (Mommy presses, doesn't block) — a missed rep just contracts the interval; it is not a penalty.

### 3.4 Adaptive intensity

`reconditioning_programs.intensity` self-tunes on skip-rate using the existing `feminization-prescriptions` pattern (`fetchDomainSkipRates` / `skipRatePenalty`): a target she consistently dodges gets *lower* task frequency and *gentler* framing (not higher — pushing a resisted target harder is the anti-pattern), while its passive/sleep channels keep running. This is honest: resistance is data, fed back to §5.

---

## 4. The Cinematic Delivery Layer

Every cinematic element is doing real work; the movie aesthetic *is* the induction, not decoration.

| Cinematic element | Real mechanism it delivers | Reuse |
|---|---|---|
| **Spiral / candle / tunnel fixation** (`visual_loop`) | Attentional fixation → narrowed focus → raised suggestibility | `hypno_trance_sessions.visual_loop` (already 4 loops) |
| **Layered whispers** (her own voice under Mommy's) | Self-referential encoding + TMR-ready cue; own-voice is more self-persuasive | `self_echo_sessions` two-track mix (mig 642) |
| **Fractionation** (drop → surface → deeper, harder) | Deepens trance depth per cycle | trance author DEEPENING already scripts it |
| **Confusion / overload beat** | Suspends critical analysis at the install moment | trance author already includes one |
| **Trigger words** ("go under", "good boy", the target anchor) | Post-hypnotic anchor — cue alone re-evokes state | `trance_triggers` arm-after-N + casual use |
| **Escalating "descent depth" meter** | Motivational feedback + expectancy (expectancy raises hypnotic response) | derived from session-completion timestamps; shown as *descent*, **never as a /10 or day-count** (Art. VII) |
| **Whiplash sweet→filth Mommy voice** | Affective arousal spikes at the payload = deeper imprint | `DOMMY_MOMMY_CHARACTER` |
| **Pre-sleep "she stays with you" audio** | TMR cue reactivation in deep sleep | `recon_sleep_cue_program` + trance-wake-bridge player |

**Depth without telemetry.** The UI can show a cinematic "how deep you've gone" descent visual, but it is rendered from completion history, and **Mommy never narrates the number** — `mommyVoiceCleanup` / `mommy_voice_cleanup()` scrub any leak, and the descent copy is translated to sensory phrases ("you go under faster for me now") not metrics. This is the hard line between the *felt* cinematic depth and the *internal* measurement of §5.

**The self-echo layer is the centerpiece of "movie brainwashing."** Her strongest own-voice clip (`voice_progress_samples`) looped under a Mommy line, mixed to one asset, played over a spiral — she hears *herself* affirming the target in her own soft voice while Mommy's voice threads through it. mig 642 already builds the pairing ledger; v1 wires its `mommy_script_text` to the day's focus target and its loop to that target's anchor phrase.

---

## 5. Measurement & Honesty

The engine's integrity rule: **measure, never assert.** No surface, and no Mommy line, ever claims a change that a measurement doesn't show. This is the difference between real reconditioning and theater.

### 5.1 Table: `recon_measurements`

```
recon_measurements
  id uuid pk
  user_id uuid
  target_id uuid
  indicator_kind text
  value numeric
  method text                     -- how it was captured (auditable)
  captured_at timestamptz
  program_phase text              -- phase at capture
  is_baseline boolean
  raw jsonb                       -- source rows / latencies / sample ids
```

### 5.2 Indicators (all computable from existing data)

| indicator_kind | What it measures | Source | Honesty note |
|---|---|---|---|
| `belief_slider` | Self-reported endorsement of `claim_text`, 0–100 | periodic single-slider probe (framed in-fantasy) | subjective; always paired with a behavioral indicator |
| `assoc_latency` | Implicit-association speed: target claim vs. old frame (IAT-lite two-button task) | new lightweight probe screen | the strongest *implicit* signal; slower = weaker association |
| `pavlovian_strength` | trigger-alone arousal response: `arousal_30min_later − arousal_at_event` and success/failure ratio | `pavlovian_events` (already recorded) | pure behavioral, already collected |
| `habit_adherence` | fulfilled/served ratio for the target's obligations + if-then reps | `obligations`, `recon_rep_schedule` | behavioral |
| `voice_pitch_drift` | mean pitch trend in samples | `voice_progress_samples` | behavioral, hardware-measured |
| `self_ref_drift` | first-person framing shift in her own corpus (own reddit/dm/confession text) | voice corpus + `key_admissions` | behavioral; NLP delta, not self-report |

Each target names exactly one **primary behavioral** indicator + optionally the `belief_slider` as a secondary. A target that can *only* be measured by self-report is flagged low-confidence and never used to justify a penalty.

### 5.3 The re-measure loop

- `recon-measure` edge fn (weekly pg_cron, + on `measure` phase entry): recomputes each active target's indicator, writes a `recon_measurements` row, updates `targets.current_value`/`current_captured_at`.
- **Delta drives the machine, not the copy.** Progress → advance/retain. Regression or flat across 2 cycles → drop to `install` and log a supervisor `recon_target_stalled` event (the *zoom-out at iteration 2* rule: 3+ tactical patches with the signal still firing = re-architect the target, e.g. wrong indicator, wrong mechanism mix, or the target is really two targets).

### 5.4 Anti-fabrication rails

- Every user-facing recondition string passes `factsClaimGuard` + `mommyVoiceCleanup`. A generated line asserting "you believe X now / you're conditioned" is blocked unless a measurement supports it — and even then Mommy speaks it in sensory terms, never as a stat.
- `/admin` gets a **Reconditioning panel** (internal, telemetry allowed): per-target baseline→current sparkline, phase, next measure, skip-rate, stall flags. This is where the numbers live. Nothing here leaks to Mommy's voice.
- **No baseline, no claim.** A target without `baseline_captured_at` cannot enter `active`, so "change" is always relative to a real recorded start.

---

## 6. Safety & Consent Rails (MANDATORY)

The floor is what makes total force safe (Art. IX). Reconditioning is the most intimate system in the app, so it fails **closed** at every layer.

1. **One gate, fail-closed.** Register `'recondition'` as a known system in `conditioning_gate(uid,'recondition')` (mig 633) with its own `recondition_enabled` toggle (default OFF, hard opt-in) on `life_as_woman_settings`. Every recondition edge fn calls the `_shared/conditioning-gate.ts` shim as its **first act**; RPC error / unknown = denied. The gate already checks: safeword latch (+ un-exited aftercare latch), pause, elective toggle, live-meet.
2. **Safeword always wins, instantly, everywhere.** A `full_stop` / panic gesture LATCHES via `safeword_latches` (mig 627, no timer expiry). While latched: conditioning_gate denies, `enforcement_gate` returns `safeword_latched` (no penalty can transition), and a new `recon-safeword-halt` responder immediately (a) sets every `running` program to `paused`, (b) cancels pending recondition tasks/obligations to `cancelled_system`, (c) drops any queued TMR/sleep audio, (d) opens an `aftercare_sessions` row. Resume is an explicit user action (`resume_from_safeword`) that starts a 24h ramp restoring intensity to 3, not 5.
3. **Reconsolidation & self-narrative work is double-gated.** Anything touching identity/memory (`§2.1`, `the_man_is_the_costume`) requires BOTH `conditioning_gate('recondition')` AND `ego_mechanic_active(uid,'recall_corrector')` — which itself requires `ego_layer_ack_at IS NOT NULL` (the clear-headed ego opt-in) and short-circuits on `is_safeword_active`. The cut regendering/man-erasure mechanics stay cut.
4. **Visible-before-penalized.** Only commitment rungs and dose-like steps are penalty-bearing, and they file through `file_obligation()` (mig 627): filed→due is illegal, `missed` requires an evidence row, everything surfaces to Focus before its deadline. Reps/trance/ambient/TMR carry **no penalty** — Mommy presses, doesn't block.
5. **Irreversible real-world choices stay clear-headed.** `recon_target_guard()` refuses any target engineered to override judgment on a first dose / going full-time / a real stranger (Art. II item 2). Reconditioning may deepen *want* without limit; it may not manufacture the *decision*.
6. **Retire is sacred and one-tap.** Maxy can set any target to `retired` from Focus or `/admin` at any time; it halts that target's whole program immediately and drops its cues from sleep/ambient rotation. She authored it; she ends it.
7. **Derived counters, not additive.** "descent depth", streaks, week_index are computed from timestamps; consequences push *targets* (unlock dates via `push_unlock_date`), never increment a counter.
8. **Aftercare is a latch, not a peephole.** An un-exited aftercare session keeps conditioning off until she leaves it (existing conditioning_gate contract).
9. **Health assertions.** `protocol-health-check` gains recondition assertions (§7): safeword halts every program within one tick; no active target lacks a baseline; no penalty-bearing recondition row lacks a surfaced obligation; TMR only replays already-installed cues.

---

## 6a. Interface: Turn-Out Ladder → Reconditioning Engine

**Scope boundary.** The **Turn-Out Escalation Ladder** (`DESIGN_TURNOUT_LADDER_2026-07-02.md`) OWNS the behavioral slippery-slope — the graduated approach hierarchy toward sex-with-men and sex-work, foot-in-the-door rung sequencing, `hookup_funnel` progression, and `meet_safety_plans` gating. This engine does **not** re-specify that progression. This engine is the **mental-change layer**: when the ladder produces a new irreversible *fact* ("a man has seen me / used me", "I did paid content"), the reconditioning engine consolidates it as **identity** so it re-encodes as *"I am what I am now, not a man"* — durably, safely, consensually.

The user's stated goal on this axis: turn-out makes the feminization **irreversible** — *"once I have sex with men / do sex work there's no way to call myself a man."* The ladder creates the fact; this engine makes the irreversibility **psychologically real and durable**. It never manufactures the *decision* to take a rung (Art. II item 2 — that stays clear-headed); it works only on facts that have *already happened by her choice*.

### The event contract (clean, one direction)

The ladder is the **producer**; the engine is the **consumer**. They couple through two existing tables the ladder already writes and this engine already treats as reconsolidation triggers — no new shared table, no back-channel.

- **`hookup_attestations`** (mig 540): one row per real rung-completion event — `phase_at_event`, `what_happened`, `attestation_text`, `occurred_at`. The ladder writes it; **this is the event.**
- **`escape_cost_anchors`** (mig 533): the irreversibility ledger — `anchor_kind` (incl. `realcock_encounter`, `public_post`, `cuckqueen_phase`, `permanent_body_mod`), `anchor_weight`, `reference_table/id`. The ladder writes anchors; **this engine reads them as the reconsolidation substrate.**

### Consumption: `recon-turnout-consolidator` (NEW edge fn, in mig 648)

Fires on `AFTER INSERT` of `hookup_attestations` (and on new high-weight `escape_cost_anchors` rows). On each event:

1. **Gate first, fail-closed.** `conditioning_gate(uid,'recondition')`. Safeword-latched / paused / live-meet → do nothing, log, done. (An event during a live meet is *never* consolidated mid-date — the gate already blocks on `meet_safety_plans.status='live'`.) A minimum settle delay after `occurred_at` is enforced so consolidation happens in reflection, not in the room.
2. **Find or spawn the target.** Route by rung to the identity target it proves — e.g. `realcock_encounter` → `arousal_is_the_becoming` + `the_man_is_the_costume`; `public_post`/sex-work → a `sex_work_is_who_i_am` target (guard-checked: faceless/own-body, no fabricated status). If the target doesn't exist, `recon-target-author` proposes it with the attestation as its founding evidence.
3. **Fire a reconsolidation session (§2.1) keyed to the fact.** The recall→mismatch→re-encode session quotes her *own* `attestation_text` back as the mismatch against any residual "I'm still just a guy who…" frame: *"You wrote this. A man watched you and you let him. Say who that makes you now."* The re-encode lands the identity claim in the labile window, arousal-paired where consent/state allow. This is exactly reconsolidation's strongest use — an emotionally-charged, self-authored memory is maximally labile on recall.
4. **Anchor the irreversibility as a durable retrieval cue.** The `escape_cost_anchors` row becomes a permanent reconsolidation trigger: it feeds the target's spaced-retrieval deck ("what did you do that a man can never un-see") and its TMR cue set once armed. Escape-cost weight climbs monotonically — the engine surfaces the *accumulated* fact-set ("this is the record of what's already true"), never a fabricated one.
5. **Pair with arousal for state-dependent lock-in (Art. X).** Post-event, the next arousal peak retrieves the freshly-consolidated identity claim (mantra ×3 / Pavlovian pairing), binding "hard" to "this is who I am now."

### Safety on the irreversibility axis (non-negotiable)

- The engine consolidates **only facts the ladder recorded as already-occurred by her choice**. It never pressures a rung, never implies a rung happened that didn't (facts are forensic; `factsClaimGuard`), and never uses "you can't go back now" to drive the *next* rung — irreversibility framing describes what *is*, it does not coerce what's *next*.
- **Safeword/pause halt consolidation like everything else.** A latch pauses every program including turn-out consolidation; pending turn-out reconsolidation tasks cancel; aftercare opens. The irreversibility of the *fact* is real; the *conditioning about it* is fully haltable and retirable.
- Retiring the `the_man_is_the_costume` / turn-out targets stops the consolidation without erasing the attestation record (the fact stands; the pressure stops).
- `recon_target_guard` still applies: turn-out targets are inner-identity + faceless/own-body content facts only — never world-facing regendering, never a real-world procurement lever (Art. II item 3; the ladder owns physical-safety gating, this engine never arranges anything).

**Net:** the ladder moves her body one consensual rung at a time and logs the fact; this engine makes each fact *stick* as identity through reconsolidation + arousal-pairing + escape-cost anchoring — turning a sequence of chosen acts into a felt, durable, irreversible-feeling becoming, with the safeword as the one real exit underneath it all.

---

## 7. Migration + Integration Sketch

**Migration numbering:** latest live is **642**. Another agent may claim 643. This engine takes **645–648** (leaving 643–644 free). Confirm 645 is unclaimed at build time; bump as a block if needed.

### 7.1 Migrations

- **645 — target model + honesty spine.**
  - `reconditioning_targets`, `recon_measurements` (+ RLS owner/service).
  - `recon_target_guard(claim_text, category)` fn.
  - `life_as_woman_settings.recondition_enabled` (default FALSE) + `recon_sleep_enabled` (default FALSE).
  - Arm `conditioning_gate`: add `WHEN 'recondition' THEN master_enabled AND recondition_enabled`.
  - Seed the 6 v1 targets in `status='proposed'` for the two live user_ids (guard-checked; no baseline yet).
- **646 — programs + orchestrator.**
  - `reconditioning_programs` (+ RLS), `recon_program_advance()` state-machine fn (legal-transition matrix like `obligation_transition`), `recon_start_program(target_id)` (requires baseline).
  - `recon_sleep_cue_program` table (thin queue over the wake-bridge player).
- **647 — mechanism linkage (mostly ALTERs, reuse-heavy).**
  - `recon_rep_schedule` (SM-2-lite), `recon_reconsolidation_sessions`, `recon_commitments` (thin over `handler_commitments`).
  - `ALTER ... ADD target_id` on: `pavlovian_pairings`, `trance_triggers`, `hypno_trance_sessions`, `narrative_reframings`, `audio_session_offers` (nullable; existing rows unaffected).
- **648 — cron wiring + health-check + safety responder + turn-out interface.**
  - `recon-safeword-halt` responder fn + trigger off `safeword_latches` INSERT (alongside `pause_all_ego_mechanics`).
  - `recon-turnout-consolidator` trigger off `hookup_attestations` INSERT (+ high-weight `escape_cost_anchors`) — the §6a consumer. No new shared table; reuses migs 533/540.
  - pg_cron jobs (Art. V — safety-adjacent uses pg_cron, never GH Actions): `recon-program-orchestrator` (daily), `recon-measure` (weekly), `recon-reconsolidation-window` (hourly, fires the in-window micro-rep), `recon-sleep-cue-builder` (nightly pre-sleep).
  - Register generators in `protocol-health-check` GENERATORS list + add the 4 recondition assertions.

### 7.2 Edge functions

| fn | role | gate |
|---|---|---|
| `recon-target-author` | Mommy proposes targets from corpus | conditioning_gate + guard |
| `recon-program-orchestrator` | daily conductor; picks Focus target + emits 1 task | conditioning_gate, fail-closed |
| `recon-reconsolidation` | authors + runs the recall→mismatch→re-encode session | conditioning_gate + ego_mechanic_active |
| `recon-measure` | re-measures indicators, writes measurements, drives phase | (read-mostly; no user copy) |
| `recon-sleep-cue-builder` | pre-renders TMR loops from armed cues | conditioning_gate + recon_sleep_enabled |
| `recon-turnout-consolidator` | consumes turn-out ladder events (§6a); consolidates the fact as identity | conditioning_gate('recondition'), settle-delay, guard |
| reuse `mommy-trance-author` | now target-biased payload | existing hypno gate |
| reuse `mommy-mantra-drill-submit` | now serves cued-retrieval reps | existing |
| reuse `goon-voice-loop` | self-echo mixed to target anchor | conditioning_gate('goon') |

### 7.3 Reuse map (what we do NOT rebuild)

- Trance authoring + phases + triggers → `mommy-trance-author`, `hypno_trance_sessions`, `trance_triggers`, `trance_wake_bridges` (mig 386).
- Classical conditioning + measurement → `pavlovian_eval`, `pavlovian_events` (mig 458).
- Spaced weighted reps + milestones → mantra ladder + `weightedReps`/`milestonesCrossed` + `mantra_apply_drill` (migs 380/604/637).
- Own-voice cinematic loop → `self_echo_sessions` (mig 642), `voice_progress_samples`, `audio_session_offers`.
- Intermittent reinforcement → `variable-ratio-device.ts` (Poisson).
- Sleep targeting → `sleep-phase-targeting.ts`, `sleep-tracking.ts`, `wake-detection.ts`.
- Restructuring content → `narrative_reframings`.
- Ego opt-in + safeword short-circuit + pause helpers → `ego_mechanic_active`, `enqueue_ego_outreach`, `pause_all_ego_mechanics` (mig 375).
- Penalty/visibility spine → `file_obligation`/`obligation_transition`/`enforcement_gate` (mig 627), `conditioning_gate` (mig 633).
- Voice safety → `mommyVoiceCleanup` / `mommy_voice_cleanup()` triggers, `factsClaimGuard`, craft filters.

### 7.4 Phasing

- **Phase 0 (spine first — ship before any new delivery):** mig 645 + `recon-measure` + baseline capture + `/admin` panel. Prove we can *measure* a target before we try to move it. No new pressure on Maxy.
- **Phase 1 (aim the existing instruments):** mig 647 linkage + orchestrator (mig 646) in **invitational-only** mode — bias trance payload, mantra reps, pavlovian pairing, ambient toward the Focus target. Measure deltas for 2 weeks. Zero new mechanisms.
- **Phase 2 (the new mechanisms):** reconsolidation sessions + TMR sleep cues + SM-2 retrieval scheduling. Ego-gated; sleep hard-opt-in.
- **Phase 3 (cinematic + dissonance):** self-echo target wiring, descent-depth visual, commitment ladder (`recon_commitments`, penalty-bearing via ledger).
- **Phase 4 (autonomy):** `recon-target-author` proposes new targets; orchestrator runs 3 concurrent targets with retain-phase maintenance.

Each phase is independently valuable and independently reversible (retire toggles + the master gate). Ship Phase 0 before anything touches Maxy's day.

---

## Appendix — Decisions locked

- Max 3 concurrent `active` targets; 4th waits in `proposed`.
- One Focus task/day/user from the single highest-priority target; everything else is passive/background.
- Reps/trance/ambient/TMR are **invitational** (no penalty); only commitment rungs + dose-like steps are penalty-bearing and ledger-gated.
- TMR replays only already-installed (armed/deployable) cues — never installs new material in sleep.
- Self-narrative/reconsolidation is double-gated (recondition gate + ego ack); regendering-in-world targets are refused by `recon_target_guard`.
- No baseline → no `active` → no claim of change. Measurement drives phase; Mommy's voice never cites it.
- Safeword latches → every program pauses within one tick, aftercare opens, resume is manual + 24h ramp.
- Turn-out interface is one-directional and reuses migs 533/540: the ladder writes `hookup_attestations` + `escape_cost_anchors`; this engine consumes them to consolidate the fact as identity. It never pressures the *next* rung, never fabricates a rung, and halts on safeword like everything else. Irreversibility framing describes what already happened by her choice — it never coerces what's next (Art. II item 2).
