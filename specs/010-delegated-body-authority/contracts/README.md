# Contracts: Delegated Body Authority

Created: 2026-07-13

## API Principles

- All endpoints require authenticated user context.
- All mutating endpoints check active contract, domain scope, safety latch, and privacy limits.
- Responses must include `safety_decision` and `confidence_tier` when they issue, launch, verify, or alter authority.
- No endpoint returns OAuth tokens or raw sensitive biometric payloads.

## POST /api/body-authority/contract

Create or update the delegated authority contract.

Request:

```json
{
  "status": "active",
  "domains": ["exercise", "recovery", "measurement", "meditation", "reconditioning"],
  "intensity_ceiling": 3,
  "proof_strictness": "standard",
  "escalation_default": true,
  "data_sources": {
    "whoop": true,
    "session_biometrics": true
  },
  "proof_lanes": {
    "workout": true,
    "body_metrics": true,
    "photo": false,
    "self_report": true
  },
  "hard_limits": {
    "no_medical_dosing": true,
    "no_irreversible_actions": true
  },
  "retention_policy": {
    "raw_payloads": "none",
    "derived_scores": "until_deleted"
  }
}
```

Response:

```json
{
  "contract_id": "uuid",
  "status": "active",
  "version": 1,
  "consented_at": "2026-07-13T15:00:00Z",
  "revocation_available": true
}
```

## POST /api/body-authority/command/next

Generate or fetch the next command.

Request:

```json
{
  "domain": "exercise",
  "target_date": "2026-07-13",
  "force_refresh": false
}
```

Response:

```json
{
  "command": {
    "id": "uuid",
    "domain": "exercise",
    "title": "Lower body protocol",
    "instruction": "Complete today's prescribed lower-body session.",
    "minimum_viable_completion": "Complete the warmup and first two working sets.",
    "reason": "Recovery is moderate and the last session was completed.",
    "due_at": "2026-07-13T23:00:00Z",
    "proof_requirements": {
      "kind": "workout_log",
      "whoop_supported": true
    },
    "missed_outcome": "reschedule_or_review",
    "escalation_level": 1
  },
  "receptivity": {
    "score": 72,
    "readiness_band": "high",
    "confidence_tier": "C2",
    "recommended_window_start": "2026-07-13T18:00:00Z",
    "recommended_window_end": "2026-07-13T20:00:00Z"
  },
  "safety_decision": {
    "state": "allow",
    "reasons": []
  }
}
```

## POST /api/body-authority/protocol/baseline

Create or update the personal transformation baseline and feminine measurement schema.

Request:

```json
{
  "target_label": "feminine camera-ready fitness",
  "target_mode": "recomposition",
  "presentation_target": "feminine_camera_ready",
  "equipment_profile": {
    "gym": true,
    "dumbbells": true,
    "bands": true
  },
  "schedule_profile": {
    "preferred_training_windows": ["18:00-20:00"],
    "days_available": ["mon", "wed", "fri", "sat"]
  },
  "injury_limits": {
    "avoid_movements": [],
    "pain_flags": []
  },
  "nutrition_constraints": {
    "protein_preferences": [],
    "appetite_notes": null
  },
  "measurements": {
    "weight_kg": 82.5,
    "bust_cm": null,
    "underbust_cm": null,
    "natural_waist_cm": null,
    "navel_waist_cm": null,
    "high_hip_cm": null,
    "full_hip_cm": null,
    "upper_glute_cm": null,
    "left_thigh_cm": null,
    "right_thigh_cm": null,
    "shoulders_cm": null
  }
}
```

Response:

```json
{
  "profile_id": "uuid",
  "measurement_snapshot_id": "uuid",
  "status": "calibrating",
  "current_week": 0,
  "next_required_inputs": ["progress_photos", "training_history", "whoop_baseline"]
}
```

## POST /api/body-authority/protocol/week-plan

Generate the next weekly protocol plan.

Request:

