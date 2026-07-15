# Data Model: Delegated Body Authority

Created: 2026-07-13

## Principles

- Store authority as a revocable contract, not an implied user preference.
- Store command decisions separately from verification evidence.
- Store derived biometric summaries by default; raw payloads require explicit retention purpose.
- Keep safety and confidence state on every command/session decision.
- Use RLS for all user data. OAuth tokens remain service-side only.

## Tables

### delegated_authority_contracts

Purpose: Active and historical delegated body authority contracts.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `status text not null check (status in ('draft','active','paused','domain_paused','revoked','expired'))`
- `authority_level text not null default 'delegated_full'`
- `domains text[] not null`
- `intensity_ceiling integer not null default 3`
- `proof_strictness text not null default 'standard'`
- `escalation_default boolean not null default true`
- `data_sources jsonb not null default '{}'`
- `proof_lanes jsonb not null default '{}'`
- `safety_limits jsonb not null default '{}'`
- `hard_limits jsonb not null default '{}'`
- `retention_policy jsonb not null default '{}'`
- `notification_privacy text not null default 'neutral'`
- `consented_at timestamptz`
- `paused_at timestamptz`
- `revoked_at timestamptz`
- `expires_at timestamptz`
- `version integer not null default 1`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `(user_id, status)`
- `(user_id, consented_at desc)`

RLS:

- User can read own contract summaries.
- User can insert/update own contract through safe RPCs.
- Service role can write audit-safe status changes.

### receptivity_scores

Purpose: Domain-specific readiness snapshots.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `contract_id uuid references delegated_authority_contracts(id)`
- `mode text not null check (mode in ('exercise','recovery','nutrition','measurement','meditation','reconditioning','hypno','private_high_stimulation'))`
- `score numeric not null check (score >= 0 and score <= 100)`
- `readiness_band text not null check (readiness_band in ('blocked','low','moderate','high','excellent'))`
- `confidence_tier text not null check (confidence_tier in ('C0','C1','C2','C3','C4'))`
- `recommended_window_start timestamptz`
- `recommended_window_end timestamptz`
- `factors jsonb not null default '{}'`
- `contraindications jsonb not null default '{}'`
- `source_metrics jsonb not null default '{}'`
- `source_freshness jsonb not null default '{}'`
- `scored_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`

Indexes:

- `(user_id, mode, scored_at desc)`
- `(user_id, readiness_band, scored_at desc)`

RLS:

- User can read own scores.
- Scores written by service role/RPC only.

### authority_commands

Purpose: Visible instructions issued by the app.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `contract_id uuid not null references delegated_authority_contracts(id)`
- `receptivity_score_id uuid references receptivity_scores(id)`
- `command_kind text not null`
- `domain text not null`
- `title text not null`
- `instruction text not null`
- `minimum_viable_completion text`
- `reason text not null`
- `source_inputs jsonb not null default '{}'`
- `proof_requirements jsonb not null default '{}'`
- `missed_outcome text not null default 'reschedule_or_review'`
- `safety_state text not null default 'unchecked'`
- `confidence_tier text not null check (confidence_tier in ('C0','C1','C2','C3','C4'))`
- `escalation_level integer not null default 0`
- `status text not null check (status in ('draft','surfaced','accepted','in_progress','completed','partial','missed','paused','blocked','review_needed','voided'))`
- `due_at timestamptz`
- `expires_at timestamptz`
- `surfaced_at timestamptz`
- `accepted_at timestamptz`
- `completed_at timestamptz`
- `created_by text not null default 'body_authority_orchestrator'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `(user_id, status, due_at)`
- `(user_id, domain, created_at desc)`
- `(contract_id, created_at desc)`

Rules:

- `surfaced_at` is required before a command can count as missed.
- Commands cannot be escalated when `confidence_tier` is `C0` or `C4`.

### command_verifications

Purpose: Evidence and decision result for a command.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `command_id uuid not null references authority_commands(id)`
- `confidence text not null check (confidence in ('none','self_reported','structured_log','sensor_supported','photo_supported','high_confidence','review_needed'))`
- `proof_sources jsonb not null default '{}'`
- `whoop_workout_id text`
- `biometric_session_id uuid`
- `body_metric_ids uuid[]`
- `photo_path text`
- `note text`
- `user_correction text`
- `verified_at timestamptz not null default now()`
- `needs_review boolean not null default false`
- `reason text`
- `created_at timestamptz not null default now()`

Indexes:

- `(user_id, command_id)`
- `(user_id, verified_at desc)`

Rules:

- Photo proof requires explicit active proof lane.
- Private/intimate image proof is not supported.

### biometric_sessions

Purpose: App-managed biometric session lifecycle for exercise, meditation, hypno, and optional private high-stimulation.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `contract_id uuid references delegated_authority_contracts(id)`
- `command_id uuid references authority_commands(id)`
- `session_kind text not null check (session_kind in ('exercise','meditation','reconditioning','hypno','private_high_stimulation','recovery','measurement'))`
- `session_source text not null default 'body_authority'`
- `planned_duration_seconds integer`
- `started_at timestamptz not null default now()`
- `ended_at timestamptz`
- `pre_snapshot jsonb not null default '{}'`
- `post_snapshot jsonb not null default '{}'`
- `safety_state text not null default 'clear'`
- `confidence_tier text not null check (confidence_tier in ('C0','C1','C2','C3','C4'))`
- `completion_state text not null check (completion_state in ('started','completed','aborted','stopped','aftercare','failed','review_needed'))`
- `adaptations jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `(user_id, session_kind, started_at desc)`
- `(command_id)`

