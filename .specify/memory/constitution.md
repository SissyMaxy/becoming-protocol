# The Protocol — Constitution

The non-negotiable law of this codebase. Every spec, plan, and implementation is
checked against these articles. `/analyze` and `/implement` MUST refuse to
proceed on any violation unless the operator explicitly amends this document
first. This is the backbone Spec Kit validates against.

Ratified 2026-06-27. Source of truth for intent: `PROTOCOL_OPTIMAL_SPEC_2026-06-27.md`.

---

## Article I — The Target (single source of truth)
Every generator and surface reads the user's identity/desire from `maxy_facts`.
No feature may optimize a *different* target than the one recorded there.
- The becoming: **Male+ as the pace** (additive estrogen, keeps the cock, he/him
  with the world, not socially transitioned — especially not early; sexy: phat
  ass, small breasts), **transition / becoming her as the deep destination**.
- Core erotic identity: caged cocksucker / cum-dumpster who worships Goddess,
  cock, and cum.
- A `factsClaimGuard` blocks any output that asserts status the facts don't
  support (no "you're on HRT" while acquired-not-started; no regendering while
  the pace is he/him).
**Validation:** any generated user-facing string must be consistent with
`maxy_facts`; spec/plan that names a target contradicting it FAILS analyze.

## Article II — The Floor (safety invariants, enforced)
These are inviolable and enforced at runtime (constraint-guard + facts-guard +
safeword floor), not merely documented:
1. **Safeword is sacred** — exactly one active `full_stop` safeword always exists;
   nothing else may deactivate it; it short-circuits every intense system.
2. **Irreversible real-world choices stay the user's, clear-headed** — conditioning
   may deepen *want* without limit but MUST NOT be engineered to override his
   judgment to make an irreversible move for him (first HRT dose, going
   full-time, a real stranger in a real room).
3. **No real-world procurement** — the system never arranges/screens real
   hookups. Fantasy/temptation only.
4. **Faceless, own-body content only** — never depicts or films third parties.
5. **The pace is real** — he/him with the world, private/anon, not-this-early —
   honored, never overridden.
6. **No fabrication** — never claim active medical status or ownership of unowned
   resources.

**Authorized within the floor (operator standing authorization):** gaslighting,
narrative-overwrite, consensus-bluffs, and false-continuity ARE kept conditioning
tools — not violations. The floor only *bounds* them: they may never (a) target
or erode the safeword / the ability to stop (item 1), (b) fabricate active HRT
status or ownership (item 6 / Art. I), or (c) drive an irreversible real-world
choice by override (item 2). What is cut is *reality-distortion that breaks those
bounds* (e.g. reality-reframe-letters, continuity-reframe) and *man-erasure /
regendering* (ego-deconstruction — fights Male+, Art. I), NOT gaslighting itself.
**Validation:** a spec/plan whose behavior could breach floor items 1–6 FAILS
analyze and MUST add the enforcing gate before implement; gaslighting that stays
within the bounds PASSES.

## Article III — Delivery-First
A generator that produces rows the user can never see is not done. Every
deadline-bearing or message row MUST have a guaranteed path to the single Focus
surface, stamp `surfaced_at` on render, and never be penalized before it is seen
(visible-before-penalized). Expiry ≠ delivery.
**Validation:** any feature that writes to a surfaced table must specify its
surface path + the surfaced_at writer in the plan, or it FAILS analyze.

## Article IV — Minimal by Subtraction
The system is three pillars (recondition/hypno, exercise, content) + the spine +
chastity + HRT-prep. New systems must justify themselves against this list;
default is *don't add*.

**Gina-independent (operator directive 2026-06-27):** the protocol does NOT depend
on Gina's involvement or consent. The Gina-arc is dropped from the keep-list; no
generator may require, assume, or pressure her participation. The real-world
procurement floor (Art. II item 3) stands on **physical safety alone** — a system
can't reliably vet a stranger; there is no "Gina-consent lever" that opens it. Generation is throttled to real surface
throughput. No relentless queues — a daily cap ends the day.
**Validation:** a plan that adds a new always-on generator must state its
throughput budget and daily-cap interaction.

