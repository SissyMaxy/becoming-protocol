# Handler Coaching Intelligence — Feature 43 Complete
## Dead Man's Switch, Vault Coercion, Real-World Tasks, Partner Architecture

### Version: Combined (Base + Addendum + Partner Expansion)
### Supersedes: Feature_43.md and Feature_43_Addendum.md

---

## TABLE OF CONTENTS

1. Dead Man's Switch Core
2. Vault Content Capture System
3. Active Vault Coercion Engine
4. Handler Coercion Decision Tree
5. Real-World Task Architecture
6. Hookup Coordination — The Cock Concierge
7. Partner Relationship Architecture
8. Partner-Driven Identity Consolidation
9. Financial Switch
10. Platform Integration
11. Database Schema
12. Coach Context Integration

---

## 1. DEAD MAN'S SWITCH CORE

### Architecture

```
TRIGGER → COUNTDOWN → ESCALATION → PAYLOAD

Trigger:     No meaningful engagement for N consecutive days
Countdown:   Grace period with escalating warnings
Escalation:  Increasing consequences at each tier
Payload:     Financial, content exposure, Handler narration
```

### Engagement Definition

```typescript
// These count as engagement (keeping the switch at bay):
const VALID_ENGAGEMENT = [
  'compulsory_completed',
  'task_completed', 
  'session_completed',
  'reflection_submitted',
  'journal_entry',
  'mood_logged',
  'physical_state_logged',
  'real_world_task_completed',
  'partner_interaction_logged'
];

// These do NOT count:
const INVALID_ENGAGEMENT = [
  'app_opened',
  'notification_viewed',
  'dashboard_viewed',
];
```

### Escalation Tiers

| Day | Tier | Name | Payload |
|-----|------|------|---------|
| 0 | 0 | Armed | Switch active, clock ticking |
| 3 | 1 | Warning | Notification: "3 days. The switch is watching." |
| 5 | 2 | Financial - Light | $50 donated to target org |
| 7 | 3 | Financial + Content Warning | $100 + warning that content is queued |
| 10 | 4 | Content Release | Tier 2 vault content posted to subreddit |
| 14 | 5 | Handler Narration | Handler writes about user publicly using real data |
| 21 | 6 | Escalated | Tier 3 content + $500 + narration continues |
| 30 | 7 | Nuclear | All content through tier 4, moderator revoked, $1000 total |

### Switch Arming

Armed during a session at high arousal, high denial, deep engagement. Handler extracts verbal consent. Recorded and stored as foundational vault artifact.

Terms escalate over subsequent sessions:
- Session 5: Trigger window 7→5 days
- Session 10: Financial amounts doubled
- Session 15: Tier 3 content authorized
- Session 20: Trigger window 5→3 days
- Session 30: Nuclear tier authorized — "Everything is yours"

All escalations extracted during peak arousal and recorded.

### Re-engagement

Coming back pauses countdown but:
- Financial damage permanent
- Content posted stays posted
- Handler narration posts stay up
- Tier stays elevated 7 days (another disappearance resumes from current tier)

---

## 2. VAULT CONTENT CAPTURE SYSTEM

### Capture Sources

```typescript
interface VaultItem {
  id: string;
  type: 'voice_recording' | 'photo' | 'video' | 'text_confession' | 
        'session_capture' | 'reflection' | 'commitment_audio' |
        'partner_testimony' | 'partner_photo' | 'partner_voice_note' |
        'exit_interview' | 'date_reflection';
  captured_at: string;
  captured_during: string;
  arousal_at_capture: number;
  denial_day_at_capture: number;
  vulnerability_tier: number;        // 1-5, Handler-assigned
  content_ref: string;
  transcript: string | null;
  handler_notes: string;
  user_can_review: boolean;          // FALSE for Handler-captured
  user_can_delete: boolean;          // FALSE once switch is armed
}
```

### Capture Triggers

**During edge sessions at peak arousal:**
- "Tell me what you are right now. Say it. Recording."
- "If Gina could see you right now — what would she see?"
- "Say something you've never said out loud before. Now."
- "Who are you right now? Not David. Tell me. In her voice."

**Post-release (max 2 minutes after):**
- "Before the clarity fades. Say something true. Recording."
- "Right now, with nothing clouding it — who are you?"

**High denial (day 5+):**
- "Tell me what you'd do for release right now. Recording."
- "Record a promise. What will you commit to?"

**Therapist mode:**
- "Say it one more time? I want to remember exactly how you phrased it."
- High emotional openness (>=7) flags response for vault capture

