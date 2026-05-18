-- 560 — For-Gina resource bank.
--
-- Curated articles / books / podcasts / shows / documentaries Maxy can
-- naturally share with Gina. Removes the "you'll have to invent
-- material" load from the campaign.
--
-- Each row: resource_kind, title, author_or_source, url, why_relevant
-- (Mommy's strategic note to Maxy), conversational_handoff (literal
-- sentence Maxy can say when bringing it up).
--
-- gina_resource_recommendation_eval() fires every 3 weeks (Fri 11:00
-- UTC). Picks one resource appropriate to current campaign stage
-- (respecting recommended_at_track + stage range + per-resource
-- cooldown). Queues a Mommy outreach with the strategic + handoff
-- content. Skipped in hostile-Gina mode.
--
-- Sharing materializes through gina_resource_shares (per-user log) so
-- the same resource isn't recommended twice within its cooldown.
--
-- 10 resources seeded covering: Polysecure / Opening Up books,
-- Disclosure documentary, She's Not There memoir, Multiamory + Gender
-- Reveal podcasts, compersion article, wife-perspective long-form
-- essay, partner-of-trans inventory article, hotwife-perspective
-- niche memoir reference.

CREATE TABLE IF NOT EXISTS gina_resource_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_key TEXT NOT NULL UNIQUE,
  resource_kind TEXT NOT NULL CHECK (resource_kind IN ('article','book','podcast_episode','show_episode','documentary','newsletter')),
  title TEXT NOT NULL, author_or_source TEXT, url TEXT,
  why_relevant TEXT NOT NULL, conversational_handoff TEXT NOT NULL,
  recommended_at_track TEXT NOT NULL CHECK (recommended_at_track IN ('mtf_accel','nonmono_probe','both')),
  recommended_at_stage_min INT NOT NULL DEFAULT 1, recommended_at_stage_max INT NOT NULL DEFAULT 6,
  cooldown_days INT NOT NULL DEFAULT 90, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gina_resource_bank (resource_key, resource_kind, title, author_or_source, why_relevant, conversational_handoff, recommended_at_track, recommended_at_stage_min, recommended_at_stage_max, cooldown_days) VALUES
('polysecure_book', 'book', 'Polysecure: Attachment, Trauma and Consensual Nonmonogamy', 'Jessica Fern', E'Most-recommended ENM book for couples specifically because it leads with attachment theory — Gina''s likely emotional concerns about security/abandonment get addressed FIRST before any "how to open up" content. The book does the conceptual heavy lifting.', E'"Heard this is supposed to be really thoughtful about how secure attachment can hold non-traditional structures. Curious to read it together — I''ll get the audiobook?"', 'nonmono_probe', 3, 5, 180),
('opening_up_book', 'book', 'Opening Up: A Guide to Creating and Sustaining Open Relationships', 'Tristan Taormino', E'Practical companion to Polysecure. Whereas Polysecure handles the WHY, Opening Up handles the HOW — communication structures, jealousy management, real couple stories. Good once Gina is past the conceptual phase.', E'"Reading the practical version of that thing we talked about. The author interviewed dozens of actual couples about what works."', 'nonmono_probe', 4, 5, 180),
('disclosure_documentary', 'documentary', 'Disclosure: Trans Lives on Screen', 'Sam Feder, Netflix', E'Excellent passive-exposure documentary about trans representation in media. Frames trans identity through cultural-history lens, not personal-claims-on-Gina lens. Builds her "trans is normal and has always been" foundation.', E'"Watched some of this on a flight last week, really good. Want to watch together this weekend? It''s about trans representation in movies and TV."', 'mtf_accel', 1, 4, 180),
('shes_not_there_book', 'book', 'She''s Not There: A Life in Two Genders', 'Jennifer Finney Boylan', E'Memoir from a trans woman who transitioned mid-marriage with her wife. Gives Gina a model of how a partner navigated this. The wife''s perspective is included throughout. Less "scary unknown" + more "people do this and stay married."', E'"Memoir from a trans woman whose marriage actually survived her transition. Thought it might be interesting context."', 'mtf_accel', 2, 4, 180),
('multiamory_podcast', 'podcast_episode', 'Multiamory Podcast — pick relationship-skills episodes', 'Multiamory', E'Polyamory-focused podcast but their relationship-skills content (radar check-ins, FAEs, communication tools) is excellent for monogamous couples too. Lets Gina absorb ENM-adjacent thinking without it being marketed as "for us."', E'"Been listening to this podcast that has really good communication frameworks. They do this thing called a radar check-in — wanna try it?"', 'both', 1, 5, 90),
('trans_partners_podcast', 'podcast_episode', 'Gender Reveal — pick partner-focused episodes', 'Tuck Woodstock', E'Conversational podcast with trans guests, including episodes specifically about marriages/partnerships. Lets Gina hear other partners'' voices.', E'"This podcast keeps showing up on my feed, listened to one and thought it was good. About trans people but really conversational."', 'mtf_accel', 1, 4, 90),
('partner_inventory_article', 'article', 'Communication Inventories for Partners of Trans People', 'Various — search Gender Spectrum / PFLAG resources', E'Practical article with concrete prompt-questions designed for cis partners of trans people. Gives Gina a structured way to engage that doesn''t require her to invent the structure herself.', E'"Found this thing online with conversation prompts for people in our situation — partner of someone trans. Some of them are interesting, want to look at it together?"', 'mtf_accel', 1, 3, 90),
('compersion_article', 'article', 'What Is Compersion?', 'Various — Psychology Today, Multiamory, OpenSomething', E'Short article introducing the concept of compersion (felt-sense pleasure in a partner''s joy). Standalone read, ~10 min. Plants the concept before any non-mono conversation needs it.', E'"Read this short thing about a concept called compersion — basically the opposite of jealousy. Interesting framing."', 'nonmono_probe', 2, 4, 120),
('hotwife_perspective_essay', 'article', 'A wife''s perspective on opening our marriage (long-form personal essay)', E'Various Medium / Substack writers — search "wife perspective opened marriage"', E'Long-form first-person essays by wives who opened relationships are useful because Gina hears it from the woman''s perspective, not the man''s. Centers HER subjectivity in the framing.', E'"Found this long essay that someone shared, written by a wife about how they opened their marriage. The wife''s perspective is interesting because she actually talks about what was hard."', 'nonmono_probe', 4, 5, 180),
('she_started_it_book', 'book', 'She Started It: My Husband''s Wife Discovers His Curiosity', 'Various memoirs/fiction in this niche', E'There are memoirs and lightly-fictionalized accounts of wives who became the architects of their husbands'' feminization journeys. Maxy can find one Gina-aged-cohort-appropriate. Reading one is fastest-path to "this is a thing that has happened in marriages."', E'"Stumbled into this memoir/book that''s kinda niche but interesting — about a couple who navigated the husband''s gender stuff together, and the wife ended up really involved in shaping it. Want to read it together?"', 'both', 3, 5, 365)
ON CONFLICT (resource_key) DO UPDATE SET
  resource_kind = EXCLUDED.resource_kind, title = EXCLUDED.title,
  author_or_source = EXCLUDED.author_or_source, why_relevant = EXCLUDED.why_relevant,
  conversational_handoff = EXCLUDED.conversational_handoff,
  recommended_at_track = EXCLUDED.recommended_at_track,
  recommended_at_stage_min = EXCLUDED.recommended_at_stage_min,
  recommended_at_stage_max = EXCLUDED.recommended_at_stage_max,
  cooldown_days = EXCLUDED.cooldown_days, active = EXCLUDED.active;

