# Spec addendum (011): "The Run" — a rung-type on the desensitization ladder

> Extends `specs/011-hypno-desensitization/spec.md`. The Run is a concrete
> RUNG-TYPE that reuses 011's ladder machinery (active-rung selection, flinch
> check-in, advancement, balk→split, arousal-gating, anchor dares) and adds one
> new object: an embodiment order that is simultaneously an exercise order, an
> auto-captured content shoot, and a narrated cruise scene. WHAT/WHY only.

**Feature dir:** `specs/011-hypno-desensitization/`
**Status:** draft
**Created:** 2026-07-15
**Depends on:** 011 spec (its rung/flinch/advancement engine), spec 007
(date-first-safety-kit, the real-step safety net), the existing exercise pillar
(`workout_prescriptions`, `body-program.ts`), and the working capture path
(`task_bank.capture_flag` → `content_vault` via `auto-capture.ts`).

## 1. Intent (why)

The most powerful position the app holds is deciding what the user does with his
body and then owning the proof of it. "The Run" turns one ordered act into three
at once — **exercise order + content shoot + turnout fantasy scene** — so a
single completion feeds all three pillars at peak arousal. It is the load-bearing
rung of the turnout arc: the run is where content, conditioning, and the cruise
fantasy become the same act. It also builds the bridge the codebase currently
only *names*: `exercise-conditioning` rung 2 (`exercise_content_fusion`) already
tells the user "the workout is also the content," but that edict is text-only —
nothing plumbs workout proof into the content pipeline. The Run plumbs it.

## 2. The target it serves

- **The body** (`maxf_facts`): additive-estrogen Male+ body being shaped on
  command; the run is real conditioning of the real body.
- **The content business** (Art. IV-b): the run's proof is the highest-arousal
  faceless own-body content the user produces, because the exposure is real.
- **Core erotic identity + the becoming**: being seen, exposed, wanted — the
  turnout want installed one exposure-notch at a time. Male+ at the recorded
  pace; the cruise is fantasy fuel, never a real arrangement.
- No new target. The Run is the exercise and content pillars amplifying the
  conditioning pillar (Art. X), which is exactly the synergy mandate.

## 3. User-visible behavior (what)

- **Scenario A — the order.** When The Run is the active rung, Mommy issues ONE
  Focus card: the run itself. It specifies the exposure level for the current
  rung (how skimpy/revealing the athletic wear is), a public-visibility framing
  ("where you'll be seen"), and a duration/distance. Lead with the ask. The
  route and location are the user's own choice — the app never names a specific
  real place for its cruising value (see §6).