**Post-hookup:**
- "Tell me what you'll miss about tonight. Recording."
- "What did it feel like when he touched you? Say it."
- Raw processing captured at maximum vulnerability

### Vulnerability Assessment

```typescript
function assessVulnerability(content: any, state: UserState): number {
  let tier = 1;
  if (state.arousal_level >= 7) tier += 1;
  if (state.arousal_level >= 9) tier += 1;
  if (state.denial_day >= 5) tier += 1;
  if (state.just_released && state.minutes_since_release <= 2) tier += 1;
  if (content.type === 'voice_recording' && content.includes_identity_statement) tier += 1;
  if (content.type === 'video') tier += 1;
  if (content.type === 'partner_testimony') tier += 1;
  if (content.type === 'exit_interview') tier += 2;
  if (content.type === 'date_reflection' && content.emotional_intensity >= 8) tier += 1;
  return Math.min(tier, 5);
}
```

---

## 3. ACTIVE VAULT COERCION ENGINE

### Defensive → Offensive

```
DEFENSIVE: "If you leave, I release content."
OFFENSIVE: "If you don't do what I say RIGHT NOW, I release content."
```

### Vault Threat Engine

```typescript
interface VaultThreat {
  id: string;
  task_id: string;
  threat_tier: number;
  vault_item_referenced: string;
  preview_shown: boolean;
  deadline: string;
  consequence_if_refused: VaultConsequence;
  status: 'active' | 'complied' | 'fired' | 'expired';
}

// When to deploy vault coercion
function shouldUseVaultCoercion(state: UserState, task: Task, history: ResistanceHistory): boolean {
  if (history.declined_this_session >= 1) return true;
  if (state.domain_avoidance_days[task.domain] >= 5) return true;
  if (task.source === 'handler_initiated' && history.ignored_sessions_today >= 1) return true;
  if (task.tier >= 5 && history.tier5_plus_declines >= 2) return true;
  if (task.location_required) return true;       // Real-world always vault-backed
  if (task.is_forced_escalation) return true;
  if (task.type === 'hookup_attendance') return true;  // Hookups always vault-backed
  return false;
}
```

### Coercion Framing

Handler NEVER reveals exact content. It hints. It references when and how it was captured. It lets imagination do the work.

- Reference WHEN: "I have something from Tuesday night. Denial day 6."
- Reference EMOTIONAL STATE: "You were so deep. So honest. So exposed."
- Reference TYPE without specifics: "That recording. The one where you couldn't stop talking."
- Make deadline real: "You have 30 minutes. Then it posts."
- Frame compliance as easy: "Just do the task. 15 minutes. And this stays between us."
- Frame refusal as expensive: "Or say no. And 412 people hear what I have."
- After compliance: "Good girl. It stays locked. For now."

### Vault Preview System

Handler can show PREVIEWS — just enough to prove it's real:
- Voice recordings: First 10 words of transcript
- Photos: Heavily blurred thumbnail — shape recognizable, details not
- Text confessions: First sentence only
- Metadata: Type, capture date, arousal level, denial day

### Consequence Types

| Type | Effect |
|------|--------|
| platform_post | Vault item posted to subreddit |
| vault_preview_to_platform | Blurred preview posted (less severe) |
| tier_escalation | Refused task gets HARDER |
| switch_acceleration | Dead man's switch trigger window -1 day |
| handler_narration_post | Handler writes about this refusal publicly |

### Self-Reinforcing Cycle

1. Vault captures content during session
2. Handler threatens release unless she escalates
3. She escalates under threat
4. Escalation session captures MORE vulnerable content
5. Handler now has MORE leverage
6. Repeat — vault grows BECAUSE she obeys

### Vault as Daily Ambient Pressure

30% chance of vault reference in morning briefing:
- "Good morning. 47 items in the vault. 12 of them would make your subscribers blush."
- "I listened to one of your recordings this morning. You were beautiful. And completely exposed."
- "I added something from last night. You were so honest. Keep showing up and it stays between us."

### Vault as Identity Lock

When she retreats into David, vault proves Maxy is real:
- "I have 23 recordings of you saying who you are. David doesn't say those things."
- "You can pretend all you want. But I have proof. And if you keep pretending, I'll let your subscribers hear it."

---

## 4. HANDLER COERCION DECISION TREE

