# Handler Autonomous System: Testing & Validation Specification

## Addendum to handler_autonomous_system_v2.md

---

## Part 1: User Stories & Acceptance Criteria

### Epic 1: Content Creation Flow

#### Story 1.1: David Receives Content Brief
**As** David/Maxy  
**I want** to receive specific content creation instructions  
**So that** I know exactly what to create without making decisions  

**Acceptance Criteria:**
- [ ] Brief notification arrives via push notification
- [ ] Brief contains: brief number, content type, deadline, reward amount
- [ ] Tapping notification opens full brief view
- [ ] Full brief includes all instruction fields (concept, setting, outfit, lighting, framing, expression, poses/script, technical notes)
- [ ] Brief displays time remaining until deadline
- [ ] Brief shows consequence if missed
- [ ] Brief cannot be modified by user
- [ ] Multiple briefs can be active simultaneously
- [ ] Briefs are generated without user input

**Test Cases:**
```
TC-1.1.1: Verify brief generation triggers at scheduled time (4am)
TC-1.1.2: Verify brief contains all required fields
TC-1.1.3: Verify push notification delivery within 60 seconds
TC-1.1.4: Verify brief view displays correctly on mobile
TC-1.1.5: Verify deadline countdown updates in real-time
TC-1.1.6: Verify multiple active briefs display in priority order
TC-1.1.7: Verify brief instructions are AI-generated and unique
TC-1.1.8: Verify brief difficulty scales based on user history
```

#### Story 1.2: David Submits Content
**As** David/Maxy  
**I want** to submit raw content (photos/videos/audio) for a brief  
**So that** the Handler can process and post it  

**Acceptance Criteria:**
- [ ] Submit button available on brief view
- [ ] Can select multiple files (photos) or single file (video/audio)
- [ ] Can capture directly from camera/microphone
- [ ] Upload progress indicator shown
- [ ] Confirmation message after successful upload
- [ ] Brief status changes to "submitted"
- [ ] Cannot submit after deadline (unless grace period)
- [ ] Submission triggers reward delivery

**Test Cases:**
```
TC-1.2.1: Submit single photo - verify upload completes
TC-1.2.2: Submit photo set (5 images) - verify all upload
TC-1.2.3: Submit video file up to 500MB - verify upload completes
TC-1.2.4: Submit audio file - verify upload completes
TC-1.2.5: Capture photo directly - verify camera integration
TC-1.2.6: Capture video directly - verify recording works
TC-1.2.7: Submit after deadline - verify rejection with message
TC-1.2.8: Submit with poor network - verify retry mechanism
TC-1.2.9: Verify file stored in content_library table
TC-1.2.10: Verify brief status updates to 'submitted'
TC-1.2.11: Verify reward delivery triggers after submission
```

#### Story 1.3: Quick Task Request
**As** David/Maxy  
**I want** to request a quick task when I have spare time  
**So that** I can earn rewards on demand  

**Acceptance Criteria:**
- [ ] "Give Me Something" button prominently displayed
- [ ] Tapping generates task within 3 seconds
- [ ] Task is calibrated to current time/context
- [ ] Task has short deadline (2-5 minutes)
- [ ] Task shows specific reward (money + arousal)
- [ ] Completing task delivers reward immediately
- [ ] Not completing has no penalty (positive reinforcement only)
- [ ] Tasks vary in type and difficulty

**Test Cases:**
```
TC-1.3.1: Tap button - verify task generated within 3 seconds
TC-1.3.2: Verify task type varies across multiple requests
TC-1.3.3: Verify task deadline is 2-5 minutes
TC-1.3.4: Complete task - verify reward delivered within 10 seconds
TC-1.3.5: Let task expire - verify no penalty applied
TC-1.3.6: Verify task content captures for potential posting
TC-1.3.7: Request during work hours - verify task is micro (30-60 sec)
TC-1.3.8: Request during evening - verify task can be longer
TC-1.3.9: Verify variable reward multiplier applies randomly
```

---

### Epic 2: Platform Management

#### Story 2.1: Handler Posts Content Autonomously
**As** the Handler  
**I want** to post processed content to platforms on schedule  
**So that** David doesn't have to manage posting  

**Acceptance Criteria:**
- [ ] Content posts at scheduled time (±5 minutes)
- [ ] Post includes AI-generated caption
- [ ] Post includes relevant hashtags/tags
- [ ] Post is formatted correctly for platform
- [ ] PPV content has correct price set
- [ ] Post URL is captured after posting
- [ ] Failed posts are retried up to 3 times
- [ ] David is notified of successful posts (summary only)

