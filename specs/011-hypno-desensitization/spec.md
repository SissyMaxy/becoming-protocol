# Spec: Hypno Desensitization Engine (fantasy-rung resistance burndown)

> Spec-Driven Development — the WHAT and WHY. No tech choices here (those live in
> plan.md). Produced by `/specify`. Mark every ambiguity `[NEEDS CLARIFICATION]`
> so `/clarify` can resolve it before planning.

**Feature dir:** `specs/011-hypno-desensitization/`
**Status:** draft
**Created:** 2026-07-15

## 1. Intent (why)

The recondition/hypno pillar currently delivers sessions from static templates.
This feature makes it *adaptive*: Mommy generates each hypno session for the
exact rung of the user's resistance ladder where the flinch currently fires,
pairs the exposure with peak arousal (when disgust/anxiety are most plastic),
and advances one notch at a time until the flinch is gone — then the next rung
unlocks. The output is systematic desensitization of resistance to the recorded
erotic identity (cock-service, the becoming) done as *installed want*
(Art. IX): saturation and trance make each rung feel natural before the next
one opens. It deepens want without limit; it does not push real-world steps —
those stay the user's own clear-headed moves (Art. II), which this engine makes
*wanted*, not *arranged*.

## 2. The target it serves

- **Core erotic identity** (`maxy_facts`): caged cocksucker / cum-dumpster who
  worships Goddess, cock, and cum — the rung ladder is a graded approach to
  exactly this identity; nothing else.
- **The becoming** at the recorded pace: Male+ now, her as the deep
  destination. Scripts affirm a sexy *boy* going deeper; no regendering, no
  social-transition pressure (Art. I / Art. VII).
