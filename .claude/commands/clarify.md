---
description: Resolve a spec's open questions before planning
---

You are running **/clarify** for the Protocol.

Input: `$ARGUMENTS` (feature number/slug).

Do this:
1. Read `specs/NNN-slug/spec.md`. Collect every `[NEEDS CLARIFICATION: …]`.
2. For each, decide: can it be answered from the constitution, maxy_facts, the
   optimal spec, or existing code? If yes, resolve it and edit the spec inline,
   citing the source.
3. If it is an **operator-only** fact (identity, medical/HRT status, relationship,
   an irreversible-choice pace, a spend) — DO NOT guess. Ask the operator a tight,
   specific question (use the question tool for discrete choices). One round,
   batched.
4. After answers land, update the spec, remove the resolved markers, and tick the
   Constitution Check boxes you now can.

Output: what you resolved (with sources), what you asked the operator, and
whether the spec is now clarification-clean and ready for `/plan`.
