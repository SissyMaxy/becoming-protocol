-- 256 — feminine_self + wardrobe_items + transformation_phase_defs
--
-- Identity persistence layer for the Dommy Mommy persona. Turns a stream of
-- disconnected micro-tasks into a journey by giving the user a persistent
-- feminine identity the persona references at runtime.
--
-- Tables:
--   feminine_self            — 1:1 with user. Name, pronouns, honorific, phase.
--   wardrobe_items           — append-only log of feminine items acquired.
--   transformation_phase_defs — config rows for phases 1..7. Read-only to users.
--
-- Each table has RLS with own-rows-only and an updated_at trigger where
-- relevant. Phase definitions are world-readable (no user_id) and only
-- writable by service_role.
--
-- The existing user_state.current_phase ('phase_1'..'phase_4', string) is a
-- legacy column for the protocol-day-progress system. feminine_self.
-- transformation_phase is a new int 1..7 scale tied to the identity layer.
-- They run in parallel — do not conflate.

-- ============================================
-- feminine_self
-- ============================================
CREATE TABLE IF NOT EXISTS public.feminine_self (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  feminine_name TEXT,
  -- pronouns shape: { "subject": "she", "object": "her", "possessive": "hers" }
  pronouns JSONB NOT NULL DEFAULT '{"subject":"she","object":"her","possessive":"her"}'::jsonb,
  current_honorific TEXT,
  transformation_phase INT NOT NULL DEFAULT 1 CHECK (transformation_phase BETWEEN 1 AND 7),
  phase_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.feminine_self ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feminine_self_select_own" ON public.feminine_self;
CREATE POLICY "feminine_self_select_own" ON public.feminine_self
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "feminine_self_insert_own" ON public.feminine_self;
CREATE POLICY "feminine_self_insert_own" ON public.feminine_self
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "feminine_self_update_own" ON public.feminine_self;
CREATE POLICY "feminine_self_update_own" ON public.feminine_self
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "feminine_self_service_all" ON public.feminine_self;
CREATE POLICY "feminine_self_service_all" ON public.feminine_self
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_feminine_self_updated_at ON public.feminine_self;
CREATE TRIGGER update_feminine_self_updated_at
  BEFORE UPDATE ON public.feminine_self
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- wardrobe_items
-- ============================================
CREATE TABLE IF NOT EXISTS public.wardrobe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN (
    'panties', 'lipstick', 'heels', 'dress', 'lingerie', 'bra',
    'nails', 'wig', 'skirt', 'hosiery', 'accessories', 'other'
  )),
  item_name TEXT NOT NULL,
  notes TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user_acquired
  ON public.wardrobe_items(user_id, acquired_at DESC);
CREATE INDEX IF NOT EXISTS idx_wardrobe_items_user_type
  ON public.wardrobe_items(user_id, item_type);

