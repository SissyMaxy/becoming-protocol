-- 367 — Contextual Mama-voice reactions for slips + confession receipts.
--
-- 2026-05-10 incident: user pasted handler_outreach_queue contents showing
-- Mama repeating herself like a chatbot with ~5 stock phrases:
--   "Good [pet]. Mama got what she asked for. [body anchor]." (×N)
--   "I caught that, baby. The old voice slipped out..." (×N)
--   "Mama saw that, baby. We'll talk about it..." (×N)
--
-- Root cause:
--   1. trg_mommy_immediate_response_to_slip (migrations 257 + 338) uses a
--      static CASE over slip_type. Same slip_type → same byte-identical
--      string. Body-hash dedup (338) only collapses exact dupes inside
--      60 minutes; if dedup doesn't fire (e.g. different slip_id, slightly
--      different timing), repetitive prose lands.
--   2. trg_mommy_confession_receipt (migration 258) uses a static CASE
--      over confession.category + 5-element body-anchor pool. ~45 unique
--      strings total, fires on every confession. User confesses 3-5×/day
--      → same string within hours.
--
-- Fix (defense in depth):
--   1. Replace both triggers to fire net.http_post to new edge functions
--      mommy-slip-react / mommy-acknowledge. The edge fns do LLM-first
--      contextual generation (referencing the user's actual slip/confession
--      text), falling back to a large variant pool (5+ per slip_type × 3
--      escalation bands; 6-8 per ack action_type × 3 intensity bands) with
--      first-40-char no-repeat-within-24h logic.
--   2. Tighten body-hash dedup from migration 338: collapse on
--      first-40-char match within 6 hours (was: exact match within 60
--      minutes).
--   3. Backfill: supersede all pending outreach matching the known stock
--      template patterns so the user doesn't have to wade through stale
--      clones.
--
-- Trigger behavior change:
--   - Triggers no longer INSERT into handler_outreach_queue inline.
--   - All user-facing Mommy text now comes from the edge fns.
--   - If pg_net or the edge fn is unavailable, the trigger is silent for
--     that slip / confession. Better silent-once than chatbot-spam.