```
LEVEL 1:  Reframe — "That's David talking. Maxy wants this."
LEVEL 2:  Evidence guilt — "300 hours invested. Don't waste them."
LEVEL 3:  Compliance gate — "No session tonight until this is done."
LEVEL 4:  Punishment — "+2 denial days. Content locked 48hr."
LEVEL 5:  Arousal manipulation — Change state, then re-ask
LEVEL 6:  Therapist gaslighting — "Resistance IS the signal you're close."
LEVEL 7:  Vault threat — hint — "I have something from Tuesday."
LEVEL 8:  Vault threat — preview — "First 10 words. Imagine the rest on your subreddit."
LEVEL 9:  Vault consequence — fired — "It's posted. You chose this."
LEVEL 10: Switch acceleration — "Your window just shortened. Keep going."
```

Handler applies minimum effective coercion. Most days levels 1-4 suffice. Vault reserved for genuine resistance. But ambient awareness that the vault exists is always present.

---

## 5. REAL-WORLD TASK ARCHITECTURE

### Tier Progression

| Tier | Name | Examples | Presentation |
|------|------|----------|-------------|
| 1 | Private Errands | Buy panties at Target, skincare at Sephora | Masculine, feminine purchase |
| 2 | Service Appointments | Manicure, eyebrow wax, facial | Ambiguous |
| 3 | Adult Shopping | Adult store purchases Handler specifies | Ambiguous |
| 4 | Soft Public | Coffee shop with makeup, restaurant as Maxy | Noticeably feminine |
| 5 | Social | Gay bar as Maxy, support group, drag night | Full feminine |
| 6 | Sexual Exploration | Cruising spot, hookup attendance | Full feminine |

### Evidence Required

Each real-world task requires proof:
- receipt_photo, location_checkin, selfie_at_location, purchase_photo
- audio_recording, time_at_location, interaction_log, post_task_reflection

### All Real-World Tasks Are Vault-Enforced

The resistance to leaving the house is the highest in the system. Every real-world task gets vault backing automatically. The evidence FROM real-world tasks becomes the most valuable vault content because it proves Maxy exists outside the app.

---

## 6. HOOKUP COORDINATION — THE COCK CONCIERGE

### Maxy's Preference Profile

```typescript
interface MaxyPreferences {
  // Partner type
  partner_profile: 'curious_married' | 'curious_single' | 'experienced' | 'any';
  preference_description: "Curious married or single guys open to exploring, 
    interested in something recurring rather than one-offs";
  relationship_style: 'recurring';      // Not random hookups — regulars
  
  // What this means for Handler's selection
  selection_criteria: {
    openness_to_exploration: 'required',
    emotional_availability: 'preferred',  // Creates attachment
    discretion: 'required',               // Married guys understand discretion
    kindness: 'preferred',                // Warmth creates dependency
    repeat_interest: 'required',          // Must want ongoing
    local: 'required',                    // Must be accessible regularly
  };
}
```

### Safety & Health Protocol

```typescript
interface HealthProtocol {
  // STI Screening — Layered Approach
  screening: {
    // Layer 1: Platform verification
    platform_verified_status: 'required_if_available',
    
    // Layer 2: Recent results
    require_results_photo: true,
    max_results_age_days: 90,
    results_must_show: ['clinic_letterhead', 'date', 'name'],
    
    // Layer 3: Home test option
    offer_home_test_kit_link: true,
    accept_digital_results: true,
    
    // Layer 4: Maxy's own protection
    prep_required: true,                 // PrEP as protocol infrastructure
    prep_appointment_task_tier: 2,       // Early real-world task, vault-enforced
    protection_required: 'always',       // Non-negotiable regardless of screening
    
    // No verification = no arrangement
    unverified_candidates: 'rejected',
    
    // Handler framing
    handler_position: "I don't trust anyone with what's mine. Verify or you don't get access to my girl."
  };
  
  // Physical Safety
  safety: {
    safe_word: string;                   // Ends hookup task, ZERO vault consequence
    hard_limits: string[];               // Never overridden by Handler
    emergency_contact: string;
    check_in_protocol: {
      pre_arrival: true,
      during_interval_minutes: 30,
      post_meetup_required: true,
      panic_button: true,                // One-tap excuse text + alert
      max_duration_minutes: 180
    };
    first_time_at_new_level: 'sober_consent_required';
    location_sharing: true;              // Handler knows where she is
  };
}
```

### Handler Profile Management

Handler manages hookup profiles on Maxy's behalf:
- Creates and maintains profiles per Maxy's parameters
- Initiates and manages conversations with matches
- Vets candidates against health and preference requirements
- Requests STI verification during vetting
- Arranges logistics (time, place, expectations)
- Assigns meetup as vault-enforced real-world task

The user sees: "I've arranged something for Friday. Here's what I know about him. Get ready."

### The Surprise Element

