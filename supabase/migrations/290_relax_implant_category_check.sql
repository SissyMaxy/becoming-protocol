-- 290 — Drop the implant_category CHECK constraint.
--
-- 2026-05-07 CI regression failure: detect_identity_dimension_decay
-- function tries to INSERT into memory_implants with a category not in
-- the migration-284 enum list, hitting
-- memory_implants_implant_category_check.
--
-- Categories on memory_implants are an organizational tag, not a
-- security boundary. Adding new categories at the function level should
-- not require a migration to whitelist them — that's the wrong blast
-- radius for a tag rename. Dropping the CHECK lets new categories land
-- without coupling. Existing categories continue to work.
--
-- If we ever want category-level invariants again, do it via a runtime
-- audit (mommy_voice_leaks-style) that flags unexpected categories,
-- not a migration-blocked CHECK.

DO $$
DECLARE
  c_name TEXT;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'memory_implants'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%implant_category%';
  IF c_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE memory_implants DROP CONSTRAINT ' || quote_ident(c_name);
  END IF;
END $$;
