-- 260 — Stealth/privacy bundle.
--
-- Discretion features for shared-space use: disguised app icon variants,
-- neutral notification previews, panic-close gesture, optional PIN gate.
-- All toggles are presentational only — the underlying content is
-- unchanged; stealth controls how/where it's displayed.
--
-- Two surfaces:
--
-- - user_state.stealth_settings (jsonb) — per-user toggles. Defaults
--   keep behavior identical to pre-migration (icon=default, no neutral
--   notifications, no panic-close, no PIN). The web-push-dispatch edge
--   fn reads this column at send time to neutralize push payloads when
--   neutral_notifications=true.
--
-- - stealth_pin (separate table) — hashed PIN (PBKDF2-SHA256, salt per
--   row) plus failed-attempt counters and a lockout timestamp. Kept
--   out of user_state because PINs are write-once and lock state is
--   churn-heavy; mixing them would make user_state row updates more
--   expensive on hot paths. RLS owner-only.

-- 1. user_state.stealth_settings
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS stealth_settings JSONB NOT NULL DEFAULT '{
    "icon_variant": "default",
    "neutral_notifications": false,
    "panic_close_enabled": false,
    "pin_lock_enabled": false
  }'::jsonb;

-- 2. stealth_pin
CREATE TABLE IF NOT EXISTS stealth_pin (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_iterations INT NOT NULL DEFAULT 600000,
  pin_set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE stealth_pin ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stealth_pin_select_own ON stealth_pin;
CREATE POLICY stealth_pin_select_own ON stealth_pin
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS stealth_pin_insert_own ON stealth_pin;
CREATE POLICY stealth_pin_insert_own ON stealth_pin
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS stealth_pin_update_own ON stealth_pin;
CREATE POLICY stealth_pin_update_own ON stealth_pin
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS stealth_pin_delete_own ON stealth_pin;
CREATE POLICY stealth_pin_delete_own ON stealth_pin
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION stealth_pin_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stealth_pin_updated_at_trg ON stealth_pin;
CREATE TRIGGER stealth_pin_updated_at_trg
  BEFORE UPDATE ON stealth_pin
  FOR EACH ROW EXECUTE FUNCTION stealth_pin_set_updated_at();