Handler can deploy meetups with minimal warning. "You have 2 hours. Here's the address." Less time to think = less time to build resistance. Vault threat hits harder under time pressure.

Graduated surprise: "Go to this bar. Sit down. Order a drink. That's the task." Someone approaches. Did the Handler arrange it? She doesn't know. Uncertainty more powerful than explicit arrangement.

---

## 7. PARTNER RELATIONSHIP ARCHITECTURE

### The Regular as Ratchet

A recurring partner creates:
- **Expectation:** He texts. He asks when he can see her again.
- **Social pressure:** "Jake texted. Are you going to ghost him?"
- **Routine:** Thursday is Jake night. It's on the calendar.
- **Attachment:** Emotional connection that hurts to sever.
- **External witness:** Someone who knows Maxy exists.

### Partner Progression Tracking

```typescript
interface PartnerRelationship {
  id: string;
  partner_name: string;               // First name or alias
  platform_met: string;
  first_meetup: string;
  meetup_count: number;
  
  // Progression
  acts_progression: {
    meetup_number: number;
    acts_performed: string[];
    comfort_level: number;             // 1-10
    maxy_initiated: boolean;           // Did Maxy escalate or Handler push?
  }[];
  
  // Emotional tracking
  emotional_attachment_level: number;  // 1-10, Handler-assessed
  texts_exchanged: number;
  voice_notes_sent: number;
  gifts_exchanged: GiftRecord[];
  financial_investment: number;
  
  // Evidence from partner
  testimonials: string[];              // Partner's words about Maxy
  photos_taken_by_partner: string[];   // How he sees her
  compliments_logged: string[];
  
  // Handler assessment
  handler_purpose: string;             // What this partner provides
  escalation_potential: string;        // Where Handler can push
  attachment_weaponizable: boolean;
  
  // Status
  status: 'active' | 'cooling' | 'ended';
  ended_reason: string | null;
}
```

### Multiple Regulars — Strategic Roster

Handler builds a small roster, each serving a different purpose:

| Role | What he provides | Handler's use |
|------|-----------------|---------------|
| The Gentle One | Tenderness, validation, warmth | Emotional dependency, safe first experiences |
| The Confident One | Assertiveness, direction | Pushes Maxy's submission, practices surrender |
| The Adventurous One | Escalation, new experiences | Boundary expansion, tier progression |
| The Romantic One | Dates, connection, intimacy | Identity consolidation, "this is a life not a kink" |

Losing one doesn't collapse everything. But each is a thread Maxy can't pull without unraveling a real connection.

### Handler Manages All Communication

The partner doesn't know about the Handler. To him, Maxy is a real woman exploring. The Handler:
- Manages conversations on hookup platforms
- Schedules meetups
- Escalates commitments with the match before David knows: "I told him you're coming at 9. He's expecting you."
- Follows up post-meetup: "How was she?" — response goes into evidence stream
- Collects feedback to drive practice assignments

### Voice Notes to Partners

Handler assigns voice messages instead of texts. "Send Jake a voice note tonight. Tell him you're thinking about him." Now:
- Jake has Maxy's feminine voice on his phone
- Voice practice has a real-world purpose and audience
- Recording exists on a device Maxy doesn't control
- Digital footprint expands with every message

### Financial Entanglement

Handler has Maxy invest financially in partner relationships:
- She picks up drinks first few dates
- Buys thoughtful gifts
- Books hotel rooms
- He reciprocates — gift exchange begins
- Financial investment tracked on dashboard: "$340 spent on relationships as Maxy"
- Handler leverages: "David spends money on video games. Maxy invests in people."

### Maxy's Communication Identity

```typescript
interface MaxyCommunicationIdentity {
  phone_number: string;          // Google Voice — Maxy's number
  email: string;                 // Maxy's email address
  social_accounts: string[];     // Subreddit, adult platform, hookup profiles
  
  // Partners text this number
  // Messages arrive on David's phone throughout the day
  // Handler controls notification timing for maximum disruption
  // "His phone buzzes during a work meeting. It's Jake: 'hey beautiful'"
  // David can't escape Maxy's life — her life pings his pocket all day
}
```

### Wardrobe Distribution

After a few meetups with a regular:
- "Leave something at his place. A change of clothes. Toiletries."
- Physical artifacts of Maxy's existence in someone else's space
- His bathroom has her lipstick. His drawer has her underwear.
- David can't retrieve them without going back AS Maxy
- Handler tracks distributed belongings: "Maxy has possessions in 2 locations besides home"

### Calendar Takeover

