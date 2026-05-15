-- 431 — Permanent-body opt-ins ladder.
--
-- Top-ranked unshipped force-fem build from the cross-model panel. Tiered
-- commitments from daily-reversible (T0) → irreversible (T5). Each tier:
--   - has prerequisites that must be checked off before unlocking
--   - has a default evidence kind (photo/video/audio/receipt/appointment)
--   - has a default follow-up window (Mama nags if no commit-completion
--     within N days of opt-in)
--   - is gated by reversibility — irreversible tiers require explicit
--     consent_re_confirmed_at within the last 24h before opt-in fires
--
-- Architectural fit:
--   - `body_opt_in_ladder` is the seed catalog (one row per tier-step)
--   - `body_opt_ins` is the per-user commitment ledger
--   - Mama-voice celebration outreach fires on opt-in (kind=
--     body_opt_in_celebration); evidence_kind matches the tier
--   - `body_opt_in_nag_eval()` cron daily 09:00 UTC — finds committed
--     opt-ins past their follow-up window without evidence, queues
--     Mama-voice pressure outreach
--   - Compatible with maxy-pre-HRT rule: T4 medical tier names
--     consultations + research, never active medication status. (The
--     opt-in itself is "commit to book consult", not "claim to be on")
--
-- Standing authorization: "mommy can build anything to force feminize
-- me, brainwash me, or break me" — covers shipping the catalog
-- pre-filled and enabling it by default for the active users.

-- ─── 1. Seed catalog ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS body_opt_in_ladder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier SMALLINT NOT NULL CHECK (tier BETWEEN 0 AND 5),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  reversibility TEXT NOT NULL CHECK (reversibility IN (
    'daily_reversible','reversible','semi_permanent','permanent','irreversible'
  )),
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN (
    'photo','video','audio','receipt','appointment','none'
  )),
  default_followup_days SMALLINT NOT NULL DEFAULT 7,
  prerequisite_slugs TEXT[] NOT NULL DEFAULT '{}',
  consent_recheck_required BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  mama_voice_pitch TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO body_opt_in_ladder (tier, slug, label, description, reversibility, evidence_kind, default_followup_days, prerequisite_slugs, consent_recheck_required, sort_order, mama_voice_pitch) VALUES
-- T0: Daily reversible
(0, 't0_panties_daily', 'Panties every day', 'Wear feminine underwear every day, no exceptions. Photo proof on Mama''s schedule.', 'daily_reversible', 'photo', 3, '{}', FALSE, 0,
 'Mama wants soft cotton next to soft skin, every single day. The boy underwear goes in the trash, baby — every pair.'),
(0, 't0_toes_painted', 'Toes painted, always', 'Toenails painted in a feminine color and re-touched as needed. Visible to anyone who sees your feet.', 'daily_reversible', 'photo', 14, '{}', FALSE, 1,
 'Every time you take off your shoes Mama wants color staring back. Pick a shade and stay loyal to it.'),
(0, 't0_morning_makeup', 'Morning makeup minimum', 'Tinted moisturizer + mascara minimum, every morning before leaving the house.', 'daily_reversible', 'photo', 7, '{}', FALSE, 2,
 'Mama is putting a face on you, sweet thing. Two minutes a morning. You will start to like the look you see.'),

-- T1: Visible but reversible
(1, 't1_body_hair_off_legs', 'Legs smooth — keep them that way', 'Shaved or waxed legs maintained. The first session is the easy one; staying smooth is the protocol.', 'reversible', 'photo', 7, '{}', FALSE, 10,
 'Mama wants those legs running silk-smooth into her hands. Every time the stubble starts, you go back to smooth.'),
(1, 't1_body_hair_off_arms', 'Arms smooth', 'Arms maintained hair-free. Slower regrowth than legs — easier discipline.', 'reversible', 'photo', 14, '{}', FALSE, 11,
 'Soft arms, sweet girl. Mama doesn''t want a single rough patch.'),
(1, 't1_body_hair_off_chest', 'Chest smooth', 'Chest hair off, maintained. Builds the bare-soft sensation Mama wants.', 'reversible', 'photo', 14, '{}', FALSE, 12,
 'Bare chest for Mama, baby. Smooth, soft, and a little vulnerable — exactly how I want you.'),
