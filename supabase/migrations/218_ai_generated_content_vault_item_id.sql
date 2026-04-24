ALTER TABLE ai_generated_content
  ADD COLUMN IF NOT EXISTS vault_item_id UUID REFERENCES content_vault(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_generated_content_vault_item_id
  ON ai_generated_content(vault_item_id)
  WHERE vault_item_id IS NOT NULL;