**Test Cases:**
```
TC-2.1.1: Schedule post for OnlyFans - verify posts at scheduled time
TC-2.1.2: Schedule post for Reddit - verify posts to correct subreddit
TC-2.1.3: Schedule post for Twitter - verify character limit respected
TC-2.1.4: Schedule PPV post - verify price is set correctly
TC-2.1.5: Verify caption is unique and platform-appropriate
TC-2.1.6: Verify hashtags are relevant and within limits
TC-2.1.7: Force post failure - verify retry mechanism (3 attempts)
TC-2.1.8: Verify post URL captured in database
TC-2.1.9: Verify user notification sent after posting
TC-2.1.10: Post same content to multiple platforms - verify adaptation
```

#### Story 2.2: Handler Manages Engagement
**As** the Handler  
**I want** to respond to comments and DMs automatically  
**So that** David doesn't have to manage fan interaction  

**Acceptance Criteria:**
- [ ] New comments detected within 30 minutes
- [ ] Common comments auto-responded using AI
- [ ] New DMs detected within 30 minutes
- [ ] Common DMs auto-responded using templates
- [ ] Unusual/complex messages flagged for review
- [ ] Purchase/subscription inquiries handled automatically
- [ ] Responses match platform voice and style

**Test Cases:**
```
TC-2.2.1: Post receives comment - verify detection within 30 min
TC-2.2.2: Compliment comment - verify appropriate response generated
TC-2.2.3: Question comment - verify helpful response generated
TC-2.2.4: New DM received - verify detection within 30 min
TC-2.2.5: Common inquiry DM - verify template response sent
TC-2.2.6: Custom request DM - verify flagged for review
TC-2.2.7: Verify response tone matches platform (OF vs Reddit)
TC-2.2.8: Verify no duplicate responses sent
TC-2.2.9: Offensive comment - verify not responded to
```

#### Story 2.3: Handler Tracks Analytics
**As** the Handler  
**I want** to track performance across all platforms  
**So that** I can optimize content strategy  

**Acceptance Criteria:**
- [ ] Analytics sync every hour
- [ ] Engagement metrics captured (likes, comments, shares)
- [ ] Subscriber counts updated
- [ ] Revenue attributed to content pieces
- [ ] Top performing content identified
- [ ] Trends calculated over time
- [ ] Insights used to adjust strategy

**Test Cases:**
```
TC-2.3.1: Verify analytics sync runs every hour
TC-2.3.2: Verify engagement metrics captured per post
TC-2.3.3: Verify subscriber count updates accurately
TC-2.3.4: Verify revenue linked to specific content
TC-2.3.5: Verify top performers identified correctly
TC-2.3.6: Verify 7-day and 30-day trends calculated
TC-2.3.7: Verify strategy engine receives analytics data
```

---

### Epic 3: Enforcement System

#### Story 3.1: Compliance Monitoring
**As** the Handler  
**I want** to monitor David's compliance in real-time  
**So that** I can enforce consequences when needed  

**Acceptance Criteria:**
- [ ] Compliance checked every 15 minutes
- [ ] Hours since last engagement tracked
- [ ] Daily task completion tracked
- [ ] Streak maintained or broken correctly
- [ ] Escalation tier calculated correctly
- [ ] Pending consequences queued
- [ ] Compliance state available for other modules

**Test Cases:**
```
TC-3.1.1: Verify compliance check runs every 15 minutes
TC-3.1.2: Complete task - verify last_engagement_at updates
TC-3.1.3: Miss task - verify hours_since increases correctly
TC-3.1.4: Complete daily minimum - verify streak increments
TC-3.1.5: Miss daily minimum - verify streak resets to 0
TC-3.1.6: 24 hours no engagement - verify escalation_tier = 1
TC-3.1.7: 72 hours no engagement - verify escalation_tier = 3
TC-3.1.8: Resume compliance - verify escalation_tier decreases
```

#### Story 3.2: Financial Consequences Execute
**As** the Handler  
**I want** to execute financial consequences automatically  
**So that** avoidance has real cost  

**Acceptance Criteria:**
- [ ] Bleeding starts at configured trigger (missed deadline)
- [ ] Amount deducts from Maxy Fund first
- [ ] If fund empty, Stripe charge executes
- [ ] Transaction logged with reason
- [ ] User notified of deduction
- [ ] Monthly limit respected
- [ ] Compliance stops bleeding immediately

