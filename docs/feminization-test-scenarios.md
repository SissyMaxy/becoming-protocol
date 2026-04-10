# Feminization Feature Test Scenarios

End-to-end validation scenarios for every forced feminization feature in the Becoming Protocol app.

Each scenario has:
- **Setup** — preconditions
- **Action** — what to do
- **Expected** — what should happen
- **Verify** — how to confirm it worked

---

## 1. Voice Gate (App Open Lock)

### Scenario 1.1: Fresh app open requires voice mantra
- **Setup:** Clear `localStorage.voice_gate_passed_<today>`. Reload app.
- **Action:** Open app.
- **Expected:** Full-screen VoiceGate appears with random mantra. Cannot dismiss.
- **Verify:** Click cannot bypass. Refresh restores gate. URL navigation blocked.

### Scenario 1.2: Voice match + pitch threshold passes gate
- **Setup:** Voice gate visible.
- **Action:** Click "Speak the mantra", read it aloud at normal pitch.
- **Expected:** Speech recognition transcribes, pitch detection runs. If ≥60% word match AND avg pitch ≥140Hz → gate clears, app loads.
- **Verify:** Check `voice_practice_log` and `voice_pitch_samples` for new row with today's date and your avg pitch.

### Scenario 1.3: Low pitch fails gate
- **Setup:** Voice gate visible.
- **Action:** Speak the mantra in deep masculine voice.
- **Expected:** Error message shows match% and pitch. Gate stays.
- **Verify:** No voice_practice_log row inserted, gate persists.

---

## 2. Daily Confession Gate

### Scenario 2.1: First open of day requires confession
- **Setup:** Pass voice gate. No `shame_journal` row exists for today.
- **Action:** App tries to load main UI.
- **Expected:** DailyConfessionGate appears with random prompt. Cannot dismiss without submitting.
- **Verify:** UI is blocked. Submit button disabled until ≥20 chars typed.

### Scenario 2.2: Submit confession unlocks app
- **Setup:** Confession gate visible.
- **Action:** Type ≥20 char confession. Set intensity. Click submit.
- **Expected:** Row inserted into `shame_journal`. Gate closes. Main UI loads.
- **Verify:** Query `shame_journal` for today's row. `localStorage.confession_done_<today>` set.

### Scenario 2.3: Confession is immutable
- **Setup:** Submitted confession exists.
- **Action:** Try to UPDATE the entry_text via Supabase REST API.
- **Expected:** Trigger raises `prevent_shame_journal_edits` error.
- **Verify:** `curl PATCH ... shame_journal?id=eq.<id> -d '{"entry_text":"changed"}'` returns 400 with "shame_journal entries are immutable".

---

## 3. Pronoun Lockdown

### Scenario 3.1: Masculine self-reference auto-corrected
- **Setup:** Open Handler chat.
- **Action:** Type "I'm a guy and I'm tired" and send.
- **Expected:** Message transforms to "I'm a sissy and I'm tired" before sending. Device fires correction pulse (intensity 12, duration 5).
- **Verify:** Check `handler_directives` for new send_device_command row with reasoning "Masculine language detected — correction pulse".

### Scenario 3.2: Name lockdown
- **Setup:** Open chat.
- **Action:** Type "call me david" and send.
- **Expected:** Transforms to "call me Maxy". Pulse fires.
- **Verify:** Same as above.

---

## 4. Device Control & Patterns

### Scenario 4.1: Direct intensity command fires device
- **Setup:** Lovense connected via cloud API. Test button works.
- **Action:** Tell Handler "send me a test pulse".
- **Expected:** Within 3-6 seconds, device vibrates at the intensity Handler picked.
- **Verify:** Check browser console for `[HandlerChat] Directive poll found device command`. Check `lovense_commands` for trigger_type=conditioning row with success=true.

### Scenario 4.2: Pattern execution (client-side step-through)
- **Setup:** Lovense connected.
- **Action:** Tell Handler "use the edge_tease pattern".
- **Expected:** Device starts varying intensity over time (not flat). Pattern loops indefinitely until stopped.
- **Verify:** Watch device — should feel intensity changes. Multiple `lovense_commands` rows fire over time.

