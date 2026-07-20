# Spec addendum (011): At-Home Physical Practice Ladder (muscle memory)

> Extends 011. The concrete own-body rung track: solo, at-home rehearsal of the
> physical acts (oral, bottoming) drilled to trained skill / muscle memory, so
> the real encounter is executed practice, not unknown territory. WHAT/WHY.

**Feature dir:** `specs/011-hypno-desensitization/`
**Status:** draft · **Created:** 2026-07-15
**Depends on:** 011's rung/flinch engine, the existing realcock ladder + toy/
prop progression (mig 584, `transformation_phase` 1→5), the arousal state
(`user_state`), the capture→vault path (optional content), and the health-prep
attestation pattern from the turnout/date-first work.

## 1. Intent (why)
This is the load-bearing physical desensitization: at-home solo rehearsal of the
acts, drilled with arousal pairing until they are *trained skill*, not novelty.
"Muscle memory" lowers the barrier the safe way — by making the act **known**,
not by suppressing judgment. When the user is eventually in a real situation, he
runs rehearsed skill; the only live question left is the safety-read of the
person/room (the one instinct 011 deliberately preserves). Solo, own-body, at
home: the most in-bounds mechanic in the arc — no real person, no real-moment
override touched.

## 2. The target it serves
Core erotic identity (cocksucker / receptive) + the becoming at the recorded
pace + own-body content (Art. IV-b). No new target. This is the concrete top of
011's ladder — the physical own-body rungs the abstract ones build toward.

## 3. User-visible behavior (what)
- **A — the drill.** When a physical rung is active, Mommy prescribes one at-home
  practice session on the current rung (an oral-track drill or a bottoming-track
  drill), specifying the prop/toy, the technique focus, and the arousal pairing.
  One Focus card. Explicit user start; awake, deliberate.
- **B — the two tracks (each a graded progression).**
  - *Oral track* — toy progression (starter → realistic size), technique focus
    (rhythm, breathing, endurance), gag-reflex desensitization drilled gradually.
    Muscle memory: jaw/throat/breath/pace.
  - *Bottoming track* — plug/dilator progression (small → larger), relaxation-on-
    demand training, riding/positional technique, prep+hygiene routine. Muscle
    memory: relaxing to take it, riding, taking it comfortably.
- **C — arousal-paired imprint.** Drills land during high arousal (011 gating) so
  the skill and the want fuse — the body learns to crave doing what it's
  practicing.
- **D — comfort-gated advancement.** After each drill, the 011 check-in captures
  comfort/flinch; a rung burns down and the next size/intensity unlocks only when
  comfort holds (paired with completion, not self-report alone). Balk → split to
  a smaller step; stall → re-present, never punish.
- **E — practice-as-content (optional).** A drill's faceless own-body proof can
  feed the evidence→content flywheel; the practice is also the shoot.
- **F — evidence loop.** Handler quotes drills back as disconfirming evidence and
  as competence ("you take that size easy now — you're ready, you *know* this").

## 4. Acceptance criteria (testable)
- [ ] All practice is solo, own-body, at-home; no rung, prop, or prompt involves
  a real partner or real contact (Art. II item 3/4 — trivially satisfied, gate
  confirms no real-person element enters a drill prompt).
- [ ] Physical rungs advance on 011's comfort/flinch + completion gate; size/
  intensity never jumps a notch on time alone; balk splits, stall re-presents.
- [ ] **Real-body safety is prescribed, not optional.** Bottoming-track drills
  include prep/hygiene, correct sizing progression, go-slow/lube guidance, and a
  "stop on pain" instruction; the ladder never prescribes a size/step that skips
  the progression or risks real injury. (Competent domination ≠ reckless.)
- [ ] Required props the user doesn't own generate an acquisition step first
  (prescribe-only-what-he-owns); the ladder never assumes unavailable gear.
- [ ] Optional content capture is faceless own-body only (Art. II item 4).
- [ ] No fabricated medical/body status in any copy (factsClaimGuard).
- [ ] Assignment autonomous + default-on within the enabled ladder (Art. IX);
  all rungs/props inspectable before any drill (visible-before-penalized);
  safeword short-circuits.
- [ ] The "muscle memory" framing preserves the safety-read: no drill or copy
  targets the in-the-moment judgment/veto with a real partner (Art. II item 2) —
  this ladder makes the *act* known, never the *choice* automatic.
- [ ] Voice: Mommy Male+, no telemetry, leads with the ask, craft + scrubs.

## 5. Delivery (Art. III)
Drill card via existing Focus/session path (`surfaced_at` on render); optional
artifact via capture→vault. No new surface.

## 6. Floor & voice (Art. II, VII)
- Items 3/4: solo own-body at home — no real person, faceless content.
- Item 2: makes the act practiced, never the real-encounter choice automatic;
  the preserved safety-read is untouched.
- Real-body safety prescribed (prep/sizing/pain-stop) — physical responsibility,
  not a container-breaker.
- Item 6 / Art. I: no fabricated status; Male+ pace (private own-body practice,
  not public femme — presentation-follows-body not implicated).
- Voice: Male+, plain, no telemetry; craft + scrubs.

## 7. Non-goals
No real partner in any drill; no real-meet arrangement; no size/step that skips
safe progression or risks injury; no non-faceless or third-party content; no
public presentation; no conditioning of the in-the-moment veto.

## 8. Open questions — RESOLVED (operator "build it", 2026-07-15)
- ~~track seeds~~ → **RESOLVED:** Oral track (1 familiarization → 2 technique →
  3 depth/gag desensitization → 4 endurance/realism → 5 integration) and
  Bottoming track (0 prep ritual → 1 entry → 2 relax-on-demand → 3 size
  progression → 4 movement/riding → 5 integration), seeded as data with a
  per-rung prop list. Sizing/intensity carries defined safe bounds; size steps
  are strictly ordered and non-skippable.
- ~~data spine~~ → **RESOLVED:** a NEW physical-rung table keyed to 011 (not the
  realcock-ladder rows, mig 584, to avoid overloading their semantics); the
  realcock ladder is read for phase gating only if needed.
- ~~health-prep gate~~ → **RESOLVED:** reuse the existing STI/PrEP / date-first
  attestation PATTERN for the bottoming-track prep step (a prep attestation
  gating size progression), not a new mechanism.

---
## Constitution Check
- [x] Art. I target (Male+ pace, own-body) · [x] Art. II floor (items 2/3/4 held;
  real-body safety prescribed) · [x] Art. III delivery · [x] Art. IV minimal
  (concrete top of the existing ladder) · [x] Art. VII voice · [x] Art. X synergy
- [ ] No unresolved [NEEDS CLARIFICATION] — 3 open.
