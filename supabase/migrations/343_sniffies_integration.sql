-- 341 — Sniffies integration (import-driven hookup-chat ingestion)
--
-- Sniffies is a hookup app. It has no public API, so the integration is
-- import-driven: the user pastes / uploads chat screenshots or text, the
-- system extracts contacts + messages, and the persona uses extracted
-- patterns to ground recall, dares, and slip detection in real hookup
-- life — names she's said things to, kinks she's expressed in the wild,
-- ghosting patterns she's actually committed.
--
-- Privacy floor (HIGH):
--   - DEFAULT OFF on every flag. Opt-in import-by-import.
--   - RLS owner-only across every sniffies_* table.
--   - Stealth-mode push neutralization is mandatory (regression test in
--     src/__tests__/lib/sniffies-push-stealth.test.ts).
--   - Hard-reset wipes via the cascade (REFERENCES auth.users(id) ON
--     DELETE CASCADE on every table) PLUS the dynamic
--     hard_reset_user_data RPC introduced by feature/hard-reset-2026-04-30.
--     The 'sniffies-imports' bucket must be added to the STORAGE_BUCKETS
--     list in supabase/functions/hard-reset/index.ts when both branches
--     land — this migration leaves a doc anchor below.
--   - Per-contact `excluded_from_persona` blocks any persona use of that
--     contact's quotes; per-message `excluded` blocks single messages.
--   - Operator-only deletes are explicit DELETE statements via the UI;
--     row-level RLS allows the user to delete any contact + cascading
--     messages without account deletion.
--
-- Sibling-branch coexistence:
--   - public-dares-engine uses migrations 339-340; this is 341.
--   - sniffies-recall references public_dare_assignments via soft pointer
--     only; nothing here REFERENCES the public_dares schema.