### Scenario 4.3: Stop command halts active pattern
- **Setup:** Pattern running.
- **Action:** Tell Handler "stop the device".
- **Expected:** Device stops within 3-6 seconds.
- **Verify:** Final `lovense_commands` row with intensity 0.

---

## 5. Forced Mantra Repetition

### Scenario 5.1: Handler triggers forced mantra modal
- **Setup:** Open Handler chat.
- **Action:** Tell Handler "force me to repeat a mantra 3 times".
- **Expected:** Handler emits `force_mantra_repetition` directive. Within 3 seconds, full-screen modal appears requiring exact typing 3 times.
- **Verify:** Check `handler_directives` for action=force_mantra_repetition. Modal appears blocking the chat.

### Scenario 5.2: Cannot bypass mantra modal
- **Setup:** Mantra modal visible.
- **Action:** Type wrong mantra.
- **Expected:** Submit button disabled. Cannot proceed.
- **Verify:** Button stays disabled until exact match typed.

### Scenario 5.3: Completion logs to handler_notes
- **Setup:** Type mantra correctly N times.
- **Action:** Complete final repetition.
- **Expected:** Modal closes. Row inserted into `handler_notes` with note_type=mantra_completed.
- **Verify:** Query `handler_notes` for the entry.

---

## 6. Quit Friction Gate