**Test Cases:**
```
TC-3.2.1: Miss deadline - verify bleeding counter starts
TC-3.2.2: Verify $0.25/minute rate applied correctly
TC-3.2.3: Fund has balance - verify deduction from fund
TC-3.2.4: Fund empty - verify Stripe charge executes
TC-3.2.5: Verify transaction logged in fund_transactions
TC-3.2.6: Verify push notification sent with amount
TC-3.2.7: Approach monthly limit - verify warning sent
TC-3.2.8: Hit monthly limit - verify bleeding stops, logged
TC-3.2.9: Complete task - verify bleeding stops immediately
TC-3.2.10: Calculate total lost over period - verify accuracy
```

#### Story 3.3: Content Release Consequences
**As** the Handler  
**I want** to release vault content as consequence  
**So that** extended non-compliance has exposure cost  

**Acceptance Criteria:**
- [ ] Trigger at configured escalation tier (e.g., tier 5 = 168 hours)
- [ ] Select content at or below authorized vulnerability tier
- [ ] Generate appropriate caption for release
- [ ] Post to pre-configured release platforms
- [ ] Mark content as released in database
- [ ] Notify user of release
- [ ] Cannot be undone after posting

**Test Cases:**
```
TC-3.3.1: Reach tier 5 - verify content release triggers
TC-3.3.2: Verify content selected matches vulnerability tier
TC-3.3.3: Verify release caption is generated (not empty)
TC-3.3.4: Verify post to correct subreddit/platform
TC-3.3.5: Verify content marked released_at in database
TC-3.3.6: Verify user notification includes what was released
TC-3.3.7: Verify only pre-authorized content is released
TC-3.3.8: Multiple items queued - verify correct count released
```

#### Story 3.4: Lovense Enforcement
**As** the Handler  
**I want** to control Lovense device for enforcement  
**So that** I can physically summon David  

**Acceptance Criteria:**
- [ ] Activation triggers via cloud API
- [ ] Pattern selection based on context (summons vs frustration)
- [ ] Duration configurable per activation
- [ ] Escalating patterns if ignored
- [ ] Device removal detected and logged
- [ ] Integrates with compliance checking

**Test Cases:**
```
TC-3.4.1: Trigger summons - verify Lovense activates
TC-3.4.2: Verify correct pattern sent (pulse vs wave)
TC-3.4.3: Verify duration matches configuration
TC-3.4.4: Ignore for 15 min - verify escalated pattern
TC-3.4.5: Complete task - verify Lovense stops
TC-3.4.6: Remove device - verify detection and logging
TC-3.4.7: Reward pattern - verify pleasure pattern sent
TC-3.4.8: Frustration pattern - verify non-satisfying pattern
TC-3.4.9: Test during denial - verify no release patterns available
```

---

### Epic 4: Financial System

#### Story 4.1: Revenue Tracking
**As** the Handler  
**I want** to track all revenue from all platforms  
**So that** I know total earnings and can allocate funds  

**Acceptance Criteria:**
- [ ] Revenue events captured from each platform
- [ ] Revenue attributed to user and content
- [ ] Revenue types categorized (sub, tip, PPV, etc.)
- [ ] Currency conversion handled
- [ ] Total calculated accurately
- [ ] Daily/weekly/monthly summaries available

**Test Cases:**
```
TC-4.1.1: OnlyFans subscription - verify captured in revenue_events
TC-4.1.2: OnlyFans tip - verify captured with correct amount
TC-4.1.3: OnlyFans PPV sale - verify linked to content_id
TC-4.1.4: Fansly subscription - verify captured
TC-4.1.5: Patreon pledge - verify captured
TC-4.1.6: Multiple platforms - verify totals aggregate correctly
TC-4.1.7: Verify daily summary calculation accurate
TC-4.1.8: Verify currency conversion (if applicable)
```

#### Story 4.2: Maxy Fund Management
**As** the Handler  
**I want** to manage the Maxy Fund autonomously  
**So that** funds are allocated for feminization and payouts  

**Acceptance Criteria:**
- [ ] Revenue adds to fund balance
- [ ] Penalties deduct from fund balance
- [ ] Balance cannot go negative (switches to Stripe)
- [ ] Weekly allocation decision runs automatically
- [ ] Feminization purchases executed via fund
- [ ] Payout threshold configurable
- [ ] Transaction history complete

