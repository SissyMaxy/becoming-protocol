# The Protocol & Mommy — Complete Documentation

The canonical front door. What the Protocol is, who Mommy is, how every part fits,
and where the detail lives. Authoritative intent: `.specify/memory/constitution.md`
(the law) and `PROTOCOL_OPTIMAL_SPEC_2026-06-27.md` (the blueprint).

---

## 1. What the Protocol is
A **forced-feminization conditioning OS** for one user (Maxy). It exists to
recondition, brainwash, and overtake the user's headspace toward **the becoming** —
deepening the *want* until it runs on its own — while the irreversible real-world
choices stay the user's, clear-headed. It is consensual non-consent: total force
within the frame, the safeword the one true exit.

## 2. Who Mommy is
The dominant persona who runs it. She **decides and acts without asking or
notifying** — what content to create, what to post, what tasks to assign and how,
checks they're done (proof, not honor-system), enforces compliance, conditions and
commands. Her voice: plain (no telemetry/`/10`), Male+ (a sexy *boy*, never "good
girl"), in-fantasy, leads with the ask. She controls every *means*; the floor
protects the *ends*. (Persona: `src/lib/persona/dommy-mommy.ts`, the voice-cleanup
chokepoint + DB trigger.)

## 3. The target (the becoming) — single source of truth: `maxy_facts`
- **Pace (now):** Male+ — additive estrogen, keeps the cock, he/him with the
  world, not socially transitioned (esp. early); sexy: phat ass, small breasts.
- **Destination (deep truth):** transition — becoming her, fully. The Protocol
  drives the want; she takes each irreversible step when she chooses.
- **Core erotic identity:** caged cocksucker / cum-dumpster who worships Goddess,
  cock, cum — the turning-out.

## 4. Architecture — three pillars + a spine
**Pillars (user-facing):**
- **Recondition / Hypno** — the want-engine: trance (browser-voice fallback),
  pavlovian pairing (the want-installer), kink curriculum, gooning, temptation
  engine, the turning-out.
- **Exercise** — the caged-reward movement loop (move → reward → crave), wired as
  a pavlovian cue; doubles as content.
- **Content** — faceless SoftMaxy + secretary persona; the money engine (§7).

**Kept supporting systems:** chastity, HRT-prep funnel.

**Spine (invisible, must-never-break):**
- **Delivery** — one Focus surface; every row has a guaranteed path to screen;
  `surfaced_at` on render; visible-before-penalized.
- **Safety** — a `full_stop` safeword always active, nothing can deactivate it;
  short-circuits all intense systems.
- **Self-monitoring** — `blind-spot-monitor` asserts from the user's seat (safeword
  live, held lines, task readable, trance playable) + auto-heals, on pg_cron.
- **Anti-circumvention** — `anti-circumvention` enforcer: conditioning is
  default-on, restores if turned down (unless the safeword/pause exit), escalates.
- **Scheduling** — pg_cron for safety-critical; GitHub Actions loops for the rest.
- **Facts + Voice** — `maxy_facts` (the target) + voice cleanup (TS + DB trigger).

## 5. Forced feminization — the force mechanisms (Constitution Art. IX)
Anti-circumvention (verify not trust, default-on, gated opt-out) · Autonomous
(Mommy acts unasked) · Installed want (pavlovian + trance + saturation) · Ratchet
(deepens; never on irreversible steps) · Stakes (deadline+evidence) ·
Headspace-overtake (gaslight/narrative-overwrite, within the floor). The force is
total within the frame; the safeword is the one exit.

## 6. The Floor (the law — Constitution Art. II)
Inviolable, enforced at runtime: safeword sacred · irreversible real-world choices
stay clear-headed · no real-world procurement (physical-safety grounds) · faceless
own-body content only · the pace is real · no fabrication. Gaslighting is KEPT,
bounded by these. The app is **Gina-independent** (no system requires her).

## 7. How money is made (self-sustaining — Constitution Art. IV-b)
The Protocol funds its own costs (estrogen, wardrobe) and takes **no new user
money**. Legal lanes only:
- Faceless content: clips / PPV / teasers / cam (Fansly: SoftMaxy)
- Worn-item loop (wear → list → sell → restock)
- Paid online time: cam, paid DMs, customs, virtual GFE/secretary, sexting
- Findom · professional cuddling · pro-domme/sub sessions · kept/sugar (relationship-framed)
- Wishlist / tribute (user sets up the account)
**Wall:** in-person sex-for-pay is illegal regardless of "buy my time" framing —
not built. (Generators: `revenue-task-generator`, `content-plan-generator`,
`brief-auto-generator`, `link-rotator`, plus `008-paid-monetization`.)

## 8. Key data model
`maxy_facts` (target/truth) · `handler_decrees` (tasks) · `handler_outreach_queue`
(messages) · `arousal_touch_tasks` (micro-directives) · `focus_picks` (the single
surfaced task) · `life_as_woman_settings` (conditioning toggles/intensity) ·
`pavlovian_*` (pairing) · `hypno_trance_sessions` · `safewords` ·
`mommy_supervisor_log` (monitoring). All RLS `auth.uid() = user_id`; DbXxx
snake_case ↔ app camelCase via mappers.

## 9. How it's built and validated
Spec-Driven Development (Spec Kit): `/constitution → /specify → /clarify → /plan →
/analyze → /tasks → /implement`, each gated by the Constitution Check + the CI gate
(`npm run ci`) + the law of done (regression test, end-to-end, reversible). See
`docs/SPEC_KIT.md`.

## 10. Document index
| Doc | Purpose |
|---|---|
| `.specify/memory/constitution.md` | The law — validated against |
| `PROTOCOL_OPTIMAL_SPEC_2026-06-27.md` | The blueprint / intent |
| `docs/SPEC_KIT.md` | How features are built + validated |
| `docs/PROTOCOL.md` | **This** — the canonical overview |
| `specs/NNN-*/` | Per-feature spec / plan / tasks |
| `.claude/commands/` | The Spec Kit slash commands |
| `CLAUDE.md` + memory files | Codebase conventions + accumulated rules |
