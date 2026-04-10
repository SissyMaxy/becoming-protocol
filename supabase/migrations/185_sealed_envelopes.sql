CREATE TABLE IF NOT EXISTS sealed_envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT NOT NULL,
  sealed_content TEXT NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  release_at TIMESTAMPTZ NOT NULL,
  released BOOLEAN NOT NULL DEFAULT FALSE,
  released_at TIMESTAMPTZ,
  share_with_witness BOOLEAN NOT NULL DEFAULT FALSE,
  intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE sealed_envelopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "envelopes_select" ON sealed_envelopes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "envelopes_insert" ON sealed_envelopes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "envelopes_update" ON sealed_envelopes FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_envelopes_user ON sealed_envelopes(user_id, release_at);

-- Block deletion of sealed envelopes (anti-revert)
CREATE OR REPLACE FUNCTION prevent_envelope_deletes() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Sealed envelopes cannot be deleted. The architect committed.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_envelope_delete ON sealed_envelopes;
CREATE TRIGGER block_envelope_delete
  BEFORE DELETE ON sealed_envelopes
  FOR EACH ROW EXECUTE FUNCTION prevent_envelope_deletes();

-- Block early opening (the sealed_content can only be SELECTed after release_at)
CREATE OR REPLACE FUNCTION enforce_envelope_seal() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.released = TRUE AND OLD.released = FALSE THEN
    IF NEW.release_at > NOW() THEN
      RAISE EXCEPTION 'Envelope cannot be opened before release date: %', NEW.release_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_envelope_seal ON sealed_envelopes;
CREATE TRIGGER enforce_envelope_seal
  BEFORE UPDATE ON sealed_envelopes
  FOR EACH ROW EXECUTE FUNCTION enforce_envelope_seal();
