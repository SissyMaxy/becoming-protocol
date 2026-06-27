# Spec Kit — Spec-Driven Development for the Protocol

How to build and **validate** every change to this codebase with Claude Code,
using Spec-Driven Development (modeled on GitHub Spec Kit, tailored to this
project). The point: no more target-drift, dead delivery, or sprawl — every
feature is specified, checked against a constitution, planned, broken into
verifiable tasks, and implemented behind hard gates.

---

## Why this exists
The 2026-06-27 audit found the protocol had: a dead delivery layer (0/9,179 rows
reached the user), conditioning aimed at the wrong target, ~140 legacy crons
fighting the direction, and safety bugs. All of it came from building without a
spec or a validation backbone. Spec Kit fixes the *process* so those classes of
failure can't recur: intent is written down, validated against law, and every
change has to pass the gates before it's "done."

---

## The pieces

```
.specify/
  memory/constitution.md     ← the non-negotiable law (validated against)
  templates/
    spec-template.md         ← WHAT + WHY
    plan-template.md         ← HOW (+ constitution gate)
    tasks-template.md        ← ordered, verifiable, TDD breakdown
.claude/commands/            ← the slash commands Claude Code runs
  specify.md  clarify.md  plan.md  tasks.md  analyze.md  implement.md  constitution.md
specs/
  NNN-feature-slug/
    spec.md  plan.md  tasks.md  [research.md data-model.md contracts/]
PROTOCOL_OPTIMAL_SPEC_2026-06-27.md   ← the source-of-truth intent the constitution distills
docs/SPEC_KIT.md             ← this guide
```

---

## The workflow

```
/constitution  →  /specify  →  /clarify  →  /plan  →  /analyze  →  /tasks  →  /implement
   (law)          (what/why)   (resolve)    (how)     (GO/NO-GO)   (steps)    (build+validate)
```

1. **/constitution** — establish or amend the law. Already ratified in
   `.specify/memory/constitution.md` (the floor, the target, delivery-first,
   minimal/self-sustaining, reliable scheduling, self-asserting, voice, the
   validation gates). Only the operator amends it.
2. **/specify "<idea>"** — writes `specs/NNN-slug/spec.md`: intent, the
   maxy_facts target it serves, user-visible behavior on the single Focus
   surface, testable acceptance criteria, delivery + floor + voice impact.
   Ambiguities are marked `[NEEDS CLARIFICATION]`.
3. **/clarify** — resolves those from the constitution/facts/code, or asks the
   operator for the operator-only ones (identity/medical/relationship/spend).
   Never guesses those.
4. **/plan** — writes `plan.md`: the technical HOW, reusing the spine (never
   rebuilding delivery/safety/voice/facts/scheduling), the data/contracts, any
   DDL + its application path, the runtime gates it adds, the rollback. Runs the
   **Constitution Check** — if any box fails, it STOPS.
5. **/analyze** — read-only cross-artifact + constitution audit. Returns a
   compliance table and a **GO / NO-GO**. NO-GO blocks implementation.
6. **/tasks** — writes `tasks.md`: small, ordered, TDD tasks with an
   acceptance-trace table.
7. **/implement** — executes the tasks behind the **law of done** (below),
   marking each `[x]` only when it genuinely passes.

---

## The validation backbone (what "validated correctly" means)

Three layers, all enforced:

1. **Constitution Check** — baked into the spec & plan templates and re-run by
   `/analyze`. A feature that violates an article cannot proceed; the only way
   past is to amend the constitution explicitly (`/constitution`). No agent may
   weaken an article to make a feature pass.
2. **The CI gate** — `npm run ci` (the existing pre-push suite): no-crlf,
   typecheck, typecheck-api, lint, tests, pattern-lint, voice-gate, voice-parity,
   migrations, enum-guard, storage, centrality, baselines, vercel-dryrun,
   voice-craft. `/implement` must get this green.
3. **The law of done (Art. VIII)** — "compiles" and "deployed" are NOT done.
   Every change: passes CI; for a bug fix adds a regression test *verified red on
   the broken version* (+ a generation-site gate if it was a generator); applies
   DDL via the recorded migration + (token-less) one-shot DB-connection edge fn,
   then verifies; is traceable to a task ID; is verified end-to-end with real
   data; is reversible.

---

## How Claude Code uses it
- Type `/specify your idea` in Claude Code → it creates the spec from the
  template, honoring the constitution.
- Then `/clarify`, `/plan`, `/analyze`, `/tasks`, `/implement` in order. Each
  command file in `.claude/commands/` tells Claude exactly what to do and what to
  refuse.
- At any gate that fails, Claude STOPS and reports rather than pushing a
  non-compliant change — that's the whole point.

---

## Worked example (the next builds, spec-driven)
The optimal spec already names the work. Each becomes a feature:

- `001-carve-to-pillars` — decommission the cut-list crons (reversible
  unschedule), keep pillars + spine + chastity + HRT-prep + Gina-arc +
  gaslight + funding. `/specify` it, `/analyze` against Art. IV/II, `/implement`.
- `002-exercise-pavlovian-cue` — wire exercise as a first-class pavlovian cue
  (the want-loop closed). Art. I (target), Art. III (delivery).
- `003-daily-cap` — finite Focus ("done for today, good boy"); Art. IV throughput.
- `004-conditioning-reaim` — strip passing/procurement from the kept ladders,
  re-aim to sexy-Male+ + cock-service fantasy. Art. I, Art. II floor gate.
- `005-content-secretary` — the secretary persona generator path. Art. IV-b
  (self-sustaining funding).

Run `/specify 001-carve-to-pillars` to start the first one.

---

## Quick reference
| Command | Makes | Gate |
|---|---|---|
| /constitution | edits the law | operator-explicit only |
| /specify | spec.md | constitution-aware, marks unknowns |
| /clarify | resolves unknowns | no guessing operator facts |
| /plan | plan.md | **Constitution Check must pass** |
| /analyze | audit report | **GO / NO-GO** |
| /tasks | tasks.md | acceptance-trace complete |
| /implement | the build | **law of done (CI + tests + e2e + reversible)** |

The constitution is law. The optimal spec is intent. This kit is how Claude Code
turns intent into validated reality without drifting off-target or breaking the
floor.