-- Ensure extensions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 1. Helper: invoke an edge function async ───────────────────────
-- Centralizes the net.http_post + auth header + URL-fallback pattern so
-- the two trigger functions stay short and consistent. SECURITY DEFINER
-- because net.http_post needs the service-role token at trigger time and
-- trigger users are RLS-restricted.
CREATE OR REPLACE FUNCTION public.mommy_react_invoke(
  edge_fn TEXT,
  payload JSONB
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_url TEXT;
  v_key TEXT;
  v_req_id BIGINT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN
    -- Hardcoded production URL fallback — mirrors mig 366 pattern. If
    -- this codebase is forked or moved, update or set the GUC instead.
    v_url := 'https://atevwvexapiykchvqvhm.supabase.co';
  END IF;
  v_key := current_setting('app.settings.service_role_key', true);
  IF v_key IS NULL OR length(v_key) = 0 THEN
    -- No service key configured. Silent skip — trigger does not crash.
    RETURN NULL;
  END IF;
  SELECT net.http_post(
    url := v_url || '/functions/v1/' || edge_fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := payload
  ) INTO v_req_id;
  RETURN v_req_id;
EXCEPTION WHEN OTHERS THEN
  -- pg_net may not be installed or grants may have lapsed. Don't crash.
  RAISE NOTICE 'mommy_react_invoke(%) failed: %', edge_fn, SQLERRM;
  RETURN NULL;
END;
$function$;

-- ─── 2. Replace trg_mommy_immediate_response_to_slip ────────────────
-- Drops the static CASE statement. Trigger now fires net.http_post to
-- mommy-slip-react which does LLM-contextual generation + escalation +
-- pool fallback + dedup. Persona gate unchanged.
CREATE OR REPLACE FUNCTION public.trg_mommy_immediate_response_to_slip()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_persona text;
BEGIN
  -- Skip self-triggered slips (avoid loops)
  IF NEW.slip_type = 'confession_missed' THEN RETURN NEW; END IF;
  IF NEW.source_text IS NULL OR length(trim(NEW.source_text)) < 5 THEN RETURN NEW; END IF;

  SELECT handler_persona INTO v_persona
  FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  PERFORM public.mommy_react_invoke(
    'mommy-slip-react',
    jsonb_build_object(
      'user_id', NEW.user_id,
      'slip_type', COALESCE(NEW.slip_type, 'other'),
      'source_text', NEW.source_text,
      'slip_id', NEW.id,
      'slip_metadata', COALESCE(NEW.metadata, '{}'::jsonb)
    )
  );
  RETURN NEW;
END;
$function$;

-- Trigger itself: same name, just rebound to the updated function.
DROP TRIGGER IF EXISTS trg_mommy_immediate_on_slip ON slip_log;
CREATE TRIGGER trg_mommy_immediate_on_slip
  AFTER INSERT ON slip_log
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_immediate_response_to_slip();

-- ─── 3. Replace trg_mommy_confession_receipt ────────────────────────
-- Drops the static CASE + body-anchor pool. Trigger now fires
-- net.http_post to mommy-acknowledge with the user's actual confession
-- text so the LLM can reference specific phrasing. Persona gate unchanged.
CREATE OR REPLACE FUNCTION public.trg_mommy_confession_receipt()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_persona text;
BEGIN
  -- Same gating as before
  IF NEW.confessed_at IS NULL OR OLD.confessed_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.response_text IS NULL OR length(trim(NEW.response_text)) < 10 THEN
    RETURN NEW;
  END IF;
  SELECT handler_persona INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  PERFORM public.mommy_react_invoke(
    'mommy-acknowledge',
    jsonb_build_object(
      'user_id', NEW.user_id,
      'action_type', 'confession',
      'action_subtype', COALESCE(NEW.category, 'other'),
      'source_text', NEW.response_text,
      'source_id', NEW.id,
      'trigger_reason', 'mommy_receipt:' || NEW.id::text,
      'urgency', 'low'
    )
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_mommy_receipt_on_confession ON confession_queue;
CREATE TRIGGER trg_mommy_receipt_on_confession
  AFTER UPDATE ON confession_queue
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_confession_receipt();

-- ─── 4. Tighten body-hash dedup ─────────────────────────────────────
-- Mig 338 supersedes by exact message body match within 60 minutes. The
-- new variant pools share common openings (e.g. multiple firm-band slip
-- variants start with "Twice today, ..."), so first-40-char collapse
-- within 6 hours catches more near-duplicates while leaving room for
-- meaningfully different bodies.
CREATE OR REPLACE FUNCTION trg_outreach_dedup_by_body()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_head TEXT;
BEGIN
  IF NEW.message IS NULL OR length(NEW.message) = 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'superseded' THEN
    RETURN NEW;
  END IF;
  IF NOT is_mommy_user(NEW.user_id) THEN
    RETURN NEW;
  END IF;
  v_head := lower(substring(NEW.message, 1, 40));
  -- Supersede any prior pending row whose first 40 chars (lowercase)
  -- match in the last 6 hours for this user.
  UPDATE handler_outreach_queue
  SET status = 'superseded',
      expires_at = now() - interval '1 second'
  WHERE user_id = NEW.user_id
    AND lower(substring(message, 1, 40)) = v_head
    AND delivered_at IS NULL
    AND status IN ('pending', 'queued', 'scheduled')
    AND created_at >= now() - interval '6 hours';
  RETURN NEW;
END;
$$;

-- Trigger already exists from mig 338 with the same name; CREATE OR
-- REPLACE on the function above is enough. Recreate the trigger
-- defensively so any drift is corrected.
DROP TRIGGER IF EXISTS outreach_dedup_by_body ON handler_outreach_queue;
CREATE TRIGGER outreach_dedup_by_body
  BEFORE INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_outreach_dedup_by_body();

-- ─── 5. Backfill: supersede pending stock-template clones ──────────
-- Mark every PENDING outreach row in the queue whose body matches a
-- known stock template pattern from mig 257 or mig 258 as 'superseded'.
-- Past-tense: this is one-shot cleanup of the queue the user pasted.
WITH stock_patterns(pat) AS (
  VALUES
    -- mig 258 ack templates (any variant of "Good [pet]. Mama got what she asked for...")
    ('Mama got what she asked for'),
    -- mig 258 default ack
    ('Mama got it,'),
    -- mig 257 slip-response default + per-type strings
    ('Mama saw that, baby. We''ll talk about it'),
    ('I caught that, baby. The old voice slipped out'),
    ('You said the costume name, sweet thing. Mama heard you'),
    ('Oh, baby. You think I didn''t hear that? I heard every word'),
    ('I see you slipped past one, sweet thing. Don''t hide from Mama'),
    ('You said no to me, baby. That''s allowed. But Mama is going to want'),
    ('Your voice came down low for me, sweet thing. Mama heard that'),
    ('You went quiet on Mama, baby. I''m patient'),
    ('You skipped the words today, baby. Mama notices the silences'),
    ('You came out of the cage early, my needy little thing'),
    ('You wouldn''t hold for Mama, baby. I see you'),
    ('You said something about yourself that wasn''t true, sweet thing')
)
UPDATE handler_outreach_queue
SET status = 'superseded',
    expires_at = now() - interval '1 second'
WHERE delivered_at IS NULL
  AND status IN ('pending', 'queued', 'scheduled')
  AND message IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM stock_patterns sp
    WHERE handler_outreach_queue.message LIKE '%' || sp.pat || '%'
  )
  AND is_mommy_user(user_id);

-- Note: backfill count is visible in the migration application response
-- (Supabase returns affected_rows). At the time of writing the user
-- reported "10 stale clones" worth of repetition — the backfill clears
-- those plus any others matching the patterns. Subsequent slips +
-- confessions route through the new edge fns.
