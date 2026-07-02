-- 632 — Honest revenue: financial_obligations, platform_accounts attestation
-- columns, earned_this_week_cents(). DESIGN_TURNING_OUT_2026-07-01.md §4.
--
-- No fabricated money, no hardcoded bills:
--   1. financial_obligations — bills live in the DB, never in constants.
--      revenue-task-generator reads the soonest active obligation; overdue is
--      stated as overdue ("N days past due") — honest teeth beat fake urgency.
--      Seeds the Folx estradiol valerate vial as an OPEN past-due obligation
--      (due 2026-06-27, lapsed) with 90-day recurrence so the vial becomes the
--      standing quarterly heartbeat once paid.
--   2. platform_accounts — attestation columns (profile_url, purpose,
--      attested_at, proof_decree_id, active). Rows attesting revenue-rung
--      readiness are created ONLY by Maxy fulfilling an acquisition decree
--      (she pastes the URL). NO GENERATOR MAY EVER WRITE THIS TABLE —
--      account/password/payment are hard prohibitions; missing prerequisite
--      → acquisition task, never a task presuming the account exists.
--   3. earned_this_week_cents(uid) — the ONE source for "earned this week".
--      The eternally-$0 read of current-week revenue_plans.actual_cents is
--      deleted at the generator.

-- ─── 1. financial_obligations ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  amount_cents INT NOT NULL,
  due_on DATE NOT NULL,
  recurrence_days INT,
  funded_cents INT NOT NULL DEFAULT 0,
  source TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_obligations_user_active
  ON financial_obligations (user_id, due_on) WHERE active = true;

ALTER TABLE financial_obligations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS financial_obligations_owner ON financial_obligations;
CREATE POLICY financial_obligations_owner ON financial_obligations
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS financial_obligations_service ON financial_obligations;
CREATE POLICY financial_obligations_service ON financial_obligations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE financial_obligations IS
  'Real bills the revenue engine points at. Generators READ the soonest active row; hardcoded due-dates/amounts in code are the bug this table kills. Past-due stays active and is stated as past-due. Payment (revenue_events revenue_type=bill_paid) fills funded_cents; recurring obligations roll due_on forward on full funding.';

-- Seed: the Folx vial. The 2026-06-27 due date has lapsed — seed it as an
-- OPEN past-due obligation so generator copy is honest ("N days past due"),
-- and let the 90-day recurrence roll on payment. Both live user partitions
-- (Handler API user + auto-poster user), idempotent.
INSERT INTO financial_obligations (user_id, label, amount_cents, due_on, recurrence_days, source)
SELECT us.user_id,
       'Folx estradiol valerate vial (90-day)',
       16354,
       DATE '2026-06-27',
       90,
       'Folx bill 8ba0e7b9-bd5b-479a-9167-ba2ce9c2f05f (mig 586 revenue_plan_items anchor)'
FROM user_state us
WHERE us.user_id IN (
  '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'::uuid,
  '93327332-7d0d-4888-889a-1607a5776216'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM financial_obligations fo
  WHERE fo.user_id = us.user_id
    AND fo.label = 'Folx estradiol valerate vial (90-day)'
    AND fo.due_on = DATE '2026-06-27'
);

