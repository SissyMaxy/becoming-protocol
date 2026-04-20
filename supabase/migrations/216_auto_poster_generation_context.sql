-- Migration 216: Auto-poster generation context for retroactive audit.
--
-- Problem: ai_generated_content stores WHAT was posted but nothing about the
-- state, plan, quality score, or voice inputs at generation time. You can see
-- "reply went out to @foo" but not "generated under which handler state,
-- against which narrative arc, with which voice corpus rows, scoring 8/10."
--
-- Fix: Single JSONB column on ai_generated_content and paid_conversations.
-- Shape is free-form — see generation-context.ts for the canonical keys.
-- GIN indexes for narrative_theme / handler_state filtering in audit queries.

ALTER TABLE ai_generated_content
  ADD COLUMN IF NOT EXISTS generation_context JSONB;

ALTER TABLE paid_conversations
  ADD COLUMN IF NOT EXISTS generation_context JSONB;

CREATE INDEX IF NOT EXISTS idx_agc_gen_ctx ON ai_generated_content USING GIN (generation_context);
CREATE INDEX IF NOT EXISTS idx_paid_conv_gen_ctx ON paid_conversations USING GIN (generation_context);

NOTIFY pgrst, 'reload schema';
