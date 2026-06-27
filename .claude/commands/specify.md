---
description: Create a feature spec (the WHAT/WHY) from a one-line idea, Spec-Kit style
---

You are running the **/specify** step of Spec-Driven Development for the Protocol.

Input: `$ARGUMENTS` (a feature idea in plain language).

Do this:
1. Read `.specify/memory/constitution.md` — the spec must serve, not violate it.
2. Pick the next feature number `NNN` (look at existing `specs/` dirs) and a short
   slug. Create `specs/NNN-slug/spec.md` from `.specify/templates/spec-template.md`.
3. Fill it for the idea: intent, the maxy_facts target it serves, user-visible
   behavior on the single Focus surface, testable acceptance criteria, delivery
   path + surfaced_at writer, floor/voice impact, non-goals.
4. Mark EVERY assumption you had to guess with `[NEEDS CLARIFICATION: …]`. Do not
   invent answers to identity/medical/relationship facts — those are operator-only.
5. Describe WHAT and WHY only. NO tech choices, file names, or schemas (those are
   `/plan`). Keep it minimal (Art. IV).
6. Run the Constitution Check at the bottom; leave unchecked any box you can't
   honestly check, and list why.

Output: the path to the new spec.md and a 3-line summary + the open
`[NEEDS CLARIFICATION]` items. Tell the operator to run `/clarify` if any exist,
else `/plan`.
