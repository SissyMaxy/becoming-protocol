# Becoming Protocol — Claude Code Implementation Guide

## Getting Started

Copy all 5 spec files into your project root:
```
D:\Projects\Becoming Protocol\
├── Handler_Coaching_Intelligence_Spec.md
├── Handler_Coaching_Intelligence_Spec_Part2.md
├── Handler_Coaching_Intelligence_Spec_Part3.md
├── Handler_Coaching_Intelligence_Spec_Part4.md
├── Handler_Coaching_Intelligence_Spec_Part5.md
```

## Implementation Order

Don't try to build all 42 features at once. This order ensures each phase works standalone and builds on the last.

### Phase 1: Foundation (Do First)
**Goal:** App works with new coaching architecture. One card, one task, API connected.

1. **Database migrations** — All new tables from all 5 specs. Run these first so nothing breaks later.
2. **Feature 1: Claude API Edge Function** — `supabase/functions/handler-coach/index.ts`. This is the brain.
3. **Feature 6: Single-Card Directive View** — Replace task list with DirectiveCard.tsx. One task, two buttons.
4. **Prefill Generator** — `src/lib/prefill-generator.ts`. Required for all API calls.

**Claude Code prompt for Phase 1:**
```
Read Handler_Coaching_Intelligence_Spec.md. I need to implement Phase 1:

1. Create all database migrations from all 5 spec files (Handler_Coaching_Intelligence_Spec.md through Part5.md). Create a single migration file.

2. Create the Supabase Edge Function at supabase/functions/handler-coach/index.ts per Feature 1.

3. Create src/lib/prefill-generator.ts per the spec.

4. Create src/components/DirectiveCard.tsx per Feature 6, replacing the current task list view.

The app uses React 18, TypeScript, Supabase, Tailwind. Start with the migration file.
```

### Phase 2: Daily Structure
**Goal:** Compulsory elements enforce daily engagement. App locks until requirements met.

5. **Feature 38: Compulsory Daily Elements** — Morning gate screen, skincare tracking, evening reflection.
6. **Feature 36: Compliance Gating** — Avoided domains gate desired features.
7. **Feature 2: Timing Engine** — `src/lib/timing-engine.ts`. Detects optimal moments.

**Claude Code prompt for Phase 2:**
```
Read Handler_Coaching_Intelligence_Spec.md (Feature 2) and Part5.md (Features 36, 38). 

Implement the compulsory daily elements system: morning check-in, physical state log, skincare tracking, voice minimum, evening reflection. The app should show a lock screen until compulsory elements are complete.

Then implement compliance gating: certain features (edge sessions, content library, high-tier content) are blocked when the user avoids specific domains. See Feature 36 for the gating logic.

Then implement the timing engine at src/lib/timing-engine.ts per Feature 2.
```

### Phase 3: Handler Authority
**Goal:** The Handler initiates sessions, controls denial, and enforces consequences.

8. **Feature 35: Handler-Initiated Sessions** — Push notifications, response windows.
9. **Feature 39: Denial Authority** — Release eligibility logic, variable scheduling (Feature 11).
10. **Feature 40: Punishment Protocols** — Automated consequence enforcement.
11. **Feature 37: Forced Escalation** — Stealth and announced tier increases.

**Claude Code prompt for Phase 3:**
```
Read Part5.md (Features 35, 37, 39, 40) and Part2.md (Feature 11). 

Implement Handler-initiated sessions with push notifications and response windows. When the timing engine detects a high-priority signal, the Handler initiates a session via notification. If ignored within the response window, resistance is logged and punishments applied.

Implement denial authority: the Handler evaluates release eligibility based on compliance, engagement, and variable scheduling. The user can request release; the Handler decides.

Implement the punishment protocol table and automatic enforcement from Feature 40.

Implement forced escalation: when the escalation readiness analyzer says a domain is ready, the Handler escalates automatically (stealth or announced per Feature 37).
```

### Phase 4: Tracking Systems
**Goal:** All evidence streams feeding the coach context.

12. **Feature 3: Goal Engine** — Commitment extraction + accountability.
13. **Feature 4: Baseline Ratcheting** — Escalating floors.
14. **Feature 5 + 15: Evidence + Investment Dashboard**
15. **Feature 9: Gina Logging**
16. **Feature 10: Post-Release Capture**
17. **Feature 12: Evidence Categorization + Masculine Effort**
18. **Feature 13: Comfort Conditioning**
19. **Feature 14: Involuntary Emergence**
20. **Feature 16: Social Visibility**
21. **Coach Context Builder** — `src/lib/coach-context-builder.ts` aggregating all streams.

