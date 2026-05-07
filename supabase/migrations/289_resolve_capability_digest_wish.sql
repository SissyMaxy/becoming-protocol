-- 289 — Resolve the capability-digest wish (shipped same turn it was identified).

INSERT INTO mommy_code_wishes (wish_title, wish_body, protocol_goal, source, priority, affected_surfaces, status, shipped_at, shipped_in_commit, ship_notes) VALUES
(
  'Daily capability digest — passive surface for autonomous capability changes',
  'User asked: how will I know when Mommy is autonomously updating her capabilities? There was no passive surface. Daily 7:30am cron now summarizes shipped + queued wishes from the last 24h, writes mama_capability_digest row, and lands a low-urgency capability_digest outreach so it shows on Today.',
  'observability / autonomy_with_visibility',
  'user_directive', 'high',
  '{"tables": ["mama_capability_digest"], "edge_functions": ["capability-digest-cron"], "schedule": "30 7 * * *", "outreach_source": "capability_digest"}'::jsonb,
  'shipped', now(), 'pending-commit-round5',
  'Shipped 2026-05-07: capability-digest-cron daily 7:30am writes a plain-English summary (NOT Mama voice — operator output) of last-24h shipped/queued wishes. Lands as urgency=low outreach with source=capability_digest so any UI that filters by source can route it. process-wishes.ts also gained --since flag for ad-hoc audit.'
);
