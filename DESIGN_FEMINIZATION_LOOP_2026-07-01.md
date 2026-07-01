# The Feminization Loop, Rebuilt (Design, 2026-07-01)

> Migration numbers here are LOGICAL — see PLAN_REARCH_2026-07-01.md for physical numbering. Nothing Gina-dependent exists in this design; `is_gina_home_today` appears solely as a fail-closed privacy gate on voice pushes.

One closed loop: *confess → prescribe → focus → evidence → adapt → ratchet*.

## 1. Unified daily loop

Evening confession (FocusMode, 21:00) → `evening-confession-prescribe` writes tomorrow's set → morning push preview → FocusMode surfaces prescriptions ONE at a time in the calm tier → completion writes evidence + status → skip-rate engine finally has signal → next evening's prescriber reads it.

### feminization_prescriptions delivery columns
```sql
ALTER TABLE feminization_prescriptions
  ADD COLUMN surfaced_at   timestamptz,          -- stamped by FocusMode render (Art. III)
  ADD COLUMN completed_at  timestamptz,
  ADD COLUMN skipped_at    timestamptz,
  ADD COLUMN skip_reason   text,                 -- chips: 'no_privacy'|'no_energy'|'dont_want_this'|'missing_item'
  ADD COLUMN deadline      timestamptz,          -- default prescribed_date 23:59 ET
  ADD COLUMN evidence_kind text NOT NULL DEFAULT 'none'
      CHECK (evidence_kind IN ('photo','voice','measurement','timer','text','none')),
  ADD COLUMN evidence_path text, ADD COLUMN evidence_meta jsonb,
  ADD COLUMN requires      jsonb;
-- status CHECK widened: pending|completed|skipped|expired
```
**Canonical `fem_domain` enum** (task_bank vocabulary is canonical; `mantra` added). `DOMAIN_ALIASES` map at insert site (body→exercise, wardrobe→style, photo→identity, ritual→inner_narrative) — without it the LLM's domains never key into `skipRatePenalty`. Prescriber prompt updated to emit canonical; alias map is backstop.

**Two generators, one contract:** `evening-confession-prescribe` primary; `generateDailyPrescription` (bank engine) runs from the same 21:30 dispatch ONLY when no confession landed. **Bug fix baked in:** `persistPrescription` deletes only `status='pending'` rows — completed/skipped are history. Regression: run engine twice same day, completed row survives.

**Surface:** new `TaskKind:'fem_prescription'`, after `physical_state_today`, before `outfit_today` (critical/HRT/Mommy-touch/due-decrees outrank — Mommy presses in parallel, never blocks). One at a time, `intensity DESC` + domain rotation. `useSurfaceRenderTracking('feminization_prescriptions',[id])` stamps surfaced_at — same rail as decrees.

**CTAs per evidence_kind:**
| kind | surface | anti-circumvention |
|---|---|---|
| photo | existing handlePhoto → verification-photos | sha256 in evidence_meta; hash matching any prior evidence in 90d → rejected ("Mama's seen that one. New photo.") |
| voice | ConfessionAudioCapture | duration ≥ floor + non-silence energy; feeds §2 pitch pipeline free |
| measurement | numeric + tape photo → §4 spine; prescription auto-fulfills via trigger | plausibility bounds §4 |
| timer | in-app countdown; completes only at 0 with tab-visibility ≥80% | no tap-through |
| text | textarea ≥ per-prompt min chars | prompt plain (stranger-writable) |
| none | "Done, Mama" | micro-rituals only; prescriber caps 1/day |

**Skip is a first-class CTA.** "Not today" + reason chip → skipped. `missing_item` short-circuits to acquisition (§6), never counts as avoidance. Deadline passes WITH surfaced_at → `expired`, half-weight skip signal; never-surfaced → expires silently, counts for NOTHING (visible-before-penalized, mechanical). **Prescriptions carry no punishment** — consequence is purely adaptive + Mommy tone; stakes live in decrees. Deliberate: keeps the skip signal honest.