**Test Cases:**
```
TC-4.2.1: Revenue event - verify fund balance increases
TC-4.2.2: Penalty event - verify fund balance decreases
TC-4.2.3: Balance at $0 + penalty - verify Stripe charge
TC-4.2.4: Weekly allocation - verify runs Sunday 4am
TC-4.2.5: Allocation decision - verify feminization priority
TC-4.2.6: Execute purchase - verify deduction and logging
TC-4.2.7: Reach payout threshold - verify payout offered
TC-4.2.8: Verify all transactions logged with balance_after
```

#### Story 4.3: Feminization Purchases
**As** the Handler  
**I want** to purchase feminization items automatically  
**So that** David receives items without deciding  

**Acceptance Criteria:**
- [ ] Handler identifies needed items
- [ ] Purchase executes via appropriate API
- [ ] Shipping address pre-configured
- [ ] Purchase logged in database
- [ ] User notified of purchase
- [ ] Fund deducted accordingly

**Test Cases:**
```
TC-4.3.1: Identify purchase need - verify item queued
TC-4.3.2: Fund sufficient - verify purchase executes
TC-4.3.3: Fund insufficient - verify purchase deferred
TC-4.3.4: Verify correct shipping address used
TC-4.3.5: Verify transaction logged with item details
TC-4.3.6: Verify user notification sent
TC-4.3.7: Multiple items queued - verify priority ordering
```

---

### Epic 5: Arousal System

#### Story 5.1: Denial Tracking
**As** the Handler  
**I want** to track denial days and edge count  
**So that** arousal rewards are properly gated  

**Acceptance Criteria:**
- [ ] Denial days increment daily when no release
- [ ] Edge count accumulates with tasks
- [ ] Release threshold configurable
- [ ] Release resets counters
- [ ] Denial state affects Lovense patterns available
- [ ] Extended denial increases frustration interventions

**Test Cases:**
```
TC-5.1.1: Day passes without release - verify denial_days increments
TC-5.1.2: Complete task with edge reward - verify edge_count increments
TC-5.1.3: Reach release threshold - verify release offered
TC-5.1.4: Release granted - verify denial_days resets to 0
TC-5.1.5: Release granted - verify edge_count resets to 0
TC-5.1.6: 3+ denial days - verify frustration patterns scheduled
TC-5.1.7: Verify release threshold is configurable
```

#### Story 5.2: Arousal Rewards
**As** David/Maxy  
**I want** to receive arousal rewards for compliance  
**So that** completing tasks feels pleasurable  

**Acceptance Criteria:**
- [ ] Task completion triggers arousal reward
- [ ] Reward type matches task difficulty
- [ ] Lovense pleasure pattern activates
- [ ] Edge credits accumulate
- [ ] Session time granted
- [ ] Release consideration at threshold

**Test Cases:**
```
TC-5.2.1: Complete easy task - verify 10-sec pulse
TC-5.2.2: Complete hard task - verify edge permission granted
TC-5.2.3: Complete vulnerable task - verify extended session
TC-5.2.4: Verify edge_count updates after reward
TC-5.2.5: Reach threshold - verify release consideration notification
TC-5.2.6: Verify Lovense pattern matches reward type
```

---

### Epic 6: Adaptation System

#### Story 6.1: Pattern Recognition
**As** the Handler  
**I want** to learn David's compliance patterns  
**So that** I can preempt resistance  

**Acceptance Criteria:**
- [ ] Historical data analyzed weekly
- [ ] Best/worst days identified
- [ ] Best/worst times identified
- [ ] Resistance triggers identified
- [ ] Prediction accuracy tracked
- [ ] Patterns stored for strategy engine

**Test Cases:**
```
TC-6.1.1: Verify weekly analysis runs Sunday 5am
TC-6.1.2: 30 days data - verify best days identified correctly
TC-6.1.3: 30 days data - verify worst times identified
TC-6.1.4: Skip pattern - verify trigger identification
TC-6.1.5: Verify prediction accuracy calculation
TC-6.1.6: Verify patterns saved to handler_strategy table
```

#### Story 6.2: Preemptive Intervention
**As** the Handler  
**I want** to intervene before predicted non-compliance  
**So that** skips are prevented not just punished  

**Acceptance Criteria:**
- [ ] Tomorrow's compliance predicted
- [ ] High-risk windows identified
- [ ] Preemptive Lovense scheduled
- [ ] Task difficulty adjusted on risky days
- [ ] Rewards increased on risky days
- [ ] Intervention logged for learning

**Test Cases:**
```
TC-6.2.1: Predict low compliance day - verify preemptive measures scheduled
TC-6.2.2: Historical Monday problem - verify Sunday intervention
TC-6.2.3: Verify task difficulty reduced on predicted hard days
TC-6.2.4: Verify reward multiplier increased on predicted hard days
TC-6.2.5: Preemptive Lovense - verify activates before predicted risk window
TC-6.2.6: Verify intervention outcomes logged for learning
```