Rules:

- Stop/safeword sets `completion_state` to `stopped` or `aftercare` and blocks escalation.

### biometric_session_samples

Purpose: Normalized samples captured during a session.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `session_id uuid not null references biometric_sessions(id)`
- `captured_at timestamptz not null`
- `source text not null`
- `metric_kind text not null`
- `value_numeric numeric`
- `value_text text`
- `unit text`
- `freshness_ms integer`
- `raw jsonb`
- `created_at timestamptz not null default now()`

Indexes:

- `(user_id, session_id, captured_at)`
- `(user_id, metric_kind, captured_at desc)`

Rules:

- Raw payloads should be null by default or encrypted/short-lived when retained.

### session_outcomes

Purpose: User feedback and post-session outcome tracking.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `session_id uuid not null references biometric_sessions(id)`
- `mood_before integer`
- `mood_after integer`
- `activation_before integer`
- `activation_after integer`
- `perceived_depth integer`
- `soreness integer`
- `fatigue integer`
- `distress_flag boolean not null default false`
- `pain_flag boolean not null default false`
- `privacy_issue boolean not null default false`
- `notes text`
- `safety_event text`
- `created_at timestamptz not null default now()`

Indexes:

- `(user_id, session_id)`
- `(user_id, created_at desc)`

### protocol_escalation_events

Purpose: Audit escalation and downshift decisions.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `contract_id uuid references delegated_authority_contracts(id)`
- `command_id uuid references authority_commands(id)`
- `event_type text not null check (event_type in ('escalated','downshifted','blocked','paused','resumed','voided'))`
- `from_level integer`
- `to_level integer`
- `reason text not null`
- `safety_decision jsonb not null default '{}'`
- `source_inputs jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

Indexes:

- `(user_id, created_at desc)`
- `(contract_id, created_at desc)`

### body_protocol_reviews

Purpose: Weekly or phase review summaries.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `contract_id uuid references delegated_authority_contracts(id)`
- `period_start date not null`
- `period_end date not null`
- `completion_summary jsonb not null default '{}'`
- `biometric_alignment jsonb not null default '{}'`
- `body_metric_summary jsonb not null default '{}'`
- `safety_summary jsonb not null default '{}'`
- `recommended_next_level integer`
- `user_decision text check (user_decision in ('accepted','narrowed','paused','revoked','deferred'))`
- `created_at timestamptz not null default now()`

Indexes:

- `(user_id, period_end desc)`

### body_transformation_profiles

Purpose: The active personal body transformation plan and target model.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `contract_id uuid references delegated_authority_contracts(id)`
- `status text not null check (status in ('draft','calibrating','active','paused','completed','retired'))`
- `target_label text not null`
- `target_mode text not null check (target_mode in ('recomposition','leaning','building','specialization'))`
- `presentation_target text not null default 'feminine_camera_ready'`
- `start_date date`
- `target_end_date date`
- `current_week integer not null default 0`
- `equipment_profile jsonb not null default '{}'`
- `schedule_profile jsonb not null default '{}'`
- `injury_limits jsonb not null default '{}'`
- `nutrition_constraints jsonb not null default '{}'`
- `measurement_schema jsonb not null default '{}'`
- `training_preferences jsonb not null default '{}'`
- `success_metrics jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `(user_id, status)`
- `(user_id, start_date desc)`

