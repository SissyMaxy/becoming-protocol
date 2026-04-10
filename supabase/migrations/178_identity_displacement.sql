CREATE TABLE IF NOT EXISTS identity_displacement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  log_date DATE NOT NULL,
  feminine_self_refs INTEGER DEFAULT 0,
  masculine_self_refs INTEGER DEFAULT 0,
  feminine_name_uses INTEGER DEFAULT 0,
  masculine_name_uses INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  displacement_score NUMERIC GENERATED ALWAYS AS (
    CASE
      WHEN (feminine_self_refs + masculine_self_refs + feminine_name_uses + masculine_name_uses) = 0
      THEN NULL
      ELSE (feminine_self_refs + feminine_name_uses)::NUMERIC /
           NULLIF(feminine_self_refs + masculine_self_refs + feminine_name_uses + masculine_name_uses, 0)
    END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, log_date)
);

ALTER TABLE identity_displacement_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "identity_displacement_select" ON identity_displacement_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "identity_displacement_insert" ON identity_displacement_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "identity_displacement_update" ON identity_displacement_log FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_displacement_user ON identity_displacement_log(user_id, log_date DESC);