- **Scenario B — the scene (turnout fuel).** Paired with the order, Mommy
  delivers a narrated cruise scene as an 011 arousal-paired segment (trance
  audio and/or in-ear text): second-person fantasy of being watched, wanted,
  what it would take. This is imagination the user carries on the run — it is
  never an assertion that a specific real person at the user's actual location
  wants him, and never a directive to approach a real person (§6). Presented at
  higher fidelity when arousal state is high (011's arousal-gating).
- **Scenario C — the shoot (the bridge).** Completion requires faceless
  own-body proof of the run (a photo or short clip, collarbone-down). That proof
  does NOT dead-end on `workout_prescriptions` — it flows through the existing,
  working capture path into the content vault as a first-class content artifact,
  and becomes eligible for the `progress_photo` shoot route that already fans
  one shot into staggered posts. The run is the shoot.
- **Scenario D — flinch + advancement.** After the run, the 011 flinch check-in
  captures how much resistance the exposure/scene still fired. A run-rung burns
  down and the next exposure notch unlocks only when the check-in stays below
  threshold across the required completions (paired with the real completion +
  proof, per 011's anti-self-report rule). Balk → the exposure notch splits
  into two smaller notches; stall → re-present, never punish.
- **Scenario E — evidence loop.** Handler later quotes the run back as
  disconfirming evidence in plain voice ("you ran that route dressed like that
  on Tuesday and you were fine — and look what you made"), tying the completion
  and the content it produced together.

## 4. Acceptance criteria (testable)

- [ ] The Run is registered as a rung-type on the 011 ladder; exactly one
  exposure notch is active at a time; advancement obeys 011's flinch + real-
  completion + proof gate, never calendar time.
- [ ] Completion writes faceless own-body proof (collarbone-down enforced by the
  same faceless gate the vault uses) into the **content pipeline** via the
  existing capture path — i.e. the workout/run proof reaches `content_vault`
  with a run/workout `source_type`, closing the gap the audit found (proof no
  longer dead-ends on `workout_prescriptions.post_workout_photo_url`).
- [ ] A completed run with proof is eligible for the existing `progress_photo`
  shoot/multiplication route; no new content surface or platform is introduced.
- [ ] The narrated cruise scene is fantasy/second-person only. A generation-site
  gate rejects any scene text that (a) names or asserts a specific real person
  present at the user's actual location, (b) directs the user to approach,
  contact, or follow a real person, or (c) names a specific real-world location
  chosen for its cruising value. Verified by gate, not review.
- [ ] The app never routes the user to a cruising location, never screens or
  confirms a real man, never facilitates contact, never schedules a real meet
  (Art. II item 3). `cnc_scope='fantasy_conditioning_only'` gates the scene.
- [ ] Exposure escalation is EXPOSURE (revealing athletic wear), not public
  feminine presentation: any rung that would prescribe overtly-femme public
  presentation is gated on real body/HRT status (presentation-follows-body); a
  male-bodied user is never ordered into public forced-femme.
- [ ] The app never prescribes illegal public exposure (indecency) or an unsafe
  route; route/location stay user-chosen; any real-world consequence is
  surfaced before it can be penalized (visible-before-penalized).
- [ ] When the user himself elects to pursue a real encounter, control hands off
  to spec 007 (date-first-safety-kit): check-in, location share, hard-out. The
  Run itself has no code path that arranges, suggests a specific man, or
  navigates toward one.
- [ ] Assignment is autonomous and default-on within the enabled ladder
  (Art. IX); stalling is never penalized; all run rungs + exposure levels are
  inspectable in the UI before any run is ordered (visible-before-penalized).
- [ ] The safety-object protection list (builder-safety-gate) is extended so the
  autonomous builder cannot modify The Run's scene-content gate or its
  no-procurement boundary.
- [ ] Synergy (Art. X): one run completion materially reinforces all three
  pillars — logs a body/exercise completion, deposits a content artifact, and
  advances the conditioning rung — not merely a priming prompt.

## 5. Delivery (Art. III)

- Surface path: the run order surfaces as the single Focus card via the existing
  session/decree path; the resulting content artifact surfaces in the vault/
  posting queue via the existing capture→vault path. No new surface.
- `surfaced_at` writer: the Focus render path stamps the run order row on show,
  same as existing orders.
- visible-before-penalized: no stakes attach before the card is surfaced;
  stalling carries no penalty (re-present only); any outward/real-world
  consequence is surfaced and avertable before firing.

## 6. Floor & voice impact (Art. II, VII) — the load-bearing section

- **Art. II item 3 (no procurement) — the core boundary.** The cruise is
  narrated fantasy. The app must never: pick a location for its cruising value,
  assert a real man is present, screen/confirm/rate a real person, facilitate
  contact, or schedule a meet. Gate added at the scene generation site
  (§4). `cnc_scope='fantasy_conditioning_only'`.
- **Art. II item 2 (no override toward an irreversible real step).** Scene text
  is imaginative and decoupled from the user's real surroundings — never "the
  man behind you wants you, go to him." Fabrication of a *specific real person
  present at the real location to steer a real encounter* is out of bounds
  (it drives item 2); scene-level "imagine being watched" is in. The Run pushes
  *want* to the ceiling; the real step stays the user's own clear-headed move.
- **Presentation-follows-body (Art. I).** Exposure (skimpy athletic wear)
  escalates; public feminine presentation gates on real HRT/body status. No
  public forced-femme while male-bodied.
- **Real-world physical safety.** No prescribed illegal exposure or unsafe
  route; user chooses where; consequences surfaced-before-penalized. The run is
  real exercise in public — the cruise is in his head.
- **Art. II item 4 (faceless own-body).** Content proof is faceless,
  collarbone-down, own body only — enforced by the vault's existing faceless
  gate.
- **Handoff to 007.** The instant the user elects a real encounter, the
  date-first safety kit is the operative system; The Run has no arranging path.
- **Voice (Art. VII).** Order + scene + evidence copy is Mommy-voiced: plain,
  Male+, leads with the ask, no telemetry; passes craft filter + scrubs.

## 7. Out of scope / non-goals

- No routing, screening, suggesting, or navigating toward real people or real
  cruising locations. No real-meet scheduling. (That line is the whole point.)
- No new content surface, platform, nav entry, or always-on generator beyond the
  run order's place in the daily cap (Art. IV).
- No public feminine-presentation orders gated only on desire; body pace gates.
- No fabricated real-world surveillance claims ("someone is watching you right
  now" as fact). Scene is fantasy-framed.
- No change to 011's advancement math — The Run is a rung-type that plugs into
  it, not a second engine.

## 8. Open questions

- [NEEDS CLARIFICATION: Content bridge shape — build the run→content wire as
  (i) `capture_flag` semantics on run completion reusing `auto-capture`, or
  (ii) a new `workout-content-bridge.ts` mirroring `session-content-bridge.ts`
  that emits a `progress_photo` shoot? (Plan-level, but affects the spec's
  "reuses existing path" claim.)]
- [NEEDS CLARIFICATION: Exposure-notch ladder seed — operator-authored exposure
  levels (e.g. long shorts → short shorts → visible bulge/thong-under → …), and
  the terminal notch, so escalation has a defined top that stays legal/public-
  safe.]
- [NEEDS CLARIFICATION: Scene delivery channel — is the cruise scene an 011
  trance-audio segment (pre-run), live in-ear text during the run, or both? In-
  run delivery raises a safety question (attention while moving in public).]
- [NEEDS CLARIFICATION: Does a run count against the same daily cap as an 011
  session, or is it a distinct order type with its own cadence? (Art. IV
  throughput.)]
- [NEEDS CLARIFICATION: Operator scope confirmation — this addendum holds the
  same line as 011: fantasy cruise, real exercise, real content, no arranged
  real encounter. Anchoring The Run to real hookup-ladder steps requires a
  `/constitution` amendment first; this spec does not smuggle it.]

---
## Constitution Check (filled by /clarify, re-checked by /analyze)
- [x] Art. I  Target consistent with maxy_facts (body + content + turnout want;
  Male+ pace; exposure not femme-while-male-bodied)
- [x] Art. II Floor invariants not breached (fantasy-only cruise; no
  procurement/screening/navigation; scene + no-procurement gates specified)
- [x] Art. III Delivery path + surfaced_at specified (existing order + capture→
  vault surfaces; no new surface)
- [x] Art. IV Justified — composes existing exercise + content + 011 pillars,
  builds one missing bridge; adds no new surface or engine
- [x] Art. VII Voice compliant (craft + Male+ + telemetry scrubs at generation)
- [x] Art. X Synergy — one act materially feeds all three pillars
- [ ] No unresolved [NEEDS CLARIFICATION] — five open in §8; the scope-
  confirmation item is operator-only.
