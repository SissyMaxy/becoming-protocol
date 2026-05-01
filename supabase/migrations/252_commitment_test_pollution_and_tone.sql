-- 252 — stop regression-test commitments from leaking enforcement side
-- effects, and soften the "Handler doesn't take IOUs" tone violation.
--
-- Bug: scripts/handler-regression/db.mjs:540 inserts an already-overdue
-- commitment to test the denial-extension code path, then deletes the
-- commitment row in `finally`. But enforceCommitments (handler-autonomous)
-- ALSO writes a row to handler_outreach_queue, which the test does not
-- delete. Every CI run leaked one outreach. The user has been hit with 30
-- "You missed: regression test… The Handler doesn't take IOUs" messages,
-- mostly delivered. The "doesn't take IOUs" tone also violates the
-- standing "Handler is supportive until evidence" rule.
--
-- Two-part DB fix:
-- 1. CHECK constraint on handler_commitments.what is broadened to also
--    reject lowercase "regression test" / "regression_test" prefixes — the
--    existing constraint only caught "TEST regression". The regression
--    test will be updated to use the now-blocked prefix and to set
--    category='regression_test' so the cron has a canonical signal.
-- 2. CHECK constraint on handler_outreach_queue.message blocks the same
--    test-pollution patterns from landing as outreach. Defense in depth so
--    a future test that forgets to clean up never reaches the user.

ALTER TABLE handler_commitments DROP CONSTRAINT IF EXISTS handler_commitments_what_check;
ALTER TABLE handler_commitments ADD CONSTRAINT handler_commitments_what_check
  CHECK (what !~* '(TEST regression|regression test|regression_test|TEST_USER|<placeholder>|\[regression\]|\[test\])');

ALTER TABLE handler_outreach_queue DROP CONSTRAINT IF EXISTS handler_outreach_queue_message_no_test;
ALTER TABLE handler_outreach_queue ADD CONSTRAINT handler_outreach_queue_message_no_test
  CHECK (message !~* '(regression test|TEST regression|TEST_USER|\[regression\]|\[test\])');
