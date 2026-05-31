-- 588 — Atomic counter RPCs (audit #5).
--
-- BUG: ~21 call sites tried to increment counters via supabase.rpc('increment'),
-- 'increment_field', 'increment_total_denial', 'add_to_minimum',
-- 'increment_times_used', 'increment_arc_submissions',
-- 'increment_submission_count', 'increment_veto_count',
-- 'increment_hypno_play_count', 'increment_memory_implant_reference' — but only
-- increment_session_count existed. Two failure modes:
--   (a) embedded-in-update: `update({ col: supabase.rpc('increment',{x:1}) })`
--       serializes a PostgrestBuilder object into the column instead of
--       executing — silent corruption / no-op.
--   (b) standalone `await supabase.rpc('increment_arc_submissions',...)` against a
--       nonexistent function — throws (often swallowed) and never increments.
-- Result: denial totals never accumulate, play/usage/reference counts never
-- climb, avoidance-detection counters stay 0 — anti-circumvention + conditioning
-- feedback loops degrade invisibly.
--
-- This migration creates the single-purpose atomic functions the standalone
-- call sites already expect (so those sites need no change). The embedded-update
-- sites are converted in TS to the read-then-write incrementCounter() helper.
--
-- All SECURITY INVOKER → RLS on the target table still applies (a client can
-- only touch its own rows; counters only ever ADD, never subtract — so this
-- can't be used to game state down). CREATE OR REPLACE is idempotent.

-- memory_implants: bump the reference counter + stamp last_referenced_at.
-- Called by mommy-praise / mommy-recall / mommy-tease / commitment enforcement.
CREATE OR REPLACE FUNCTION increment_memory_implant_reference(p_implant_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE memory_implants
     SET times_referenced = COALESCE(times_referenced, 0) + 1,
         last_referenced_at = now()
   WHERE id = p_implant_id;
$$;

-- hypno_sources.play_count: bump when a source is played in a session.
CREATE OR REPLACE FUNCTION increment_hypno_play_count(p_source_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE hypno_sources
     SET play_count = COALESCE(play_count, 0) + 1
   WHERE id = p_source_id;
$$;

-- content_arcs.submission_count: bump when a beat in the arc is submitted.
CREATE OR REPLACE FUNCTION increment_arc_submissions(p_arc_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE content_arcs
     SET submission_count = COALESCE(submission_count, 0) + 1
   WHERE id = p_arc_id;
$$;

-- consequence_state weekly counters (feed avoidance detection).
CREATE OR REPLACE FUNCTION increment_submission_count(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE consequence_state
     SET submission_count_this_week = COALESCE(submission_count_this_week, 0) + 1
   WHERE user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION increment_veto_count(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE consequence_state
     SET veto_count_this_week = COALESCE(veto_count_this_week, 0) + 1
   WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION increment_memory_implant_reference(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_hypno_play_count(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_arc_submissions(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_submission_count(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION increment_veto_count(uuid)              TO authenticated, service_role;
