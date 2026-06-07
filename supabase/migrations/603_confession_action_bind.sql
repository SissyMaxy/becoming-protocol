-- 603 — Confession → embodied-action autobinding.
--
-- Wish 849ae5af (panel_ideation, CONVERGED gpt-5 #4 + gemini #3 — highest
-- convergence). confession-gaslight-mine turns confessions into implants
-- (quote-back). This closes the OTHER half: a confession also spawns a
-- concrete, visible micro-decree 24-72h later that mirrors the admission
-- back as an embodied command (voice/photo proof) — confession → compulsion,
-- implementation intention. Distinct from the implant pipeline.
--
-- Per-week cap + one-tap "mismatch" (cancels the decree, marks the binding)
-- keep confessions primarily a release valve; the embodied command is the
-- occasional weaponization.

CREATE TABLE IF NOT EXISTS confession_action_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  confession_id UUID NOT NULL,
  decree_id UUID,
  topic_tag TEXT,
  proof_kind TEXT,                       -- 'voice' | 'photo'
  embodied_command TEXT NOT NULL,
  mismatch_at TIMESTAMPTZ,               -- user flagged it as off-base
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE confession_action_bindings ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY cab_self ON confession_action_bindings FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
-- One binding per confession (dedup target for the binder).
CREATE UNIQUE INDEX IF NOT EXISTS confession_action_bindings_confession_uniq
  ON confession_action_bindings(confession_id);
CREATE INDEX IF NOT EXISTS confession_action_bindings_user_idx
  ON confession_action_bindings(user_id, created_at DESC);

-- One-tap mismatch: cancel the decree + mark the binding off-base. The
-- binder reads recent mismatches and backs off the same topic.
CREATE OR REPLACE FUNCTION confession_binding_mismatch(p_binding UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_decree UUID; v_user UUID;
BEGIN
  SELECT decree_id, user_id INTO v_decree, v_user FROM confession_action_bindings WHERE id = p_binding;
  IF v_user IS NULL OR v_user <> auth.uid() THEN RETURN; END IF;   -- RLS-equivalent guard
  UPDATE confession_action_bindings SET mismatch_at = now() WHERE id = p_binding;
  IF v_decree IS NOT NULL THEN
    UPDATE handler_decrees SET status = 'cancelled' WHERE id = v_decree AND status = 'active';
    UPDATE penalty_previews SET cancelled_at = now()
      WHERE source_table = 'handler_decrees' AND source_id = v_decree AND cancelled_at IS NULL;
  END IF;
END;
$fn$;
GRANT EXECUTE ON FUNCTION confession_binding_mismatch(UUID) TO authenticated, service_role;