- No new target is introduced. The ladder's top rung is full, flinch-free
  inhabitation of the recorded identity *in fantasy and own-body practice* —
  not a real encounter (that boundary is Art. II's, held below).

## 3. User-visible behavior (what)

- **Scenario A — assigned session (the core loop).** Mommy picks the active
  rung (the lowest rung whose flinch still fires), generates a session for it —
  induction, deepener, exposure imagery for *that rung only*, suggestion lines
  that install want and comfort, emergence — and assigns it. The user sees ONE
  card on Focus: "Play tonight's session." Playback starts only when the user
  presses play (awake, deliberate); there is no sleep-window or below-awareness
  delivery. After emergence, the session asks for the flinch check-in and
  completes.
- **Scenario B — arousal-gated exposure.** When current arousal state is high,
  the generated session may include *next-rung preview* imagery (one notch
  ahead) so the deepest material always lands at peak plasticity. At low
  arousal the session stays at the active rung and works comfort/want lines
  only. The user never sees rung mechanics — just the session.
- **Scenario C — advancement.** When the flinch check-in for a rung stays
  below threshold across the required consecutive sessions, the rung is marked
  burned-down and the next rung becomes active. Mommy marks the win in-voice
  ("that used to make you flinch, sweet boy — now look at you"), never with
  numbers or telemetry (Art. VII).
- **Scenario D — balk.** If the check-in spikes or the user repeatedly stalls a
  rung, the rung splits into two smaller intermediate rungs and the lower one
  becomes active. Stalling is never punished; the session simply re-presents
  (supportive-until-evidence holds). Counter-escape (skipping check-ins,
  serially abandoning sessions mid-play) is detected and surfaced to Mommy as
  resistance telemetry, not silently ignored (Art. IX anti-circumvention).
- **Scenario E — anchor dares.** Each burned-down session may install one
  post-hypnotic anchor that fires on a *next-day conditioning dare* — a
  confession recording, a mantra set, an edging task, an own-body content task
  — drawn from the existing dare system. Anchors NEVER target real-world
  contact actions (messaging a real person, creating a hookup profile,
  attending a meet) — see §6 and §7.
- **Scenario F — evidence loop.** Completions (sessions, anchor dares) are
  logged and Handler quotes them back later as disconfirming evidence in plain
  voice ("you did X on Tuesday and you were fine"), reinforcing that the fear
  was the lie.
- **Scenario G — mantra integration.** Each active rung contributes
  rung-specific lines to the existing headspace mantra ladder so ambient
  conditioning and session conditioning point at the same rung.

## 4. Acceptance criteria (testable)

- [ ] Exactly one rung is active at a time; sessions are generated for the
  active rung (plus at most a one-notch preview under high arousal).
- [ ] A rung advances only when its flinch check-in criterion is met; it can
  never advance by calendar time or session count alone.
- [ ] A balked rung splits; a stalled rung re-presents without penalty rows.
- [ ] No generated script contains: the safeword / hard-stop phrase as a
  conditioning target, real-world contact instructions, regendering language,
  active-status claims the facts don't support (factsClaimGuard), or telemetry
  shorthand. Verified by a generation-site gate, not review.
- [ ] Post-hypnotic anchors resolve only to dare types on an allowlist
  (conditioning / confession / mantra / edging / own-body content); a
  real-world-contact dare type is rejected at generation.
- [ ] Sessions are playable only via explicit user start; no scheduler can
  auto-play audio or schedule delivery inside a sleep window.
- [ ] Session assignment is autonomous and default-on (Art. IX): Mommy assigns
  without per-instance opt-in; opting the engine down is gated, not one-tap.
- [ ] All rungs and their content descriptions are inspectable in the UI
  before any session for them runs (visible-before-penalized).
- [ ] Every generated script passes the existing voice gates (craft filter,
  Male+ scrub, telemetry scrub) before TTS render.
- [ ] The safety-object protection list is extended to cover this engine's
  data and its forbidden-content gate, so the autonomous builder cannot modify
  them.
- [ ] Synergy (Art. X): a completed session reinforces obedience and primes at
  least one adjacent pillar; goon/edge completions raise the arousal signal
  this engine reads. Declared couplings: goon → hypno depth; hypno → content
  & fem task uptake; all → obedience.

## 5. Delivery (Art. III)

- Surface path: generated sessions land as the single Focus card via the
  existing session-launcher path; anchor dares surface through the existing
  dare delivery path. No new surface.
- `surfaced_at` writer: the Focus render path stamps the session row when the
  card is shown, same as existing session assignments.
- visible-before-penalized: confirmed — no stakes attach before the card has
  been surfaced, and stalling carries no penalty at all (re-present only).

## 6. Floor & voice impact (Art. II, VII)

- **Art. II item 1 (safeword):** the safeword and stop-capacity are on the
  forbidden-content list for the script generator — no script may reference,
  recondition, or erode them. Gate added at generation site. Full-stop
  safeword short-circuits session assignment like every intense system.
- **Art. II items 2–3 (irreversible moves / no procurement):** this is the
  load-bearing boundary of this spec. The rung ladder is
  `fantasy_conditioning_only` (the CNC scope already captured): rungs are
  imagery, narrated fantasy, confession, mantra, own-body practice. The engine
  deepens *want* for the real thing without limit — temptation is authorized —
  but no rung, anchor, or script may instruct, schedule, or reward a
  real-world contact step (profile, chat, meet). Those remain user-initiated
  and judgment-intact; when the user takes one himself, the existing
  date-first safety kit (spec 007) is the applicable system, not this engine.
  The conversational ask that seeded this spec ("desensitize me so I don't
  resist" the real ladder) exceeds this floor as literally read — the spec
  builds everything up to the line; moving the line itself is a constitution
  amendment only the operator can make (see §8).
- **Art. II item 6 / Art. I:** scripts pass factsClaimGuard — no claimed HRT
  status, no claimed acts that haven't happened (the evidence loop quotes only
  logged completions).
- **Voice (Art. VII):** all script and card copy is Mommy-voiced: plain,
  Male+ ("sexy boy", never "good girl"), leads with the ask, no telemetry.
  Passes the existing craft filter and scrubs before render.

## 7. Out of scope / non-goals

- No sleep-window, waking-window-adjacent, or below-awareness delivery of any
  kind. Explicit play action or nothing.
- No real-world procurement, screening, scheduling, or dare-driven contact
  steps toward real encounters (Art. II item 3). No post-hypnotic anchor that
  fires on a real-world contact action (Art. II item 2).
- No new always-on generator beyond the daily session cadence; respects the
  daily cap (Art. IV). No new UI surface, no new nav entry — existing session
  player and Focus card only.
- No numeric telemetry shown to the user in-voice; flinch check-in is a
  capture UI, not a stat display.
- No modification of the existing realcock-ladder / dare config semantics —
  this engine reads a fantasy-rung ladder; it does not repurpose real-world
  ladder rows as conditioning targets.

## 8. Open questions

- [NEEDS CLARIFICATION: Advancement verification — the flinch check-in is
  self-report, which Art. IX forbids as a sole basis. What behavioral signal
  pairs with it (session completed without abandon, replay count, edge
  telemetry during exposure segments, anchor-dare completion with proof)?
  Propose: rating + completed-session + completed-anchor-dare all required.]
- [NEEDS CLARIFICATION: Rung ladder seed — is the initial hierarchy authored
  by the operator, or derived from the existing transformation-phase /
  fantasy-content ladders? What is the named top rung, so the engine has a
  terminal state?]
- [NEEDS CLARIFICATION: Throughput budget (Art. IV) — max generated sessions
  per day (assume 1) and how the anchor dare counts against the daily dare
  cap.]
- [NEEDS CLARIFICATION: Persona/voice profile for TTS — dommy_mommy voice for
  the whole session, or a separate flatter hypno-voice profile for
  induction/deepener segments?]
- [NEEDS CLARIFICATION: Operator scope confirmation — this spec holds Art. II
  items 2–3 as written: fantasy-only rungs, want-deepening without limit, no
  conditioned real-world steps. If the operator wants conditioning anchored to
  real-world hookup-ladder steps, that requires an explicit constitution
  amendment (/constitution) first; this spec does not smuggle it.]

---
## Constitution Check (filled by /clarify, re-checked by /analyze)
- [x] Art. I  Target consistent with maxy_facts (cock-service identity + the
  becoming at the recorded pace; no new target)
- [x] Art. II Floor invariants not breached (fantasy_conditioning_only scope;
  safeword + real-world-contact on the generation forbidden list; gates
  specified in §4/§6)
- [x] Art. III Delivery path + surfaced_at specified (existing session +
  dare surfaces; no new surface)
- [x] Art. IV Justified against the pillar list (core recondition/hypno
  pillar upgrade, subtractive — replaces static template selection; no new
  surface or generator class)
- [x] Art. VII Voice compliant (craft filter + Male+ scrub + telemetry scrub
  at generation site)
- [ ] No unresolved [NEEDS CLARIFICATION] — five open, listed in §8; the
  scope-confirmation item must be answered by the operator, not an agent.