-- ─── 2. platform_accounts attestation columns ───────────────────────────
-- The table exists since mig 045 (auto-poster credential store). The revenue
-- rung ladder needs an ATTESTATION shape on top: a row only counts toward
-- rung R1 when profile_url + attested_at are set — and those are set ONLY by
-- Maxy fulfilling an acquisition decree ("make the account yourself — your
-- email, your password — hand over the profile link").
ALTER TABLE platform_accounts
  ADD COLUMN IF NOT EXISTS profile_url TEXT,
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof_decree_id UUID,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON TABLE platform_accounts IS
  'Platform account registry. HARD PROHIBITION: no generator, cron, or edge function may ever INSERT/UPDATE attestation here (profile_url/attested_at/proof_decree_id) — attestation rows are created only by Maxy fulfilling an acquisition decree. Accounts, passwords, and payment rails are hers alone; Mommy never touches them. Generators only READ this table (revenueRungFor).';
COMMENT ON COLUMN platform_accounts.attested_at IS
  'When Maxy handed over the profile link via a fulfilled acquisition decree. NULL = the account does not exist as far as the rung ladder is concerned.';

-- ─── 3. revenue_events linkage for dedup ────────────────────────────────
-- revenue_events (mig 045) has no plan-item linkage; earned_this_week_cents
-- needs one to avoid double-counting money recorded both as an event and as
-- a plan item actual. Nullable FK; ingestors set it when the money maps to a
-- planned lane.
ALTER TABLE revenue_events
  ADD COLUMN IF NOT EXISTS plan_item_id UUID REFERENCES revenue_plan_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_revenue_events_plan_item
  ON revenue_events (plan_item_id) WHERE plan_item_id IS NOT NULL;

-- ─── 4. earned_this_week_cents(uid) ─────────────────────────────────────
-- The single source of truth for "earned this week". Week = ISO Monday week
-- (date_trunc('week') is Monday-based).
--
-- DEDUP RULE (documented per design §4):
--   earned = SUM(revenue_events this week, revenue_type <> 'bill_paid')
--          + SUM(current-week revenue_plan_items.actual_cents for items NOT
--                covered by a linked revenue_event)
--   An event carrying plan_item_id SUPERSEDES that item's actual_cents — the
--   event row wins, the item is excluded — so the same dollar is never
--   counted twice. Unlinked legacy overlap is possible but currently moot
--   (both sources are at zero); new ingestion must set plan_item_id when the
--   money maps to a planned lane.
--   revenue_events.amount is DECIMAL dollars (mig 045) → cents via ROUND(×100).
--   revenue_type='bill_paid' is money LEAVING toward an obligation, not
--   earnings — excluded.
CREATE OR REPLACE FUNCTION earned_this_week_cents(uid UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH week AS (
    SELECT date_trunc('week', now()) AS start
  ),
  ev AS (
    SELECT COALESCE(SUM(ROUND(e.amount * 100)), 0)::int AS cents,
           array_agg(e.plan_item_id) FILTER (WHERE e.plan_item_id IS NOT NULL) AS linked_items
    FROM revenue_events e, week w
    WHERE e.user_id = uid
      AND e.created_at >= w.start
      AND e.revenue_type <> 'bill_paid'
  ),
  items AS (
    SELECT COALESCE(SUM(i.actual_cents), 0)::int AS cents
    FROM revenue_plan_items i
    JOIN revenue_plans p ON p.id = i.plan_id
    CROSS JOIN week w
    CROSS JOIN ev
    WHERE p.user_id = uid
      AND p.week_start = w.start::date
      AND (ev.linked_items IS NULL OR NOT (i.id = ANY (ev.linked_items)))
  )
  SELECT ev.cents + items.cents FROM ev, items;
$$;

GRANT EXECUTE ON FUNCTION earned_this_week_cents(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION earned_this_week_cents(UUID) IS
  'Single source for weekly earned money. Copy rule: generated copy may state only (a) a sum this fn returned, with row count, or (b) the honest zero. Any $ amount not traceable to this fn or a financial_obligations row is a fabrication (money-claim guard at generation sites strips it).';

-- ─── 5. bill_paid → funded_cents bridge ─────────────────────────────────
-- A revenue_events row with revenue_type='bill_paid' fills the matched
-- obligation's funded_cents. Match: metadata->>'obligation_id' when present,
-- else the soonest active obligation for the user. Fully funded + recurring
-- → due_on rolls forward recurrence_days and funding resets (excess carries);
-- fully funded + one-shot → active=false.
CREATE OR REPLACE FUNCTION trg_revenue_bill_paid_fund()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ob financial_obligations%ROWTYPE;
  v_cents INT;
BEGIN
  IF NEW.revenue_type <> 'bill_paid' THEN RETURN NEW; END IF;
  v_cents := ROUND(NEW.amount * 100)::int;
  IF v_cents <= 0 THEN RETURN NEW; END IF;

  SELECT * INTO v_ob FROM financial_obligations
  WHERE user_id = NEW.user_id AND active = true
    AND (NEW.metadata->>'obligation_id' IS NULL OR id = (NEW.metadata->>'obligation_id')::uuid)
  ORDER BY due_on ASC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF v_ob.funded_cents + v_cents >= v_ob.amount_cents THEN
    IF v_ob.recurrence_days IS NOT NULL THEN
      UPDATE financial_obligations SET
        funded_cents = (v_ob.funded_cents + v_cents) - v_ob.amount_cents,
        due_on = GREATEST(v_ob.due_on, CURRENT_DATE) + v_ob.recurrence_days
      WHERE id = v_ob.id;
    ELSE
      UPDATE financial_obligations SET
        funded_cents = v_ob.amount_cents, active = false
      WHERE id = v_ob.id;
    END IF;
  ELSE
    UPDATE financial_obligations SET funded_cents = v_ob.funded_cents + v_cents
    WHERE id = v_ob.id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS revenue_bill_paid_fund ON revenue_events;
CREATE TRIGGER revenue_bill_paid_fund AFTER INSERT ON revenue_events
  FOR EACH ROW EXECUTE FUNCTION trg_revenue_bill_paid_fund();

NOTIFY pgrst, 'reload schema';