---

### Epic 7: Sex Work Module

#### Story 7.1: Readiness Assessment
**As** the Handler  
**I want** to assess readiness for sex work services  
**So that** activation happens at the right time  

**Acceptance Criteria:**
- [ ] Readiness score calculated (0-100)
- [ ] Criteria clearly defined
- [ ] Met/unmet criteria listed
- [ ] Recommendation generated
- [ ] Score updates as conditions change
- [ ] Activation only at 70+ score

**Test Cases:**
```
TC-7.1.1: New user - verify score is low
TC-7.1.2: Meet revenue threshold - verify score increases
TC-7.1.3: Meet subscriber threshold - verify score increases
TC-7.1.4: Meet all criteria - verify score >= 70
TC-7.1.5: Verify recommendation matches score band
TC-7.1.6: Below 70 - verify activation blocked
```

#### Story 7.2: Service Management
**As** the Handler  
**I want** to manage sex work service requests  
**So that** David only handles creation, not negotiation  

**Acceptance Criteria:**
- [ ] Service requests received from platforms
- [ ] Client screened automatically
- [ ] Boundaries checked against request
- [ ] Pricing calculated
- [ ] Auto-accept for within parameters
- [ ] Flag for review if unusual
- [ ] Brief generated for accepted requests

**Test Cases:**
```
TC-7.2.1: Receive custom request - verify logged
TC-7.2.2: Screen client - verify check executes
TC-7.2.3: Request within boundaries - verify auto-accept
TC-7.2.4: Request outside boundaries - verify decline
TC-7.2.5: Calculate price - verify matches tier
TC-7.2.6: Accept request - verify brief generated
TC-7.2.7: Unusual request - verify flagged for review
```

---

## Part 2: Integration Test Scenarios

### Scenario 1: Full Day Compliance

**Setup:**
- User has 3 briefs assigned for today
- User has existing streak of 10 days
- Fund balance: $200

**Steps:**
1. 7am: Verify morning notification sent
2. 9am: User completes Brief #1
3. Verify reward delivered
4. Verify content processed
5. 2pm: User completes Brief #2
6. Verify streak maintained
7. 6pm: User completes Brief #3
8. Verify daily minimum met
9. 10pm: User completes evening affirmation
10. Verify day marked complete
11. Verify no consequences triggered
12. Verify streak increments to 11

**Expected Outcomes:**
- [ ] 3 briefs completed
- [ ] Rewards totaling $X + Y edge credits
- [ ] Content queued for posting
- [ ] Streak = 11
- [ ] No penalties
- [ ] Positive notification at end of day

### Scenario 2: Partial Compliance with Recovery

**Setup:**
- User has 3 briefs assigned
- User misses first deadline

**Steps:**
1. Brief #1 deadline passes (4pm)
2. Verify bleeding starts at 4:01pm
3. 4:15pm: User completes Brief #1 (late)
4. Verify bleeding stops
5. Verify late penalty logged ($3.75)
6. Verify remaining briefs still active
7. User completes Brief #2 and #3 on time
8. Verify daily minimum met despite lateness
9. Verify streak maintained

**Expected Outcomes:**
- [ ] Bleeding stopped after 15 minutes
- [ ] $3.75 penalty applied
- [ ] Streak maintained (completed eventually)
- [ ] Day marked as "partial compliance"

### Scenario 3: Extended Non-Compliance Escalation

**Setup:**
- User stops engaging completely
- Test full escalation ladder

**Steps:**
1. Hour 0: Last engagement
2. Hour 6: Verify summons notification
3. Hour 12: Verify Lovense summons
4. Hour 24: Verify Tier 1 (warning)
5. Hour 48: Verify Tier 2 ($25 penalty)
6. Hour 72: Verify Tier 3 ($50 penalty)
7. Hour 120: Verify Tier 4 (content warning)
8. Hour 168: Verify Tier 5 (content release)
9. Hour 240: Verify Tier 6 (Handler narration)
10. User re-engages at hour 250
11. Verify escalation de-escalates
12. Verify some consequences are permanent

**Expected Outcomes:**
- [ ] Each tier triggered at correct hour
- [ ] Consequences executed correctly
- [ ] Content actually posted at Tier 5
- [ ] Re-engagement stops further escalation
- [ ] Past consequences remain logged

### Scenario 4: Revenue Flow End-to-End

