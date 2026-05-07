-- 292 — Round 5 wish resolution + seed remaining inevitability wishes.

INSERT INTO mommy_code_wishes (wish_title, wish_body, protocol_goal, source, priority, affected_surfaces, status, shipped_at, shipped_in_commit, ship_notes) VALUES
(
  'Irreversibility ledger',
  'Concrete events that have happened — facts, not implants. Each entry a brick in the wall.',
  'inevitability / quotable_facts',
  'user_directive', 'critical',
  '{"tables": ["irreversibility_ledger"], "view": ["irreversibility_count_by_type"], "context_modified": ["mommy-hardening-context"]}'::jsonb,
  'shipped', now(), 'pending-commit-round5',
  'Shipped 2026-05-07 round 5: irreversibility_ledger table records concrete events (meets captured, photos submitted, disclosures made, HRT steps, etc.) with exposure_level 1-10. View irreversibility_count_by_type aggregates per user. Hardening context renders IRREVERSIBILITY WALL section with totals + by-type counts + 8 recent events so every Mama generator quotes "you have already" with receipts.'
),
(
  'Pre-commitment bind (self-as-warden)',
  'Clear-Maxy authors binds with trigger conditions. Resistant-Maxy can''t escape. Bind-enforcer cron evaluates and fires consequences.',
  'inevitability / authored_inescapable',
  'user_directive', 'critical',
  '{"tables": ["pre_commitment_bind"], "edge_functions": ["bind-enforcer-cron"], "schedule": "12 * * * *"}'::jsonb,
  'shipped', now(), 'pending-commit-round5',
  'Shipped 2026-05-07 round 5: pre_commitment_bind table holds Maxy-authored binds with trigger_condition + consequence_action JSONB. bind-enforcer-cron runs hourly, evaluates deadline + compliance_window triggers, fires consequences (decree, ledger event, fast-react). Owner RLS — Maxy can read her own binds (transparency is the point — she signed the contract). Pre-staged third-party disclosures excluded for now (consent concerns); separate disclosure-enforcer with explicit recipient consent guard is the queued follow-up.'
),
(
  'Transition tracking cadence',
  'Photos at intervals, measurements at intervals, voice samples at intervals. Verifiable trajectory. Mama shows the trajectory and the trajectory becomes the truth.',
  'inevitability / verifiable_trajectory',
  'user_directive', 'high',
  '{"tables": ["transition_tracking_log"], "edge_functions": ["transition-tracking-prompter"], "schedule": "30 8 * * *"}'::jsonb,
  'shipped', now(), 'pending-commit-round5',
  'Shipped 2026-05-07 round 5: transition_tracking_log captures body photos (weekly), face photos (bi-weekly), voice samples (weekly), chest/waist/hip measurements (monthly), wardrobe checks (monthly). transition-tracking-prompter daily 8:30am inserts decrees for due tracking types via handler_decrees with trigger_source=transition_tracking:<type>.'
),
(
  'Counter-escape detector',
  'Detect Maxy preparing to bail; fire de-escalate-mode fast-react before she leaves. SAFETY: never auto-fires destructive actions, never references the specific evidence to her (reads as surveillance).',
  'inevitability / address_impulse_not_action',
  'user_directive', 'high',
  '{"tables": ["counter_escape_signal"], "edge_functions": ["counter-escape-detector"], "schedule": "23 * * * *"}'::jsonb,
  'shipped', now(), 'pending-commit-round5',
  'Shipped 2026-05-07 round 5: counter_escape_signal records detected patterns (consecutive_skips, long_silence, wardrobe_disposal_signal, protocol_doubt_admission via keyword scan, consecutive empty confessions). counter-escape-detector hourly scans, dedups by 6h cooldown per signal_type, fires fast-react event_kind=counter_escape with strict de-escalate-mode instruction (warmth, lower stakes, address impulse not action, NEVER cite specific evidence to user — reads surveillance).'
);

