# Becoming Protocol — QA Audit Prompt
## For use with Claude in Chrome extension

---

## Quick Start

Paste one of the section prompts below into Claude in Chrome while on the Becoming Protocol site. Each section tests a specific feature area and produces a pass/fail report.

---

## FULL SITE AUDIT PROMPT

```
I need you to QA test this web application (Becoming Protocol). Navigate through every visible screen, component, and interaction. For each thing you find, report:

1. SCREEN/COMPONENT NAME — what is it
2. STATUS — Working / Broken / Partial / Missing
3. WHAT IT DOES — brief description of current behavior
4. ISSUES — any bugs, layout problems, broken buttons, console errors
5. MISSING — features that should exist based on a coaching/directive app but don't appear implemented

Start from the main page and systematically explore every navigation path, every button, every modal, every form. Take screenshots as you go. Open the browser console and check for errors on each page.

Organize your findings as a table:
| Screen | Component | Status | Issues | Notes |

Be thorough. Click everything. Try to break things.
```

---

## SECTION-SPECIFIC PROMPTS

### 1. Authentication & Onboarding
```
Test the authentication and onboarding flow:
1. Check if there's a login/signup screen
2. Test the auth flow (Supabase auth)
3. Check for onboarding steps after first login
4. Verify session persistence (refresh the page — still logged in?)
5. Check for any exposed API keys or credentials in the page source
6. Screenshot each step

Report: What works, what's broken, what's missing.
```

### 2. Today View / Dashboard
```
Navigate to the main Today view or dashboard. Test:
1. What components are visible?
2. Is there a DirectiveCard showing a single task with Done/Can't buttons?
3. Or is there still a task list/browsable interface?
4. Is there a directive mode toggle (lightning bolt icon)?
5. Click the directive mode toggle if it exists — what changes?
6. Are there mood/state inputs?
7. Is there a streak counter?
8. Is there an investment/evidence dashboard?
9. What does the top nav look like? What pages are accessible?
10. Check console for errors
11. Screenshot the main view in both modes (if toggle exists)

Report as a table with status for each component.
```

### 3. DirectiveCard Flow
```
Test the DirectiveCard component specifically:
1. Is it rendering? What does it show?
2. Does it display a coach message above the task?
3. Does it show exactly ONE task (not a list)?
4. Are there exactly two buttons: "Done" and "I can't right now" (or similar)?
5. Click "Done" — what happens? Does a new task appear?
6. Click "I can't right now" — does a pivot task appear?
7. Does the pivot task have a decline option or is it final?
8. Is there an API call to the handler-coach edge function? (Check network tab)
9. Does the coach message feel personalized or is it placeholder text?
10. Screenshot the card, the done flow, and the decline flow

Report: Working / Broken / Placeholder for each element.
```

### 4. Compulsory Gate Screen
```
Test for compulsory daily elements:
1. Is there a gate/lock screen that blocks the app until requirements are met?
2. What compulsory elements are listed? (morning check-in, physical state, skincare, etc.)
3. Can you bypass the gate without completing elements?
4. Does completing an element update the gate?
5. What time-based logic exists? (morning elements vs evening elements)
6. If no gate screen exists, note this as MISSING — it's a critical feature

Screenshot the gate screen if it exists, or screenshot what appears instead.
```

### 5. Compliance Gating
```
Test for compliance gating (features blocked behind requirements):
1. Are any features shown as locked/blurred/gated?
2. Is there a lock overlay with explanation text?
3. Can you access edge sessions or content without prerequisites?
4. Is voice practice linked to session access?
5. Are there any "blocked because..." messages anywhere in the UI?
6. If no compliance gating exists, note as MISSING

Screenshot any gated features or their absence.
```

### 6. State Tracking & Logging
```
Test all state tracking interfaces:
1. Is there a mood input? What format? (slider, buttons, number)
2. Is there a physical state logger? (cage, clothing, devices)
3. Is there an arousal level input?
4. Is there a denial day counter?
5. Is there a Gina home/away toggle?
6. Is there a streak display?
7. Is there any evidence/investment dashboard?
8. Is there a Gina interaction logger?
9. Is there a euphoria/moment capture?
10. Is there a voice practice tracker?
11. For each: does it save to the database? (Check network tab for Supabase calls)

Report each tracker as: Present & Working / Present & Broken / Missing
```

### 7. Session System
```
Test the session/edge system:
1. Is there a session entry point? Where?
2. What types of sessions are available?
3. Is there session gating (physical readiness check before starting)?
4. Does a session show content (scripts, affirmations)?
5. Is there an edge counter?
6. Is there a timer?
7. Is there haptic/Lovense integration UI?
8. Is there a post-session modal/reflection?
9. Is there a release request flow?
10. Check for session_scripts table data (are scripts loaded or empty?)

Screenshot the session flow from entry to completion if possible.
```