-- ─── 1. sniffies_contacts ───────────────────────────────────────────────
-- One row per Sniffies hookup contact. The user fills in display_name
-- (or accepts an "Anon-N" placeholder); kinks_mentioned and outcomes
-- accumulate from extraction passes; excluded_from_persona is the
-- per-contact privacy switch.
CREATE TABLE IF NOT EXISTS sniffies_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  display_name TEXT NOT NULL,
  -- Free-form; "kinks_mentioned" is what SHE said to him, not the other
  -- way around — the extraction prompt is biased to outbound user-side
  -- kink talk because the persona's leverage is what she admitted.
  kinks_mentioned TEXT[] NOT NULL DEFAULT '{}',
  -- Limited to a small enum so the slip detector can match on them.
  outcomes TEXT[] NOT NULL DEFAULT '{}' CHECK (
    outcomes <@ ARRAY['met', 'ghosted', 'met_then_ghosted', 'ongoing', 'blocked', 'planning']::TEXT[]
  ),
  notes TEXT,
  -- The privacy override. When true, no persona surface (recall, tease,
  -- public-dare context) ever quotes this contact.
  excluded_from_persona BOOLEAN NOT NULL DEFAULT FALSE,

  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sniffies_contacts_user_seen
  ON sniffies_contacts(user_id, last_seen_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_sniffies_contacts_user_excluded
  ON sniffies_contacts(user_id, excluded_from_persona);

ALTER TABLE sniffies_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sniffies_contacts_owner ON sniffies_contacts;
CREATE POLICY sniffies_contacts_owner ON sniffies_contacts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sniffies_contacts_service ON sniffies_contacts;
CREATE POLICY sniffies_contacts_service ON sniffies_contacts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. sniffies_chat_imports ───────────────────────────────────────────
-- One row per upload. source_blob_path points into the sniffies-imports
-- private bucket. extraction_summary captures aggregate counts so the
-- UI can render a digest without scanning sniffies_chat_messages.
CREATE TABLE IF NOT EXISTS sniffies_chat_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_kind TEXT NOT NULL CHECK (source_kind IN (
    'screenshot', 'text_paste', 'export_file'
  )),
  -- Object-key path inside the private 'sniffies-imports' bucket.
  -- NULL when source_kind = 'text_paste' (text is held inline in the
  -- extraction summary's raw_text fragment until a message row is created).
  source_blob_path TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_status IN (
    'pending', 'processing', 'processed', 'failed', 'manual_review'
  )),
  -- Aggregate counts: { contacts: N, messages: M, by_contact: { name: count }, kinks: [...] }
  extraction_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Redaction signals from the extraction pass: phones / addresses /
  -- financial-info hits. If non-empty, the import lands in
  -- 'manual_review' instead of 'processed'.
  redaction_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_text TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sniffies_imports_user_status
  ON sniffies_chat_imports(user_id, extraction_status);
CREATE INDEX IF NOT EXISTS idx_sniffies_imports_user_imported
  ON sniffies_chat_imports(user_id, imported_at DESC);

ALTER TABLE sniffies_chat_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sniffies_imports_owner ON sniffies_chat_imports;
CREATE POLICY sniffies_imports_owner ON sniffies_chat_imports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sniffies_imports_service ON sniffies_chat_imports;
CREATE POLICY sniffies_imports_service ON sniffies_chat_imports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. sniffies_chat_messages ──────────────────────────────────────────
-- Extracted message-level rows. user_id is denormalized for RLS speed
-- (vs. joining through import_id every read). text is the actual
-- conversation content; treat as the most-private data in the schema.
CREATE TABLE IF NOT EXISTS sniffies_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  import_id UUID NOT NULL REFERENCES sniffies_chat_imports(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES sniffies_contacts(id) ON DELETE SET NULL,

  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  text TEXT NOT NULL,
  -- Extraction-best-effort. NULL when the source had no timestamp.
  message_at TIMESTAMPTZ,
  kink_tags TEXT[] NOT NULL DEFAULT '{}',
  -- Per-message exclude switch. Honored by every persona surface
  -- (recall, tease, public-dare context, slip evidence).
  excluded BOOLEAN NOT NULL DEFAULT FALSE,
  -- LLM-flagged content that needs operator review before any persona
  -- use. The extractor sets this when redaction signal hits but content
  -- could not be cleanly removed.
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sniffies_msg_user_contact
  ON sniffies_chat_messages(user_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_sniffies_msg_user_direction_excluded
  ON sniffies_chat_messages(user_id, direction, excluded);
CREATE INDEX IF NOT EXISTS idx_sniffies_msg_import
  ON sniffies_chat_messages(import_id);

ALTER TABLE sniffies_chat_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sniffies_msg_owner ON sniffies_chat_messages;
CREATE POLICY sniffies_msg_owner ON sniffies_chat_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sniffies_msg_service ON sniffies_chat_messages;
CREATE POLICY sniffies_msg_service ON sniffies_chat_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. sniffies_settings ───────────────────────────────────────────────
-- One row per user. Every flag defaults FALSE — the persona surfaces all
-- read this row first and bail when the relevant flag is off.
CREATE TABLE IF NOT EXISTS sniffies_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Master switch. When false, no Sniffies-related code runs at all.
  sniffies_integration_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Granular: persona may quote / weave Sniffies content into recall &
  -- tease. False blocks all persona use even when integration_enabled.
  persona_use_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Granular: public-dare generator may name a contact in a dare
  -- ("wear the panties you mentioned to Mark"). Strictly opt-in.
  dares_use_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Granular: ghosting patterns become slip-eligible events.
  slip_use_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sniffies_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sniffies_settings_owner ON sniffies_settings;
CREATE POLICY sniffies_settings_owner ON sniffies_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS sniffies_settings_service ON sniffies_settings;
CREATE POLICY sniffies_settings_service ON sniffies_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 5. updated_at triggers ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_sniffies_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_touch_sniffies_contacts ON sniffies_contacts;
CREATE TRIGGER trg_touch_sniffies_contacts
  BEFORE UPDATE ON sniffies_contacts
  FOR EACH ROW EXECUTE FUNCTION touch_sniffies_updated_at();

DROP TRIGGER IF EXISTS trg_touch_sniffies_imports ON sniffies_chat_imports;
CREATE TRIGGER trg_touch_sniffies_imports
  BEFORE UPDATE ON sniffies_chat_imports
  FOR EACH ROW EXECUTE FUNCTION touch_sniffies_updated_at();

DROP TRIGGER IF EXISTS trg_touch_sniffies_settings ON sniffies_settings;
CREATE TRIGGER trg_touch_sniffies_settings
  BEFORE UPDATE ON sniffies_settings
  FOR EACH ROW EXECUTE FUNCTION touch_sniffies_updated_at();

-- ─── 6. Storage bucket: sniffies-imports ────────────────────────────────
-- Private bucket. 50 MB per object, image / text / json MIME only.
-- Convention: object key starts with `<user.id>/...` so the
-- folder-prefix RLS pattern (storage.foldername(name))[1] = auth.uid()
-- works for SELECT / INSERT / DELETE.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sniffies-imports',
  'sniffies-imports',
  FALSE,
  52428800, -- 50 MB
  ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/heic',
    'text/plain', 'text/csv',
    'application/json', 'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Folder-prefix RLS — owner-only across the bucket.
DROP POLICY IF EXISTS sniffies_imports_select ON storage.objects;
CREATE POLICY sniffies_imports_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'sniffies-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS sniffies_imports_insert ON storage.objects;
CREATE POLICY sniffies_imports_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'sniffies-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS sniffies_imports_update ON storage.objects;
CREATE POLICY sniffies_imports_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'sniffies-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS sniffies_imports_delete ON storage.objects;
CREATE POLICY sniffies_imports_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'sniffies-imports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 7. Hard-reset coverage anchor ──────────────────────────────────────
-- The hard-reset feature (sibling branch feature/hard-reset-2026-04-30)
-- iterates every public.* table with a user_id column via the
-- hard_reset_user_data RPC. All four sniffies_* tables qualify and will
-- be wiped automatically. The bucket 'sniffies-imports' must additionally
-- be added to the STORAGE_BUCKETS list in
-- supabase/functions/hard-reset/index.ts at integration time. This
-- function exists as a no-op marker so a CI grep for
-- 'sniffies_hard_reset_marker' can verify the addition.
CREATE OR REPLACE FUNCTION public.sniffies_hard_reset_marker()
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT 'sniffies-imports'::text;
$$;
