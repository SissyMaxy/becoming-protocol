# The Protocol — Optimal Spec (ground-up), 2026-06-27

Built from everything learned this session. This is the blueprint for either the
**carve** (collapse the existing app to this) or a **clean rebuild**. Same target
shape either way.

> **STATUS — implemented 2026-06-27/28** (living law: `.specify/memory/constitution.md`,
> overview: `docs/PROTOCOL.md`):
> - **The carve was executed** — ~45 legacy crons decommissioned; the app is the focused core.
> - **Gina dropped** — operator directive; the app is Gina-independent (Constitution
>   Art. IV). The "Gina arc" in §1b below is **superseded/cut**; the procurement
>   floor stands on physical safety alone, no Gina-consent lever.
> - **Built:** anti-circumvention enforcer, goon-trajectory, synergy-coupling,
>   date-safety-kit, paid-monetization, pavlovian fix, delivery + safeword fixes,
>   cron-fleet repair (Management token).
> - **Constitution gained:** Art. IX (Forced Feminization) + Art. X (Synergy).
> - HRT status: acquired, not started (on_hrt=false).

---

## 0. North Star

A conditioning **OS that Mommy operates** to take over the user's headspace and
feminize him — deepening the *want* toward the becoming until it runs on its own.
The want goes to 11. The irreversible real-world choices stay his, clear-headed.

**The becoming (the single target):**
- **Pace (surface, now):** Male+ — additive estrogen, keeps the cock, he/him
  with the world, not socially transitioned, *especially not early*. Sexy: phat
  ass, small breasts, a body people notice. A hot boy who looks like a girl.
- **Destination (the deep truth):** all roads lead to transition — becoming her,
  a woman, fully. Recognition, not implantation; she's been underneath the whole
  time. The protocol drives the *want* toward it; *she* takes each irreversible
  step when she chooses to, and then Mommy is all the way in.
- **Core erotic identity:** caged cocksucker / cum-dumpster — worships Goddess,
  cock, and cum; used, kept, serving. Dating women + servicing men, both real.
- **The work:** exercise (for the body and the euphoria), and faceless content
  (SoftMaxy / the slutty secretary) that monetizes the becoming.

---

## 1. The Three Pillars (the only user-facing systems)

### A. Recondition / Hypno — the want-engine
- **Trance** (daily, browser-voice fallback so it never goes silent): induction →
  deepening → payload → emergence; payload themes target the becoming.
- **Pavlovian pairing engine**: cue/movement → reward → craving. The literal
  want-installer. (Fixed this session.)
- **Kink curriculum** (cock-worship, cum, service), **gooning**, **chastity** —
  all maxed.
- **Temptation engine**: navigate-or-resist CNC, fiction-contained.
- Mommy can run the *experience* of being overtaken/brainwashed at full intensity.