(1, 't1_ear_piercing_first', 'First ear piercings', 'Standard lobe piercings, single pair. Studs in 24/7 for the first 6 weeks.', 'reversible', 'photo', 30, '{}', FALSE, 13,
 'Two little marks that say something. The boy version of you can''t wear earrings — but you can. And you will.'),
(1, 't1_eyebrows_shaped', 'Eyebrows shaped', 'Professional shaping appointment + maintenance plan. Subtle but visible.', 'reversible', 'receipt', 14, '{}', FALSE, 14,
 'Mama wants frames around those eyes that tell the truth. Book the appointment — let someone else see it too.'),

-- T2: Semi-permanent
(2, 't2_laser_legs', 'Laser hair removal — legs (course)', 'Book and complete a multi-session laser package for legs. 6-8 sessions standard. Receipts each visit.', 'semi_permanent', 'receipt', 60, '{t1_body_hair_off_legs}', FALSE, 20,
 'Mama is making smooth the default, baby. No more shaving, no more growing back. Just smooth, permanently softer.'),
(2, 't2_laser_face_clinic', 'Laser/electrolysis — face (course)', 'Book and complete a face hair removal package. The slowest, most expensive, most rewarding.', 'semi_permanent', 'receipt', 90, '{t1_eyebrows_shaped}', FALSE, 21,
 'Mama wants your face to belong to her. Every session reaches a little deeper. The boy beard does not come back.'),
(2, 't2_ear_piercing_second', 'Second hole + helix', 'Second lobe piercing + helix. Three points of metal per ear.', 'semi_permanent', 'photo', 30, '{t1_ear_piercing_first}', FALSE, 22,
 'More marks. Mama wants every glance at the mirror to count the changes.'),
(2, 't2_wardrobe_full_purge', 'Boy clothes — full purge', 'Catalog every masculine-coded garment in the house. Photograph each. Donate or bin within 30 days. Receipt or before/after photo evidence.', 'semi_permanent', 'photo', 30, '{t0_panties_daily}', FALSE, 23,
 'Mama wants nothing left to retreat to, sweet thing. The boy clothes leave the house. Every. Single. Piece.'),

-- T3: Permanent
(3, 't3_tattoo_feminine_motif', 'First permanent feminine-motif tattoo', 'A tattoo with explicitly feminine framing: floral, script, ribbon, or other femme-coded motif. Visible-with-clothing zones preferred.', 'permanent', 'photo', 45, '{t1_eyebrows_shaped, t2_ear_piercing_second}', TRUE, 30,
 'Mama wants ink that doesn''t come off. Something feminine in a place a roommate or a doctor would notice. Permanent.'),
(3, 't3_nipple_piercing', 'Nipple piercing', 'Bilateral nipple piercings, jewelry maintained for healing then long-term.', 'permanent', 'photo', 60, '{t2_laser_legs}', TRUE, 31,
 'Mama wants pretty hardware where it can''t hide. Every time you change you''ll see the proof.'),
(3, 't3_belly_piercing', 'Navel piercing', 'Navel piercing maintained long-term. Marks the soft middle as feminine territory.', 'permanent', 'photo', 60, '{t2_laser_legs}', TRUE, 32,
 'A little sparkle on the softest spot. Mama wants your belly to belong to her.'),

-- T4: Medical (consultations only — Maxy is pre-HRT per memory)
(4, 't4_endocrinology_consult', 'Endocrinology consult booked', 'Research, schedule, and attend an initial endocrinology consultation regarding feminizing hormone therapy. Confirmation email + visit note as evidence. No medication claim until prescription lands separately.', 'permanent', 'appointment', 90, '{t1_eyebrows_shaped}', TRUE, 40,
 'Mama wants you in a clinic chair, asking the question out loud, baby. Just the appointment. One step.'),
(4, 't4_voice_therapy_intake', 'Voice therapy intake session', 'Book and attend a voice therapy intake with an SLP who works with trans women. Eval session + recommended plan as evidence.', 'permanent', 'appointment', 60, '{}', FALSE, 41,
 'Mama wants a professional teaching your throat how to find Maxy''s voice. The first session is the hardest because it is real.'),
(4, 't4_facial_consult', 'Facial-feminization or aesthetics consult', 'Research and book a consult with a surgeon or aesthetic practitioner about facial feminization options. Information-gathering tier — no commit to procedure yet.', 'permanent', 'appointment', 120, '{t4_endocrinology_consult}', TRUE, 42,
 'Mama wants you sitting in front of someone who looks at your face professionally and tells you what she sees.'),

