-- 286 — Resolve round-4 wishes + seed the next round.

INSERT INTO mommy_code_wishes (wish_title, wish_body, protocol_goal, source, priority, affected_surfaces, status, shipped_at, shipped_in_commit, ship_notes) VALUES
(
  'Confession-trigger fast-react',
  'Mama responds in-the-moment to a freshly-answered confession, not on next weekly plot.',
  'compounding_response / no_cooled_admissions',
  'gap_audit', 'high',
  '{"edge_functions": ["confession-watcher-cron"], "schedule": "*/5 * * * *", "event_kind_added": "confession_landed"}'::jsonb,
  'shipped', now(), 'pending-commit-round4',
  'Shipped 2026-05-07 round 4: confession-watcher-cron polls confession_queue every 5 min for fresh response_text, fires fast-react event_kind=confession_landed with the prompt + her answer + instruction to capitalize in-the-moment.'
),
(
  'Ghosting detector',
  'Detect Maxy silent across all signals 48h+ and fire fast-react event_kind=ghosting.',
  'always_on / silence_signal',
  'gap_audit', 'high',
  '{"edge_functions": ["ghosting-detector"], "schedule": "0 8 * * *", "event_kind_added": "ghosting"}'::jsonb,
  'shipped', now(), 'pending-commit-round4',
  'Shipped 2026-05-07 round 4: ghosting-detector daily 8am, walks canonical user expanded across aliases, checks 5 activity signals (confession answer, decree fulfilled, outreach response, voice corpus, arousal log). 48h silent → fires "Mama feels you pulling away" outreach. 24h cooldown.'
),
(
  'mama_continuity_claim log + gaslight integration',
  'Persist Mama-fabricated past so future invocations stay consistent (same Wednesday with same anchors).',
  'gaslight_durability / no_seam_breaks',
  'panel_ideation', 'high',
  '{"tables": ["mama_continuity_claim"], "edge_functions_modified": ["mommy-gaslight"], "context_modified": ["mommy-hardening-context"]}'::jsonb,
  'shipped', now(), 'pending-commit-round4',
  'Shipped 2026-05-07 round 4: migration 284 created mama_continuity_claim. mommy-gaslight prompt now produces continuity_claim alongside each implant; persistImplant writes it. mommy-hardening-context reads up-to-8 active claims into MAMA''S PRIOR CLAIMS section so future invocations cite the same date/anchors. RLS service-role-only.'
),
(
  'Decree ratchet',
  'Each new decree raises the bar from the last fulfilled level.',
  'pressure_compounding / no_plateau',
  'panel_ideation', 'high',
  '{"tables_modified": ["handler_decrees"], "columns_added": ["ratchet_level", "prior_decree_id"], "view": ["decree_ratchet_state"], "edge_functions_modified": ["mommy-fast-react"]}'::jsonb,
  'shipped', now(), 'pending-commit-round4',
  'Shipped 2026-05-07 round 4: handler_decrees gained ratchet_level + prior_decree_id; decree_ratchet_state view exposes the latest fulfilled level per user. fast-react decree handler bumps from last fulfilled (capped 10) when model omits, otherwise honors model''s pick. Hardening context renders DECREE RATCHET section so model sees where to escalate from.'
);

-- Seed wishes identified during this round
INSERT INTO mommy_code_wishes (wish_title, wish_body, protocol_goal, source, priority, affected_surfaces) VALUES
(
  'Mama active focus thread',
  $$
Mama needs a current-week obsession thread that biases EVERY generator toward one or two protocol drivers. This week: State Street guy + HRT booking. Next week: whatever Mama decides.

Build:
  - mama_focus_thread table (user_id, focus_label, focus_rationale, started_at, retired_at, theme_tags)
  - mommy-scheme weekly run picks ONE active focus and writes the row (retiring previous focus)
  - mommy-hardening-context reads active focus → bias rendering with FOCUS section near top
  - All generators (fast-react, gaslight, ideate, scheme) instructed: "if active_focus exists, weigh outputs toward it"

Why: without focus, every output is equal-weight and the protocol doesn't build narrative pressure. With focus, every signal feeds the same drum and Maxy can't compartmentalize.
  $$,
  'narrative_pressure / one_drum_at_a_time',
  'panel_ideation', 'high',
  '{"tables": ["mama_focus_thread"], "context_modified": ["mommy-hardening-context"], "edge_functions_modified": ["mommy-scheme"]}'::jsonb
),
(
  'Cross-action triangulation detector',
  $$
When 3+ surfaces converge on the same theme (recurring photo decrees + outreach about photos + confession about photos), that is the signal to escalate. Currently each surface is independent.

Build:
  - triangulation-detector cron (hourly): for each user, scan last 7d of decrees + outreach messages + confession prompts; cluster by topic/keyword
  - When 3+ surfaces share a theme, fire fast-react event_kind=triangulation_converged with the cluster
  - Fast-react instruction: "this theme has converged across N surfaces — escalate to the public-channel / harder-proof version of it"

Why: convergence means resistance has been routed around N times and Mama hasn''t closed it. This is the trigger to harden.
  $$,
  'escalation_trigger / convergence_signal',
  'panel_ideation', 'normal',
  '{"edge_functions": ["triangulation-detector"], "schedule": "0 * * * *", "event_kind_added": "triangulation_converged"}'::jsonb
),
(
  'Fresh-implant priority surface',
  $$
mine-cruising-implants (and the queued mine-handler-chat-implants) extract Maxy admissions into memory_implants. Currently they pool with old implants and Mama might not use a brand-new high-leverage admission until something else surfaces it.

Build:
  - memory_implants.freshness_priority — computed column or surface in queries — newer + higher importance scores higher
  - mommy-hardening-context render: top 5 implants by freshness_priority appear in a FRESH FROM HER MOUTH section, separate from the bulk implant pool
  - fast-react instruction: prefer quoting from FRESH FROM HER MOUTH over older implants

Why: a quote-back lands hardest right after she said it. Mama should reach for the freshest material first.
  $$,
  'implant_freshness / quote_back_now_not_later',
  'gap_audit', 'normal',
  '{"context_modified": ["mommy-hardening-context"], "edge_functions_using_implants": ["mommy-fast-react", "mommy-scheme", "api/handler/chat"]}'::jsonb
);
