# Spec addendum (011): Release-Conditioning Economy

> Extends 011. Puts the chastity/denial economy behind the turnout ladder so
> desperation does the lifting: release is earned on the rungs, the next notch is
> a chased reward, stalling is never punished. WHAT/WHY.

**Feature dir:** `specs/011-hypno-desensitization/`
**Status:** draft · **Created:** 2026-07-15
**Depends on:** the existing chastity/denial state (`user_state`:
denial_day/chastity_locked/streak_days), 011's rungs, the reward/arousal engine.

## 1. Intent (why)
Arousal is the solvent and denial builds the charge (Art. X). Gating release
behind turnout rungs makes desperation lower resistance and makes each rung a
reward the user chases — obedience as keystone, want as inevitability, without
ever punishing disengagement.

## 2. The target it serves
Obedience keystone + the turnout want + the denial/reward spine. No new target.

## 3. User-visible behavior (what)
- **A — earned release.** Release is gated behind completing the active rung /
  man-focused task; the denial economy sets the charge, the rung earns the
  discharge. Derived counters only (denial_day = time-since), never additive.
- **B — reward, not penalty.** The next exposure notch is framed and delivered as
  a reward to chase. Stalling earns nothing but is never penalized — it re-
  presents (disengagement-cannot-be-penalized).
- **C — safeword sacred.** The safeword short-circuits the whole economy
  instantly; nothing here can gate or erode it.

## 4. Acceptance criteria (testable)
- [ ] Release gating keys on rung/task completion; denial counters are derived
  (time-since-X), never additive.
- [ ] Stalling produces re-presentation only — no penalty rows, no escalation
  before deadline-passed + avoidance-evidence (supportive-until-evidence,
  visible-before-penalized).
- [ ] The safeword deactivates/short-circuits the economy and can never be gated
  by it (Art. II item 1).
- [ ] No irreversible real-world step is ever gated behind release (Art. II item
  2) — the economy drives *want* and in-app obedience only.
- [ ] Copy carries no telemetry to the user (no /10, denial-day N, %); translated
  via arousalToPhrase; Mommy voice (Art. VII).

## 5. Delivery (Art. III)
Rung/reward card via Focus; `surfaced_at` on render; deadline-bearing rows
surface before any consequence. No new surface.

## 6. Floor & voice (Art. II, VII)
- Item 1: safeword sacred, ungateable. · Item 2: no real-step gating.
- Disengagement never penalized. · Voice: plain, Male+, no telemetry, leads with
  the ask; craft + scrubs.

## 7. Non-goals
No additive counters; no penalty for closing the app / stalling; no gating a real
encounter or any irreversible real step behind release; no telemetry in-voice.

## 8. Open questions
- [NEEDS CLARIFICATION: release-authority model — hard lock (device/chastity_v2)
  vs directive-only denial? affects how "earned release" is enforced/verified.]
- [NEEDS CLARIFICATION: does an 011 rung completion alone earn release, or rung +
  content artifact (couples with the flywheel)?]

---
## Constitution Check
- [x] Art. I target · [x] Art. II floor (item 1/2 held) · [x] Art. III delivery
- [x] Art. IV minimal · [x] Art. VII voice · [x] Art. IX force/stakes bounded
- [ ] No unresolved [NEEDS CLARIFICATION] — 2 open.