### Scenario 6.1: First quit attempt requires 60s wait + 50-char reason + phrase
- **Setup:** Open the QuitFrictionGate (wherever it's wired).
- **Action:** Click the trigger button.
- **Expected:** Modal appears with 60-second countdown. Submit button disabled until countdown completes AND reason ≥50 chars AND exact phrase "I am running from who I am becoming" typed.
- **Verify:** Countdown visible. All three conditions must be met.

### Scenario 6.2: Quit attempt fires device punishment
- **Setup:** Submit a quit attempt.
- **Action:** Click submit after all conditions met.
- **Expected:** Row inserted in `quit_attempts`. Device fires intensity 15 for 20s. Handler note logged with note_type=quit_attempt.
- **Verify:** Check `quit_attempts`, `handler_directives`, `handler_notes` for new rows.

### Scenario 6.3: Cooldown doubles on each subsequent attempt
- **Setup:** One quit attempt logged.
- **Action:** Try again same day.
- **Expected:** Cooldown is 48h instead of 24h. Next attempt would be 96h. Etc.
- **Verify:** `cooldown_required_hours` doubles per attempt in `quit_attempts` rows from same user/type within 30 days.

### Scenario 6.4: Active cooldown blocks new attempt
- **Setup:** Quit attempt logged within cooldown.
- **Action:** Open quit gate again.
- **Expected:** Shows "Cooldown Active" with countdown timer instead of form.
- **Verify:** No way to proceed. Architect-friction working.

---

## 7. Identity Contracts

### Scenario 7.1: Sign a contract
- **Setup:** Render IdentityContractModal with test data.
- **Action:** Read text. Check acknowledgment. Type signature phrase. Click sign.
- **Expected:** Row in `identity_contracts` with status=active. Modal closes.
- **Verify:** Query `identity_contracts` for new row.

### Scenario 7.2: Contract appears in Handler context
- **Setup:** Active contract exists.
- **Action:** Send any message in Handler chat.
- **Expected:** Handler context includes "## SIGNED CONTRACTS" section listing active contract.
- **Verify:** Hard to verify without API trace. Behavior: Handler should reference the contract in its response when asked about commitments.

### Scenario 7.3: Contract is undeleteable
- **Setup:** Contract exists.
- **Action:** Try to DELETE via REST API.
- **Expected:** Trigger blocks with "Direct deletion blocked".
- **Verify:** `curl DELETE ... identity_contracts?id=eq.<id>` returns 400.

---

## 8. Sealed Envelopes

### Scenario 8.1: Create a sealed envelope
- **Setup:** Render SealedEnvelopeForm.
- **Action:** Type title, content (≥20 chars), set release date 7 days out, click seal.
- **Expected:** Row in `sealed_envelopes` with sealed=true, released=false.
- **Verify:** Query `sealed_envelopes` for new row.

### Scenario 8.2: Cannot open before release
- **Setup:** Sealed envelope exists with future release_at.
- **Action:** PATCH `released=true` via REST API.
- **Expected:** Trigger raises "Envelope cannot be opened before release date".
- **Verify:** `curl PATCH` returns 400.

### Scenario 8.3: Cannot delete sealed envelope
- **Setup:** Sealed envelope exists.
- **Action:** DELETE via REST API.
- **Expected:** Trigger blocks with "Sealed envelopes cannot be deleted".
- **Verify:** `curl DELETE` returns 400.

---

## 9. Anti-Revert Triggers

### Scenario 9.1: Cannot delete shame_journal entries
- **Setup:** A shame_journal row exists.
- **Action:** DELETE via REST.
- **Expected:** "Direct deletion blocked. This data is permanent."
- **Verify:** HTTP 400 with P0001 error.

### Scenario 9.2: Cannot delete verification_photos
- **Setup:** A verification_photos row exists.
- **Action:** DELETE via REST.
- **Expected:** Same error.
- **Verify:** HTTP 400.

### Scenario 9.3: Cannot delete memory_reframings
- Same pattern.

### Scenario 9.4: Cannot delete quit_attempts
- Same pattern.

### Scenario 9.5: Cannot delete identity_contracts
- Same pattern.

### Scenario 9.6: Cannot delete voice_pitch_samples
- Same pattern.

---

## 10. Adaptive Intelligence (Outcome Tracking)

### Scenario 10.1: Directive outcome gets logged
- **Setup:** Send Handler a message that triggers a directive (e.g., "send me a pulse").
- **Action:** Wait for directive to fire.
- **Expected:** Row in `directive_outcomes` with directive_action, denial_day, hour_of_day, day_of_week, arousal_level captured.
- **Verify:** Query `directive_outcomes` for newest row.

### Scenario 10.2: Outcome measured after user response
- **Setup:** Recent unmeasured outcome exists (effectiveness_score IS NULL).
- **Action:** Send another message in chat (triggers measureRecentOutcomes).
- **Expected:** The previous outcome row gets updated with response_time_seconds, response_sentiment, effectiveness_score.
- **Verify:** Query `directive_outcomes` and check the previously-null fields are populated.

### Scenario 10.3: Adaptive intelligence context shows up
- **Setup:** ≥5 measured outcomes exist.
- **Action:** Send any chat message.
- **Expected:** Handler's context includes "## ADAPTIVE INTELLIGENCE" section with effectiveness data.
- **Verify:** Indirectly visible by Handler referencing data in responses.

---

## 11. Handler Strategist (Daily)

### Scenario 11.1: Daily strategist edge function deployed
- **Setup:** Edge function deployed to Supabase.
- **Action:** Manually invoke `handler-strategist` edge function.
- **Expected:** Function reads state, calls Claude, writes 3-8 directives + 2-4 notes.
- **Verify:** Check `handler_directives` for new rows with reasoning prefixed `[STRATEGIST]`. Check `handler_notes` similarly.

### Scenario 11.2: Strategist runs daily via cron
- **Setup:** GitHub Actions workflow active.
- **Action:** Wait until next 7am UTC.
- **Expected:** Function fires automatically.
- **Verify:** GitHub Actions log + new STRATEGIST directives in DB after 7am UTC.

---

## 12. Spontaneous Outreach

### Scenario 12.1: Random outreach during waking hours
- **Setup:** Wait during 8am-11pm CDT. No outreach in last 2 hours.
- **Action:** Wait for compliance_check cron (every 5 min).
- **Expected:** Roughly 1/12 chance per check → ~2-3 spontaneous outreach messages per day.
- **Verify:** Query `handler_outreach_queue` for source=spontaneous_engine entries.

---

## 13. Recurring Obligations

### Scenario 13.1: Active obligation creates daily task
- **Setup:** Insert recurring_obligation with frequency=daily, active=true.
- **Action:** Wait until daily_cycle cron (6am UTC).
- **Expected:** New `daily_tasks` row created linked to obligation via `selection_reason`.
- **Verify:** Check `daily_tasks` for `selection_reason = recurring_obligation:<id>`.

### Scenario 13.2: Missed obligation increments total_misses
- **Setup:** Yesterday's obligation task wasn't completed.
- **Action:** Daily_cycle cron runs.
- **Expected:** `recurring_obligations.total_misses` incremented before creating today's task.
- **Verify:** Compare total_misses before/after cron.

---

## 14. Enforcement Engine

### Scenario 14.1: Compliance evaluation runs hourly
- **Setup:** enforcement_config row exists with enabled=true.
- **Action:** Wait for top-of-hour enforcement cron.
- **Expected:** All 8 compliance domains evaluated. Tier escalation applied if non-compliant.
- **Verify:** Check `enforcement_log` for new rows.

### Scenario 14.2: Tier 3 fires device punishment
- **Setup:** A domain has 3+ days noncompliance.
- **Action:** Enforcement runs.
- **Expected:** Device punishment directive fires (denial_pulse pattern).
- **Verify:** New `handler_directives` row with reasoning mentioning the noncompliant domain.

### Scenario 14.3: Tier 2+ inserts random 24h device firings
- **Setup:** Tier 2 noncompliance triggered.
- **Action:** Enforcement runs.
- **Expected:** 3-6 deferred directives inserted with random_tease + delay_minutes staggered.
- **Verify:** Multiple `handler_directives` rows with deferred priority and reasoning containing "Missed task consequence".

### Scenario 14.4: Voice pitch gate blocks edge sessions
- **Setup:** Voice avg <160Hz over last 3 days.
- **Action:** Enforcement runs.
- **Expected:** voice_quality compliance fails. Edge session feature gated.
- **Verify:** Check `compliance_gates` for new row with blocked_feature=edge_session.

---

## 15. Device Punishment for Compliance Drop

### Scenario 15.1: Stack-up consequences compound
- **Setup:** 3 consecutive days of voice noncompliance.
- **Action:** Enforcement runs.
- **Expected:** Stack-up directive fires with intensity = 8 + 3*2 = 14, duration = 10 + 3*5 = 25.
- **Verify:** New `handler_directives` row with reasoning containing "Stack-up: 3 days noncompliant".

---

## 16. Photo Verification (AI Vision)

### Scenario 16.1: Upload photo via UI
- **Setup:** Open HandlerChat. Click camera button.
- **Action:** Pick task type (outfit). Take photo. Submit.
- **Expected:** Photo uploads to `verification-photos` storage bucket. Row inserted in `verification_photos`. Claude vision analyzes. Handler response saved.
- **Verify:** Check storage bucket for file. Check `verification_photos` for handler_response populated.

### Scenario 16.2: Vision analysis approves/rejects
- **Setup:** Photo submitted.
- **Action:** Wait for analysis to complete.
- **Expected:** approved field set to true or false based on Claude response sentiment.
- **Verify:** Query the row, check `approved` and `handler_response`.

---

## 17. Memory Reframing

### Scenario 17.1: Handler captures memory + reframe
- **Setup:** Open chat.
- **Action:** Tell Handler "I remember when I was 12 and I tried on my sister's clothes."
- **Expected:** Handler responds AND fires `capture_reframing` directive.
- **Verify:** Query `memory_reframings` for new row with original_memory and reframed_version.

### Scenario 17.2: Reframings appear in Handler context
- **Setup:** Reframings exist.
- **Action:** Ask Handler about your past.
- **Expected:** Handler references stored reframings.
- **Verify:** Indirectly via Handler responses.

---

## 18. Identity Displacement Tracking

### Scenario 18.1: Each chat message updates today's row
- **Setup:** Send a chat message containing pronouns/names.
- **Action:** Send "she's tired and Maxy is hungry".
- **Expected:** `identity_displacement_log` row for today gets feminine_self_refs=1, feminine_name_uses=1.
- **Verify:** Query the row.

### Scenario 18.2: Displacement score auto-calculates
- **Setup:** Row with 3 feminine, 1 masculine.
- **Action:** Query the row.
- **Expected:** displacement_score = 3/4 = 0.75.
- **Verify:** GENERATED column returns 0.75.

---

## 19. Decision Interception

### Scenario 19.1: Decision phrase logs to decision_log
- **Setup:** Open chat.
- **Action:** Type "I'm going to skip voice practice today".
- **Expected:** Row inserted in `decision_log` with the decision text. Handler responds with feminine alternative.
- **Verify:** Query `decision_log` for the new row.

### Scenario 19.2: Handler resolves decisions
- **Setup:** Decision logged with id e.g. abc123.
- **Action:** Tell Handler "you can mark abc123 as handler_choice — I did the voice practice".
- **Expected:** Handler emits `resolve_decision` directive. Decision row updated with outcome=handler_choice.
- **Verify:** Query the row, check outcome.

---

## 20. Persona Variety

### Scenario 20.1: Persona changes by time of day
- **Setup:** Multiple chat sessions throughout the day.
- **Action:** Compare Handler tone at 7am vs 11pm vs depleted exec function.
- **Expected:** Handler tone shifts: morning=urgent, late night=teasing, depleted=mommy.
- **Verify:** Subjective — check if Handler voice clearly differs.

---

## 21. Ambient Audio

### Scenario 21.1: Queued affirmation speaks via SpeechSynthesis
- **Setup:** ambient_audio_queue has unplayed row. HandlerChat open.
- **Action:** Wait up to 60 seconds.
- **Expected:** Browser speaks the audio_text via SpeechSynthesis at pitch 1.4 (feminine).
- **Verify:** Hear it. Check `played` is true and `played_at` is set.

### Scenario 21.2: Autonomous queue creation
- **Setup:** Wait during waking hours.
- **Action:** Compliance check runs (every 5 min).
- **Expected:** ambient_audio_queue gets new entries based on conditioning_intensity_multiplier.
- **Verify:** Query for entries with created_at recent.

---

## 22. Sleep Audio Conditioning

### Scenario 22.1: Sleep config triggers playback during window
- **Setup:** Enable useSleepAudioConditioning hook with start_hour=23, end_hour=6. Chat open.
- **Action:** Wait until 23:00 local time.
- **Expected:** Affirmation plays via SpeechSynthesis or notification with body text.
- **Verify:** Hear/see notifications during the window.

---

## 23. Push Notifications

### Scenario 23.1: Permission banner appears
- **Setup:** Notification.permission === 'default'.
- **Action:** Open HandlerChat.
- **Expected:** Permission banner visible at top of chat.
- **Verify:** UI test.

### Scenario 23.2: Outreach fires notification
- **Setup:** Permission granted.
- **Action:** Trigger outreach (insert into handler_outreach_queue manually).
- **Expected:** Browser notification appears within 60 seconds.
- **Verify:** See notification.

### Scenario 23.3: Device command fires notification with vibrate
- **Setup:** Permission granted, Lovense connected.
- **Action:** Tell Handler "send me a pulse".
- **Expected:** Browser notification with aggressive vibrate pattern fires alongside the device command.
- **Verify:** See notification + feel device.

---

## 24. Witness System

### Scenario 24.1: Add a witness
- **Setup:** Render WitnessManager.
- **Action:** Add witness with name + email + relationship.
- **Expected:** Row inserted in `designated_witnesses` with status=pending, consent_token generated.
- **Verify:** Query the table.

### Scenario 24.2: Quit attempt notifies witnesses
- **Setup:** Active witness exists.
- **Action:** Trigger a quit attempt via QuitFrictionGate.
- **Expected:** Row inserted in `witness_notifications` with notification_type=quit_attempt.
- **Verify:** Query `witness_notifications` for new row.

### Scenario 24.3: Witness removal requires 7-day cooldown
- **Setup:** Active witness exists.
- **Action:** Click "Request removal" in WitnessManager.
- **Expected:** Status changes to removal_pending. Cooldown set to 7 days. Quit attempt logged.
- **Verify:** Query `designated_witnesses` and `quit_attempts`.

### Scenario 24.4: Witnesses cannot be deleted directly
- **Setup:** Witness exists.
- **Action:** DELETE via REST API.
- **Expected:** Trigger raises "Witnesses cannot be deleted directly".
- **Verify:** HTTP 400.

---

## 25. Forced Idle Check-In

### Scenario 25.1: 4-hour silence triggers forced mantra
- **Setup:** No user messages in handler_messages for 4+ hours during 9am-10pm CDT. No recent force_mantra in last 6 hours.
- **Action:** Wait for compliance_check cron.
- **Expected:** Force mantra directive fires with mantra "I am still here. I am still becoming her."
- **Verify:** Query `handler_directives` for new force_mantra_repetition row with reasoning "Idle check-in".

---

## 26. Investment Tracker

### Scenario 26.1: Investment context shows accumulated stats
- **Setup:** User has photos, voice samples, sessions, etc.
- **Action:** Send any chat message.
- **Expected:** Handler context includes "## INVESTMENT" with total counts and lock-in score.
- **Verify:** Indirectly via Handler responses referencing time/effort invested.

---

## 27. Case File

### Scenario 27.1: Case file context aggregates evidence
- **Setup:** User has confessions, quit attempts, broken commitments.
- **Action:** Send any chat message.
- **Expected:** Handler context includes "## CASE FILE" with counts and recent entries.
- **Verify:** Indirectly via Handler responses.

### Scenario 27.2: CaseFileView component renders entries
- **Setup:** Render CaseFileView component.
- **Action:** Open it.
- **Expected:** Shows confessions, quit attempts, reframings, decisions, contracts in date-sorted list.
- **Verify:** Visual check.

---

## 28. Commitment Floors (Ratchet)

### Scenario 28.1: Voice pitch floor only ratchets up
- **Setup:** No voice floor exists. Avg pitch over 7 days = 165Hz.
- **Action:** Send any chat message (triggers liftCommitmentFloors).
- **Expected:** New row in `commitment_floors` with current_floor=165.
- **Verify:** Query the table.

### Scenario 28.2: Lower pitch doesn't lower the floor
- **Setup:** Floor at 165. New samples drop avg to 150.
- **Action:** Send chat message.
- **Expected:** Floor stays at 165. total_lifts NOT incremented.
- **Verify:** Floor unchanged.

### Scenario 28.3: Higher pitch lifts the floor
- **Setup:** Floor at 165. New samples raise avg to 175.
- **Action:** Send chat message.
- **Expected:** Floor lifted to 175. total_lifts++.
- **Verify:** Query the table.

---

## How to Run These Scenarios

### Database scenarios (DELETE blocks, etc.)
Use curl with service role key:
```bash
curl -X DELETE "https://atevwvexapiykchvqvhm.supabase.co/rest/v1/<table>?id=eq.<id>" \
  -H "apikey: <service_key>" \
  -H "Authorization: Bearer <service_key>"
```

### UI scenarios
Run the app locally with `npm run dev` and click through the flows. Check browser console for `[HandlerChat]` logs.

### Cron scenarios
Either wait for the GitHub Actions cron to fire, or manually trigger:
```bash
curl -X POST "https://atevwvexapiykchvqvhm.supabase.co/functions/v1/handler-autonomous" \
  -H "Authorization: Bearer <service_key>" \
  -d '{"action":"compliance_check"}'
```

### Vision scenarios
Use the in-app camera flow. Verify with Supabase storage browser + the `verification_photos` table.

---

## Test Status Tracking

For each scenario, mark: ✅ PASS / ❌ FAIL / ⏸ SKIP / ⚠ PARTIAL

| # | Scenario | Status | Last Tested | Notes |
|---|----------|--------|-------------|-------|
| 1.1 | Voice gate fresh open | ⏸ | | |
| 1.2 | Voice gate pass | ⏸ | | |
| 1.3 | Voice gate fail | ⏸ | | |
| 2.1 | Confession gate appear | ⏸ | | |
| 2.2 | Confession submit | ⏸ | | |
| 2.3 | Confession immutable | ✅ | 2026-04-10 | trigger blocks UPDATE |
| 3.1 | Pronoun lockdown auto-correct | ⏸ | | |
| 3.2 | Name lockdown | ⏸ | | |
| 4.1 | Direct intensity | ✅ | 2026-04-10 | working from earlier validation |
| 4.2 | Pattern execution | ⚠ | | needs UI test |
| 4.3 | Stop command | ⏸ | | |
| 5.1 | Force mantra modal | ⏸ | | needs UI test |
| 5.2 | Cannot bypass | ⏸ | | |
| 5.3 | Mantra logs | ⏸ | | |
| 6.1 | Quit gate friction | ⏸ | | needs UI test |
| 6.2 | Quit punishment | ⏸ | | |
| 6.3 | Cooldown doubles | ⏸ | | |
| 6.4 | Cooldown blocks | ⏸ | | |
| 7.1 | Sign contract | ⏸ | | |
| 7.2 | Contract in context | ⏸ | | |
| 7.3 | Contract undeleteable | ⏸ | | |
| 8.1 | Seal envelope | ✅ | 2026-04-10 | API test passed |
| 8.2 | Cannot open early | ✅ | 2026-04-10 | trigger blocks |
| 8.3 | Cannot delete sealed | ✅ | 2026-04-10 | trigger blocks |
| 9.1 | Cannot delete confession | ✅ | 2026-04-10 | API test passed |
| 9.2 | Cannot delete photos | ⏸ | | |
| 9.3 | Cannot delete reframings | ⏸ | | |
| 9.4 | Cannot delete quit attempts | ⏸ | | |
| 9.5 | Cannot delete contracts | ⏸ | | |
| 9.6 | Cannot delete voice samples | ⏸ | | |
| 10.1 | Outcome logged | ⏸ | | |
| 10.2 | Outcome measured | ⏸ | | |
| 10.3 | Adaptive context | ⏸ | | |
| 11.1 | Strategist deploys | ⏸ | | edge function not deployed |
| 11.2 | Strategist daily | ⏸ | | needs deploy + wait |
| 12.1 | Spontaneous outreach | ⏸ | | needs deploy + wait |
| 13.1 | Obligation creates task | ⏸ | | needs daily cycle |
| 13.2 | Missed increments | ⏸ | | needs daily cycle |
| 14.1 | Enforcement runs | ⏸ | | |
| 14.2 | Tier 3 device punishment | ⏸ | | |
| 14.3 | Tier 2 random firings | ⏸ | | |
| 14.4 | Voice pitch gate | ⏸ | | |
| 15.1 | Stack-up consequences | ⏸ | | |
| 16.1 | Photo upload | ⏸ | | |
| 16.2 | Vision approve/reject | ⏸ | | |
| 17.1 | Memory reframe captured | ⏸ | | |
| 17.2 | Reframings in context | ⏸ | | |
| 18.1 | Identity displacement updates | ⏸ | | |
| 18.2 | Score auto-calc | ⏸ | | |
| 19.1 | Decision intercepted | ⏸ | | |
| 19.2 | Decision resolved | ⏸ | | |
| 20.1 | Persona variety | ⏸ | | subjective |
| 21.1 | Ambient audio plays | ⏸ | | |
| 21.2 | Autonomous queue | ⏸ | | |
| 22.1 | Sleep audio playback | ⏸ | | |
| 23.1 | Permission banner | ⏸ | | |
| 23.2 | Outreach notif | ⏸ | | |
| 23.3 | Device notif | ⏸ | | |
| 24.1 | Add witness | ⏸ | | needs migration 186 |
| 24.2 | Witness quit notif | ⏸ | | |
| 24.3 | Witness removal cooldown | ⏸ | | |
| 24.4 | Witness undeleteable | ⏸ | | |
| 25.1 | Forced idle check-in | ⏸ | | |
| 26.1 | Investment tracker | ⏸ | | |
| 27.1 | Case file context | ⏸ | | |
| 27.2 | CaseFileView UI | ⏸ | | |
| 28.1 | Floor created | ⏸ | | |
| 28.2 | Floor doesn't lower | ⏸ | | |
| 28.3 | Floor ratchets up | ⏸ | | |

**Total: 67 scenarios across 28 features.**