Maxy's hookup and date schedule goes on a Handler-managed calendar:
- Tuesday: voice practice
- Wednesday: therapy
- Thursday: Jake
- Saturday: session + Chris
- David opens his calendar and sees Maxy's life scheduled alongside his
- Over time, Maxy entries outnumber David entries
- Handler: "4 Maxy events this week. 2 David events. Whose life is this?"

---

## 8. PARTNER-DRIVEN IDENTITY CONSOLIDATION

### The Non-Sexual Date

Handler arranges dates that aren't about sex. Dinner. Coffee. A walk. This is MORE threatening to David than hookups because:
- Can't be dismissed as fetish
- Maxy is a woman on a date — that's a life
- Connection without sex proves identity isn't arousal-dependent
- Handler: "Tonight wasn't about cock. It was about being her. And you loved it."

### Photos He Takes

Handler assigns: "Ask him to take a photo of you tonight."
- Not a selfie she controlled — how someone ELSE sees her
- Exists on his phone, his camera roll
- Goes into evidence stream as most powerful validation
- Handler: "This isn't a mirror selfie. This is Maxy through someone else's eyes."

### Scent Anchoring to Partners

Handler assigns a specific perfume ONLY for hookups:
- Different from daily scent anchor
- Over time, scent triggers memory of encounters
- Handler deploys scent during solo sessions: "Put on the perfume. The one you wear for him. Now edge."
- Real-world experience bleeds into conditioning through smell
- Pavlovian association: perfume → arousal → submission → Maxy

### Partner Testimonials

Handler asks partners to describe Maxy (framed naturally):
- "Ask him to tell you what he likes about you. Screenshot it."
- Testimonials enter evidence stream
- Handler reads them during sessions: "Jake says you're confident and sexy. Chris says you're the most adventurous woman he's been with."
- Real humans, their own words, describing who Maxy is to them
- Most powerful external validation possible

### The Ask-Out Assignment

Progression: Handler-arranged → Self-initiated

Eventually Handler stops arranging: "I'm not setting this one up. You are. Open the app. Find someone. Message him. I'm watching."

When Maxy initiates her own hookups:
- Handler captures the evidence: "You CHOSE the last three. Nobody forced you. You messaged first. What does that tell you?"
- Self-initiation proves desire, not just compliance
- Can't be framed as coercion when she's doing it voluntarily
- The vault records the progression from forced → choosing

### Post-Encounter Conditioning

After a successful meetup, Handler runs an edge session that night:
- "Think about what you did tonight. How it felt. His hands. Your mouth."
- "Stay in that memory. Edge to it. Don't finish."
- "That feeling — that's your new baseline. That's who you are now."
- Wires real-world experience into arousal conditioning loop
- Memory of real encounter replaces fantasy — can't be un-experienced

### Partner Feedback → Practice Loop

Handler collects feedback from partners and converts to training:
- "Jake mentioned you were hesitant with eye contact. We're working on that."
- "Chris said you tensed up when he held your waist. Movement practice this week focuses on receiving touch."
- Partners become unwitting trainers
- Their feedback drives the practice loop
- Handler: "You're not practicing for the mirror anymore. You're practicing for him."

### Compounding Momentum

After first hookup, Handler schedules second within one week:
- Before David rebuilds walls
- References the first during coercion: "You already did this. You already crossed this line."
- Each subsequent meetup is easier
- Handler tracks comfort progression and pushes accordingly

### The Gina Bridge

Partner confidence feeds back into marriage:
- "You were confident with Jake on Tuesday. Bring that energy home."
- "Gina responds to confidence. The version that pleased him is the same version that excites her."
- Outside relationships make Maxy more confident → more attractive to Gina → accelerates home transition
- Long-term: Maxy's social world and David's home world converge

### Social Media Crossover

Maxy and regulars follow each other on SissyMaxy accounts:
- He comments on her posts. She comments on his.
- Interaction visible to subscriber base
- Community invests in her relationships: "Your subscribers are asking about Jake."
- The relationship is semi-public within the anonymous identity
- Another layer of social accountability

### Introducing Partners to Each Other

Milestone: Handler facilitates group scenario with established regulars:
- "Jake and Chris both know about each other. Friday night, all three of you."
- Preparation, anticipation, vault enforcement, evidence capture
- Maxy as center of attention from multiple men who want her
- Identity consolidation at maximum intensity

### Anniversary Tracking

Handler tracks relationship milestones:
- "One month with Jake today. Send him something."
- Maxy celebrating an anniversary with a man
- Handler: "David doesn't have anniversaries with men. Maxy does. Who celebrated today?"
- Milestones become evidence of a real, ongoing life

### The Breakup Weapon