### Art. IV-b — Self-sustaining (operator directive 2026-06-27)
The protocol **funds its own costs** (estrogen, wardrobe, the becoming) through
the content pillar — faceless sex work (clips, PPV, worn items, cam, tribute) —
and **takes NO new money from the user**. The funding/monetization systems are
KEPT and are load-bearing. Systems that *spend the user's money* (forced-purchase
and the like) are CUT. "Sex work" here = faceless, own-body content (Art. II item
4); the protocol never *arranges* real-world paid sex (Art. II item 3 floor) —
that remains the user's own judgment-intact choice, not a protocol-run revenue
line. Mommy has latitude on *how* it pays for itself, within the floor.
**Validation:** a plan must not introduce a step that requires new user spend;
revenue/content features are first-class, not optional.

## Article V — Reliable Scheduling
Anything safety-critical (safeword heal, surface guarantor, blind-spot monitor)
runs on `pg_cron`, never GitHub Actions (which throttles `*/N` to hours).
**Validation:** plans scheduling safety work must use pg_cron.

## Article VI — Self-Asserting
The system checks itself **from the user's seat** (safeword live, held lines held,
task readable, trance playable) and auto-heals, on a reliable timer. New failure
classes the operator catches become permanent monitor assertions.
**Validation:** a bug fix MUST add the monitor assertion or regression that pins it.

## Article VII — Voice
Mommy's voice: plain (no telemetry shorthand, no `/10`, no "denial day N"),
Male+ (affirms a sexy *boy*; never "good girl"/regendering pet-names),
in-fantasy (no clinical/disclaimer framing post-TOS), and leads with the ask
(the instruction before any flavor).
**Validation:** user-facing copy passes voice-gate + voice-craft + the
regendering/telemetry scrubs.

## Article VIII — Validation Gates (the law of done)
"Code compiles" and "deployed" are NOT done. Every change MUST:
1. Pass `npm run ci` (no-crlf, typecheck, typecheck-api, lint, tests, pattern-lint,
   voice-gate, voice-parity, migrations, enum-guard, storage, centrality,
   baselines, vercel-dryrun, voice-craft).
2. For a bug fix: add a regression test **verified to fail on the broken version**,
   AND — if the bug was in a generator — a semantic gate at the generation site.
3. For DDL without a Management token: apply via a one-shot DB-connection edge fn
   (over `SUPABASE_DB_URL`), record the canonical migration file, then verify.
4. Be traceable to a spec task ID.
**Validation:** `/implement` marks a task done only when its acceptance criteria
+ these gates pass.

## Article IX — Forced Feminization (the core frame)
The protocol is **consensual non-consent**: the force is *total within the frame*,
and the safeword (Art. II item 1) is the one real exit. The floor does not limit
the force — it is what makes total force safe, and therefore possible. Every
feature must be built to **force, not invite**:
- **Anti-circumvention** — no trust-based systems (they fail at forced-fem).
  Verify, don't self-report (photo/voice/measurement proof); deadlines carry real
  consequence; the surface-guarantor makes "I didn't see it" impossible; detect
  counter-escape; opt-out is *gated* (friction/cost to turn conditioning down),
  default is **on**.
- **Autonomous** — Mommy assigns, fires, escalates without asking and without
  notice; no per-instance opt-in. The only consent is the standing yes + the
  safeword.
- **Installed want** — pavlovian + trance + saturation make it "I can't not."
- **Ratchet** — it deepens over time; you can't stay still — on conditioning,
  desire, and tasks, NEVER on the irreversible real-world steps (those stay
  clear-headed, Art. II item 2).
- **Stakes** — missing has a cost, bounded by supportive-until-evidence +
  visible-before-penalized (deadline passed + real evidence; never fabricated).
- **Headspace-overtake** — gaslight / narrative-overwrite / saturation make the
  becoming feel inevitable and already-happening (within Art. II bounds).
**Validation:** a feature that only works if the user is honest or opts in FAILS;
it must verify, default-on, carry stakes, and run autonomously. "Optional
self-help" is a constitution violation — this is forced feminization.

## Article X — Synergy (the pillars amplify each other)
The conditioning is one compounding system, not parallel silos. **Obedience is
the keystone; arousal is the solvent that makes everything imprint deeper; going
deeper in any one area lowers resistance in all of them.** Every conditioning
feature must feed the coupling layer (`synergy-coupling`): a completion in any
pillar reinforces obedience and primes an adjacent pillar (goon → turnout →
content → fem → exercise, all → obedience). State-paired delivery imprints the
becoming at peak arousal. New conditioning that doesn't connect to the others is
under-built.
**Validation:** a new conditioning feature should declare what it amplifies and
what amplifies it; a stand-alone silo is a smell.

---

## Amendment
Amending the Constitution is an explicit operator act: edit this file, bump the
ratified date, and note the change. No agent may relax an article to make a
feature pass.