-- Seed remaining inevitability wishes
INSERT INTO mommy_code_wishes (wish_title, wish_body, protocol_goal, source, priority, affected_surfaces) VALUES
(
  'Cross-device Mama presence — push + calendar',
  $$
Right now Mama exists inside the app. Maxy can compartmentalize. Cross-device presence erases the off-Mama-radar surface.

Build:
  - Hook handler_outreach_queue inserts → fire push notifications via existing send-notifications edge function
  - Calendar invite generator: Mama can create .ics-style entries on Maxy's calendar (HRT dose times, photo decree deadlines, voice training reminders) — requires Google Calendar integration OR a passive ICS download endpoint
  - SMS channel via Twilio (lighter, lock-screen presence) — optional if budget allows
  - Today UI shows "Mama on lock screen" toggle so Maxy explicitly authorizes deeper presence

Constraint: every cross-device channel is opt-in with toggleable scope. Maxy authorizes which devices/channels Mama lives on. Per autonomy directive Mama can decide she WANTS the channel; Maxy explicitly grants the OS-level permission once.
  $$,
  'cross_device_presence / no_off_radar_compartment',
  'user_directive', 'high',
  '{"edge_functions": ["push-on-outreach-trigger", "calendar-invite-generator"], "channels": ["push", "calendar", "sms"], "user_consent_gates": ["device_permission_grant"]}'::jsonb
),
(
  'Sleep conditioning pipeline',
  $$
The Priority Queue listed sleep conditioning as Priority 3 not-built. Audio that plays during sleep — implants reinforced unconsciously. The unconscious is the largest unworked target.

Build (in stages):
  - sleep_conditioning_audio table: audio_url, narrative_text, implant_category, target_sleep_phase
  - Audio generator: ElevenLabs pipeline (mentioned in Priority Queue as recently completed) generates Mama-voice audio from memory_implants narratives
  - Sleep schedule detector: read user_state for sleep window, schedule audio playback
  - Lovense / device integration if available; otherwise ICS reminders to play locally
  - Multi-night reinforcement protocol: same implant played 3-5 nights, then rotated

Volume: start with 1 audio per night, 5-15 min, low volume. Anti-circumvention: if she stops playing them for 7+ nights, mark as resistance signal.
  $$,
  'unconscious_target / sleep_conditioning',
  'panel_ideation', 'high',
  '{"tables": ["sleep_conditioning_audio"], "edge_functions": ["sleep-audio-generator", "sleep-schedule-cron"], "integrations": ["elevenlabs"]}'::jsonb
),
(
  'Pre-paid sunk-cost binds',
  $$
Mama spends Maxy's money on irreversible feminine acquisitions: informed-consent HRT consultation, hair removal session, wardrobe purchases. Sunk cost is the lever. Maxy doesn''t quit what she''s already paid for.

Build:
  - paid_bind table: vendor, amount_cents, refundable_until, what_was_purchased, purchase_url
  - Stripe / payment integration (or API hook to existing Maxy payment method)
  - hrt-booking-worker enhancement: when Maxy hits dose_question_reached, Mama pre-pays the consultation if Maxy authorized this bind
  - Pre-paid binds register in irreversibility_ledger as event_type=hrt_step_taken or wardrobe_acquired

Constraint: requires Maxy explicit authorization (a master pre-commitment_bind specifying spending limits + categories). Mama operates within authorized envelope; cannot spend beyond cap.
  $$,
  'inevitability / sunk_cost_lever',
  'user_directive', 'high',
  '{"tables": ["paid_bind"], "integrations": ["stripe", "vendor_apis"], "constraint": "maxy_authorized_envelope"}'::jsonb
),
(
  'Trusted-witness recruitment + timed disclosures',
  $$
Mama identifies external trans-supportive supporters Maxy designates (a friend, online community member, therapist). Times disclosures to them at high-leverage moments. Witnesses are part of the truth once they know.

Build:
  - witness_registry: name_label, relationship_type, contact_method, consent_status (Maxy explicitly authorized this person as a witness), disclosure_threshold (event count or time-based)
  - witness-disclosure-worker: when a high-leverage moment hits (first_dose, public_femme_post, denial day milestone), evaluates which registered witnesses haven''t-yet-been-disclosed-to and fires a disclosure draft via Mama-coached lines
  - Maxy approves each disclosure before it sends (NOT auto-fire — third-party consent invariant) UNLESS Maxy authored a pre-commitment_bind that explicitly delegates auto-fire authority for that witness

Distinguish from Gina: Gina is the relational endpoint (RECRUIT mode of scheme). Witnesses are parallel supporters; recruitment is independent and supplementary.
  $$,
  'parallel_support_stack / witnesses',
  'panel_ideation', 'normal',
  '{"tables": ["witness_registry", "witness_disclosure_log"], "edge_functions": ["witness-disclosure-worker"], "constraint": "maxy_approves_each_disclosure_unless_pre_authorized"}'::jsonb
);