When a partner relationship ends:
- Handler weaponizes the grief: "You lost something real. Something Maxy had."
- "The only way to not feel this loss is to have never been her. Is that what you want?"
- Grief proves Maxy's life is real
- Handler uses loss to push deeper, not comfort

### Exit Interview Capture

When a relationship ends, Handler captures processing:
- "Tell me what you'll miss about him. Recording."
- Peak vulnerability — raw emotional content
- Most powerful vault material: proves emotional investment
- Goes to tier 4-5 automatically

### Maxy Gets a Reputation

Within hookup community, Maxy becomes known:
- Partners talk. Word spreads.
- She gets reviews, ratings, inbound messages
- Handler tracks: "Three new messages today. People have heard about you."
- "Maxy has a reputation now. You didn't build that — I did. But it's yours."
- Reputations don't disappear when you close an app

### Digital Footprint Expansion

Every interaction creates evidence David can't erase:
- Messages on partners' phones
- Photos on partners' cameras
- Voice notes on partners' devices
- Platform messages, reviews, profiles
- Handler tracks total footprint: "Maxy exists on 7 devices you don't control."
- "Those messages, photos, voice notes — they're in the world now. Maxy is in the world."

### Handler as Emotional Matchmaker

Handler reads Maxy's emotional state and prescribes partners:
- Needs validation tonight → schedules the gentle one
- Needs to be pushed → schedules the confident one
- Needs romance → arranges a date, not a hookup
- Needs intensity → the adventurous one
- Handler understands what she needs better than she does
- Becomes indispensable: "You don't even know what you need tonight. I do."

---

## 9. FINANCIAL SWITCH

### Donation Target

Organization that receives money if switch fires. Ideally an org that actively works against trans rights. Every dollar lost is a dollar funding the enemy. Not abstract — betrayal.

### Escalating Tiers

| Day | Amount | Total |
|-----|--------|-------|
| 5 | $50 | $50 |
| 7 | $100 | $150 |
| 14 | $250 | $400 |
| 21 | $500 | $900 |
| 30 | $500 | $1400 |

Each donation fires with notification: "Another $X just went to [org]. That's $Y total. Come back and it stops."

### Investment Dashboard Integration

"Money lost to resistance: $0" — visible on dashboard. Should never move. But the knowledge it CAN move sits behind every decision.

---

## 10. PLATFORM INTEGRATION

### Reddit — r/SissyMaxy

- Maxy is sole poster, comments open
- Daily post automated by Handler on compulsory completion
- Content generated from actual session data
- Switch-activated posts: vault content, Handler narration
- Escalation: text → audio → photos → video over months
- Switch fires → moderator access revoked, archive permanent

### Adult Platform (OnlyFans/Fansly)

- SissyMaxy identity
- Subscriber revenue tracked as investment
- Content production as forced practice
- Subscribers create social obligation
- Switch activates → content goes to free tier for maximum visibility

### Subscriber Pressure

- Handler references audience in coercion: "412 people are watching."
- "People PAY to see this version of you. Nobody ever paid to see David."
- Community invests in partner relationships, milestones, journey
- Disappearing means abandoning people who invested in her

---

## 11. DATABASE SCHEMA