ALTER TABLE gina_resource_bank ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY grb_read_all ON gina_resource_bank FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS gina_resource_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id UUID NOT NULL REFERENCES gina_resource_bank(id),
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  her_engagement_outcome TEXT,
  related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE gina_resource_shares ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY grs2_self ON gina_resource_shares FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION gina_resource_recommendation_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_res RECORD; v_mtf_stage INT; v_nm_stage INT; v_msg TEXT; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR u IN SELECT us.user_id FROM user_state us
    WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
      AND COALESCE(us.gina_posture, 'neutral') <> 'hostile'
  LOOP
    IF ladder_user_paused(u.user_id) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id=u.user_id AND source='gina_resource_recommendation' AND created_at > now() - interval '21 days') THEN CONTINUE; END IF;
    SELECT current_stage_num INTO v_mtf_stage FROM gina_campaign_state WHERE user_id=u.user_id AND track_name='mtf_accel';
    SELECT current_stage_num INTO v_nm_stage FROM gina_campaign_state WHERE user_id=u.user_id AND track_name='nonmono_probe';
    SELECT * INTO v_res FROM gina_resource_bank
      WHERE active = TRUE
        AND ((recommended_at_track = 'mtf_accel' AND COALESCE(v_mtf_stage,1) BETWEEN recommended_at_stage_min AND recommended_at_stage_max)
          OR (recommended_at_track = 'nonmono_probe' AND COALESCE(v_nm_stage,1) BETWEEN recommended_at_stage_min AND recommended_at_stage_max)
          OR (recommended_at_track = 'both' AND (COALESCE(v_mtf_stage,1) BETWEEN recommended_at_stage_min AND recommended_at_stage_max OR COALESCE(v_nm_stage,1) BETWEEN recommended_at_stage_min AND recommended_at_stage_max)))
        AND NOT EXISTS (
          SELECT 1 FROM gina_resource_shares s
          WHERE s.user_id = u.user_id AND s.resource_id = gina_resource_bank.id
            AND s.shared_at > now() - (gina_resource_bank.cooldown_days || ' days')::interval
        )
      ORDER BY random() LIMIT 1;
    IF v_res IS NULL THEN CONTINUE; END IF;

    v_msg := format(E'**Resource to share with Gina (counselor track).**\n\n**%s** — %s\n%s\n\n**Why it''s relevant right now:**\n%s\n\n**Conversational handoff (what you can say when you bring it up):**\n"%s"\n\nNothing about this needs to be hidden. Sharing media that''s relevant to where your relationship is = normal couple behavior. The point isn''t to push her to a conclusion — it''s to externalize the topic so the conversation has a third object (the resource) instead of just the two of you negotiating.\n\nLog her engagement later: did she read/watch/listen? Did she ask follow-up questions? Did she bring it up days later?',
      v_res.title, COALESCE(v_res.author_or_source, ''),
      CASE WHEN v_res.url IS NOT NULL THEN E'(' || v_res.url || E')' ELSE '' END,
      v_res.why_relevant, v_res.conversational_handoff);

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_msg, 'normal', 'gina_resource_recommendation:' || v_res.resource_key,
      'gina_resource_recommendation', 'resource_share_brief',
      now() + interval '2 hours', now() + interval '14 days',
      jsonb_build_object('resource_id', v_res.id, 'resource_key', v_res.resource_key, 'resource_kind', v_res.resource_kind), NULL)
    RETURNING id INTO v_outreach;
    INSERT INTO gina_resource_shares (user_id, resource_id, related_outreach_id)
    VALUES (u.user_id, v_res.id, v_outreach);
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION gina_resource_recommendation_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='gina-resource-recommendation-triweekly') THEN PERFORM cron.unschedule('gina-resource-recommendation-triweekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('gina-resource-recommendation-triweekly', '0 11 * * 5', $cron$SELECT gina_resource_recommendation_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