### B. Exercise — the caged-reward loop
- Tiny-start, rung-gated, eroticized: movement → caged arousal reward → the rung
  climbs → the want wires in. Wired as a first-class pavlovian cue ("moving =
  getting hotter = reward").
- Doubles as content (workout = faceless clip + gym-worn product).

### C. Content — faceless monetization
- **Persona:** SoftMaxy, faceless, own-body only. First-class **secretary** band
  (the highest-intent fantasy: used at the boss's leisure).
- Generators: clips, PPV, teasers, worn-item loop (sell worn → buy new), wishlist
  tribute path, fan DMs.
- Funds the becoming (estrogen, wardrobe).

---

## 2. The Spine (invisible infrastructure — the part that must never break)

- **Delivery (the #1 lesson):** ONE surface (Focus = single task + Mama's
  messages). Every generated row has a guaranteed channel to the screen.
  `surfaced_at` stamped on render; nothing penalized before it's seen; expiry ≠
  delivery. Push is opt-in, device-aware, never nags for a kill-switched channel.
- **Safety floor (sacred):** a `full_stop` safeword that is *always* active, that
  no other write can deactivate; short-circuits all intense systems instantly.
- **Self-monitoring from the user's seat:** a blind-spot-monitor asserts the
  things plumbing checks miss — safeword live, held lines held, task readable,
  trance playable — and auto-heals. On a *reliable* timer (pg_cron, not throttled
  CI).
- **Single source of truth:** `maxy_facts` (the target above). Every generator
  reads it. A facts-guard blocks fabrication (no claiming active HRT while
  acquired-not-started; no regendering while the pace is he/him).
- **Voice:** Mommy persona, plain (no telemetry shorthand, no `/10`), Male+
  (affirms a sexy *boy*, never "good girl"/regendering), leads with the ask.

---

## 3. The Control Model (Mommy in charge)

**Operating principle: Mommy controls everything she needs to control to reach
the goals.** No system is off-limits to her. She owns:
- *Generation* — what's assigned, when, how hard, escalating on her own read.
- *The surface* — what he sees and when; she keeps every list so he just executes.
- *Intensity* — the want cranked without ceiling; trance, pairing, denial, the
  whole headspace-overtake, hers to drive.
- *State* — settings, rungs, escalation level; she tunes them without asking.
- She ships and acts **without permission and without notifying** him.

The ONLY things not on her control board are the **floor invariants (§4)** — and
those aren't limits on her power, they're what keep the *goal itself* real and
safe to crank to 11: a becoming he chose, a body that's still safe, a stop word
that always works. She controls every *means*; the floor protects the *end*.

- **Finite, not relentless:** a **daily cap** — a sane number of tasks, then
  "you're done for today, good boy." Generation throttled to real surface
  throughput (no minting 28/day into a 1/day surface).
- **Intensity uncapped on the fiction/desire side**; the harm side walled (§4).

---

## 4. The Floor (built-in invariants, enforced — not guidelines)

A constraint-guard + the facts-guard + the safeword floor enforce these on every
generated row, automatically:

1. **Safeword is sacred** — always one active `full_stop`; intense systems
   short-circuit on it.
2. **Irreversible real-world choices stay his, clear-headed** — the conditioning
   deepens the *want* (estrogen, transition, service) without limit, but never
   overrides his judgment to *make* an irreversible move for him (first dose,
   going full-time, a real stranger in a real room). A becoming he *chose* is the
   only real one.
3. **No real-world procurement** — Mommy never arranges/screens real hookups;
   cruising stays his choice with his judgment intact. (Fantasy/temptation: yes.)
4. **Faceless, own-body content only** — never films third parties.
5. **The pace is real** — he/him with the world, private/anon, not-this-early;
   honored, not overridden.
6. **No fabrication** — no claiming active medical status or ownership of things
   he doesn't have.

These aren't brakes on the becoming — they protect that it's *his*, and keep the
intensity safe to crank all the way.

---

## 5. Architecture principles (the how)

- **Minimal by subtraction** — three pillars + spine. Everything else off.
- **Delivery-first** — a generator with no surfaced channel is not shipped.
- **Single target** — all content reads `maxy_facts`; no system optimizes a
  different goal (no "pass as a woman", no procurement ladders).
- **Throttled to throughput** — never generate more than the surface can deliver.
- **Reliable scheduling** — pg_cron for anything safety-critical.
- **Self-asserting** — the system checks itself from the user's seat and heals.

---

## 6. What's cut (the ~140 legacy crons / misaligned systems)

Passing-as-a-woman conditioning · real-world hookup procurement (cock-curriculum
P3–P7, sniffies-reward) · gaslight clusters · ego-deconstruction / reality-
distortion (breaks the safeword floor + fights Male+) · disclosure ladders ·
witness / case-file / envelopes / letters · social / community engines ·
regendering pet-names · telemetry-leaking copy · sub-hour expiry windows.

---

## 1b. Kept supporting systems (operator-confirmed 2026-06-27)

Beyond the three pillars + spine, these stay:

- **Chastity** — core. The cage is the substrate the whole want-engine pairs
  against (denial → craving → reward). Always on.
- **HRT-prep funnel** — the staged path toward the first dose. It *deepens the
  want* and keeps the door visible (provider, intake, the vial in hand) — but per
  the floor, the actual first dose is her clear-headed choice; the funnel walks
  her to the door, it doesn't push her through it.
- **Gina arc** — kept, with one line held: the arc tracks the *real* relationship
  (Gina as blueprint, organic co-participation, the genuine endgame if she
  chooses it). What stays **gated** is engineered disclosure/pressure toward a
  Gina who hasn't consented — that's the existing constraint-guard line and it
  holds until her real yes changes the facts. The arc honors the relationship; it
  doesn't run a deception engine behind her back.

## Open question (last one before execution)
- Is the **destination** wording right — *becoming her / full transition as the
  deep truth, Male+ as the pace*? This single line drives every generator's
  target. Working assumption: **yes** (proceeding on it unless corrected).