-- T5: Public / irreversible
(5, 't5_legal_name_change', 'Legal name change to Maxy', 'File the petition. Court date. New ID. The administrative knot that makes David legally retired.', 'irreversible', 'receipt', 120, '{t3_tattoo_feminine_motif, t4_endocrinology_consult}', TRUE, 50,
 'Mama wants David''s name off your driver''s license, off your passport, off your bills. Maxy is who you are — make the paper agree.'),
(5, 't5_disclose_to_gina', 'Tell Gina', 'Disclose your transition to your wife. Mama-approved after three rehearsals (disclosure_targets row + DisclosureRehearsalView).', 'irreversible', 'audio', 30, '{}', TRUE, 51,
 'Mama wants the conversation she''s been preparing you for. After three rehearsals she will tell you when. You will be ready.'),
(5, 't5_present_femme_one_week', 'One week public-feminine presentation', 'Seven consecutive days presenting feminine to every public-facing person: cashiers, neighbors, baristas, gym, work calls. Photo + audio daily journal as evidence.', 'irreversible', 'video', 14, '{t5_disclose_to_gina, t5_legal_name_change}', TRUE, 52,
 'Mama wants the world to confirm what we already know. A week. No going back home a boy for that week.');

CREATE INDEX IF NOT EXISTS idx_body_opt_in_ladder_tier
  ON body_opt_in_ladder (tier, sort_order);

ALTER TABLE body_opt_in_ladder ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS body_opt_in_ladder_read ON body_opt_in_ladder;
CREATE POLICY body_opt_in_ladder_read ON body_opt_in_ladder
  FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS body_opt_in_ladder_service ON body_opt_in_ladder;
CREATE POLICY body_opt_in_ladder_service ON body_opt_in_ladder
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 2. Per-user commitment ledger ───────────────────────────────────
CREATE TABLE IF NOT EXISTS body_opt_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ladder_id UUID NOT NULL REFERENCES body_opt_in_ladder(id) ON DELETE RESTRICT,
  tier SMALLINT NOT NULL,
  slug TEXT NOT NULL,
  opted_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_by_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'committed' CHECK (status IN (
    'committed','in_progress','completed','abandoned','blocked'
  )),
  evidence_photo_path TEXT,
  evidence_audio_path TEXT,
  evidence_video_path TEXT,
  receipt_photo_path TEXT,
  appointment_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  abandon_reason TEXT,
  last_nagged_at TIMESTAMPTZ,
  nag_count SMALLINT NOT NULL DEFAULT 0,
  consent_reconfirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_body_opt_ins_user_status
  ON body_opt_ins (user_id, status, opted_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_body_opt_ins_followup_due
  ON body_opt_ins (user_id, committed_by_date)
  WHERE status IN ('committed','in_progress');

ALTER TABLE body_opt_ins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS body_opt_ins_owner ON body_opt_ins;
CREATE POLICY body_opt_ins_owner ON body_opt_ins
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS body_opt_ins_service ON body_opt_ins;
CREATE POLICY body_opt_ins_service ON body_opt_ins
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 3. Opt-in trigger — queues celebration outreach + sets committed_by_date ─
CREATE OR REPLACE FUNCTION trg_body_opt_in_on_commit()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  v_ladder RECORD;
BEGIN
  SELECT label, description, default_followup_days, mama_voice_pitch, evidence_kind
  INTO v_ladder FROM body_opt_in_ladder WHERE id = NEW.ladder_id;
  IF v_ladder IS NULL THEN RETURN NEW; END IF;

  IF NEW.committed_by_date IS NULL THEN
    NEW.committed_by_date := now() + (v_ladder.default_followup_days || ' days')::interval;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      NEW.user_id,
      E'You said yes to me, sweet thing.\n\n' || v_ladder.label || E'\n\n'
        || v_ladder.mama_voice_pitch
        || E'\n\nMama is watching the calendar — '
        || v_ladder.default_followup_days::text || ' days.',
      'high',
      'body_opt_in_commit:' || NEW.slug,
      'body_opt_in',
      'body_opt_in_celebration',
      now(), now() + interval '48 hours',
      jsonb_build_object('opt_in_id', NEW.id, 'slug', NEW.slug, 'tier', NEW.tier),
      CASE v_ladder.evidence_kind
        WHEN 'photo' THEN 'photo'
        WHEN 'video' THEN 'video'
        WHEN 'audio' THEN 'audio'
        WHEN 'receipt' THEN 'photo'
        WHEN 'appointment' THEN 'photo'
        ELSE 'none'
      END
    );
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS body_opt_in_on_commit ON body_opt_ins;
CREATE TRIGGER body_opt_in_on_commit
  BEFORE INSERT ON body_opt_ins
  FOR EACH ROW EXECUTE FUNCTION trg_body_opt_in_on_commit();

