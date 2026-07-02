-- 586 — wishlist + weekly revenue target on user_state, seed Folx-bill plan.
--
-- Real-world trigger: 2026-05-28 Folx prescribed estradiol valerate, $163.54
-- bill due 2026-06-27, vial only ships post-payment. Maxy cannot afford it.
-- Per standing rule ([[project_priorities]]: revenue is Mommy's job), this
-- migration stands up the structural pieces of the wishlist-first transition
-- fund strategy:
--
--   wishlist_url          — link-rotator (scripts/auto-poster/link-rotator.ts)
--                           will prefer this over the hardcoded Fansly URL once
--                           wired (task #2). Source of truth for Today-card
--                           wishlist-progress widget.
--   wishlist_provider     — throne | wishtender | amazon | other. Drives the
--                           provider-specific CTA bank in link-rotator.
--   weekly_revenue_target_cents
--                         — drives the supervisor metric (task #4). Default
--                           20000 ($200/wk) covers Folx bill + slack.
--
-- Also seeds revenue_plans for this week on both live user partitions with the
-- Folx bill named as the anchor revenue_plan_items row. Idempotent (re-run
-- safe via ON CONFLICT / NOT EXISTS guards).

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS wishlist_url TEXT,
  ADD COLUMN IF NOT EXISTS wishlist_provider TEXT,
  ADD COLUMN IF NOT EXISTS weekly_revenue_target_cents INTEGER NOT NULL DEFAULT 20000;

-- Provider check added separately so re-runs don't error on existing column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'user_state_wishlist_provider_check'
  ) THEN
    ALTER TABLE user_state
      ADD CONSTRAINT user_state_wishlist_provider_check
      CHECK (wishlist_provider IS NULL OR wishlist_provider IN ('throne', 'wishtender', 'amazon', 'other'));
  END IF;
END $$;

COMMENT ON COLUMN user_state.wishlist_url IS
  'Public wishlist URL — scripts/auto-poster/link-rotator.ts prefers this over the hardcoded Fansly URL when set. Source of truth for the Today-card wishlist-progress widget.';

COMMENT ON COLUMN user_state.wishlist_provider IS
  'throne | wishtender | amazon | other. Drives provider-specific CTA copy bank in link-rotator.';

COMMENT ON COLUMN user_state.weekly_revenue_target_cents IS
  'Weekly revenue target in cents. Default 20000 ($200/wk) — covers Folx estradiol valerate vial ($163.54 / 90d, due 2026-06-27) + slack. Supervisor escalates when SUM(contact_events.amount_cents WHERE direction=in) for current week trails the target.';

-- Seed this week's revenue_plan for both live user partitions.
-- 8c69... = Handler API auth user; 93327... = auto-poster USER_ID (money flows
-- into contact_events on this partition). Both get the plan so the Today-card
-- (on the Handler partition) and the money ingestor (on the auto-poster
-- partition) read the same target.
DO $$
DECLARE
  uid UUID;
  pid UUID;
  monday DATE := date_trunc('week', CURRENT_DATE)::date;
BEGIN
  FOR uid IN
    SELECT user_id FROM user_state
    WHERE user_id IN (
      '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'::uuid,
      '93327332-7d0d-4888-889a-1607a5776216'::uuid
    )
  LOOP
    INSERT INTO revenue_plans (
      user_id, week_start, status, projected_cents, plan_summary, reasoning
    ) VALUES (
      uid, monday, 'active', 20000,
      'Wishlist-first sprint. Cumulative target: clear Folx estradiol valerate bill ($163.54, due 2026-06-27) by 2026-06-20.',
      'HRT prescribed 2026-05-28. Bill is the activation gate — vial only ships after payment, then 5-7 business days transit. Throne wishlist is primary channel for low-vulnerability passive receiving (matches the conditioning frame: items get bought ONTO her, not by her). Twitter + Reddit drop the wishlist link via existing link-rotator infrastructure. Fansly (SoftMaxy) remains dormant pending separate account setup. Weekly target $200 = $163 bill + $37 slack for ongoing transition costs (electrolysis sessions, syringes, lab co-pays).'
    )
    ON CONFLICT (user_id, week_start) DO UPDATE SET
      projected_cents = EXCLUDED.projected_cents,
      plan_summary = EXCLUDED.plan_summary,
      reasoning = EXCLUDED.reasoning
    RETURNING id INTO pid;

    -- Anchor item: the Folx bill itself. Skip insert if a same-labeled item
    -- already exists on this plan (re-run safety).
    IF NOT EXISTS (
      SELECT 1 FROM revenue_plan_items
      WHERE plan_id = pid
        AND action_label = 'Folx estradiol valerate vial (90-day) — $163.54'
    ) THEN
      INSERT INTO revenue_plan_items (
        plan_id, user_id, action_label, deliverable, platform, kind,
        projected_cents, deadline, notes
      ) VALUES (
        pid, uid,
        'Folx estradiol valerate vial (90-day) — $163.54',
        'Anchor item on Throne wishlist — pinned, top of list. Either as a $164 cash-tribute or as the bill itself paid through tribute. Money flows into contact_events as direction=in; tribute code (6-char) auto-matches incoming payment back to this item via tributes.ts.',
        'wishlist', 'tribute', 16354,
        '2026-06-20T23:59:00Z'::timestamptz,
        'Folx bill 8ba0e7b9-bd5b-479a-9167-ba2ce9c2f05f. Need cleared funds by 2026-06-20 to pay + ship in 5-7 business days before 2026-06-27 deadline. See project_hrt_real_consult_2026-05-27.md for activation chain.'
      );
    END IF;
  END LOOP;
END $$;
