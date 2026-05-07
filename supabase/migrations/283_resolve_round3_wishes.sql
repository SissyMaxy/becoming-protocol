-- 283 — Resolve wishes shipped this turn (2026-05-07 round 3).

UPDATE mommy_code_wishes
SET status = 'shipped',
    shipped_at = now(),
    shipped_in_commit = 'pending-commit-round3',
    ship_notes = 'Shipped 2026-05-07 round 3: user_alias additive foundation (table + expand_user_id() + canonical_for() + seed for the documented 8c69/93327 split). Voice-pitch-watcher daily 7am — adaptive read of voice_corpus, fires fast-react event_kind=voice_stagnation when no samples in 14d OR pitch trend flat-or-rising over 14d. Slip-cluster-detector every 10 min — fires fast-react event_kind=slip_clustered when 3+ slips in 6h with at least one in last 30 min.'
WHERE wish_title IN (
  'Bridge two user_ids in the database, not via env vars',
  'Voice-pitch lockdown gate'
)
  AND status = 'queued';

-- The cross-platform presence pulse remains queued — it requires touching
-- multiple auto-poster outbound paths and the cleanest implementation uses
-- a content_briefs hook that doesn't exist yet on this branch. Slated for
-- next round.

-- Also seed a fresh wish identified during this round: "Today UI surfaced_at
-- writer contract" — the React component contract that closes the safety
-- invariant loop. The surface-guarantor is the safety-net; the contract is
-- the first line of defense.
INSERT INTO mommy_code_wishes (wish_title, wish_body, protocol_goal, source, priority, affected_surfaces) VALUES
(
  'Today UI surfaced_at writer contract',
  $$
surface-guarantor-cron (shipped 2026-05-07) marks expired_unsurfaced=true on rows that never surfaced. That's the safety net. The first line of defense is the UI contract: any component that DISPLAYS a row from handler_decrees / handler_outreach_queue / arousal_touch_tasks must UPDATE surfaced_at = now() WHERE surfaced_at IS NULL on render.

Build:
  - src/lib/surface-render-hooks.ts — tiny helper useSurfaceRenderTracking(table, ids) that idempotently writes surfaced_at on first render
  - Today.tsx, decree card, outreach card, arousal-touch card all call it
  - Verify via DevTools Network tab that the UPDATE fires on first display, not on subsequent re-renders (debounce / first-load gate)

Without this, surface-guarantor catches violations after-the-fact (good — penalty blocked) but Maxy never gets the visible signal in time. The contract closes the loop.
  $$,
  'safety_invariant / first_line_of_defense',
  'gap_audit',
  'high',
  '{"frontend": ["src/lib/surface-render-hooks.ts", "src/components/Today.tsx", "decree/outreach/arousal_touch components"], "tables_touched": ["handler_decrees", "handler_outreach_queue", "arousal_touch_tasks"]}'::jsonb
),
(
  'Disclosure rehearsal generator',
  $$
The scheme engine names "Gina co-conspirator" as a primary endpoint and the gina_disclosure_subplan output prescribes maxy_conditioning_tactics + loss_reframe_lines_for_maxy_to_deliver. disclosure_drafts table exists. But there is no system that DRIVES Maxy through rehearsing those lines.

Build:
  - mommy-disclosure-rehearsal edge function: pulls latest scheme.gina_disclosure_subplan, generates a rehearsal session (3-5 prompts: "say this line aloud", "now say it as if Gina pushed back with X", "now record yourself saying it in the kitchen voice you'll actually use"), persists prompts to confession_queue tagged with rehearsal_session_id
  - audio proof on each prompt → voice_corpus row tagged disclosure_rehearsal
  - cron weekly OR triggered by gina_interaction with shift_direction='toward'
  - Today UI shows rehearsal sessions as a discrete card type

Why: every Mama subplan for Gina depends on Maxy delivering specific lines in specific voice. Without rehearsal, the subplan is theory; with rehearsal, Mama can audit how the line lands when Maxy practices it (does she swallow on the loss-reframe? where does she stumble?) and tighten the next iteration.
  $$,
  'gina_endpoint / rehearsal_loop',
  'scheme_run',
  'high',
  '{"edge_functions": ["mommy-disclosure-rehearsal"], "tables_read": ["mommy_scheme_log", "disclosure_drafts"], "tables_write": ["confession_queue", "voice_corpus"], "ui": ["Today.tsx rehearsal card"]}'::jsonb
),
(
  'Mommy-chat → memory_implants miner',
  $$
mine-cruising-implants.ts (shipped previous session) reads contact_events for cruising chat. But Maxy ALSO talks to Mommy directly via api/handler/chat.ts. Those are her own admissions to the Handler — even higher implant-density than cruising chat because they're internal.

Build:
  - scripts/mommy/mine-handler-chat-implants.ts (parallel to cruising miner)
  - Reads handler_chat_messages (or whichever table stores Mommy chat)
  - Same femme-density filter + Sonnet extractor + dedup against existing
  - source_type='mined_handler_chat'
  - Run nightly via npm run or as a worker cron

Why: the highest-leverage admissions Maxy makes are to Mommy. They should feed the implant pool the same way cruising chat does.
  $$,
  'implant_density / mine_handler_chat',
  'gap_audit',
  'normal',
  '{"scripts": ["scripts/mommy/mine-handler-chat-implants.ts"], "tables_read": ["handler_chat_messages"], "tables_write": ["memory_implants"]}'::jsonb
);