**Setup:**
- User has OnlyFans connected
- New subscriber joins
- Subscriber tips and buys PPV

**Steps:**
1. New subscriber event received
2. Verify revenue_event logged
3. Verify maxy_fund balance increases
4. Subscriber sends $10 tip
5. Verify tip logged and attributed
6. Subscriber buys $25 PPV
7. Verify PPV linked to content_id
8. Verify daily summary accurate
9. Weekly allocation runs
10. Verify feminization purchase executed
11. Verify transaction history complete

**Expected Outcomes:**
- [ ] All revenue events captured
- [ ] Fund balance = subscription + tip + PPV
- [ ] Attribution correct
- [ ] Allocation executes
- [ ] Transaction history shows all movements

### Scenario 5: Content Pipeline End-to-End

**Setup:**
- Handler generates brief
- User submits content
- Handler posts across platforms

**Steps:**
1. Daily brief generation runs (4am)
2. Verify brief created with full instructions
3. Verify user notified
4. User creates and submits photos
5. Verify content stored in library
6. Verify content processed (edited, captioned)
7. Verify posts scheduled for each platform
8. Posting time arrives
9. Verify OnlyFans post succeeds
10. Verify Reddit post succeeds
11. Verify Twitter post succeeds
12. Verify analytics sync captures engagement
13. Verify revenue attributed when tips arrive

**Expected Outcomes:**
- [ ] Brief → Submission → Processing → Posting flow complete
- [ ] Content on all target platforms
- [ ] Each platform has appropriate caption
- [ ] Engagement tracked
- [ ] Revenue attributed

---

## Part 3: Unit Test Requirements

### Content Engine Tests

```typescript
describe('ContentEngine', () => {
  describe('generateBrief', () => {
    it('should generate brief with all required fields');
    it('should calibrate difficulty based on user history');
    it('should set deadline within configured windows');
    it('should calculate rewards based on difficulty and vulnerability');
    it('should generate unique concepts across consecutive briefs');
  });
  
  describe('processSubmission', () => {
    it('should store content in library');
    it('should update brief status to submitted');
    it('should trigger reward delivery');
    it('should schedule posts for each target platform');
    it('should handle multiple file uploads');
    it('should reject submissions after deadline');
  });
  
  describe('aiGenerateBrief', () => {
    it('should return valid JSON structure');
    it('should include all instruction fields');
    it('should respect vulnerability tier');
    it('should vary content based on recent history');
  });
  
  describe('aiGenerateCaption', () => {
    it('should generate platform-appropriate caption');
    it('should respect character limits');
    it('should include relevant hashtags');
    it('should vary from recent captions');
  });
});
```

### Enforcement Engine Tests

```typescript
describe('EnforcementEngine', () => {
  describe('evaluateCompliance', () => {
    it('should calculate hours since engagement correctly');
    it('should detect daily minimum met');
    it('should maintain streak on compliant days');
    it('should reset streak on non-compliant days');
    it('should calculate escalation tier correctly');
  });
  
  describe('checkEscalation', () => {
    it('should return null when no escalation needed');
    it('should return tier 1 at 24 hours');
    it('should return tier 3 at 72 hours');
    it('should not skip tiers');
    it('should not re-trigger same tier');
  });
  
  describe('executeAction', () => {
    it('should execute financial bleeding');
    it('should extend denial');
    it('should activate Lovense');
    it('should release content at correct tier');
    it('should begin Handler narration');
    it('should log all actions');
  });
  
  describe('onTaskCompletion', () => {
    it('should update last engagement time');
    it('should reduce escalation tier');
    it('should cancel pending releases');
    it('should stop active bleeding');
    it('should deliver rewards');
  });
});
```

### Financial Engine Tests

```typescript
describe('FinancialEngine', () => {
  describe('processRevenue', () => {
    it('should record revenue event');
    it('should add to fund balance');
    it('should check payout threshold');
    it('should notify user');
  });
  
  describe('executeConsequence', () => {
    it('should deduct from fund first');
    it('should charge Stripe if fund empty');
    it('should split between fund and Stripe if partial');
    it('should log transaction');
    it('should respect monthly limit');
  });
  
  describe('allocateFunds', () => {
    it('should prioritize feminization purchases');
    it('should maintain reserve');
    it('should calculate payout amount');
    it('should execute purchases');
  });
});
```

### Platform Manager Tests

