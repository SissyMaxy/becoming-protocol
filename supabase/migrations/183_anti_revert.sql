-- Block direct deletes on critical tables; force them through quit_attempts flow
CREATE OR REPLACE FUNCTION prevent_critical_deletes() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Direct deletion blocked. This data is permanent. Use the quit attempt flow if you want to remove it.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_shame_journal_delete ON shame_journal;
CREATE TRIGGER block_shame_journal_delete
  BEFORE DELETE ON shame_journal
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();

DROP TRIGGER IF EXISTS block_verification_photos_delete ON verification_photos;
CREATE TRIGGER block_verification_photos_delete
  BEFORE DELETE ON verification_photos
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();

DROP TRIGGER IF EXISTS block_memory_reframings_delete ON memory_reframings;
CREATE TRIGGER block_memory_reframings_delete
  BEFORE DELETE ON memory_reframings
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();

DROP TRIGGER IF EXISTS block_quit_attempts_delete ON quit_attempts;
CREATE TRIGGER block_quit_attempts_delete
  BEFORE DELETE ON quit_attempts
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();

DROP TRIGGER IF EXISTS block_identity_contracts_delete ON identity_contracts;
CREATE TRIGGER block_identity_contracts_delete
  BEFORE DELETE ON identity_contracts
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();

DROP TRIGGER IF EXISTS block_voice_pitch_samples_delete ON voice_pitch_samples;
CREATE TRIGGER block_voice_pitch_samples_delete
  BEFORE DELETE ON voice_pitch_samples
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();

-- Block updates to shame_journal entries (immutable once written)
CREATE OR REPLACE FUNCTION prevent_shame_journal_edits() RETURNS TRIGGER AS $$
BEGIN
  -- Only allow handler_response and approved fields to be updated
  IF NEW.entry_text IS DISTINCT FROM OLD.entry_text
     OR NEW.prompt_used IS DISTINCT FROM OLD.prompt_used
     OR NEW.emotional_intensity IS DISTINCT FROM OLD.emotional_intensity THEN
    RAISE EXCEPTION 'shame_journal entries are immutable. The architect committed. Live with it.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS immutable_shame_journal ON shame_journal;
CREATE TRIGGER immutable_shame_journal
  BEFORE UPDATE ON shame_journal
  FOR EACH ROW EXECUTE FUNCTION prevent_shame_journal_edits();