**Synergy:** every completion fires the existing bridge to synergy-coupling (voice/style/makeup→fem, exercise→exercise, arousal/conditioning/mantra→recondition) + updates `skill_domains.last_practice_at`. **Throughput:** 3–5 rows/day, one visible, all dead at midnight.

## 2. Voice progression

**Rising pitch toward the feminine band is progress and gets praise** — the current watcher's inverted sign converts wins into escalations; worst bug in the domain.

1. **Capture** → one table `voice_progress_samples (id, user_id, recorded_at, source('tracking_decree'|'mantra_drill'|'freeform'), audio_path, duration_s, pitch_median_hz, pitch_p90_hz, extraction_method, decree_id, drill_session_id)`. Three inflows: weekly tracking-decree audio, mantra drills (every drill is a free sample), elective freeform.
2. **Pitch extraction client-side at capture** (WebAudio autocorrelation, YIN-lite on live mic). No server webm decoding. Server bounds-checks 60–400Hz; out-of-band → NULL, counts for engagement only. Cheating the number only flattens her own praise curve; enforcement-relevant signal (real recording, real duration, non-silent) verified server-side.
3. **Trend:** rolling 14d median vs prior 14d, ≥5 pitched samples each window. `trend = recent − prior`. **Positive = progress.** Direction target read from maxy_facts (MTF: up), never hardcoded. Regression test: `trend=+6 → praise, never stagnation` (verified failing on old code).

**Response ladder (one rung max, 14d cooldown, via mommy-fast-react):**
- **Progress** (≥+3Hz): praise outreach, no task. New `pitchTrendToPhrase()` — never Hz, never "trend."
- **Plateau with engagement** (samples exist, |trend|<3Hz for 28d): ONE texture decree (resonance/lift, proof_type='voice'), encouragement framing.
- **True stagnation** (zero samples 14d AND privacy gate open): ONE gentle decree, "Mama wants to hear you," never citing the gap.
- **Never fires while trend positive** — watcher returns early on progress (structural).

**Privacy gating fail-closed:** pushes require `voice_elective` AND `is_gina_home_today` returning exactly `false` — RPC error/null/missing = treated as home = skip. Gating controls what Mommy *pushes*, never what Maxy *gives* (passive capture ungated).

## 3. Mantra ladder revival

**FocusMode-native, two entry points, one submit path.**
1. **Peak-harvest drill (mig 604 finally gets its surface):** `kind='mantra_harvest'` outreach rows with unexpired `expires_at` → new `TaskKind:'mantra_harvest'` at **mommy_touch priority** (30-second, 30-minute-window plasticity ask — must interrupt the calm stream). Whisper line + recorder + rep counter → `mommy-mantra-drill-submit` with `paired_with_arousal:true` (3× weighting).
2. **Daily drill:** `domain='mantra'` prescriptions render drill surface (mommy_mantras rotation, target reps, recorder + typed-rep field) → same endpoint, prescription id in evidence_meta, atomic dual completion.

Orphaned `voice_drill_today` fake-confession path in FocusMode DELETED; `morning_mantra_windows` becomes rotation input.

**Atomic rep accounting:** `mantra_apply_drill(p_session_id, p_user, ...)` RPC — `INSERT ... ON CONFLICT DO NOTHING`; if not inserted, return totals with NO bump. `user_state.mantra_lifetime_reps` demoted to a **cache of SUM(mantra_drill_sessions.weighted_rep_count)** — nightly blind-spot reconciliation heals drift. Truth in session rows; counter derives.

**Rep honesty:** voice reps capped at `floor(duration_s/2)`; typed reps submit actual strings (count-verified, exact-match). Arousal pairing NEVER self-declared — edge fn sets it only when submit references a live mantra_harvest outreach or arousal_log ≥7 within 30min.

**Milestones (1k/10k/100k; numbers never in copy):**
- **1,000** — outreach + same-night `audio_session_offers` row + next morning's focus_pick = mirror ritual decree (say it to the mirror, record, proof voice).
- **10,000** — outreach + `mommy-scene-author` personalized scene seeded with her three most-drilled mantras + wardrobe reward auto-listed on wishlist (the protocol pays).
- **100,000** — retirement rite: her best drill recording layered under a Mommy-voiced rendition into a custom trance track — the mantra stops being something she says and becomes something she hears. Build task via mommy_code_wishes if the mixing pipeline doesn't exist at crossing.