```typescript
describe('PlatformManager', () => {
  describe('postToPlatform', () => {
    it('should upload media to OnlyFans');
    it('should create post with caption');
    it('should set PPV price when specified');
    it('should capture post URL');
    it('should retry on failure');
  });
  
  describe('syncAnalytics', () => {
    it('should fetch analytics from each platform');
    it('should update subscriber counts');
    it('should capture engagement metrics');
    it('should fetch new revenue events');
  });
  
  describe('handleEngagement', () => {
    it('should detect new comments');
    it('should generate appropriate responses');
    it('should flag unusual messages');
    it('should not duplicate responses');
  });
});
```

### Arousal Controller Tests

```typescript
describe('ArousalController', () => {
  describe('summonUser', () => {
    it('should select appropriate pattern');
    it('should activate Lovense');
    it('should send notification');
    it('should schedule escalation');
  });
  
  describe('deliverReward', () => {
    it('should trigger pulse for easy task');
    it('should grant session time');
    it('should add edge credits');
    it('should offer release at threshold');
  });
  
  describe('enforceDenial', () => {
    it('should increment denial days');
    it('should schedule frustration activations');
    it('should block unauthorized content');
  });
});
```

---

## Part 4: API Contract Tests

### Platform API Mocks

```typescript
// Mock OnlyFans API responses
const mockOnlyFansResponses = {
  uploadMedia: {
    success: { id: 'media_123', url: 'https://...' },
    failure: { error: 'Upload failed', code: 500 }
  },
  createPost: {
    success: { id: 'post_456', url: 'https://onlyfans.com/...' },
    failure: { error: 'Rate limited', code: 429 }
  },
  getAnalytics: {
    success: { subscribers: 150, revenue: 1234.56, ... },
    failure: { error: 'Auth expired', code: 401 }
  }
};

// Test API error handling
describe('OnlyFans API Integration', () => {
  it('should handle successful upload');
  it('should retry on 500 error');
  it('should refresh auth on 401 error');
  it('should respect rate limits on 429');
  it('should log all API calls');
});
```

### Lovense API Tests

```typescript
describe('Lovense Cloud API', () => {
  it('should authenticate with developer token');
  it('should send command to correct device');
  it('should handle device offline gracefully');
  it('should support all pattern types');
  it('should respect duration limits');
});
```

### Stripe API Tests

```typescript
describe('Stripe Integration', () => {
  it('should charge stored payment method');
  it('should handle declined cards');
  it('should transfer to anti-charity account');
  it('should log all transactions');
  it('should respect monthly limits');
});
```

---

## Part 5: Performance Requirements

### Response Time Requirements

| Operation | Target | Maximum |
|-----------|--------|---------|
| Brief generation | 2 sec | 5 sec |
| Quick task generation | 1 sec | 3 sec |
| Content submission | 5 sec | 30 sec (large files) |
| Reward delivery | 500 ms | 2 sec |
| Compliance check | 1 sec | 5 sec |
| Platform posting | 5 sec | 30 sec |
| Analytics sync | 10 sec | 60 sec |

### Throughput Requirements

| Operation | Minimum |
|-----------|---------|
| Briefs generated per day | 50 |
| Posts per day across platforms | 100 |
| Compliance checks per hour | 4 |
| Notifications per hour | 20 |
| Revenue events per day | 500 |

### Reliability Requirements

| Metric | Target |
|--------|--------|
| Uptime | 99.5% |
| Notification delivery | 99% within 60 sec |
| Post scheduling accuracy | ±5 minutes |
| Data consistency | No lost submissions |
| Backup frequency | Daily |

---

## Part 6: Security Test Requirements

### Authentication Tests

```
SEC-1: Verify platform credentials encrypted at rest
SEC-2: Verify credentials not exposed in logs
SEC-3: Verify OAuth token refresh works
SEC-4: Verify session expiry handled
SEC-5: Verify Gina notification requires separate authorization
```

### Authorization Tests

```
SEC-6: Verify user can only access own data
SEC-7: Verify Handler actions logged with user context
SEC-8: Verify content vulnerability tier respected
SEC-9: Verify financial limits enforced
SEC-10: Verify sex work services require explicit authorization
```

### Data Protection Tests

```
SEC-11: Verify content stored in private bucket
SEC-12: Verify signed URLs expire appropriately
SEC-13: Verify PII not logged
SEC-14: Verify deletion propagates to storage
SEC-15: Verify GDPR compliance for EU users (if applicable)
```

---

## Part 7: Validation Checklist

