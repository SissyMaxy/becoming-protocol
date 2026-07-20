# Spec addendum (011): Evidence→Content Flywheel

> Extends 011. Makes every burned-down rung produce faceless own-body content,
> so the ladder becomes a self-reinforcing content + commitment engine. WHAT/WHY.

**Feature dir:** `specs/011-hypno-desensitization/`
**Status:** draft · **Created:** 2026-07-15
**Depends on:** the working capture path (`task_bank.capture_flag` →
`content_vault` via `auto-capture.ts`), the `progress_photo` shoot/multiplication
route (`src/lib/industry/content-multiplier.ts`), `shoot-poll-bridge.ts`, and
011's rung completions. Fixes the gap the exercise→content audit found: rung/
workout proof currently dead-ends instead of becoming content.

## 1. Intent (why)
Making content about the becoming *is* desensitization: it normalizes the want,
the audience reinforces it, tribute makes it real, and each post is a public
commitment that can't un-happen. Today the leverage is named but not plumbed —
proof of a rung lands on a column no content module reads. This wires the
flywheel: rung completed → faceless artifact → post → audience pulls the next
rung → tribute funds the becoming.

## 2. The target it serves
The content business (Art. IV-b, self-funding) + the becoming + the turnout want.
No new target; it couples the content pillar to the conditioning pillar (Art. X).

## 3. User-visible behavior (what)
- **A — auto-capture on completion.** When a rung's proof is faceless own-body
  media, completing it deposits the artifact into the content vault as a
  first-class content item (not a dead column), classified and queued like any
  vault media. One Focus card at a time.
- **B — audience pulls the rung.** The existing fan-poll/shoot bridge can surface
  a demand ("they want to see you go further") that maps to the *next* turnout
  rung — a crowd pulling him up the ladder. Faceless, own-body; the poll never
  solicits or implies a real-world meet.
- **C — tribute reframed as owed.** Subs funding the journey are quoted back
  (in-voice, no $ telemetry to the user) as "they're paying for the next step" —
  the becoming feels owed and inevitable. No user spend (Art. IV-b).

## 4. Acceptance criteria (testable)
- [ ] A rung completion with faceless own-body proof creates a `content_vault`
  artifact via the existing capture path with a rung/turnout `source_type`;
  proof no longer dead-ends on a workout/decree column.
- [ ] Artifacts are eligible for the existing `progress_photo`/multiplication
  route; no new content surface or platform.
- [ ] Faceless gate (collarbone-down, own body, no third party) enforced at
  capture (Art. II item 4).
- [ ] Any audience-demand escalation maps to a fantasy/own-body rung only; a
  generation-site gate rejects any poll/prompt that solicits, implies, or
  schedules a real-world meet or names a real person/location (Art. II item 3).
- [ ] Tribute copy carries no numeric telemetry to the user (Art. VII); funding
  never requires user spend (Art. IV-b).
- [ ] visible-before-penalized: no stakes before the card surfaces; stalling
  re-presents, never punishes.

## 5. Delivery (Art. III)
Rung card via existing Focus/session path (`surfaced_at` on render); artifact via
existing capture→vault→queue path. No new surface.

## 6. Floor & voice (Art. II, VII)
- Item 3: audience/poll layer may never broker a real meet — gate at generation.
- Item 4: faceless own-body only. · Art. I: factsClaimGuard on any status copy.
- Voice: Mommy-voiced, no $/telemetry, leads with the ask, craft + scrubs.

## 7. Non-goals
No new platform/surface; no real-meet solicitation via polls; no user spend; no
non-faceless or third-party content; no telemetry shown in-voice.

## 8. Open questions
- [NEEDS CLARIFICATION: capture wire — reuse `capture_flag` semantics on rung
  completion, or a dedicated `turnout-content-bridge.ts` mirroring
  `session-content-bridge.ts`? (plan-level)]
- [NEEDS CLARIFICATION: which rung types are content-eligible vs
  private-only (some rungs may be conditioning-only, no artifact)?]

---
## Constitution Check
- [x] Art. I target · [x] Art. II floor (item 3/4 gated) · [x] Art. III delivery
- [x] Art. IV-b self-funding · [x] Art. VII voice · [x] Art. X synergy
- [ ] No unresolved [NEEDS CLARIFICATION] — 2 open.
