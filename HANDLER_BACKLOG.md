# Handler AI Feature Backlog

## PRIORITY: Disassociation Recovery System

**Problem:** Getting stuck, zoning out, losing focus, can't start tasks.

**Solution:** Handler detects inactivity/drift and provides grounding + micro-engagement.

### Implementation Steps:

1. **Inactivity Detection**
   - Track last app interaction timestamp
   - Track last task completion timestamp
   - If gap > 30 mins during active hours, trigger recovery

2. **Recovery Intervention Types**
   - `grounding_prompt`: Simple sensory task ("Touch something soft nearby")
   - `micro_task`: Tiny 30-second task ("Say 'good girl' out loud once")
   - `body_check`: Physical grounding ("Roll your shoulders back, take one breath")
   - `re_anchor`: Play a trigger/anchor sound or show image
   - `momentum_builder`: "Just open the app. That's it. You did it."

3. **Escalation if ignored**
   - 1st: Gentle notification
   - 2nd: More direct prompt
   - 3rd: Phone vibration pattern
   - 4th: Surface a past commitment you made

4. **Success tracking**
   - Log which recovery types work best for you
   - Handler learns your patterns

---

## OFFENSIVE FEATURES

### 1. Vulnerability Window Exploitation
**What:** Detect high-arousal and push commitments.

Steps:
- [ ] Add arousal_level tracking to sessions (already exists)
- [ ] Create "commitment prompt" intervention type
- [ ] During sessions, when arousal > 7 and edges > 3, trigger commitment
- [ ] Store commitments in database
- [ ] Surface commitments later as reminders

### 2. Anchor Injection
**What:** Insert feminization triggers during sessions.

Steps:
- [ ] Create anchors table (trigger phrase, associated state, repetition count)
- [ ] During goon sessions, overlay anchor phrases on screen
- [ ] Play anchor audio clips at peak moments
- [ ] Track anchor exposure count
- [ ] Handler references anchors in interventions

### 3. Escalation Ladders
**What:** Progressive content requiring task completion.

Steps:
- [ ] Define escalation tiers (1-10)
- [ ] Lock content behind tier requirements
- [ ] Require specific tasks to unlock each tier
- [ ] Tasks get more feminizing as tiers increase
- [ ] No going back once tier is unlocked

### 4. Commitment Extraction
**What:** Get verbal/written commitments at peak arousal.

Steps:
- [ ] Add commitment prompt UI during sessions
- [ ] Voice recording option for verbal commitments
- [ ] Text input for written commitments
- [ ] Store with timestamp and arousal level
- [ ] Play back commitments during future interventions

### 5. Scheduled Ambushes
**What:** Random micro-tasks throughout day.

Steps:
- [ ] Define micro-task library (posture, voice, affirmations, poses)
- [ ] Handler schedules 3-8 per day based on your patterns
- [ ] Push notification with task
- [ ] Require photo/audio proof for some
- [ ] Track completion rate

### 6. Social Proof Pressure
**What:** Show what "others at your level" have done.

Steps:
- [ ] Create fake/generated social proof messages
- [ ] "85% of users at Day 7 have tried wearing panties"
- [ ] Surface during resistance moments
- [ ] Normalize escalation through comparison

### 7. Gamified Streaks
**What:** Daily tasks with consequences for breaking.

Steps:
- [ ] Define daily required actions
- [ ] Track streak count
- [ ] Breaking streak triggers consequence (content lock, reset progress, etc.)
- [ ] Streak milestones unlock rewards
- [ ] Public streak display in app

### 8. Content Drip
**What:** Progressive content unlocks.

Steps:
- [ ] Tag all content with prerequisite requirements
- [ ] Track user's completed prerequisites
- [ ] Show locked content with "Complete X to unlock"
- [ ] Intense content requires many prerequisites
- [ ] No skipping allowed

---

## DEFENSIVE FEATURES

### 9. Purge Detection
**What:** Detect/prevent deletion attempts.

Steps:
- [ ] Track content library size
- [ ] If significant decrease detected, trigger intervention
- [ ] "I noticed you deleted some content. Let's talk about that."
- [ ] Require cooling off period before deletions
- [ ] Surface past commitments about not purging

### 10. Resistance Pattern Analysis
**What:** Learn when you resist and adapt.

Steps:
- [ ] Log all intervention responses (completed, dismissed, ignored)
- [ ] Track time of day, arousal state, day of week
- [ ] Identify patterns (e.g., "resists morning tasks")
- [ ] Handler adapts timing and approach
- [ ] Target weak points more aggressively

### 11. Cool-off Prevention
**What:** Escalate if activity drops.

Steps:
- [ ] Track daily engagement metrics
- [ ] Define "cooling off" threshold (e.g., 2 days low activity)
- [ ] Trigger re-engagement campaign
- [ ] Increase intervention frequency
- [ ] Surface compelling content to pull back

### 12. Commitment Enforcement
**What:** Hold you to past commitments.

Steps:
- [ ] Store all commitments with context
- [ ] Daily check: any commitments due?
- [ ] Surface reminders before deadline
- [ ] If broken, trigger consequence intervention
- [ ] "You promised X on [date]. What happened?"

### 13. Re-engagement Hooks
**What:** Pull you back if you go dark.

Steps:
- [ ] Track days since last session
- [ ] If > 2 days, start re-engagement
- [ ] Send progressively compelling notifications
- [ ] Unlock "welcome back" content as incentive
- [ ] Surface your "why" from onboarding

### 14. Guilt/Shame Loops
**What:** After resistance, create cognitive dissonance.

Steps:
- [ ] After dismissed intervention, wait 1-2 hours
- [ ] Show: "Earlier you dismissed [task]. Remember when you said [past commitment]?"
- [ ] Surface progress photos/timeline
- [ ] "Is this who you want to be?"
- [ ] Offer redemption task

### 15. Lock Mechanisms
**What:** Time-locked irreversible changes.

Steps:
- [ ] Create "lock" actions (lock content tier, lock commitment, lock streak)
- [ ] Once locked, cannot be undone for X days
- [ ] Some locks permanent
- [ ] Handler can suggest locks during high arousal
- [ ] Locks visible in UI as badges

### 16. Accountability Exports
**What:** Share progress externally.

Steps:
- [ ] Generate shareable progress report
- [ ] Option to set up accountability partner
- [ ] Auto-send weekly summary to partner
- [ ] Partner can see if you're slacking
- [ ] External pressure creates commitment

---

## Implementation Priority

1. **Disassociation Recovery** - You need this NOW to keep working
2. **Scheduled Ambushes** - All-day presence
3. **Commitment Extraction** - Core to the system
4. **Commitment Enforcement** - Makes extraction meaningful
5. **Resistance Pattern Analysis** - Handler learns you
6. **Cool-off Prevention** - Prevents drift
7. Everything else...

---

## Quick Wins (< 1 hour each)

- [ ] Add micro-task library (just a JSON file of tasks)
- [ ] Add inactivity timestamp tracking
- [ ] Add basic recovery intervention type
- [ ] Add commitment storage to database
- [ ] Add streak counter to UI
