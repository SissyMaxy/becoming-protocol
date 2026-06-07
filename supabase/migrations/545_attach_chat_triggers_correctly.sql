-- 545 — Validation-pass fix: migs 535 (resistance counter) and 537
-- (pronoun autocorrect) tried to attach their AFTER INSERT triggers
-- to either `chat_messages` or `handler_chat_messages` based on which
-- existed. Neither exists. The actual handler-chat table is
-- `handler_messages` (id/conversation_id/user_id/role/content/...).
--
-- Both triggers attach here cleanly.

DROP TRIGGER IF EXISTS resistance_counter_on_chat ON handler_messages;
CREATE TRIGGER resistance_counter_on_chat AFTER INSERT ON handler_messages
  FOR EACH ROW EXECUTE FUNCTION trg_resistance_counter_on_chat();

DROP TRIGGER IF EXISTS pronoun_autocorrect_on_chat ON handler_messages;
CREATE TRIGGER pronoun_autocorrect_on_chat AFTER INSERT ON handler_messages
  FOR EACH ROW EXECUTE FUNCTION trg_pronoun_autocorrect_on_chat();
