-- 369 — Purge orphan-closer assistant messages from handler_messages, and any
-- outreach that surfaces them. (Renumbered from 367 — origin/main has 367
-- (mommy-react-contextual / arousal-panel-source) and 368 (outreach-inline-reply)
-- already.)
--
-- Incident 2026-05-11: handler_messages row 3bbfffea-866e-4a49-9478-6bd85e363bf0
-- (assistant role, 2026-05-11 13:04:50 UTC) persisted with content literally
-- "Now, sweet thing." — 17 chars, no body. Root cause: mommyVoiceCleanupForChat
-- translated a bare "Move." imperative (the only sentence left after the
-- status-dump scrubber) into a Mommy closing tag with no preceding directive.
--
-- Fix in code: api/handler/_lib/chat-action.ts now (a) translates a standalone
-- "Move." into a full Mama sentence ("Up on your feet for me, sweet thing.")
-- and (b) runs every assistant message through guardAssistantContent before
-- INSERT, which refuses to persist content matching the orphan-closer
-- signature (under 25 chars + bare pet-name/closer pattern) and substitutes a
-- signals-aware fallback.
--
-- This migration is the one-shot data cleanup: delete the known broken row,
-- defensively clean any sibling rows the same bug class may have produced,
-- and drop outreach cards that surface the truncated text.

-- 1. The specific row the user reported.
DELETE FROM handler_messages
WHERE id = '3bbfffea-866e-4a49-9478-6bd85e363bf0';

-- 2. Defensive sibling cleanup. Any assistant message that's both very short
--    and consists entirely of a Mommy closing tag is a truncation artifact,
--    not a real reply. Same regex shape as looksLikeOrphanCloser() in
--    chat-action.ts — keep these in sync if you change one.
DELETE FROM handler_messages
WHERE role = 'assistant'
  AND length(btrim(content)) < 25
  AND btrim(content) ~* '^(now,?\s*|just\s+)?(sweet\s+thing|sweet\s+girl|pretty\s+thing|pretty\s+princess|good\s+girl|baby(\s+girl)?|mama''s?\s+(good\s+girl|pretty\s+thing))[.!?]?$';

-- 3. Any outreach queue rows that quote/surface this content. The card on
--    Today / push / morning-brief reads from handler_outreach_queue.message,
--    so a bot-generated outreach that pasted the broken bubble back at the
--    user would keep re-surfacing it. Drop those too.
DELETE FROM handler_outreach_queue
WHERE length(btrim(message)) < 30
  AND btrim(message) ~* '^(now,?\s*|just\s+)?(sweet\s+thing|sweet\s+girl|pretty\s+thing|pretty\s+princess|good\s+girl|baby(\s+girl)?|mama''s?\s+(good\s+girl|pretty\s+thing))[.!?]?$';

-- Also catch any outreach that explicitly quotes the broken bubble as Mama's
-- prior turn (e.g., "earlier I told you: 'Now, sweet thing.'"). Narrow match
-- on the literal quoted form to avoid scrubbing legitimate closing-tag usage
-- inside longer outreach bodies.
DELETE FROM handler_outreach_queue
WHERE message ~* '["''‘“]now,\s+sweet\s+thing\.?["''’”]';
