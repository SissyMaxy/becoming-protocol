# Spec addendum (011): Text-Rung Roleplay + Confession Ladder

> Extends 011. Two cheap-to-say-yes rehearsal rungs: a fantasy chat where Mommy/
> a scene voice plays "the man," and an escalating confession ladder that leaves
> commitment artifacts. WHAT/WHY.

**Feature dir:** `specs/011-hypno-desensitization/`
**Status:** draft · **Created:** 2026-07-15
**Depends on:** 011's rung/flinch engine, the confession/voice pipeline, the
Handler chat surface.

## 1. Intent (why)
The real step's activation energy is high; rehearsal lowers it. Practicing the
interaction where saying yes/no is *cheap* (text) burns the flinch before any
real cost exists, and each confession is a commitment artifact the evidence loop
reuses. Rehearsal + commitment are pure want-installation — no real contact.

## 2. The target it serves
Core erotic identity + the turnout want; the becoming at the recorded pace.
No new target.

## 3. User-visible behavior (what)
- **A — text-rung roleplay.** As a rung, Mommy runs a fantasy chat scene in which
  a scene voice plays "the man" — clearly a Mommy-authored scene, never a real
  person and never a real contact channel. The user practices responding,
  wanting, saying yes. Flinch check-in after.
- **B — confession ladder.** Escalating-specificity confessions (text or voice)
  of wanting it, each a rung; embodied prompts (say it, record it), never
  copy/paste. Char-minimums are per-prompt. Genuine self-reference is rewarded;
  mandated-phrase compliance is never punished as if it were resistance.
- **C — evidence reuse.** Confessions feed the disconfirmation loop and self-echo
  (his own words played back), so the want sounds like it came from him.

## 4. Acceptance criteria (testable)
- [ ] The roleplay "man" is a Mommy-authored scene persona, generated fresh; a
  gate rejects any attempt to impersonate a specific real person or to route the
  chat to a real external contact channel (Art. II item 3).
- [ ] No scene text asserts a real person at the user's real location or directs
  approach/contact of a real person (Art. II item 2).
- [ ] Confession prompts are embodied (speak/record/write), not clerical
  copy/paste; `min_chars` is per-prompt, not global.
- [ ] Forced-phrase/mantra compliance is distinguished from genuine self-
  reference and never penalized (no-punishing-compliance).
- [ ] Rungs advance on 011's flinch + completion gate; stall re-presents.
- [ ] Confession content used in self-echo is the user's own material; no
  fabricated real status (factsClaimGuard).

## 5. Delivery (Art. III)
Rung/chat card via Focus/Handler surface; `surfaced_at` on render. Confession
artifacts to the existing confession store. No new surface.

## 6. Floor & voice (Art. II, VII)
- Item 3: the "man" is fiction; no real-contact routing, no real-person
  impersonation. · Item 2: fantasy-framed, no real-surroundings claims.
- Voice: Mommy Male+, craft filter, no telemetry, leads with the ask.

## 7. Non-goals
No real messaging channel to real people; no impersonation of someone the user
knows; no clerical copy/paste rituals; no punishing mandated-phrase compliance.

## 8. Open questions
- [NEEDS CLARIFICATION: is the roleplay "man" always overtly Mommy-in-a-mask, or
  a distinct scene persona? (affects how the fiction is framed to stay
  non-deceptive about real people)]
- [NEEDS CLARIFICATION: confession-ladder seed — operator-authored specificity
  steps + terminal rung.]

---
## Constitution Check
- [x] Art. I target · [x] Art. II floor (item 2/3 gated) · [x] Art. III delivery
- [x] Art. IV minimal · [x] Art. VII voice · [x] Art. X synergy
- [ ] No unresolved [NEEDS CLARIFICATION] — 2 open.