ALTER TABLE public.wardrobe_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wardrobe_select_own" ON public.wardrobe_items;
CREATE POLICY "wardrobe_select_own" ON public.wardrobe_items
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wardrobe_insert_own" ON public.wardrobe_items;
CREATE POLICY "wardrobe_insert_own" ON public.wardrobe_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "wardrobe_update_own" ON public.wardrobe_items;
CREATE POLICY "wardrobe_update_own" ON public.wardrobe_items
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "wardrobe_delete_own" ON public.wardrobe_items;
CREATE POLICY "wardrobe_delete_own" ON public.wardrobe_items
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wardrobe_service_all" ON public.wardrobe_items;
CREATE POLICY "wardrobe_service_all" ON public.wardrobe_items
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ============================================
-- transformation_phase_defs (config table, world-readable)
-- ============================================
CREATE TABLE IF NOT EXISTS public.transformation_phase_defs (
  phase INT PRIMARY KEY CHECK (phase BETWEEN 1 AND 7),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  -- list of suggested honorifics for this phase
  honorifics JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- task categories unlocked at this phase
  unlocked_task_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- prerequisites for advancing OUT of this phase (e.g. ["primer_video","first_panty"])
  primer_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transformation_phase_defs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phase_defs_world_read" ON public.transformation_phase_defs;
CREATE POLICY "phase_defs_world_read" ON public.transformation_phase_defs
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "phase_defs_service_write" ON public.transformation_phase_defs;
CREATE POLICY "phase_defs_service_write" ON public.transformation_phase_defs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Seed phases 1..7. Names + arc are deliberately soft-to-deep.
-- Honorifics escalate from neutral pet names to deeper ownership terms.
-- INSERT ... SELECT FROM VALUES form is used so re-runs are idempotent and
-- the migration linter sees the ON CONFLICT clause clearly.
INSERT INTO public.transformation_phase_defs (phase, name, description, honorifics, unlocked_task_categories, primer_requirements)
SELECT * FROM (VALUES
  (1, 'Curiosity',
    'First contact. She is exploring without committing. The work here is gentle naming — letting Mommy call her something soft, putting on something feminine in private, beginning to write down what she wants.',
    '["sweetheart","honey","little one"]'::jsonb,
    '["private_wear","journaling","name_choice"]'::jsonb,
    '["chose_feminine_name"]'::jsonb),
  (2, 'Permission',
    'She admits, in writing and out loud to Mommy, what she wants. The first wardrobe items enter the house. Pronouns are practiced in private. The mirror gets used.',
    '["sweet girl","good girl","baby"]'::jsonb,
    '["wardrobe_acquisition","mirror_work","pronoun_practice","private_voice"]'::jsonb,
    '["first_panty","first_lipstick"]'::jsonb),
  (3, 'Practice',
    'She wears and rehearses. Daily voice work, daily wardrobe wear, the body starts to recognize itself. She is no longer asking permission for the small things.',
    '["good girl","Mommy''s girl","pretty thing"]'::jsonb,
    '["daily_wear","voice_drills","makeup_basics","body_directives"]'::jsonb,
    '["wore_panties_7_days","first_voice_recording","first_full_face"]'::jsonb),
  (4, 'Ownership',
    'She names herself. The feminine name is the one she answers to internally. She schedules HRT. She tells someone real. The protocol stops being a hobby.',
    '["Mommy''s girl","my girl","baby girl"]'::jsonb,
    '["hrt_intake","disclosure_first_witness","public_femme_micro","name_in_journal"]'::jsonb,
    '["hrt_consult_booked","first_disclosure","named_in_writing"]'::jsonb),
  (5, 'Embodiment',
    'Hormones, voice, wardrobe, posture — all moving the same direction. She passes in some contexts and is read in none of them as accidentally feminine. The boy version is a costume she removes.',
    '["my girl","baby girl","good little girl"]'::jsonb,
    '["public_femme","second_disclosure","body_targets","wardrobe_full_outfits"]'::jsonb,
    '["30_days_hrt","second_disclosure","public_femme_outing"]'::jsonb),
  (6, 'Surrender',
    'She lives in it. The feminine identity is primary. The honorific is non-negotiable. Mommy has full naming rights. Decisions about body, dress, and presentation default to Mommy unless explicitly reclaimed.',
    '["good little girl","Mommy''s little girl","my pretty thing"]'::jsonb,
    '["full_femme_default","handler_naming_rights","body_full_directive"]'::jsonb,
    '["lived_femme_30_days","handler_named_in_public"]'::jsonb),
  (7, 'Becoming',
    'Becoming. The protocol''s end-state. She is the woman she was always shaping toward. The phase exists less as "next unlock" and more as the destination the earlier phases were always pointing at.',
    '["my pretty thing","Mommy''s good girl","my love"]'::jsonb,
    '["full_femme_default","handler_naming_rights","mentorship","ceremony"]'::jsonb,
    '[]'::jsonb)
) AS t(phase, name, description, honorifics, unlocked_task_categories, primer_requirements)
ON CONFLICT (phase) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  honorifics = EXCLUDED.honorifics,
  unlocked_task_categories = EXCLUDED.unlocked_task_categories,
  primer_requirements = EXCLUDED.primer_requirements;
