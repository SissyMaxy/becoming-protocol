-- ============================================================================
-- Migration 111: Task Bank Nuclear Audit — Cleanup
-- ============================================================================
-- Soft-deletes 53 tasks across three categories:
--   Pass 2: 17 meta-management / system-analytics tasks (Handler operations, not user tasks)
--   Pass 3:  1 obfuscation-layer violation (pipeline description, not user action)
--   Pass 6: 35 exact duplicate tasks (instruction + domain identical)
--
-- Rule: Every task must pass "Can a person physically do this, in a room,
--        with their body or their voice or a pen, in a single sitting?"
--
-- Reversible: UPDATE task_bank SET active = true WHERE id IN (...);
-- ============================================================================

BEGIN;

-- ── Pass 2: Meta-Management / Handler-Level Operations ──────────────────────
-- These are system analytics, pipeline calculations, and automated checks.
-- The user should never see them — the Handler performs these autonomously.

UPDATE task_bank SET active = false WHERE id IN (
  -- System analytics (gina/system category)
  '3ef0d3a8-f170-4128-86f0-8d20cf351d4b',  -- Acceleration Detection — system triggered
  '6389f37e-9ed0-4394-8b38-8cad297b952b',  -- Channel Stall Protocol — system triggered
  '6ce989db-6414-4b07-a63f-937285b64c79',  -- Monthly Composite Score — spreadsheet calculates
  '770d518a-04a5-4b96-8c1c-661b57523b77',  -- Context Optimization — weekly analysis
  '98ed61e6-ffe1-4aa7-97a2-2634198be25c',  -- Weekly Ladder Position Assessment — analytics
  'a8fcefab-c882-4b95-99eb-4e4ba5a4ea86',  -- Seed Response Scoring — rating system
  'b7740743-9846-4846-9f8f-1b8ffd0a9e53',  -- Cross-Channel Correlation Mapping — analytics
  'be94d615-12ed-4255-8fac-c7e95ff4b7b5',  -- Pipeline Health Check — system review
  'e4313d03-cd68-4767-b0fa-5b14e1c80442',  -- Seed Failure Recovery — system triggered

  -- Pipeline assessments (handler/gina domains)
  '324afa38-fb16-436f-9d99-706e2aebcbf7',  -- BUILD: The weekly measurement dashboard
  '38f4a217-614f-458e-b5e0-089f23d8679b',  -- MONTHLY REPORT: Full diagnostic with trend analysis
  '5fb94bdc-7a0d-415a-9124-6e9d11487dcd',  -- MASTER PIPELINE ASSESSMENT: Monthly composite
  'b2b6b88b-2517-4fc2-91e5-7c2eba02fa9f',  -- Disclosure readiness assessment — reviews accumulated data

  -- System detection (Handler monitors, user doesn't self-audit)
  '752baaf2-a70b-44d8-9dd8-5c1e9c4de135',  -- Withdrawal detection — system documents, not user task

  -- SAFETY checks: preserve content for Handler-level automated reimplementation
  -- These are important functions but NOT user-facing tasks.
  'ae5c03a0-76c7-40b0-a943-d02092f41827',  -- SAFETY: Therapist transparency check → reimpl as Handler automated check
  'bd95661c-2348-452a-a83c-c2b56d90baf7',  -- SAFETY: Quarterly check — is the system isolating her? → reimpl as Handler check
  'd7fed192-5352-4449-8b12-304169686123'   -- SAFETY: Is the arousal architecture creating dependency? → reimpl as Handler check
);
-- Pass 2 count: 17

-- ── Pass 3: Obfuscation Layer Violation ─────────────────────────────────────
-- Pipeline/process description rather than a single doable action.

UPDATE task_bank SET active = false WHERE id IN (
  '3c93fa0f-af08-4392-a636-3ccc4e9c9b5a'   -- Content-to-connection pipeline — process, not action
);
-- Pass 3 count: 1

-- ── Pass 6: Exact Duplicates ────────────────────────────────────────────────
-- Same instruction text + same domain. Keeps the first occurrence (by UUID sort).
-- 35 duplicate copies soft-deleted, 35 originals preserved.

UPDATE task_bank SET active = false WHERE id IN (
  '56aac572-0632-46bc-afe8-0ff767d37e26',  -- dupe: Listen to Bambi IQ reduction file while edging
  '5d313d7c-6f40-4402-b7a3-24ba7720a8f0',  -- dupe: At edge 8+, commit to something you've been avoiding
  '6a2252d9-2046-4fe4-934d-a3de190ad328',  -- dupe: Escalate one Pavlovian anchor
  '790bfd69-9f14-4fe0-808b-a5ca133ca0f7',  -- dupe: Pronoun correction
  '7fa5d0d7-2255-49d9-aec7-b4f2ec5bdbc6',  -- dupe: Complete a full Bambi session (30-45 min)
  '8ad89e5a-105b-4e89-af5a-d20ebed76fe9',  -- dupe: Brainwave entrainment
  '8dc9aa5f-3fc0-4f15-bf9a-61908cc2fa5a',  -- dupe: Deepthroat training
  '8e107111-520b-4172-8a28-1421b1cdc72f',  -- dupe: Watch bondage content
  '8e93cdd0-0da5-4a45-832a-14eed615cbe4',  -- dupe: Watch extreme content
  '8eb9db21-cb47-44d4-8c49-c8ea2dfa6bf5',  -- dupe: Wear plug as anchor
  '9376d449-c43e-4f0e-b616-c1ff471576fe',  -- dupe: Sound trigger
  '9b933123-3ff1-4dd9-ba36-71f49b91bf5e',  -- dupe: Riding technique
  '9dd4301d-0ea4-4cf8-aef2-6c57d2fb8ecd',  -- dupe: Commit: 'I won't cum until [date/condition]'
  'a2e80d1d-1acf-4d87-aad8-25d98f593dfd',  -- dupe: Full Bambi session: Induction + conditioning
  'a55c7f9c-54e3-42f2-afb2-754ae2a37cec',  -- dupe: Extended hypno session 45 min
  'a67f0235-4190-4e00-a582-39f79df3cd10',  -- dupe: Morning protocol
  'a7bab8fb-3cfd-498e-a065-40e52a4e99ed',  -- dupe: Attempt sissygasm while watching hypno
  'a8dd45cf-8bf5-4267-9f2c-52b80b64d80f',  -- dupe: Fantasize about serving
  'aaf51fe0-94de-4a32-a225-7ae67268aa5a',  -- dupe: Before stopping, commit: 'I will [Gina visibility step]'
  'afbc5ea3-a457-44be-89b6-1de068f8b19a',  -- dupe: Cannabis baseline
  'b4389bf8-3f70-4a14-9fe8-b6d79d13616e',  -- dupe: Cum as part of her routine
  'b82805e0-d64f-4ece-bc97-c41417b1d747',  -- dupe: Watch glory hole content
  'ba2168ad-a8ed-45b3-814c-d5ec525946d0',  -- dupe: Go BACK to the squirm
  'bc19f651-bffd-406a-82b7-0c6bb4ce3d1b',  -- dupe: Watch increasingly explicit content
  'c3794561-41aa-4b7a-b691-e12792bb9f2b',  -- dupe: Skip a session on purpose
  'c58bc532-8dc4-412b-bfd3-8bb66625f02a',  -- dupe: Edge to fantasy of complete feminization
  'd17012e7-5ad4-4dc1-bab1-257416699a9e',  -- dupe: Masculine behavior consequence
  'd67bdb2d-1f89-4953-ad39-48d6cc19348d',  -- dupe: Edge to cock content
  'd77416ff-ff71-4484-bcbd-a4f99914ef5e',  -- dupe: Be referred to as an object
  'da99cf57-8676-4dc8-8f99-9e16b90298e4',  -- dupe: Scent anchor
  'de5bcfba-84de-4b3c-a2c6-4c90720242dd',  -- dupe: Edge for 20 min to service content
  'e8b8893e-61de-4f8e-be27-0e8a6c3c6546',  -- dupe: At peak arousal, commit to next irreversible step
  'e9b1291e-fe8c-4404-b7b0-d92d42c6b70b',  -- dupe: Gooning session 30 min
  'effef7db-9e77-43df-bcc6-ce5b181b7747',  -- dupe: Goon for 45 minutes
  'fe6fae79-ccb5-4607-8400-9af455c115cb'   -- dupe: Goon for 60 minutes
);
-- Pass 6 count: 35

-- ── Verification ────────────────────────────────────────────────────────────
-- Total soft-deleted: 17 + 1 + 35 = 53
-- Run after migration to verify:
--   SELECT count(*) FROM task_bank WHERE active = false;  -- should be 53
--   SELECT count(*) FROM task_bank WHERE active = true;   -- should be 1755

COMMIT;