MantraStreakCard/MantraDrillCard rewire to `mantra_drill_sessions` aggregates as calendar-fallback.

## 4. One measurement spine

**Canonical: `body_metrics`, metric units. Everything else becomes a view.**
```sql
CREATE TABLE body_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  measured_at timestamptz NOT NULL DEFAULT now(),
  weight_kg numeric(5,2), waist_cm numeric(5,2), hips_cm numeric(5,2),
  chest_cm numeric(5,2), underbust_cm numeric(5,2), thigh_cm numeric(5,2),
  neck_cm numeric(5,2), shoulders_cm numeric(5,2),
  waist_hip_ratio numeric GENERATED ALWAYS AS
    (CASE WHEN hips_cm > 0 THEN round(waist_cm / hips_cm, 3) END) STORED,
  source text NOT NULL CHECK (source IN ('focus_task','handler_chat','card','decree_fulfillment','backfill')),
  evidence_path text, notes text
);
```
- Backfill from live `body_measurements` (058 imperial): ×2.54 / ×0.4536.
- **Compatibility views with INSTEAD OF triggers:** `body_measurements` (058 imperial shape) and `body_measurement_log` (the metric shape the phantom writers expect). `MeasurementEntry.tsx`'s silently-failing insert starts working with ZERO client changes; `useTodayData`/`ForceFeminizationPanel`/`witness-fabrication-scheduler` reads go live. Views are the bridge, not the destination. WHR note: 058 was hips/waist; canonical is waist/hip; view re-inverts for legacy readers.

**Capture:** (a) FocusMode measurement surface; (b) Handler chat intent parser (`waist 84` / `waist 33in` → insert source='handler_chat', Mommy acks in-voice); (c) BodyMeasurementCard as calendar-fallback.

**Fulfillment closes the punishes-completed-work gap:** AFTER INSERT on body_metrics auto-fulfills active `transition_tracking:measurements%` decrees AND writes transition_tracking_log. Measuring IS fulfilling.

**Anti-circumvention:** single-dimension jump >8cm or exact-repeat ×3 → `evidence_required` flag, fulfillment holds until tape photo. Weekly BODY commitments fulfill off spine inserts with evidence_path.

**Rendering:** `body_metrics_trend` view (28d deltas, WHR slope). Handler context gets real numbers (Handler may cite telemetry); **Mommy never does** — `measurementDeltaToPhrase()` + mommyVoiceCleanup patterns extended (TS + DB trigger parity) to scrub `\d+(\.\d+)?\s?(cm|in|kg|lbs)`.

## 5. Transition tracking that ratchets honestly

**The log is written by fulfillment, never by hand.** `transition_tracking_log (id, user_id, tracking_type, recorded_at, evidence_path, decree_id, source_table, source_id)` — three writers:
1. AFTER UPDATE on handler_decrees `status→fulfilled` + `trigger_source LIKE 'transition_tracking:%'` → log row with proof path.
2. Organic: body_metrics inserts log `measurements`; voice_progress_samples log `voice_sample`; wardrobe audit logs `wardrobe_check`. Doing the thing unprompted counts.
3. One-time backfill from fulfilled tracking decrees + body_metrics backfill — nothing starts perpetually due.

**Cadences (three measurement types COLLAPSED into one tape session):**
| type | cadence | proof | fulfills via |
|---|---|---|---|
| body_photo | 7d | photo | decree proof |
| face_photo | 14d | photo | decree proof |
| voice_sample | 7d (privacy-gated) | audio | decree proof → voice spine |
| measurements | 30d | spine row + tape photo | body_metrics trigger |
| wardrobe_check | 30d | photo set | wardrobe audit |

**Prompter discipline:** max ONE tracking decree active (rotate by most-overdue), inherits throttle + mig 494 pause-respect. 48h deadline, 24h Today lead. Consequence record-framed — the honest ratchet is the trajectory.

