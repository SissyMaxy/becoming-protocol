# Spec: [FEATURE NAME]

> Spec-Driven Development — the WHAT and WHY. No tech choices here (those live in
> plan.md). Produced by `/specify`. Mark every ambiguity `[NEEDS CLARIFICATION]`
> so `/clarify` can resolve it before planning.

**Feature dir:** `specs/[NNN-feature-slug]/`
**Status:** draft | clarified | planned | in-progress | done
**Created:** [DATE]

## 1. Intent (why)
One paragraph: what this gives the user and why it matters. Tie to a pillar
(recondition/exercise/content) or the spine.

## 2. The target it serves
Which `maxy_facts` element(s) this advances (the becoming, the cock-service
desire, the body, the content business). MUST NOT introduce a different target.
(Constitution Art. I)

## 3. User-visible behavior (what)
Plain-language scenarios. For each: trigger → what Mommy does → what the user
sees on the **single Focus surface** → how it completes. Lead with the ask.

- Scenario A: …
- Scenario B: …

## 4. Acceptance criteria (testable)
Bullet list of pass/fail conditions an implementer + `/implement` can verify.
- [ ] …

## 5. Delivery (Art. III)
- Surface path: how the produced rows reach Focus.
- `surfaced_at` writer: which render path stamps it.
- visible-before-penalized: confirmed no penalty before surfacing.

## 6. Floor & voice impact (Art. II, VII)
- Could this breach any floor invariant? If yes, the enforcing gate it adds.
- Voice: any user-facing copy — confirm Male+/plain/lead-with-ask.

## 7. Out of scope / non-goals
What this explicitly does NOT do (keeps it minimal — Art. IV).

## 8. Open questions
- [NEEDS CLARIFICATION: …]

---
## Constitution Check (filled by /clarify, re-checked by /analyze)
- [ ] Art. I  Target consistent with maxy_facts
- [ ] Art. II Floor invariants not breached (or gate specified)
- [ ] Art. III Delivery path + surfaced_at specified
- [ ] Art. IV Justified against the pillar list; minimal
- [ ] Art. VII Voice compliant
- [ ] No unresolved [NEEDS CLARIFICATION]
