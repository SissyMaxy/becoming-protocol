-- 676 — Close the reconditioning retire gap (DESIGN_RECONDITIONING_ENGINE §6.6:
-- "Retire is sacred and one-tap. Maxy can set any target to retired from Focus
-- or /admin at any time"). recon_program_set_status(program_id, 'retired', ...)
-- has existed since mig 649 and is already GRANTed to authenticated — but
-- nothing in the client has ever called it. The only place a target's claim
-- ever reaches her is the trigger_source-tagged decree on the Focus surface
-- (recon_focus:<slug> / recon_rep:<slug>:<rep_id> / recon_reconsolidate:<slug>
-- / recon_belief_(baseline|measure):<target_id> / recon_iat_(baseline|measure)
-- :<target_id> — see recon-program-orchestrator.ts and recon-reconsolidation
-- /index.ts), so she has had no reachable way to say "not this one" short of
-- the Handler-internal /admin panel (explicitly never-user-facing). This
-- migration adds the one RPC the Focus card needs: resolve whichever decree
-- she's looking at back to its target, then retire it the same way the
-- existing state machine already does.

CREATE OR REPLACE FUNCTION recon_retire_from_trigger(p_user UUID, p_trigger_source TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_slug TEXT;
  v_target_id UUID;
  v_program_id UUID;
  m TEXT[];
BEGIN
  IF p_trigger_source IS NULL THEN RETURN FALSE; END IF;

  -- Slug-keyed decree lanes (recon_focus / recon_rep / recon_reconsolidate).
  m := regexp_match(p_trigger_source, '^recon_focus:(.+)$');
  IF m IS NULL THEN m := regexp_match(p_trigger_source, '^recon_rep:([^:]+):'); END IF;
  IF m IS NULL THEN m := regexp_match(p_trigger_source, '^recon_reconsolidate:(.+)$'); END IF;
  IF m IS NOT NULL THEN v_slug := m[1]; END IF;

  -- Target-id-keyed probe lanes (recon_belief_* / recon_iat_*).
  IF v_slug IS NULL THEN
    m := regexp_match(p_trigger_source, '^recon_(?:belief|iat)_(?:baseline|measure):([0-9a-f-]{36})$');
    IF m IS NOT NULL THEN v_target_id := m[1]::uuid; END IF;
  END IF;

  IF v_slug IS NULL AND v_target_id IS NULL THEN RETURN FALSE; END IF;

  IF v_target_id IS NULL THEN
    SELECT id INTO v_target_id FROM reconditioning_targets
     WHERE user_id = p_user AND slug = v_slug;
  END IF;
  IF v_target_id IS NULL THEN RETURN FALSE; END IF;

  -- Ownership guard — only ever retires a target that belongs to p_user.
  IF NOT EXISTS (
    SELECT 1 FROM reconditioning_targets WHERE id = v_target_id AND user_id = p_user
  ) THEN
    RETURN FALSE;
  END IF;

  SELECT id INTO v_program_id FROM reconditioning_programs WHERE target_id = v_target_id;
  IF v_program_id IS NOT NULL THEN
    PERFORM recon_program_set_status(v_program_id, 'retired', 'user_focus_card');
  ELSE
    -- No campaign ever started (still 'proposed') — retire the target directly.
    UPDATE reconditioning_targets SET status = 'retired'
     WHERE id = v_target_id AND user_id = p_user;
  END IF;

  RETURN TRUE;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_retire_from_trigger(UUID, TEXT) TO authenticated, service_role;