### 8. Handler AI Integration
```
Test the AI coaching integration:
1. Is there any AI-generated content visible? (coach messages, briefings)
2. Check network tab — are there calls to a handler-coach edge function?
3. Are responses personalized (reference user state) or generic?
4. Is there a daily briefing feature?
5. Is there a check-in feature?
6. Try triggering different states and see if coaching content changes
7. Look for the prefill pattern — does the AI response start mid-sentence?
8. Check for API errors in console

Report: AI Connected & Working / AI Connected & Generic / AI Not Connected / Errors
```

### 9. Database Verification
```
Open the browser console and run these checks:

1. Check if Supabase client is accessible:
   - Look for window.__supabase or similar
   - Check for supabase-related objects in the page context

2. Check network requests for Supabase REST API calls:
   - Look for requests to your Supabase URL
   - What tables are being queried?
   - Are writes (POST/PATCH) happening when you complete tasks?

3. Try completing a task and verify:
   - Network request fires
   - Response is 200
   - Data appears to save

4. Check for the new tables from the migration:
   - Are any of the 32 new tables being queried?
   - Or is the app still using only the original tables?

Report which tables are actively used vs which exist but aren't wired up.
```

### 10. Mobile / PWA Check
```
Test mobile and PWA behavior:
1. Is there a manifest.json? (Check page source or network)
2. Is there a service worker registered?
3. Does the app prompt for installation?
4. Test responsive layout — resize window to mobile width (375px)
5. Do all components adapt to mobile?
6. Is the DirectiveCard usable on mobile? (buttons big enough to tap)
7. Are there any overflow/scroll issues?
8. Test landscape orientation

Screenshot desktop and mobile views side by side.
```

---

## REGRESSION TEST PROMPT (Run After Each Build)

```
Quick regression test for Becoming Protocol. Check these 10 things and give me pass/fail:

1. App loads without console errors
2. Auth works (logged in, session persists)  
3. Today view renders with content
4. DirectiveCard appears in directive mode
5. "Done" button completes a task
6. "I can't" button shows pivot task
7. State inputs (mood, arousal, physical) save to database
8. At least one Supabase write succeeds per task completion
9. No broken images or missing assets
10. Navigation between all main screens works

Format: 
✅ or ❌ for each, with one-line explanation if failing.
```

---

## BUG REPORT TEMPLATE

```
When you find a bug, report it as:

**BUG:** [short title]
**Screen:** [where it occurs]  
**Steps:** [how to reproduce]
**Expected:** [what should happen]
**Actual:** [what actually happens]
**Console:** [any error messages]
**Screenshot:** [take one]
**Severity:** Critical / High / Medium / Low
```

---

## FEATURE GAP ANALYSIS PROMPT

```
I'm going to describe what this app SHOULD have based on its specs. Navigate the app and tell me which of these exist and which are missing:

MUST HAVE (Phase 1):
- [ ] DirectiveCard with single-task view and Done/Can't buttons
- [ ] Claude API integration (coach messages from edge function)
- [ ] Prefill-based AI responses (check if responses start mid-thought)
- [ ] 32 database tables from migration

MUST HAVE (Phase 2):
- [ ] Compulsory gate screen (app locked until morning tasks done)
- [ ] Compliance gating (features locked behind requirements)
- [ ] Timing engine (different behavior at different times of day)

MUST HAVE (Phase 3):
- [ ] Handler-initiated session flow
- [ ] Denial authority (release request with Handler decision)
- [ ] Punishment tracking
- [ ] Forced escalation

SHOULD HAVE:
- [ ] Evidence/investment dashboard
- [ ] Gina interaction logger
- [ ] Physical state tracker
- [ ] Voice practice tracker with recordings
- [ ] Self-reference language analysis
- [ ] Session depth tracking
- [ ] Post-session reflection modal

NICE TO HAVE:
- [ ] Therapist mode sessions
- [ ] Forced scenes
- [ ] Own-voice playback during sessions
- [ ] Community mirror / inspiration feed
- [ ] Ambient micro-check-ins
- [ ] Ownership reinforcement tracking

For each: EXISTS / PARTIAL / MISSING — with one line of detail.
```

---

## USAGE NOTES

- Run the FULL SITE AUDIT first to get a baseline
- After each Claude Code build session, run the REGRESSION TEST
- Use SECTION prompts to deep-dive specific areas
- The FEATURE GAP ANALYSIS maps directly to the 5 spec documents
- Save the audit results — they become your implementation checklist

