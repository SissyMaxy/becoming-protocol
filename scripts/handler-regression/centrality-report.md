# Handler-Centrality Audit

Generated: 2026-04-29T13:45:43.211Z

Each function below writes a user-facing artifact (decree, commitment, outreach, confession prompt, etc.) **without first reading any Handler-state table**. The artifact is therefore generated without reference to the current persona, phase, mode, slip count, or recent directives — it cannot speak with Handler authority.

Memory rule: `feedback_handler_is_singular_authority.md`. Refactor each entry to read at least one of: `user_state`, `handler_persona`, `handler_directives`, `handler_memory`, `handler_daily_plans`, `handler_briefing`, `compliance_state`, `denial_streaks`, `chastity_sessions` — before producing the artifact.

**Allowed-list (skipped):** functions in `api/handler/chat.ts`, `supabase/functions/handler-autonomous/index.ts`, `supabase/functions/handler-outreach-auto/index.ts` are exempt because they ARE the Handler — their callers have already loaded state.

## Status: CLEAN

No Handler-centrality violations detected outside the allow-list.