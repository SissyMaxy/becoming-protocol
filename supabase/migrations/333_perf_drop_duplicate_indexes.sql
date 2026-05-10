-- 333_perf_drop_duplicate_indexes.sql
-- Drops one index from each pair flagged by Supabase advisor lint `duplicate_index`.
-- Selection rule: when one index in a pair backs a UNIQUE/PK constraint, keep that one
-- and drop the other. Otherwise keep the lower-OID (older) index. The kept index name
-- is preserved as a comment so rollback is mechanical.
--
-- Rollback: each line below has a sibling `keep` index that already covers the same
-- columns; restoring requires recreating the dropped index from its definition.
-- See `.dup-drops.json` in the source branch for original definitions.

DROP INDEX IF EXISTS public.idx_arousal_check_ins_plan;             -- kept: idx_check_ins_plan
DROP INDEX IF EXISTS public.idx_arousal_check_ins_user_date;        -- kept: idx_check_ins_date
DROP INDEX IF EXISTS public.idx_body_measurements_user_time;        -- kept: idx_body_measurements_user_date
DROP INDEX IF EXISTS public.idx_chastity_milestones_plan;           -- kept: idx_milestones_plan
DROP INDEX IF EXISTS public.idx_daily_arousal_plans_status;         -- kept: idx_daily_plans_status
DROP INDEX IF EXISTS public.idx_daily_tasks_task_id;                -- kept: idx_daily_tasks_task
DROP INDEX IF EXISTS public.idx_escalation_state_user_domain;       -- kept: idx_escalation_state_domain
DROP INDEX IF EXISTS public.idx_gina_interactions_user;             -- kept: idx_gina_interactions_user_id
DROP INDEX IF EXISTS public.idx_gina_voice_samples_user_time;       -- kept: gvs_user_captured_idx
DROP INDEX IF EXISTS public.idx_handler_escalation_plans_user;      -- kept: idx_handler_escalation_plans_user_id
DROP INDEX IF EXISTS public.idx_handler_experiments_user;           -- kept: idx_handler_experiments_user_id
DROP INDEX IF EXISTS public.idx_handler_strategies_user;            -- kept: idx_handler_strategies_user_id
DROP INDEX IF EXISTS public.idx_handler_user_model_user;            -- kept: idx_handler_user_model_user_id
DROP INDEX IF EXISTS public.idx_influence_attempts_recent;          -- kept: idx_influence_attempts_timestamp
DROP INDEX IF EXISTS public.idx_influence_attempts_user;            -- kept: idx_influence_attempts_user_id
DROP INDEX IF EXISTS public.idx_investments_user_id;                -- kept: idx_investments_user
DROP INDEX IF EXISTS public.idx_learned_vulnerabilities_user;       -- kept: idx_learned_vulnerabilities_user_id
DROP INDEX IF EXISTS public.idx_lovense_devices_user_id;            -- kept: idx_lovense_devices_user
DROP INDEX IF EXISTS public.idx_planned_edge_sessions_plan;         -- kept: idx_planned_sessions_plan
DROP INDEX IF EXISTS public.idx_planned_edge_sessions_user_date;    -- kept: idx_planned_sessions_date
DROP INDEX IF EXISTS public.idx_planted_triggers_user;              -- kept: idx_planted_triggers_user_id
DROP INDEX IF EXISTS public.idx_resistance_patterns_user;           -- kept: idx_resistance_patterns_user_id
DROP INDEX IF EXISTS public.idx_task_completions_completed_at;      -- kept: idx_task_completions_date
DROP INDEX IF EXISTS public.idx_task_completions_task_id;           -- kept: idx_task_completions_task
DROP INDEX IF EXISTS public.idx_task_completions_user_id;           -- kept: idx_task_completions_user
DROP INDEX IF EXISTS public.idx_task_resistance_task_id;            -- kept: idx_task_resistance_task
DROP INDEX IF EXISTS public.idx_task_resistance_user_id;            -- kept: idx_task_resistance_user
DROP INDEX IF EXISTS public.twitter_followers_snapshot_unprocessed_idx; -- kept: idx_followers_unprocessed
DROP INDEX IF EXISTS public.twitter_followers_snapshot_user_handle_idx; -- kept: twitter_followers_snapshot_user_id_handle_key (constraint-backed)
DROP INDEX IF EXISTS public.twitter_follows_user_target_idx;        -- kept: twitter_follows_user_id_target_handle_key (constraint-backed)
DROP INDEX IF EXISTS public.idx_user_learning_patterns_user_id;     -- kept: idx_learning_patterns_user
DROP INDEX IF EXISTS public.idx_user_vector_states_user_id;         -- kept: idx_user_vector_states_user
DROP INDEX IF EXISTS public.idx_vector_lock_in_status_user_id;      -- kept: idx_lock_in_status_user