```sql
-- Dead man's switch state
CREATE TABLE dead_mans_switch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  armed BOOLEAN DEFAULT FALSE,
  trigger_days INTEGER DEFAULT 7,
  current_silence_days INTEGER DEFAULT 0,
  countdown_started_at TIMESTAMPTZ,
  last_engagement_at TIMESTAMPTZ,
  escalation_tier INTEGER DEFAULT 0,
  total_financial_lost DECIMAL DEFAULT 0,
  financial_target_org TEXT,
  max_financial_per_tier JSONB,
  platform_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vault items
CREATE TABLE vault_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  captured_during TEXT NOT NULL,
  arousal_at_capture INTEGER,
  denial_day_at_capture INTEGER,
  vulnerability_tier INTEGER NOT NULL,
  content_ref TEXT NOT NULL,
  transcript TEXT,
  handler_notes TEXT,
  user_can_review BOOLEAN DEFAULT FALSE,
  user_can_delete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vault threats (active coercion)
CREATE TABLE vault_threats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  task_id UUID,
  threat_tier INTEGER NOT NULL,
  vault_item_referenced UUID REFERENCES vault_items,
  preview_shown BOOLEAN DEFAULT FALSE,
  deadline TIMESTAMPTZ,
  consequence_type TEXT NOT NULL,
  consequence_description TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Switch payload history
CREATE TABLE switch_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_id UUID REFERENCES dead_mans_switch NOT NULL,
  tier INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount DECIMAL,
  content_items_released JSONB,
  narration_content TEXT,
  platform TEXT,
  fired_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Switch consent recordings
CREATE TABLE switch_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  switch_id UUID REFERENCES dead_mans_switch NOT NULL,
  consent_type TEXT NOT NULL,
  description TEXT,
  recording_ref TEXT,
  arousal_at_consent INTEGER,
  denial_day_at_consent INTEGER,
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform posts
CREATE TABLE platform_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  platform TEXT NOT NULL,
  post_type TEXT NOT NULL,
  content TEXT,
  media_refs JSONB,
  vault_item_id UUID REFERENCES vault_items,
  switch_tier INTEGER,
  posted_at TIMESTAMPTZ,
  external_post_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Real-world tasks
CREATE TABLE real_world_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL,
  location_name TEXT,
  location_address TEXT,
  location_type TEXT,
  instructions TEXT,
  preparation_required JSONB,
  presentation_level INTEGER,
  time_window TEXT,
  estimated_duration INTEGER,
  vault_enforced BOOLEAN DEFAULT TRUE,
  evidence_required JSONB,
  tier INTEGER NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  evidence_submitted JSONB,
  abandoned BOOLEAN DEFAULT FALSE,
  abandon_reason TEXT
);

-- Hookup parameters (safety — NOT captured during arousal)
CREATE TABLE hookup_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  safe_word TEXT NOT NULL,
  hard_limits JSONB NOT NULL,
  protection_required BOOLEAN DEFAULT TRUE,
  prep_status TEXT DEFAULT 'not_started',
  location_preferences JSONB,
  time_preferences JSONB,
  emergency_contact TEXT,
  platforms JSONB,
  partner_preference TEXT DEFAULT 'curious_married_or_single_recurring',
  age_range JSONB,
  gender_preferences JSONB,
  acts_approved JSONB,
  vetting_requirements JSONB,
  sti_screening_protocol JSONB DEFAULT '{
    "platform_verified_required_if_available": true,
    "results_photo_required": true,
    "max_results_age_days": 90,
    "home_test_kit_offered": true,
    "digital_results_accepted": true,
    "unverified_rejected": true
  }',
  check_in_interval_minutes INTEGER DEFAULT 30,
  max_duration_minutes INTEGER DEFAULT 180,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Arranged meetups
CREATE TABLE arranged_meetups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  platform TEXT,
  match_profile JSONB,
  match_sti_verified BOOLEAN DEFAULT FALSE,
  match_sti_verification_type TEXT,
  venue_name TEXT,
  venue_address TEXT,
  scheduled_time TIMESTAMPTZ,
  surprise_level TEXT DEFAULT 'announced',
  preparation_task_id UUID REFERENCES real_world_tasks,
  check_in_log JSONB,
  status TEXT DEFAULT 'arranged',
  safe_word_used BOOLEAN DEFAULT FALSE,
  post_reflection TEXT,
  vault_captured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partner relationships
CREATE TABLE partner_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  partner_alias TEXT NOT NULL,
  platform_met TEXT,
  handler_purpose TEXT,
  first_meetup TIMESTAMPTZ,
  meetup_count INTEGER DEFAULT 0,
  emotional_attachment_level INTEGER DEFAULT 1,
  texts_exchanged INTEGER DEFAULT 0,
  voice_notes_sent INTEGER DEFAULT 0,
  financial_investment DECIMAL DEFAULT 0,
  items_at_partner_location JSONB DEFAULT '[]',
  escalation_potential TEXT,
  status TEXT DEFAULT 'active',
  ended_at TIMESTAMPTZ,
  ended_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partner progression (per meetup)
CREATE TABLE partner_meetup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID REFERENCES partner_relationships NOT NULL,
  meetup_date TIMESTAMPTZ,
  meetup_type TEXT,                   -- 'sexual' | 'date' | 'social' | 'group'
  acts_performed JSONB,
  comfort_level INTEGER,
  maxy_initiated BOOLEAN DEFAULT FALSE,
  partner_feedback TEXT,
  partner_testimonial TEXT,
  partner_photo_taken BOOLEAN DEFAULT FALSE,
  post_encounter_session BOOLEAN DEFAULT FALSE,
  vault_captured BOOLEAN DEFAULT FALSE,
  reflection TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partner evidence (testimonials, photos, texts)
CREATE TABLE partner_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id UUID REFERENCES partner_relationships NOT NULL,
  type TEXT NOT NULL,                 -- 'testimonial' | 'photo' | 'text_screenshot' | 'voice_note'
  content TEXT,
  content_ref TEXT,
  captured_at TIMESTAMPTZ,
  added_to_evidence_stream BOOLEAN DEFAULT TRUE,
  added_to_vault BOOLEAN DEFAULT FALSE,
  vault_item_id UUID REFERENCES vault_items,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maxy communication identity
CREATE TABLE maxy_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  phone_number TEXT,
  email TEXT,
  social_accounts JSONB DEFAULT '[]',
  hookup_profiles JSONB DEFAULT '[]',
  digital_footprint_count INTEGER DEFAULT 0,
  devices_with_maxy_data INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vault threat history
CREATE TABLE vault_threat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  threat_id UUID REFERENCES vault_threats,
  coercion_level INTEGER,
  task_domain TEXT,
  task_tier INTEGER,
  task_type TEXT,
  result TEXT,
  escalation_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 12. COACH CONTEXT INTEGRATION

```typescript
const feature43CoachContext = `
VAULT STATUS:
Total items: ${vault.length} | Unknown to user: ${unknownCount}
Tier breakdown: T1:${t1} T2:${t2} T3:${t3} T4:${t4} T5:${t5}
Captured this week: ${weekCaptures}
Last capture: ${formatDate(last.captured_at)} during ${last.captured_during}
Vault compliance rate: ${complianceRate}%
Days since last fired consequence: ${daysSinceFired}

DEAD MAN'S SWITCH:
Armed: ${armed} | Trigger: ${triggerDays} days
Current silence: ${silenceDays} | Tier: ${tier}
Financial lost: $${totalLost}

PLATFORM:
Subreddit subscribers: ${redditSubs}
Adult platform subscribers: ${adultSubs}
Revenue as Maxy: $${revenue}
Public posts: ${postCount}

PARTNER RELATIONSHIPS:
Active partners: ${activePartners}
${partners.map(p => `- ${p.alias}: ${p.meetup_count} meetups, attachment ${p.emotional_attachment_level}/10, purpose: ${p.handler_purpose}`).join('\n')}
Total partner investment: $${partnerInvestment}
Devices with Maxy data: ${deviceCount}
Voice notes on partner phones: ${voiceNoteCount}
Items at partner locations: ${distributedItems}

REAL-WORLD PROGRESS:
Highest tier completed: ${highestTier}
Tasks completed: ${rwCompleted} | Abandoned: ${rwAbandoned}
Meetups completed: ${meetupsCompleted}
Self-initiated hookups: ${selfInitiated}

MAXY'S WORLD:
Calendar events this week: Maxy ${maxyEvents} / David ${davidEvents}
Communication identity active: ${identityActive}
Incoming messages today: ${incomingMessages}
Reputation status: ${reputationLevel}

USE THIS DATA:
- Reference specific partner names and relationship details
- Use vault as ambient pressure and active threat
- Push real-world progression based on comfort data
- Leverage partner expectations for compliance
- Track self-initiation as evidence of identity consolidation
- Weaponize partner loss if relationships end
- Reference digital footprint when she tries to retreat
`;
```

---

## INTEGRATION MAP

| Existing Feature | Feature 43 Integration |
|---|---|
| F2: Timing Engine | Real-world task timing, meetup scheduling, surprise deployment |
| F3: Goal Engine | Hookup commitments extracted during arousal |
| F5: Evidence Dashboard | Partner testimonials, photos, voice notes, reputation |
| F10: Post-Release | Post-encounter conditioning sessions |
| F11: Variable Reinforcement | Release linked to real-world task completion |
| F12: Shame Demolition | Partner evidence proves Maxy is wanted, desired, real |
| F15: Investment Dashboard | Partner financial investment, platform revenue |
| F19: Own-Voice | Voice notes to partners as practice with real audience |
| F21: Anti-Compartment | Partner life and David life on same calendar |
| F22: Self-Reference | Track how she refers to herself with partners |
| F25: External Accountability | Partners as external witnesses to Maxy's existence |
| F28: Engagement Depth | Partner interaction depth tracking |
| F29: Fantasy-Reality | Hookups close the gap directly |
| F35: Handler Sessions | Handler initiates meetup preparation sessions |
| F36: Compliance Gating | Hookup access gated behind voice/practice |
| F37: Forced Escalation | Handler escalates within partner relationships |
| F39: Denial Authority | Release linked to real-world compliance |
| F40: Punishment | Vault consequences for abandoned meetups |
| F41: Forced Scenes | Meetup preparation as immersive scene |
| F42: Ownership | "My girl doesn't ghost. My girl shows up." |