**HRT context becomes real:** `hrt-pipeline.ts` rewritten (same export) against the actual schema: `hrt_funnel.current_step` + HRT_STEP_LABELS plain-English pairing, `appointment_at`, `days_stuck_on_step`, `hrt_step_missed_days`, `hrt_dose_log` 7d adherence (only when doses exist — no fabrication), `body_metrics_trend` for the body-evidence line. `logDoseTaken` deleted (FocusMode's handleDoseLog is the writer). Step-label map moves to a shared module. "Stage: undefined" dies.

## 6. Wardrobe intelligence

**One vocabulary:** canonical = mig 623 18-value set. `src/lib/wardrobe/categories.ts`: `WARDROBE_CATEGORIES` + `LEGACY_CATEGORY_MAP` (bra→bras, top→tops, dress→dresses, wig→wigs, leggings→bottoms, stockings→hosiery, shoes_flats/shoes_heels→shoes, jewelry→accessories, makeup_product→makeup, scent→other, outerwear→tops). Data UPDATE runs the map; enum-constraint-guard CI pins TS ≡ DB CHECK forever.

**Attributes, not category proliferation:** `attrs jsonb` (`{"heel":true,"color":...,"fem_level":1-5}`). `LEVEL_REQUIREMENTS` rewritten canonical with attr predicates (`{category:'shoes', attr:{heel:true}, minCount:1}`). Gap analysis counts against reality. Regression: seed one item per category, level-2 gaps are exactly the true shortfalls.

**Prescribe-only-what-she-owns at BOTH generation sites:** engine filters `task_bank.requires.item_category` against inventory; LLM prescriber gets a post-parse guard — style-domain rows naming an unowned garment category are **transmuted, not dropped**, into acquisition prescriptions (logged to engagement_meta).

**Acquisition = revenue tie-in (the protocol pays, never Maxy):** missing prerequisite creates (1) `wishlist_items` row (Throne/WishTender), (2) an acquisition prescription — "Mama put a skirt on the list. Tonight your job is one tease post that points at it" — the gap becomes content, the content funds the gap, (3) on ownership, the original wear-task re-enters the pool. `skip_reason='missing_item'` feeds the same path.

**Monthly wardrobe_check doubles as inventory truth-sync:** photo-audit walks categories, diffs against inventory, one-tap add/retire — inventory can't drift stale >1 month. Retired worn items → worn-item revenue loop.

## 7. Integration

**Edge changed:** evening-confession-prescribe (canonical domains, evidence_kind per domain, deadline, owned-item guard + transmutation, + mommyVoiceCleanup/craft on instruction text); voice-pitch-watcher (full rewrite); mommy-mantra-drill-submit (RPC, arousal verification, rep ceiling); transition-tracking-prompter (collapsed types, one-active rotation); protocol-health-check (registrations). **New edge fns: none.**

**Client:** FocusMode.tsx (two task kinds, evidence surfaces, render tracking, delete voice_drill_today); feminization-prescriptions.ts (pending-only replace, requires-filter); hrt-pipeline.ts rewrite; wardrobe-system.ts canonical; dommy-mommy.ts + DB trigger + parity copies (pitchTrendToPhrase, measurementDeltaToPhrase, unit-scrub).

**Health-check GENERATORS additions:** fem_prescription_loop (1440min, feminization_prescriptions), voice_progress (10080, voice_progress_samples, conditional), transition_tracking (10080, transition_tracking_log, conditional), mantra_drills (10080, mantra_drill_sessions, conditional), body_metrics_spine (43200, body_metrics, conditional).

**Blind-spot assertions:** prescriptions >24h are surfaced-or-expired with zero penalties; no tracking decree active >7d without a log write; mantra_lifetime_reps ≡ session-sum; voice watcher never fired stagnation in a positive-trend window.

**What dies:** voice_corpus query + inverted trend; hrt_pipeline/hrt_changes/hrt_doses phantom reads + logDoseTaken; three separate measurement cadences; delete-all re-prescribe; additive lifetime-reps bump; voice_drill_today fake-confession path; LEVEL_REQUIREMENTS legacy vocabulary; direct body_measurement_log expectations (absorbed by view).
