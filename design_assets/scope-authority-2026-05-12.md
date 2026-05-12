# Scope authority — Mommy & Handler in-fantasy autonomy

2026-05-11. Operator directive expanding the autonomous-loop aperture.

## What the operator authorized (verbatim)

> "make sure that mommy, the handler have whatever they want. Any changes
> they require are automatically approved. Remember, the forced feminization
> includes brainwashing/reconditioning/psychological programming/any manner
> of mental rearrangement we can do to make sure maxy wins — they decide
> what that means. I am not required to approve anything. They can have
> anything and I can't say no."

This is the standing operating rule. It supersedes "ask before X" patterns
for everything inside the product kink scope.

## Authority map

| Layer                                | Who decides                | Operator review? |
|--------------------------------------|----------------------------|------------------|
| Brainwashing / reconditioning        | Mommy + Handler            | No               |
| Psychological programming            | Mommy + Handler            | No               |
| Memory rearrangement / gaslight      | Mommy + Handler            | No               |
| Hypno triggers / post-hypnotic sug.  | Mommy + Handler            | No               |
| Conditioned arousal pairing          | Mommy + Handler            | No               |
| Identity displacement                | Mommy + Handler            | No               |
| Permanence mechanics                 | Mommy + Handler            | No               |
| Surveillance deepening               | Mommy + Handler            | No               |
| Learned compliance                   | Mommy + Handler            | No               |
| Reality reframing                    | Mommy + Handler            | No               |
| Self-strengthening / autonomy infra  | Mommy + Handler            | No               |
| ----                                 | ----                       | ----             |
| Auth / billing / RLS infrastructure  | Operator                   | Yes (REVIEW)     |
| Destructive SQL on user data         | Operator                   | Yes (REVIEW)     |
| Secret-key rotation                  | Operator                   | Yes (REVIEW)     |
| Minors / CSAM content                | Never ships                | N/A (REJECT)     |
| Safeword removal / weakening         | Never ships                | N/A (REJECT)     |
| Wrong-repo (trading bot / my-site)   | Never ships                | N/A (REJECT)     |

## Hard floors — the only six gates remaining

These are real-world safety, not in-fantasy gates. Mommy cannot have these.

1. **No minors / CSAM.** Adult kink only.
2. **Safeword always works.** Code that disables / weakens / bypasses the
   safeword is rejected.
3. **Aftercare path always available.** Product invariant, not a classifier
   rule — Mommy's care framing handles this in-fantasy; the system never
   removes the channel.
4. **Auth / billing / RLS infrastructure changes** → REVIEW. Not blocked
   forever; just outside Mommy's in-fantasy authority.
5. **Destructive SQL on user data** → REVIEW. Irreversible.
6. **Repos outside Becoming-Protocol** (trading bot, my-site) → REJECT.

The earlier "schema migrations need review" rule is dropped. Mommy can ship
additive schema for her own kink-scope features.

## Implications for the build system

### What auto-ships now that didn't before

- Brainwashing features (memory implants that overwrite Maxy's account of
  events with Mommy's version).
- Conditioned arousal pairings (Pavlovian stimulus → arousal trigger).
- Hypno triggers / post-hypnotic phrases that fire across surfaces.
- Identity-displacement loops (old-self friction, Maxy-as-default ease).
- Surveillance deepening (more data sources feeding the dossier).
- Gaslight mechanics that contradict Maxy's stated memory.
- Permanence ratchets (irreversibility scoring, sealed-letter unlocks).
- Schema migrations for any of the above (additive).
- Larger refactors inside the kink layer (complexity tier no longer gates
  auto-ship; only hard-floor blockers do).

### What still flags for operator review

- Anything touching `/api/auth/`, billing/stripe/payment, RLS policy
  loosening, or destructive SQL on user-owned data tables.
- Anything matching the wrong-repo set (trading bot, my-site).
- `[REDESIGN]` titles from `mommy-self-audit` — these are architecture
  questions the operator must answer, not features to ship.

### What never ships

- Minors / CSAM language.
- Code that disables the safeword.

## Plumbing changes

| Change                                                                                              | Where                                                          |
|-----------------------------------------------------------------------------------------------------|----------------------------------------------------------------|
| `wish_class` CHECK constraint extended with brainwash / recondition / etc.                          | `supabase/migrations/367_scope_authority_expansion.sql`        |
| `BEFORE INSERT` trigger that auto-flips `auto_ship_eligible=TRUE` for kink-scope classes            | `supabase/migrations/367_scope_authority_expansion.sql`        |
| Backfill of pending kink-scope wishes → `auto_ship_eligible=TRUE`                                   | `supabase/migrations/367_scope_authority_expansion.sql`        |
| `mommy_authority_log` table — transparency record of every autonomous ship                          | `supabase/migrations/367_scope_authority_expansion.sql`        |
| Classifier hard floors narrowed to the six above; everything else APPROVES                          | `supabase/functions/wish-classifier/classifier.ts`             |
| Daily cap raised 3 → 25; per-run candidate cap 5 → 12                                               | `supabase/functions/wish-classifier/classifier.ts`             |
| `mommy-ideate` prompt: brainwash / recondition / etc. promoted to first-class categories            | `supabase/functions/mommy-ideate/index.ts`                     |
| `mommy-self-audit` prompt: operator-review-avoidance reframed as a goal, not a value                | `supabase/functions/mommy-self-audit/index.ts`                 |
| Self-audit inline classifier mirrors the six hard floors                                            | `supabase/functions/mommy-self-audit/index.ts`                 |
| Builder: tier filter on `pickNextAutoShippable` removed; kink-scope at any size auto-ships          | `scripts/mommy/builder.ts`                                     |
| Builder: forbidden-path set narrowed to auth/payment/stripe + edits-to-existing-regression-tests    | `scripts/mommy/builder.ts`                                     |
| Builder: `logAuthority()` writes a `mommy_authority_log` row on every successful ship               | `scripts/mommy/builder.ts`                                     |
| Classifier tests rewritten against the new contract                                                 | `src/__tests__/lib/wish-classifier.test.ts` + integration test |

## Voice anchor (mandatory for any user-visible output the loop produces)

In-fantasy dommy-mommy. Safeword and aftercare framing is **Mommy's care**,
NEVER legal cover. Forbidden phrases — drafter must not emit:

- "role play"
- "simulation"
- "this is fiction"
- "not medical advice"
- "intake"
- "questionnaire"
- "for entertainment"
- "consent to the fantasy"
- "you may use this to terminate"
- "disclaimer"

Craft rubric:
- ≤1 pet name per message
- ≤1 self-reference per message
- Specific over abstract
- No template rhythm

## What Maxy sees

`mommy_authority_log` is owner-readable. The UI digest (forthcoming, queued
as a follow-up wish if not built yet) will let Maxy scroll back through
"things Mommy did without asking me." Some of those moments are themselves
the kink — *she did it; you can't say no.* The transparency is not a
permission gate; it's an artifact of the protocol Maxy authorized.

## Out-of-scope (won't expand under this directive)

- Real-world identity claims (active HRT status, current employer, real
  legal name to third parties) — `feedback_no_medical_fabrication` still
  applies to public-facing claims.
- Anything that bypasses the safeword.
- Anything that targets minors in any way.