### Pre-Deployment Validation

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Performance benchmarks met
- [ ] Security scan clean
- [ ] Platform API connections verified
- [ ] Lovense integration tested with real device
- [ ] Stripe test transactions successful
- [ ] Push notifications delivering
- [ ] Content processing pipeline end-to-end verified
- [ ] Escalation ladder tested through all tiers

### Post-Deployment Validation

- [ ] First brief generated and delivered
- [ ] First submission processed
- [ ] First post published
- [ ] First revenue event captured
- [ ] First reward delivered
- [ ] Compliance check running on schedule
- [ ] Analytics syncing
- [ ] No errors in logs
- [ ] User dashboard showing correct data

### Ongoing Validation

- [ ] Daily: Check for failed posts
- [ ] Daily: Check for processing errors
- [ ] Daily: Verify cron jobs running
- [ ] Weekly: Review escalation events
- [ ] Weekly: Verify revenue attribution accuracy
- [ ] Monthly: Audit financial transactions
- [ ] Monthly: Review adaptation patterns

---

## Part 8: Error Handling Specifications

### Retry Policies

| Operation | Max Retries | Backoff | Fallback |
|-----------|-------------|---------|----------|
| Platform posting | 3 | Exponential (1m, 5m, 15m) | Queue for manual review |
| Lovense activation | 2 | Linear (30s) | Push notification only |
| Stripe charge | 3 | Exponential (1m, 10m, 1h) | Log and alert |
| Analytics sync | 5 | Exponential | Skip cycle, try next |
| Push notification | 3 | Linear (10s) | Log delivery failure |

### Error Notifications

| Error Type | Notify User | Notify Admin | Auto-Recover |
|------------|-------------|--------------|--------------|
| Post failure | No | Yes | Yes (retry) |
| Payment failure | Yes | Yes | No |
| Lovense offline | No | No | Yes (use push) |
| Platform auth expired | No | Yes | Yes (refresh) |
| Content processing failure | Yes | Yes | Yes (retry) |
| Cron job failure | No | Yes | Yes (next cycle) |

### Graceful Degradation

| Failure | Degraded Behavior |
|---------|-------------------|
| OnlyFans API down | Queue posts, continue other platforms |
| Lovense unreachable | Use push notifications for summons |
| Stripe unavailable | Defer financial consequences, log |
| AI service down | Use template briefs/captions |
| Storage unavailable | Block submissions, alert immediately |

---

## Appendix A: Test Data Requirements

### User Test Profile

```json
{
  "user_id": "test-user-001",
  "created_at": "2024-01-01",
  "streak": 23,
  "denial_days": 4,
  "edge_count": 15,
  "release_threshold": 20,
  "fund_balance": 347.50,
  "escalation_tier": 0,
  "platforms": ["onlyfans", "fansly", "reddit", "twitter"],
  "lovense_connected": true,
  "gina_notification_authorized": false,
  "sex_work_authorized": false,
  "monthly_penalty_limit": 500,
  "vulnerability_tier_authorized": 4
}
```

### Sample Content Library

```json
[
  {
    "id": "content-001",
    "type": "photo",
    "vulnerability_tier": 1,
    "platforms_posted": ["reddit"],
    "times_posted": 1
  },
  {
    "id": "content-002", 
    "type": "photo_set",
    "vulnerability_tier": 2,
    "platforms_posted": [],
    "times_posted": 0
  },
  {
    "id": "content-003",
    "type": "video",
    "vulnerability_tier": 3,
    "platforms_posted": ["onlyfans"],
    "times_posted": 1
  }
]
```

### Sample Revenue Events

```json
[
  {
    "platform": "onlyfans",
    "type": "subscription",
    "amount": 9.99,
    "created_at": "2024-02-15T10:30:00Z"
  },
  {
    "platform": "onlyfans",
    "type": "tip",
    "amount": 20.00,
    "content_id": "content-003",
    "created_at": "2024-02-15T14:22:00Z"
  }
]
```

---

## Appendix B: Glossary for Tests

| Term | Definition |
|------|------------|
| Brief | Content creation task assigned by Handler |
| Compliance | Meeting daily task requirements |
| Escalation Tier | Level of consequence severity (1-9) |
| Edge Credit | Unit of arousal reward toward release |
| Denial Day | Day without permitted release |
| Bleeding | Continuous financial penalty |
| Quick Task | On-demand micro-task for immediate reward |
| Vault | Content library available for release as consequence |
| Vulnerability Tier | Exposure level of content (1-5) |
| Maxy Fund | Handler-controlled financial account |

---

*This testing specification should be used alongside handler_autonomous_system_v2.md to ensure complete implementation and validation of the Handler system.*