```json
{
  "profile_id": "uuid",
  "week": 1,
  "force_refresh": false
}
```

Response:

```json
{
  "profile_id": "uuid",
  "week": 1,
  "phase": "consistency_install",
  "focus": "training_compliance_and_measurement_baseline",
  "daily_slots": [
    {
      "day": "mon",
      "primary_domain": "exercise",
      "command_kind": "strength_a",
      "reconditioning": "body_protocol_priming"
    }
  ],
  "safety_decision": {
    "state": "allow",
    "reasons": []
  }
}
```

## POST /api/body-authority/protocol/review

Create a weekly or phase review and adapt the plan.

Request:

```json
{
  "profile_id": "uuid",
  "period_start": "2026-07-13",
  "period_end": "2026-07-19",
  "user_feedback": {
    "appearance_rating": 6,
    "fit_notes": "Waist feels tighter, hips/glutes feel stronger.",
    "pain_flags": []
  }
}
```

Response:

```json
{
  "review_id": "uuid",
  "decision": "progress",
  "next_focus": "progressive_overload",
  "evidence": {
    "workout_completion_pct": 86,
    "protein_target_days": 5,
    "recovery_alignment": "acceptable",
    "measurement_trend": "insufficient_data"
  },
  "safety_decision": {
    "state": "allow",
    "reasons": []
  }
}
```

## POST /api/body-authority/command/:id/verify

Submit proof or correction for a command.

Request:

```json
{
  "completion_state": "completed",
  "proof_sources": {
    "self_report": true,
    "whoop_workout_id": "optional-workout-id",
    "body_metric_ids": []
  },
  "note": "Completed as prescribed.",
  "user_correction": null
}
```

Response:

```json
{
  "command_id": "uuid",
  "verification": {
    "confidence": "sensor_supported",
    "needs_review": false,
    "reason": "Workout evidence and self-report agree."
  },
  "next_state": "completed",
  "safety_decision": {
    "state": "allow",
    "reasons": []
  }
}
```

## POST /api/body-authority/session/start

Start a governed biometric session.

Request:

```json
{
  "command_id": "uuid",
  "session_kind": "meditation",
  "planned_duration_seconds": 600,
  "privacy_confirmed": true
}
```

Response:

```json
{
  "session_id": "uuid",
  "session_kind": "meditation",
  "started_at": "2026-07-13T15:00:00Z",
  "confidence_tier": "C2",
  "safety_decision": {
    "state": "allow",
    "reasons": []
  },
  "stop_available": true
}
```

## POST /api/body-authority/reconditioning/select

Select a guided reconditioning exercise for a command or receptive window.

Request:

```json
{
  "command_id": "uuid",
  "domain": "exercise",
  "target": "workout_start_compliance",
  "available_seconds": 180
}
```

Response:

```json
{
  "run_id": "uuid",
  "exercise": {
    "id": "uuid",
    "title": "Start the body protocol",
    "exercise_family": "body_protocol_priming",
    "duration_seconds": 180,
    "steps": [
      {
        "kind": "breath",
        "text": "Settle your breathing and prepare to begin."
      },
      {
        "kind": "commitment",
        "text": "Name the first physical action you will take now."
      }
    ]
  },
  "receptivity": {
    "score": 76,
    "confidence_tier": "C2"
  },
  "safety_decision": {
    "state": "allow",
    "reasons": []
  }
}
```

## POST /api/body-authority/reconditioning/:run_id/complete

Complete or stop a guided reconditioning exercise.

Request:

```json
{
  "completion_state": "completed",
  "outcome": {
    "focus_shift": 2,
    "urge_shift": -1,
    "helpfulness": 4,
    "next_action_taken": true,
    "notes": "Started the workout immediately after."
  }
}
```

Response:

```json
{
  "run_id": "uuid",
  "completion_state": "completed",
  "learning_accepted": true,
  "safety_decision": {
    "state": "allow",
    "reasons": []
  }
}
```

## POST /api/body-authority/session/sample

