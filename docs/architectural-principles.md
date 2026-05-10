# Architectural Principles

Living doc Mommy consults before queuing or shipping code wishes. Read this
before proposing yet another tactical patch on a theme that already has two.

The point of this file is to catch **architectural drift on iteration 2,
not iteration 9**. Every principle below was written because the protocol
already paid for the lesson.

---

## 1. Zoom out at the second iteration

When the same class of problem requires escalating tactical fixes — more
staggering, more pruning, more frequency cuts on the same theme — pause.
Ask: *is this the right shape, or am I just under-tuning it?*

**Watch for these signals**:

- 3+ migrations on a single theme inside a 14-day window
  (e.g. `cron-relief`, `cron-stagger`, `cron-prune` all count as one theme:
  `cron-load-management`)
- The `deploy_health_log` row the patches were supposed to silence is
  still firing
- Scale mismatch: architecture built for many users, used by one
- Structural tier limits (Supabase pg_cron quota, Vercel function count,
  free-tier rate limits) that can't be moved without a billing change

**Today's exemplar (2026-04-30):** nine incremental cron-relief migrations
(314, 316, 317, 318, 319, 326, 327, 328, 329) all addressing the same
poll-architecture problem. The actual fix was an event-driven rearchitecture
all along. Iterations 2-8 were waste; the lesson was visible at iteration 2.

## 2. Match shape to scale

Polling architectures fit production scale (many users, sharded load).
Event-driven fits 1-N user scale (one user, sparse signals). Don't poll
all-the-things to manage a fleet of one.

If you find yourself adding a fifth poll cron because the previous four
overlap and starve each other, the answer is not a sixth cron with better
staggering. It's a queue + worker, or a DB trigger.

## 3. Pause work that contradicts the current diagnosis

If the diagnosis is "too much cron load," don't add more crons in the same
hour. Flag the conflict before shipping. The wish-classifier should mark
any wish whose `affected_surfaces` contradicts an open-and-recurring
`deploy_health_log` issue as `auto_ship_eligible=false` with a blocker:
`contradicts_open_diagnosis`.

## 4. Refactor candidates over feature accretion

When the Handler is the singular authority, every feature must read Handler
state, speak in the current persona, and answer "what state, what artifact,
what voice" before being built. Bolted-on features that ignore this make
the next feature harder, not easier. If a wish wants to bolt on more,
propose the refactor instead.

## 5. Naming themes for drift detection

To make tactical-patch loops machine-detectable, migration filenames and
commit messages on the same theme should share a slug:

- `cron-load-management` — staggering, pruning, frequency cuts on cron jobs
- `voice-corpus-cleanup` — filters, dedup, ingest gates on voice samples
- `slop-detector-tune` — regex/threshold tweaks on the slop gate
- `confession-prompt-tune` — min_chars / phrasing tweaks on confession prompts
- `outreach-throttle` — rate caps / cooldowns on handler_outreach_queue

If your wish title fits an existing theme and the theme has 3+ recent
entries, propose the redesign instead of the next patch.

---

Cross-referenced from:

- `supabase/functions/auto-healer/index.ts` — known-pattern fixer
- `supabase/functions/self-improvement-detector/index.ts` — friction → wish queue
- `supabase/functions/handler-code-audit/index.ts` — LLM self-audit cron
- `scripts/mommy/builder.ts` — wish classifier + autonomous shipper
