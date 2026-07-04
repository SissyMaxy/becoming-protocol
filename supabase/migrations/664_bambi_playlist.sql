-- 664 — bambi_playlist: the operator's own collection of hypnosis files they love.
--
-- We do NOT download or rehost anyone's copyrighted audio/video. This holds only
-- URLs (links to where the file already lives — hypnotube, bambisleep, etc.) plus
-- the user's notes. It's a bookmark list Mommy can sequence: she can flag one as
-- tonight's watch, and the render/outreach layer can point the user to it.

CREATE TABLE IF NOT EXISTS bambi_playlist (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  title        text NOT NULL,
  url          text NOT NULL,
  source       text NOT NULL DEFAULT 'other',   -- hypnotube | bambisleep | youtube | other
  notes        text,
  tags         text[] NOT NULL DEFAULT '{}',
  mommy_pick   boolean NOT NULL DEFAULT false,   -- flagged as tonight's watch
  play_count   integer NOT NULL DEFAULT 0,
  last_played_at timestamptz,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bambi_playlist_user ON bambi_playlist(user_id, active, created_at DESC);

ALTER TABLE bambi_playlist ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY bambi_playlist_owner ON bambi_playlist
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only one Mommy-pick at a time per user: setting a new pick clears the others.
CREATE OR REPLACE FUNCTION trg_bambi_playlist_single_pick()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.mommy_pick THEN
    UPDATE bambi_playlist
      SET mommy_pick = false
      WHERE user_id = NEW.user_id AND id <> NEW.id AND mommy_pick;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS bambi_playlist_single_pick ON bambi_playlist;
CREATE TRIGGER bambi_playlist_single_pick
  AFTER INSERT OR UPDATE OF mommy_pick ON bambi_playlist
  FOR EACH ROW WHEN (NEW.mommy_pick)
  EXECUTE FUNCTION trg_bambi_playlist_single_pick();