Rules:

- Only one active profile per user.
- Public posting, paid work, outreach, partner involvement, or account creation is out of scope and requires separate confirmation.

### feminine_measurement_snapshots

Purpose: Thorough feminine/camera-ready body measurement tracking.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `profile_id uuid references body_transformation_profiles(id)`
- `measured_at timestamptz not null default now()`
- `weight_kg numeric`
- `bust_cm numeric`
- `underbust_cm numeric`
- `natural_waist_cm numeric`
- `navel_waist_cm numeric`
- `high_hip_cm numeric`
- `full_hip_cm numeric`
- `upper_glute_cm numeric`
- `left_thigh_cm numeric`
- `right_thigh_cm numeric`
- `left_calf_cm numeric`
- `right_calf_cm numeric`
- `shoulders_cm numeric`
- `left_upper_arm_cm numeric`
- `right_upper_arm_cm numeric`
- `neck_cm numeric`
- `inseam_cm numeric`
- `posture_notes text`
- `clothing_fit jsonb not null default '{}'`
- `photo_set jsonb not null default '{}'`
- `derived_ratios jsonb not null default '{}'`
- `source text not null default 'manual'`
- `notes text`
- `created_at timestamptz not null default now()`

Indexes:

- `(user_id, measured_at desc)`
- `(profile_id, measured_at desc)`

Rules:

- Photo paths require an active proof/storage lane and should never require explicit or intimate images.
- Derived ratios are recalculable and should be regenerated on insert/update.

### guided_reconditioning_exercises

Purpose: Versioned library of visible guided exercises for selected behavior/body-protocol targets.

Fields:

- `id uuid primary key`
- `slug text not null unique`
- `title text not null`
- `exercise_family text not null check (exercise_family in ('body_protocol_priming','identity_rehearsal','feminine_presentation_rehearsal','implementation_intention','urge_surfing','somatic_focus','post_session_lock_in','recovery_compliance'))`
- `eligible_domains text[] not null`
- `minimum_confidence_tier text not null default 'C1'`
- `duration_seconds integer not null`
- `script jsonb not null default '{}'`
- `proof_requirements jsonb not null default '{}'`
- `safety_limits jsonb not null default '{}'`
- `active boolean not null default true`
- `version integer not null default 1`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `(exercise_family, active)`

### reconditioning_exercise_runs

Purpose: Track guided exercise selection, completion, and outcomes.

Fields:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `contract_id uuid references delegated_authority_contracts(id)`
- `command_id uuid references authority_commands(id)`
- `session_id uuid references biometric_sessions(id)`
- `exercise_id uuid not null references guided_reconditioning_exercises(id)`
- `target text not null`
- `selected_reason text not null`
- `confidence_tier text not null check (confidence_tier in ('C0','C1','C2','C3','C4'))`
- `started_at timestamptz`
- `completed_at timestamptz`
- `completion_state text not null check (completion_state in ('queued','started','completed','skipped','stopped','aftercare','review_needed'))`
- `outcome jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `(user_id, target, created_at desc)`
- `(user_id, exercise_id, created_at desc)`

## State Machines

Contract:

- `draft -> active`
- `active -> paused`
- `active -> domain_paused`
- `active -> revoked`
- `active -> expired`
- `paused -> active`
- `domain_paused -> active`

Command:

- `draft -> surfaced -> accepted -> in_progress -> completed`
- `surfaced -> missed`
- `surfaced -> paused`
- `in_progress -> partial`
- `in_progress -> blocked`
- `in_progress -> review_needed`
- `any non-final -> voided`

Session:

- `started -> completed`
- `started -> aborted`
- `started -> stopped -> aftercare`
- `started -> failed`
- `completed -> review_needed`

## RLS And Privacy

- Every table includes `user_id`.
- User can read own non-secret records.
- Sensitive writes go through RPC/Edge functions.
- OAuth tokens must not be client-readable; expose only connection status and freshness.
- Raw JSON payloads are minimized and should be encrypted or short-lived when present.
- Export/delete routines must include raw metrics, session samples, derived receptivity scores, command decisions, session outcomes, and escalation logs.