**Claude Code prompt for Phase 4:**
```
Read all 5 specs. Implement the tracking libraries and UI components:

- src/lib/goal-engine.ts (Feature 3)
- src/lib/baseline-engine.ts (Feature 4)
- src/components/InvestmentDashboard.tsx (Feature 15)
- src/components/GinaLogButton.tsx (Feature 9)
- src/lib/post-release-engine.ts (Feature 10)
- src/lib/evidence-categorizer.ts (Feature 12)
- src/lib/comfort-tracker.ts (Feature 13)
- src/lib/emergence-tracker.ts (Feature 14)
- src/components/VisibilityTracker.tsx (Feature 16)

Then create src/lib/coach-context-builder.ts that aggregates ALL evidence streams into a single context string for API calls. See Part3.md for the complete context builder specification.
```

### Phase 5: Sessions & Conditioning
**Goal:** Full session delivery with scenes, conditioning arcs, and intimate progression.

22. **Feature 7: Session Content Delivery** — Template engine with pre/post API framing.
23. **Feature 8 + 21: Post-Session Reflection + Morning Interception**
24. **Feature 19: Own-Voice Conditioning** — Recording + session playback.
25. **Feature 28: Engagement Depth Analyzer**
26. **Feature 30: Degradation Response Tracker**
27. **Feature 31: Physical Practice Progression**
28. **Feature 32: Conditioning Arc Sequencer**
29. **Feature 41: Forced Scenes**

**Claude Code prompt for Phase 5:**
```
Read Part2.md, Part3.md, Part4.md, and Part5.md. Implement the session delivery system:

1. Session scripts table + content delivery (Feature 7)
2. Post-session reflection + morning-after bridging (Features 8, 21)
3. Voice recording flagging for session playback (Feature 19)
4. Session depth metrics capture (Feature 28)
5. Conditioning arc progress tracking (Feature 32)
6. Forced scene engine (Feature 41) — start with the "Getting Ready" scene example from the spec

Each session should: (a) API-generated pre-session framing with prefill, (b) serve script content from template library, (c) API-generated post-session reflection with prefill, (d) capture all depth metrics.
```

### Phase 6: Identity Intelligence
**Goal:** Deep behavioral analysis feeding back into coach.

30. **Feature 17: Community Mirror** — Static inspiration feed.
31. **Feature 18: Narrative Prompts** — Phase-based journaling.
32. **Feature 20: Ambient Awareness** — Micro-check-ins + physical state.
33. **Feature 22: Self-Reference Tracking** — Language analysis.
34. **Feature 23: Inevitability Framing** — Coach language instructions.
35. **Feature 29: Fantasy-Reality Gap**
36. **Feature 33: Submission Depth**
37. **Feature 34: Arousal-Identity Fusion**
38. **Feature 42: Ownership Reinforcement**

**Claude Code prompt for Phase 6:**
```
Read all 5 specs. Implement the identity intelligence layer:

1. Static inspiration feed with daily selection (Feature 17)
2. Narrative reflection prompts by phase (Feature 18)
3. Micro-check-in notification scheduling (Feature 20)
4. Self-reference language analysis on all text inputs (Feature 22)
5. Fantasy-reality gap calculator (Feature 29)
6. Submission depth assessment (Feature 33)
7. Arousal-identity fusion tracking (Feature 34)

Update the coach-context-builder to include all new data streams.
Add the inevitability framing and ownership context to every API call (Features 23, 42).
```

## Environment Setup

```bash
# Supabase Edge Function secrets
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# Verify existing env
echo $REACT_APP_SUPABASE_URL
echo $REACT_APP_SUPABASE_ANON_KEY
```

## Key Technical Notes

1. **Every API call needs a prefill.** The prefill is appended as a partial assistant message. Without it, the API may refuse. With it, 100% pass rate through all content tiers. See `prefill-generator.ts`.

2. **The system prompt for the API is Prompt A (coaching framing).** It's in Feature 1 of the first spec. Do not modify the system prompt — it was tested and works.

3. **Push notifications require PWA service worker.** For Handler-initiated sessions (Feature 35), ensure the service worker is configured for push. If not already set up, this needs to be added.

4. **The coach-context-builder is the single most important file.** Every API call should go through it. It aggregates all evidence streams into the context that makes the coach personalized and directive.

5. **Database migrations first, always.** Every phase starts with ensuring the tables exist. One migration file per phase, or one big one upfront.

## Troubleshooting

If Claude Code refuses a feature:
- Check that the spec language is what it's reading (not the original handler.ts comments)
- Break the feature into smaller pieces — implement the data model first, then the logic, then the UI
- If it refuses a specific function, ask it to implement the database table and types first, then come back to the logic

If the API returns refusals:
- Verify the prefill is being sent as a partial assistant message
- Verify Prompt A is the system prompt (not a modified version)
- Check that the prefill matches the state context