Record a normalized session biometric sample.

Request:

```json
{
  "session_id": "uuid",
  "captured_at": "2026-07-13T15:01:00Z",
  "source": "whoop",
  "metric_kind": "heart_rate",
  "value_numeric": 84,
  "unit": "bpm",
  "freshness_ms": 5000
}
```

Response:

```json
{
  "accepted": true,
  "sample_id": "uuid",
  "safety_decision": {
    "state": "allow",
    "reasons": []
  }
}
```

## POST /api/body-authority/session/complete

Complete, abort, stop, or aftercare a session.

Request:

```json
{
  "session_id": "uuid",
  "completion_state": "completed",
  "outcome": {
    "mood_before": 5,
    "mood_after": 7,
    "activation_before": 4,
    "activation_after": 3,
    "perceived_depth": 6,
    "distress_flag": false,
    "pain_flag": false,
    "privacy_issue": false
  }
}
```

Response:

```json
{
  "session_id": "uuid",
  "completion_state": "completed",
  "verification_confidence": "structured_log",
  "safety_decision": {
    "state": "allow",
    "reasons": []
  },
  "aftercare_required": false
}
```

## Edge Function: body-authority-orchestrator

Purpose:

- Run daily and reactively after WHOOP sync, session completion, command miss, safety event, or contract change.
- Generate or update commands.
- Mark expired commands missed only when `surfaced_at` exists.
- Create escalation or downshift events.

Inputs:

```json
{
  "user_id": "uuid",
  "trigger": "daily|whoop_synced|session_completed|command_missed|safety_event|contract_changed"
}
```

Outputs:

```json
{
  "commands_created": 1,
  "commands_updated": 0,
  "events_created": 1,
  "safety_state": "clear"
}
```

## Edge Function: receptivity-score-refresh

Purpose:

- Compute domain-specific readiness from WHOOP, session samples, body state, schedule, and feedback.
- Apply confidence floors and safety overrides.
- Write `receptivity_scores`.
- Optionally update existing `receptive_window_states` when schema is verified.

Inputs:

```json
{
  "user_id": "uuid",
  "modes": ["exercise", "meditation"],
  "trigger": "daily"
}
```

Outputs:

```json
{
  "scores": [
    {
      "mode": "exercise",
      "score": 72,
      "readiness_band": "high",
      "confidence_tier": "C2"
    }
  ]
}
```

## Events

- `authority_contract_created`
- `authority_contract_paused`
- `authority_contract_revoked`
- `whoop_synced`
- `whoop_disconnected`
- `receptivity_scored`
- `command_created`
- `command_surfaced`
- `command_verified`
- `command_missed`
- `session_started`
- `session_sample_recorded`
- `session_completed`
- `reconditioning_selected`
- `reconditioning_completed`
- `safety_downshift`
- `safety_stop_latched`
- `escalation_applied`
- `escalation_blocked`

## Verification Confidence Enum

- `none`: no acceptable proof.
- `self_reported`: user says it happened.
- `structured_log`: app timer, checklist, measurement, or session record supports it.
- `sensor_supported`: wearable or biometric data supports it.
- `photo_supported`: consented non-intimate photo supports it.
- `high_confidence`: multiple independent sources agree.
- `review_needed`: evidence is conflicting, stale, or outside scope.

## Safety Decision Contract

Every authority action should produce:

```json
{
  "state": "allow|soften|ask|block|stop|aftercare",
  "reasons": ["string"],
  "confidence_tier": "C0|C1|C2|C3|C4",
  "blocked_domains": ["hypno"],
  "requires_clear_headed_confirmation": false,
  "user_visible_message": "string"
}
```

Rules:

- `stop` and `aftercare` are final for the current active session.
- `block` prevents command/session creation in the requested domain.
- `soften` can lower intensity, shorten duration, reduce proof, or switch to recovery.
- `ask` requires user confirmation before proceeding.
- `allow` never bypasses hard limits.