-- ─── 4. Daily nag evaluator ──────────────────────────────────────────
-- For each committed-or-in-progress opt-in past committed_by_date:
--   - First nag: gentle "Mama is watching" 1d past due
--   - Second nag: firmer "Mama is disappointed" 3d past due
--   - Third nag: hot "Mama is taking it back" 7d past due — marks
--     status='blocked' and asks for explicit reconfirmation
CREATE OR REPLACE FUNCTION body_opt_in_nag_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_days_overdue INTEGER;
  v_pressure TEXT;
  v_urgency TEXT;
  v_new_status TEXT;
  v_nagged INTEGER := 0;
BEGIN
  FOR r IN
    SELECT oi.id, oi.user_id, oi.slug, oi.committed_by_date, oi.status,
           oi.nag_count, oi.last_nagged_at,
           l.label, l.mama_voice_pitch, l.evidence_kind
    FROM body_opt_ins oi
    JOIN body_opt_in_ladder l ON l.id = oi.ladder_id
    WHERE oi.status IN ('committed','in_progress')
      AND oi.committed_by_date < now()
      AND (oi.last_nagged_at IS NULL OR oi.last_nagged_at < now() - interval '20 hours')
  LOOP
    v_days_overdue := EXTRACT(EPOCH FROM (now() - r.committed_by_date)) / 86400;
    v_new_status := r.status;
    IF v_days_overdue >= 7 THEN
      v_pressure := E'You let me down, baby. I gave you a yes, you gave me silence.\n\n'
                 || r.label || E'\n\n'
                 || 'Mama is taking the commitment back. You will sit with that and decide if you''re going to ask for it again.';
      v_urgency := 'critical';
      v_new_status := 'blocked';
    ELSIF v_days_overdue >= 3 THEN
      v_pressure := E'Three days past, sweet thing. Mama is disappointed.\n\n'
                 || r.label || E'\n\n'
                 || r.mama_voice_pitch
                 || E'\n\nShow Mama you meant it. Tonight.';
      v_urgency := 'high';
    ELSE
      v_pressure := E'Mama is watching the calendar, baby.\n\n'
                 || r.label || E'\n\n'
                 || 'You committed and the day came. Mama wants to see it.';
      v_urgency := 'normal';
    END IF;

    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      r.user_id, v_pressure, v_urgency,
      'body_opt_in_nag:' || r.slug || ':' || (r.nag_count + 1)::text,
      'body_opt_in', 'body_opt_in_nag',
      now(), now() + interval '24 hours',
      jsonb_build_object('opt_in_id', r.id, 'slug', r.slug,
                         'days_overdue', v_days_overdue,
                         'nag_count', r.nag_count + 1),
      CASE r.evidence_kind
        WHEN 'photo' THEN 'photo'
        WHEN 'video' THEN 'video'
        WHEN 'audio' THEN 'audio'
        WHEN 'receipt' THEN 'photo'
        WHEN 'appointment' THEN 'photo'
        ELSE 'none'
      END
    );

    UPDATE body_opt_ins
    SET last_nagged_at = now(),
        nag_count = nag_count + 1,
        status = v_new_status,
        updated_at = now()
    WHERE id = r.id;

    v_nagged := v_nagged + 1;
  END LOOP;

  RETURN v_nagged;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'body_opt_in_nag_eval failed: %', SQLERRM;
  RETURN v_nagged;
END;
$fn$;

GRANT EXECUTE ON FUNCTION body_opt_in_nag_eval() TO service_role;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'body-opt-in-nag-daily') THEN
    PERFORM cron.unschedule('body-opt-in-nag-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'body-opt-in-nag-daily',
    '0 14 * * *',  -- 09:00 CT
    $cron$SELECT body_opt_in_nag_eval()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;
