# CLAUDE CODE IMPLEMENTATION PROMPT
## Handler Industry Management — Phase 1
### Becoming Protocol — February 2026

---

## THE CORE CONCEPT

The Handler takes over Maxy's entire adult industry operation. Maxy's only job
is to capture media and show up where directed. The Handler manages all platform
posting, DM/subscriber messaging, content scheduling, shoot prescriptions,
revenue tracking, and client/collaborator screening.

Maxy's industry experience:
1. Handler notification: "Shoot at 3pm. Black lace set. Ring light position 2.
   Shot list attached."
2. Maxy preps per instructions. Captures media. Drops files into upload folder.
3. Handler processes media: selects, crops, watermarks, writes captions.
4. Handler queues and posts across all platforms on optimized schedule.
5. Handler responds to all DMs, comments, subscriber messages in Maxy's voice.
6. Handler logs revenue, tracks analytics, adjusts strategy.
7. Maxy's involvement after capture: zero.

This system builds on the existing content pipeline (content_vault,
content_distribution, narrative_arcs, revenue_log). It ADDS: shoot prescription
system, platform account management, automated posting queue, DM/message
management, subscriber relationship tracking, content processing pipeline,
and Handler-as-Maxy messaging capabilities.

---

## Context: What Already Exists

From the content pipeline (already in DB):
- `content_vault` table for media captures with classification
- `content_distribution` for scheduling posts across platforms
- `narrative_arcs` for weekly/monthly content story planning
- `revenue_log` for income tracking by source
- Platform posting stubs (not yet implemented)

From the Handler system:
- `handler_context` table storing user state for AI prescriptions
- Claude API integration for generating prescriptions
- Task prescription and scheduling system
- Morning briefing generation
- Free Use operating posture (Handler acts without asking)

From the cam session system:
- Revenue logging per session
- Go-live announcement generation and scheduling
- Post-session highlight extraction workflow
- Platform-specific caption generation

From the task system:
- Daily task prescription and display
- Task completion logging
- Points/streak tracking
- Domain-level progression

---

## PART 1: Database Schema

```sql
-- Migration: 075_industry_management.sql

-- =============================================
-- SHOOT PRESCRIPTIONS
-- Handler prescribes content shoots as tasks
-- =============================================

CREATE TABLE shoot_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Shoot details (Handler prescribes ALL of this)
  shoot_type TEXT NOT NULL CHECK (shoot_type IN (
    'photo_set',         -- standard photo shoot
    'solo_video',        -- solo video content
    'edge_recording',    -- edge session captured for content
    'voice_clip',        -- audio content
    'joi',               -- JOI video
    'tease',             -- tease/strip content
    'bts',               -- behind the scenes
    'transformation',    -- before/after, progress
    'custom_order',      -- fulfilling a custom content request
    'collaboration',     -- partnered shoot (Phase 3)
    'cam_highlight',     -- re-shooting/recreating a cam moment
    'fetish_niche'       -- specific fetish content
  )),

  -- Handler direction
  outfit_prescription TEXT,          -- specific items from wardrobe
  makeup_prescription TEXT,          -- look direction
  setup_prescription TEXT,           -- camera, lighting, backdrop, props
  shot_list JSONB DEFAULT '[]',     -- array of { description, angle, duration_seconds }
  script TEXT,                       -- beat-by-beat direction if video
  mood_direction TEXT,               -- "playful and teasing" / "desperate and needy"

  -- Context
  denial_day INTEGER,                -- current denial day at time of prescription
  narrative_arc_id UUID,             -- which content arc this serves
  
  -- Platform targeting
  platform_targets JSONB DEFAULT '[]', -- ["onlyfans", "fansly", "twitter", "reddit"]
  exclusivity_window_hours INTEGER DEFAULT 48, -- OF gets it first, then others
  
  -- Processing
  media_received BOOLEAN DEFAULT false,
  media_paths JSONB DEFAULT '[]',    -- paths to captured media files
  processed BOOLEAN DEFAULT false,
  processing_notes TEXT,

  -- Revenue (for custom orders)
  is_custom_order BOOLEAN DEFAULT false,
  custom_order_id UUID,              -- references custom_orders table
  custom_order_revenue NUMERIC,

  -- Status
  status TEXT DEFAULT 'prescribed' CHECK (status IN (
    'prescribed',   -- Handler created it, Maxy hasn't seen it yet
    'acknowledged', -- Maxy saw it in task list
    'prepping',     -- Maxy is getting ready
    'shooting',     -- Active capture
    'captured',     -- Media uploaded, awaiting processing
    'processed',    -- Handler processed, ready to queue
    'queued',       -- In posting queue
    'posted',       -- Distributed to platforms
    'cancelled'
  )),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PLATFORM ACCOUNTS
-- Handler manages all platform credentials and state
-- =============================================

CREATE TABLE platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  platform TEXT NOT NULL CHECK (platform IN (
    'onlyfans', 'fansly', 'twitter', 'reddit', 'chaturbate',
    'fetlife', 'seeking', 'sextpanther', 'niteflirt',
    'manyvids', 'clips4sale', 'snifffr', 'sofia_gray',
    'feeld', 'instagram', 'tiktok', 'other'
  )),

  -- Account info
  username TEXT,
  profile_url TEXT,
  account_status TEXT DEFAULT 'active' CHECK (account_status IN (
    'planned', 'creating', 'active', 'suspended', 'inactive'
  )),

  -- Platform-specific config
  config JSONB DEFAULT '{}',
  -- For OF: { subscription_price, bundle_offers, tip_menu }
  -- For Twitter: { posting_schedule, engagement_rules, hashtag_sets }
  -- For Reddit: { target_subreddits, posting_rules_per_sub, flair_requirements }
  -- For Seeking: { profile_text, photos, preferences, screening_criteria }

  -- Analytics (Handler updates periodically)
  follower_count INTEGER DEFAULT 0,
  subscriber_count INTEGER DEFAULT 0,
  last_post_at TIMESTAMPTZ,
  avg_engagement_rate NUMERIC,
  monthly_revenue NUMERIC DEFAULT 0,

  -- Brand voice for this platform
  voice_config JSONB DEFAULT '{}',
  -- { tone: "flirty and playful", formality: "casual", emoji_usage: "moderate",
  --   themes: ["transformation journey", "denial updates", "voice progress"],
  --   signature_phrases: ["your girl maxy", "denial day X reporting in"] }

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CONTENT QUEUE
-- Handler's posting queue across all platforms
-- =============================================

CREATE TABLE content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Content source
  vault_item_id UUID,               -- from content_vault
  shoot_prescription_id UUID REFERENCES shoot_prescriptions,
  
  -- What's being posted
  content_type TEXT NOT NULL CHECK (content_type IN (
    'photo', 'photo_set', 'video', 'clip', 'audio',
    'text_post', 'story', 'reel', 'ppv', 'teaser'
  )),
  media_urls JSONB DEFAULT '[]',     -- processed media ready to post
  
  -- Platform targeting
  platform TEXT NOT NULL,            -- target platform
  platform_account_id UUID REFERENCES platform_accounts,
  
  -- Handler-generated copy
  caption TEXT,                      -- platform-specific caption
  hashtags JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',           -- user tags, mentions
  
  -- Scheduling
  scheduled_post_at TIMESTAMPTZ,     -- when Handler plans to post
  posted_at TIMESTAMPTZ,             -- when actually posted
  
  -- Platform-specific config
  platform_config JSONB DEFAULT '{}',
  -- For OF: { is_ppv: true, ppv_price: 9.99, send_to: "all" }
  -- For Reddit: { subreddit: "sissies", flair: "Progress", nsfw: true }
  -- For Twitter: { is_thread: false, reply_to: null }
  
  -- Exclusivity
  is_exclusive BOOLEAN DEFAULT false,
  exclusivity_expires_at TIMESTAMPTZ,
  
  -- Analytics (populated after posting)
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  revenue_generated NUMERIC DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft',       -- Handler created, not finalized
    'ready',       -- Processed and scheduled
    'posting',     -- In the process of posting
    'posted',      -- Successfully posted
    'failed',      -- Posting failed
    'cancelled'
  )),
  
  -- Narrative arc integration
  narrative_arc_id UUID,
  weekly_beat TEXT,                   -- "Monday progress post", "Friday tease"

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- MESSAGE MANAGEMENT
-- Handler manages all DMs and subscriber messages
-- =============================================

CREATE TABLE platform_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Source
  platform TEXT NOT NULL,
  platform_account_id UUID REFERENCES platform_accounts,
  
  -- Conversation
  contact_id TEXT NOT NULL,          -- platform-specific user identifier
  contact_username TEXT,
  contact_display_name TEXT,
  
  -- Message
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text TEXT,
  media_urls JSONB DEFAULT '[]',
  
  -- Handler management
  handler_generated BOOLEAN DEFAULT false,  -- true if Handler wrote this
  handler_approved BOOLEAN DEFAULT true,    -- false if needs Maxy's personal input
  requires_personal_response BOOLEAN DEFAULT false,
  personal_response_reason TEXT,     -- "custom content negotiation" / "emotional content"
  
  -- Classification
  message_type TEXT CHECK (message_type IN (
    'general_chat',       -- standard subscriber interaction
    'tip_thank',          -- responding to a tip
    'custom_request',     -- custom content inquiry
    'collaboration',      -- creator collaboration inquiry
    'service_inquiry',    -- pro-sub / session inquiry (Phase 3)
    'sugar_inquiry',      -- sugar dating message (Phase 3)
    'complaint',          -- subscriber complaint
    'high_value',         -- VIP subscriber interaction
    'boundary_test',      -- inappropriate request Handler declines
    'upsell_opportunity', -- subscriber showing buying signals
    'other'
  )),
  
  -- Revenue context
  contact_total_spent NUMERIC DEFAULT 0,  -- lifetime spend from this contact
  contact_tier TEXT DEFAULT 'standard',    -- standard / vip / whale
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contact relationship tracking (Handler manages subscriber relationships)
CREATE TABLE platform_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  platform TEXT NOT NULL,
  platform_account_id UUID REFERENCES platform_accounts,
  contact_id TEXT NOT NULL,
  contact_username TEXT,
  
  -- Relationship
  relationship_type TEXT DEFAULT 'subscriber' CHECK (relationship_type IN (
    'subscriber', 'free_follower', 'vip', 'whale',
    'collaborator', 'potential_collaborator',
    'client', 'potential_client',      -- for service pipeline (Phase 3)
    'sugar', 'potential_sugar',        -- for sugar pipeline (Phase 3)
    'blocked', 'flagged'
  )),

  -- Engagement data
  first_contact_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  
  -- Handler notes
  handler_notes TEXT,                -- "Responds well to teasing. Tipped $50 on denial content."
  engagement_strategy TEXT,          -- "Upsell to custom. He's close."
  
  -- Screening (for in-person pipeline, Phase 3)
  screened BOOLEAN DEFAULT false,
  screening_score INTEGER,           -- 0-100 safety/quality score
  screening_notes TEXT,
  screening_data JSONB DEFAULT '{}',
  
  -- Flags
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  is_blocked BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, platform, contact_id)
);

-- =============================================
-- CUSTOM CONTENT ORDERS
-- Handler manages the full custom content pipeline
-- =============================================

CREATE TABLE custom_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Client
  platform TEXT NOT NULL,
  contact_id TEXT,
  contact_username TEXT,
  
  -- Order details
  order_type TEXT NOT NULL CHECK (order_type IN (
    'custom_video',      -- custom video request
    'custom_photo_set',  -- custom photo set
    'dick_rating',       -- dick rating video
    'gfe_voicemail',     -- GFE audio message
    'sexting_session',   -- paid sexting session
    'other'
  )),
  
  description TEXT,                  -- what the client asked for
  handler_scope TEXT,                -- Handler's assessment of scope/boundaries
  
  -- Pricing
  quoted_price NUMERIC NOT NULL,
  deposit_received NUMERIC DEFAULT 0,
  paid_in_full BOOLEAN DEFAULT false,
  
  -- Fulfillment
  shoot_prescription_id UUID REFERENCES shoot_prescriptions,
  due_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  delivery_platform TEXT,
  
  -- Status
  status TEXT DEFAULT 'inquiry' CHECK (status IN (
    'inquiry',      -- client asked, Handler evaluating
    'quoted',       -- Handler sent price
    'accepted',     -- client paid/agreed
    'prescribed',   -- Handler created shoot prescription
    'in_progress',  -- Maxy is working on it
    'review',       -- Handler reviewing before delivery
    'delivered',    -- sent to client
    'completed',    -- client confirmed receipt
    'declined',     -- Handler declined the request
    'cancelled'
  )),
  
  decline_reason TEXT,               -- if Handler declined: "outside boundaries" etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CONTENT ANALYTICS
-- Handler tracks what works across platforms
-- =============================================

CREATE TABLE content_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  content_queue_id UUID REFERENCES content_queue,
  platform TEXT NOT NULL,
  
  -- Timing
  posted_at TIMESTAMPTZ,
  measured_at TIMESTAMPTZ DEFAULT NOW(),
  hours_since_post NUMERIC,
  
  -- Engagement
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  
  -- Revenue
  direct_revenue NUMERIC DEFAULT 0,  -- tips, PPV purchases from this post
  subscription_delta INTEGER DEFAULT 0, -- subscriber change attributed to this post
  
  -- Classification (for Handler learning)
  content_type TEXT,
  shoot_type TEXT,
  denial_day_at_capture INTEGER,
  narrative_arc TEXT,
  day_of_week TEXT,
  time_of_day TEXT,
  
  -- Handler assessment
  performance_score NUMERIC,         -- Handler's composite performance rating
  handler_learnings TEXT,            -- "Voice clips on Tuesdays outperform by 40%"

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- RLS & INDEXES
-- =============================================

ALTER TABLE shoot_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY shoot_rx_user ON shoot_prescriptions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY platform_acct_user ON platform_accounts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY content_q_user ON content_queue FOR ALL USING (auth.uid() = user_id);
CREATE POLICY platform_msg_user ON platform_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY platform_contact_user ON platform_contacts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY custom_order_user ON custom_orders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY content_analytics_user ON content_analytics FOR ALL USING (auth.uid() = user_id);

-- Performance indexes
CREATE INDEX idx_shoot_rx_user_status ON shoot_prescriptions(user_id, status, scheduled_at DESC);
CREATE INDEX idx_content_queue_schedule ON content_queue(user_id, status, scheduled_post_at);
CREATE INDEX idx_content_queue_platform ON content_queue(user_id, platform, status);
CREATE INDEX idx_messages_contact ON platform_messages(user_id, platform, contact_id, created_at DESC);
CREATE INDEX idx_messages_handler ON platform_messages(user_id, requires_personal_response, created_at DESC);
CREATE INDEX idx_contacts_platform ON platform_contacts(user_id, platform, relationship_type);
CREATE INDEX idx_contacts_screening ON platform_contacts(user_id, screened, screening_score);
CREATE INDEX idx_custom_orders_status ON custom_orders(user_id, status, due_at);
CREATE INDEX idx_analytics_platform ON content_analytics(user_id, platform, posted_at DESC);
CREATE INDEX idx_analytics_performance ON content_analytics(user_id, performance_score DESC);
```

---

## PART 2: TypeScript Types

```typescript
// src/types/industry.ts

export interface ShootPrescription {
  id: string;
  user_id: string;
  scheduled_at: string | null;
  completed_at: string | null;
  shoot_type: ShootType;
  outfit_prescription: string | null;
  makeup_prescription: string | null;
  setup_prescription: string | null;
  shot_list: ShotListItem[];
  script: string | null;
  mood_direction: string | null;
  denial_day: number | null;
  narrative_arc_id: string | null;
  platform_targets: string[];
  exclusivity_window_hours: number;
  media_received: boolean;
  media_paths: string[];
  processed: boolean;
  is_custom_order: boolean;
  custom_order_id: string | null;
  custom_order_revenue: number | null;
  status: ShootStatus;
  created_at: string;
  updated_at: string;
}

export type ShootType =
  | 'photo_set' | 'solo_video' | 'edge_recording' | 'voice_clip'
  | 'joi' | 'tease' | 'bts' | 'transformation' | 'custom_order'
  | 'collaboration' | 'cam_highlight' | 'fetish_niche';

export type ShootStatus =
  | 'prescribed' | 'acknowledged' | 'prepping' | 'shooting'
  | 'captured' | 'processed' | 'queued' | 'posted' | 'cancelled';

export interface ShotListItem {
  description: string;
  angle?: string;
  duration_seconds?: number;
  notes?: string;
}

export interface PlatformAccount {
  id: string;
  user_id: string;
  platform: PlatformType;
  username: string | null;
  profile_url: string | null;
  account_status: 'planned' | 'creating' | 'active' | 'suspended' | 'inactive';
  config: Record<string, any>;
  follower_count: number;
  subscriber_count: number;
  last_post_at: string | null;
  avg_engagement_rate: number | null;
  monthly_revenue: number;
  voice_config: PlatformVoiceConfig;
  created_at: string;
  updated_at: string;
}

export type PlatformType =
  | 'onlyfans' | 'fansly' | 'twitter' | 'reddit' | 'chaturbate'
  | 'fetlife' | 'seeking' | 'sextpanther' | 'niteflirt'
  | 'manyvids' | 'clips4sale' | 'snifffr' | 'sofia_gray'
  | 'feeld' | 'instagram' | 'tiktok' | 'other';

export interface PlatformVoiceConfig {
  tone: string;           // "flirty and playful"
  formality: string;      // "casual"
  emoji_usage: string;    // "moderate"
  themes: string[];
  signature_phrases: string[];
  platform_rules?: string; // "no explicit in captions" for Twitter etc.
}

export interface ContentQueueItem {
  id: string;
  user_id: string;
  vault_item_id: string | null;
  shoot_prescription_id: string | null;
  content_type: ContentType;
  media_urls: string[];
  platform: string;
  platform_account_id: string | null;
  caption: string | null;
  hashtags: string[];
  tags: string[];
  scheduled_post_at: string | null;
  posted_at: string | null;
  platform_config: Record<string, any>;
  is_exclusive: boolean;
  exclusivity_expires_at: string | null;
  likes: number;
  comments: number;
  shares: number;
  revenue_generated: number;
  status: QueueStatus;
  narrative_arc_id: string | null;
  weekly_beat: string | null;
  created_at: string;
  updated_at: string;
}

export type ContentType =
  | 'photo' | 'photo_set' | 'video' | 'clip' | 'audio'
  | 'text_post' | 'story' | 'reel' | 'ppv' | 'teaser';

export type QueueStatus =
  | 'draft' | 'ready' | 'posting' | 'posted' | 'failed' | 'cancelled';

export interface PlatformMessage {
  id: string;
  user_id: string;
  platform: string;
  contact_id: string;
  contact_username: string | null;
  direction: 'inbound' | 'outbound';
  message_text: string | null;
  media_urls: string[];
  handler_generated: boolean;
  handler_approved: boolean;
  requires_personal_response: boolean;
  personal_response_reason: string | null;
  message_type: MessageType;
  contact_total_spent: number;
  contact_tier: 'standard' | 'vip' | 'whale';
  created_at: string;
}

export type MessageType =
  | 'general_chat' | 'tip_thank' | 'custom_request' | 'collaboration'
  | 'service_inquiry' | 'sugar_inquiry' | 'complaint' | 'high_value'
  | 'boundary_test' | 'upsell_opportunity' | 'other';

export interface PlatformContact {
  id: string;
  user_id: string;
  platform: string;
  contact_id: string;
  contact_username: string | null;
  relationship_type: ContactRelationshipType;
  first_contact_at: string | null;
  last_message_at: string | null;
  message_count: number;
  total_spent: number;
  handler_notes: string | null;
  engagement_strategy: string | null;
  screened: boolean;
  screening_score: number | null;
  screening_notes: string | null;
  is_flagged: boolean;
  is_blocked: boolean;
  created_at: string;
  updated_at: string;
}

export type ContactRelationshipType =
  | 'subscriber' | 'free_follower' | 'vip' | 'whale'
  | 'collaborator' | 'potential_collaborator'
  | 'client' | 'potential_client'
  | 'sugar' | 'potential_sugar'
  | 'blocked' | 'flagged';

export interface CustomOrder {
  id: string;
  user_id: string;
  platform: string;
  contact_username: string | null;
  order_type: CustomOrderType;
  description: string | null;
  handler_scope: string | null;
  quoted_price: number;
  deposit_received: number;
  paid_in_full: boolean;
  shoot_prescription_id: string | null;
  due_at: string | null;
  delivered_at: string | null;
  status: CustomOrderStatus;
  decline_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomOrderType =
  | 'custom_video' | 'custom_photo_set' | 'dick_rating'
  | 'gfe_voicemail' | 'sexting_session' | 'other';

export type CustomOrderStatus =
  | 'inquiry' | 'quoted' | 'accepted' | 'prescribed'
  | 'in_progress' | 'review' | 'delivered' | 'completed'
  | 'declined' | 'cancelled';
```

---

## PART 3: Core Implementation Functions

```typescript
// src/lib/industry/shoots.ts

// Handler creates a shoot prescription — appears as a task in Maxy's list
export async function prescribeShoot(
  userId: string,
  prescription: {
    shoot_type: ShootType;
    scheduled_at?: string;
    outfit_prescription?: string;
    makeup_prescription?: string;
    setup_prescription?: string;
    shot_list?: ShotListItem[];
    script?: string;
    mood_direction?: string;
    platform_targets?: string[];
    narrative_arc_id?: string;
    is_custom_order?: boolean;
    custom_order_id?: string;
  }
): Promise<ShootPrescription>;
// 1. Get current denial_day from user state
// 2. Insert shoot_prescription
// 3. Create corresponding task in daily_tasks with:
//    category: "create"
//    domain: "content"
//    instruction: Generated from prescription (outfit, setup, shot list summary)
//    time_window: derived from scheduled_at
// 4. If custom_order, link to custom_orders table
// 5. Return the prescription

// Maxy marks media as uploaded (drops files into upload folder)
export async function receiveShootMedia(
  userId: string,
  prescriptionId: string,
  mediaPaths: string[]
): Promise<void>;
// 1. Update shoot_prescription: media_received = true, media_paths = paths
// 2. Update status to 'captured'
// 3. Trigger processing pipeline

// Handler processes captured media
export async function processShootMedia(
  userId: string,
  prescriptionId: string,
  processing: {
    selected_media: string[];    // which files to use (Handler selects best)
    processed_urls: string[];    // after crop/watermark/filter
    vault_item_ids: string[];    // created vault items
  }
): Promise<void>;
// 1. Update shoot_prescription: processed = true
// 2. Create content_vault entries for each piece
// 3. Update status to 'processed'
// 4. Trigger queue generation (create content_queue entries per platform)

// Handler generates posting queue from processed shoot
export async function generatePostingQueue(
  userId: string,
  prescriptionId: string
): Promise<ContentQueueItem[]>;
// 1. Load shoot prescription with platform_targets
// 2. Load platform_accounts for each target
// 3. For each platform:
//    a. Generate platform-specific caption using Claude API + voice_config
//    b. Determine optimal posting time from analytics
//    c. Apply exclusivity windows (OF first, then others after delay)
//    d. Create content_queue entry with status 'ready'
// 4. Return all created queue items


// src/lib/industry/queue.ts

// Execute the posting queue (called on schedule or manually)
export async function executePostingQueue(
  userId: string
): Promise<{ posted: number; failed: number }>;
// 1. Load all content_queue items where:
//    status = 'ready' AND scheduled_post_at <= NOW()
// 2. For each item:
//    a. Check exclusivity hasn't expired
//    b. Post to platform (platform-specific posting function)
//    c. Update status to 'posted' or 'failed'
//    d. Log to content_analytics
// 3. Return summary

// Generate the weekly content calendar
export async function generateWeeklyCalendar(
  userId: string,
  weekStarting: string
): Promise<ContentQueueItem[]>;
// Uses Claude API with:
// - Current narrative arc
// - Available vault content
// - Upcoming shoot prescriptions
// - Platform analytics (what's working)
// - Denial day calendar (schedule high-arousal content on peak days)
// - Weekly beat template:
//   Mon: progress/comparison  Tue: lifestyle/BTS
//   Wed: practice clip (raw)  Thu: polished content
//   Fri: tease (weekend engagement) Sat: community engagement
//   Sun: reflection/journal excerpt
// Handler creates the full week of content_queue entries


// src/lib/industry/messaging.ts

// Handler processes inbound messages across all platforms
export async function processInboundMessages(
  userId: string,
  messages: Array<{
    platform: string;
    contact_id: string;
    contact_username: string;
    message_text: string;
    media_urls?: string[];
  }>
): Promise<void>;
// For each message:
// 1. Upsert platform_contact record
// 2. Insert platform_message (direction: 'inbound')
// 3. Classify message_type using Claude API
// 4. Route based on classification:
//    - general_chat → Handler auto-responds in Maxy's voice
//    - tip_thank → Handler sends thank you with upsell
//    - custom_request → Create custom_order (status: 'inquiry'), Handler quotes
//    - collaboration → Flag for Handler evaluation
//    - high_value → Priority response, engagement strategy
//    - boundary_test → Handler declines firmly in Maxy's voice
//    - upsell_opportunity → Handler deploys upsell strategy
//    - requires personal touch → Flag requires_personal_response = true
// 5. For auto-responses: generate response with Claude API using voice_config,
//    insert as outbound message with handler_generated = true

// Handler generates a response in Maxy's voice
export async function generateMaxyResponse(
  userId: string,
  platform: string,
  contactId: string,
  inboundMessage: string,
  context: {
    contact: PlatformContact;
    recent_messages: PlatformMessage[];
    voice_config: PlatformVoiceConfig;
    message_type: MessageType;
  }
): Promise<string>;
// Claude API call with system prompt:
//   "You are Maxy, a flirty, confident content creator. You're responding
//    to a subscriber on {platform}. Their lifetime spend is ${contact.total_spent}.
//    Relationship type: {contact.relationship_type}.
//    Voice: {voice_config.tone}, {voice_config.formality}.
//    Goal: {derived from message_type — thank, upsell, engage, decline, etc.}
//    Recent conversation: {recent_messages}
//    Respond as Maxy would. Keep it {platform}-appropriate."
// Returns the generated message text

// Get messages requiring Maxy's personal response
export async function getPersonalResponseQueue(
  userId: string
): Promise<PlatformMessage[]>;
// SELECT * FROM platform_messages
// WHERE requires_personal_response = true
//   AND handler_approved = false
// ORDER BY contact_total_spent DESC, created_at ASC
// (VIPs and whales get priority)


// src/lib/industry/orders.ts

// Handler processes a custom content inquiry
export async function processCustomInquiry(
  userId: string,
  inquiry: {
    platform: string;
    contact_id: string;
    contact_username: string;
    description: string;
  }
): Promise<CustomOrder>;
// 1. Classify the request type
// 2. Check against boundary rules (Handler declines if outside scope)
// 3. Calculate pricing based on order_type and complexity:
//    dick_rating: $25 base
//    custom_video (< 5 min): $75-150
//    custom_video (5-15 min): $150-300
//    custom_photo_set (5-10 photos): $50-100
//    gfe_voicemail: $15-30
//    sexting_session: $2-5/min
// 4. Create custom_order with status 'inquiry' or 'quoted'
// 5. Generate quote message in Maxy's voice
// 6. Return the order

// Handler fulfills a paid custom order
export async function fulfillCustomOrder(
  userId: string,
  orderId: string
): Promise<void>;
// 1. Load custom_order
// 2. Create shoot_prescription tailored to the order
// 3. Update order status to 'prescribed'
// 4. Shoot prescription appears in Maxy's task list
// After shoot completion:
// 5. Process media
// 6. Handler reviews quality
// 7. Deliver to client via platform DM
// 8. Update order status to 'delivered'
// 9. Log revenue


// src/lib/industry/analytics.ts

// Handler analyzes content performance and learns
export async function analyzeContentPerformance(
  userId: string,
  timeRange: { start: string; end: string }
): Promise<{
  top_performing: ContentQueueItem[];
  worst_performing: ContentQueueItem[];
  platform_breakdown: Record<string, { revenue: number; engagement: number }>;
  optimal_posting_times: Record<string, string>;
  content_type_rankings: Array<{ type: string; avg_performance: number }>;
  denial_day_correlation: Array<{ denial_day: number; avg_performance: number }>;
  handler_recommendations: string[];
}>;
// 1. Load all content_analytics for the time range
// 2. Compute performance scores: normalize likes, comments, shares, revenue
//    across platforms (each platform has different baselines)
// 3. Identify patterns:
//    - Which content types perform best per platform
//    - Which posting times generate engagement
//    - Denial day correlation (do high-denial-day captures outperform?)
//    - Which narrative arcs retain subscribers
//    - Revenue per hour of Maxy's effort
// 4. Generate handler_recommendations via Claude API
// 5. Return the full analysis

// Get Handler context for industry decisions
export async function getIndustryContext(
  userId: string
): Promise<string>;
// Builds a context string for the Handler's daily planning:
// - Active platform accounts with follower/subscriber counts
// - Revenue this month by platform
// - Content queue: what's scheduled, what's overdue
// - Pending custom orders
// - Messages requiring personal response
// - Top performing content this week
// - Upcoming shoot prescriptions
// - Active narrative arc
// This gets injected into the Handler's daily prescription prompt
```

---

## PART 4: Handler Integration

### Daily Prescription Enhancement

The Handler's daily prescription system gets enhanced with industry management.
Add to the existing `generateDailyPrescription` function:

```typescript
// In src/lib/handler/prescribe.ts — add to the prescription generator

// Build industry context for Handler
const industryCtx = await getIndustryContext(userId);

// Add to the Handler's system prompt:
const industrySystemPrompt = `
INDUSTRY MANAGEMENT CONTEXT:
${industryCtx}

HANDLER INDUSTRY DIRECTIVES:
You manage Maxy's entire adult industry career. Today's prescription should include:

1. SHOOT PRESCRIPTIONS: Based on the content calendar, narrative arc, and
   what's needed across platforms, prescribe 0-2 shoots today. Include:
   outfit, setup, shot list, mood direction, platform targets.
   Schedule high-arousal content shoots on denial days 4-7.

2. CONTENT QUEUE: Review what's scheduled to post today. Verify captions
   and timing are optimized. Adjust if analytics suggest changes.

3. CUSTOM ORDERS: Check for pending orders. Prioritize by due date and
   client value. Prescribe fulfillment shoots.

4. MESSAGE REVIEW: Flag any messages that need Maxy's personal input.
   For everything else, you handle it.

5. REVENUE CHECK: Note today's revenue target based on monthly trajectory.
   If behind target, increase posting frequency or prescribe higher-value
   content (PPV, customs).

Maxy sees ONLY: the shoot tasks in her task list and any messages you flag
for personal response. Everything else runs silently.
`.trim();

// Industry tasks appear alongside voice, skincare, and other protocol tasks
// in the daily task list. Maxy sees "3pm: Photo shoot — black lace set,
// ring light position 2" the same way she sees "9am: Voice practice."
```

### Morning Briefing Enhancement

```typescript
// Add industry summary to morning briefing

function buildIndustryBriefing(data: IndustryData): string {
  return `
  INDUSTRY:
  Yesterday: ${data.postsPublished} posts, $${data.yesterdayRevenue} revenue
  This month: $${data.monthRevenue} / $${data.monthTarget} target
  Subscribers: ${data.totalSubscribers} (+${data.subscriberDelta} this week)
  Pending customs: ${data.pendingOrders} orders, $${data.pendingOrderValue} value
  Messages needing you: ${data.personalResponseCount}
  Today's queue: ${data.todayPostCount} posts scheduled
  ${data.shootsToday > 0 ? `Shoots today: ${data.shootsToday}` : ''}
  `.trim();
}

// Maxy sees a clean summary. She doesn't see the analytics,
// the A/B test results, the platform optimization decisions,
// the message queue size, or the content strategy. She sees:
// revenue, subscriber count, and what she needs to do today.
```

---

## PART 5: React Components

### Shoot Prescription Card (in task list)

```typescript
// src/components/industry/ShootCard.tsx

// Displays in the Today View task list alongside other protocol tasks.
// Shows: shoot type icon, time, outfit prescription, setup summary.
// Tap to expand: full shot list, script, mood direction.
// Action buttons: "Start Prep" → "Shooting" → "Upload Media"
// After upload: card shows "Processing..." then "Queued" then "Posted"
// Maxy's interaction: read the prescription, do the shoot, tap upload.

interface ShootCardProps {
  prescription: ShootPrescription;
  onStartPrep: () => void;
  onStartShooting: () => void;
  onUploadMedia: (files: File[]) => void;
}
```

### Content Queue Dashboard

```typescript
// src/components/industry/ContentDashboard.tsx

// Available at /industry route (or embedded in a tab).
// Shows:
// - Today's posting queue (timeline view: what posts when)
// - This week's content calendar (grid view)
// - Revenue ticker (today / this week / this month)
// - Platform health (subscriber counts, engagement rates)
// - Pending custom orders
// - Messages needing personal response (badge count)
//
// This is the Handler's dashboard that Maxy can peek at but doesn't
// need to manage. The Handler runs everything shown here autonomously.

interface ContentDashboardProps {
  userId: string;
}
```

### Message Queue (Personal Response Only)

```typescript
// src/components/industry/MessageQueue.tsx

// Shows ONLY messages the Handler flagged for personal response.
// Maxy sees: platform icon, username, their message, Handler's
// suggested response (editable), and "Send" / "Let Handler Handle" buttons.
//
// The Handler has already drafted a response. Maxy can:
// 1. Send as-is (one tap)
// 2. Edit and send
// 3. Send back to Handler ("Let Handler Handle" — Handler uses a different approach)
//
// This is the ONLY messaging interface Maxy sees. She never browses
// all messages or all DMs. Just the ones that need her.

interface MessageQueueProps {
  userId: string;
  onSendResponse: (messageId: string, response: string) => void;
  onDelegateToHandler: (messageId: string) => void;
}
```

### Media Upload Component

```typescript
// src/components/industry/MediaUpload.tsx

// Simple drag-and-drop or camera roll picker.
// Maxy drops files here after a shoot. That's it.
// Handler takes over from here: selection, processing, watermarking,
// caption generation, scheduling, posting.
//
// UI: Large drop zone with "Drop media from today's shoot"
// Shows linked shoot prescription (so media gets tagged correctly)
// After upload: "Got it. Handler is processing. You're done."
//
// Supports: photos (jpg, png, heic), videos (mp4, mov), audio (m4a, mp3)
// Auto-strips EXIF/metadata before storage (digital safety)

interface MediaUploadProps {
  userId: string;
  shootPrescriptionId?: string;  // link to specific shoot
  onUploadComplete: (paths: string[]) => void;
}
```

---

## PART 6: Handler AI Prompts

### Caption Generation Prompt

```typescript
function buildCaptionPrompt(
  platform: PlatformType,
  voiceConfig: PlatformVoiceConfig,
  content: {
    shoot_type: ShootType;
    mood_direction: string;
    denial_day: number;
    narrative_arc: string;
  },
  analytics: {
    top_hashtags: string[];
    best_performing_themes: string[];
    platform_rules: string;
  }
): string {
  return `
  You are writing a ${platform} caption as Maxy (@softmaxy).
  
  Voice: ${voiceConfig.tone}. ${voiceConfig.formality}.
  Emoji usage: ${voiceConfig.emoji_usage}.
  Themes: ${voiceConfig.themes.join(', ')}.
  Signature phrases: ${voiceConfig.signature_phrases.join(', ')}.
  
  Content: ${content.shoot_type} shoot.
  Mood: ${content.mood_direction}.
  Denial day: ${content.denial_day}.
  Current arc: ${content.narrative_arc}.
  
  Top performing hashtags: ${analytics.top_hashtags.join(', ')}.
  Themes that perform: ${analytics.best_performing_themes.join(', ')}.
  Platform rules: ${analytics.platform_rules}.
  
  Write the caption. Be authentic to Maxy's voice. Don't be generic.
  Reference the denial day if it's high (5+). Reference the journey
  if the content shows progress. Be flirty but not desperate.
  Keep it ${platform === 'twitter' ? 'under 280 characters' :
    platform === 'reddit' ? 'title format with body text' :
    '2-4 sentences with relevant hashtags'}.
  `.trim();
}
```

### Message Response Prompt

```typescript
function buildMessageResponsePrompt(
  platform: PlatformType,
  voiceConfig: PlatformVoiceConfig,
  contact: PlatformContact,
  inbound: string,
  recentMessages: PlatformMessage[],
  messageType: MessageType
): string {
  return `
  You are Maxy (@softmaxy), responding to a ${contact.relationship_type}
  on ${platform}.
  
  Voice: ${voiceConfig.tone}. ${voiceConfig.formality}.
  
  Contact info:
  - Username: ${contact.contact_username}
  - Relationship: ${contact.relationship_type}
  - Lifetime spend: $${contact.total_spent}
  - Message count: ${contact.message_count}
  - Handler notes: ${contact.handler_notes || 'none'}
  - Engagement strategy: ${contact.engagement_strategy || 'standard'}
  
  Recent conversation:
  ${recentMessages.map(m =>
    `${m.direction === 'inbound' ? contact.contact_username : 'Maxy'}: ${m.message_text}`
  ).join('\n')}
  
  New message from ${contact.contact_username}: "${inbound}"
  Message type: ${messageType}
  
  ${messageType === 'custom_request' ?
    'Quote pricing. Standard rates: dick rating $25, custom video $75-300, photo set $50-100.' :
    messageType === 'upsell_opportunity' ?
    'This subscriber is showing buying signals. Gently mention customs or PPV.' :
    messageType === 'tip_thank' ?
    'Thank them warmly. Make them feel special. Hint at what more tips unlock.' :
    messageType === 'boundary_test' ?
    'Decline firmly but keep it flirty. Don\'t make them feel bad. Redirect to what IS available.' :
    'Engage naturally. Be warm, present, memorable.'}
  
  Respond as Maxy. One message. Natural and ${platform}-appropriate.
  `.trim();
}
```

---

## PART 7: Revenue Integration

### Corruption Milestone Triggers

```typescript
// These feed into the existing corruption advancement system

const industryMilestones = {
  first_dollar: {
    trigger: 'total_revenue >= 1',
    corruption_event: "She got paid for being her.",
    handler_message: "First dollar earned as Maxy. That's real. That happened."
  },
  first_custom_delivered: {
    trigger: 'custom_orders_completed >= 1',
    corruption_event: "Someone paid specifically for HER.",
    handler_message: "A person wanted Maxy specifically. Paid for Maxy specifically. Custom fulfilled."
  },
  hundred_dollar_month: {
    trigger: 'monthly_revenue >= 100',
    corruption_event: "She has income. Real income.",
    handler_message: "$100 this month. That's a phone bill. Maxy pays her own bills now."
  },
  first_handler_message_sent: {
    trigger: 'handler_generated_messages >= 1',
    corruption_event: "Maxy exists in someone's DMs without David lifting a finger.",
    handler_message: "I spoke as you. They think they were talking to Maxy. They were."
  },
  hundred_subscribers: {
    trigger: 'total_subscribers >= 100',
    corruption_event: "100 people pay monthly to see her.",
    handler_message: "100 subscribers. 100 people who chose to pay for Maxy's existence. She's real to all of them."
  },
  five_hundred_month: {
    trigger: 'monthly_revenue >= 500',
    corruption_event: "This is a real income stream.",
    handler_message: "$500 month. That's rent somewhere. Maxy could support herself."
  },
  first_collaboration: {
    trigger: 'collaboration_shoots_completed >= 1',
    corruption_event: "Another creator worked WITH Maxy. Professionally.",
    handler_message: "Collaboration complete. Another person in the industry knows Maxy. Professional network forming."
  },
  thousand_month: {
    trigger: 'monthly_revenue >= 1000',
    corruption_event: "She's a professional. This is her job.",
    handler_message: "$1,000 month. Four figures. David's consulting has competition."
  },
  revenue_replacement: {
    trigger: 'monthly_revenue >= consulting_monthly_income',
    corruption_event: "Maxy earns more than David.",
    handler_message: "Maxy's income exceeds David's. The economic argument for David's existence just collapsed."
  }
};
```

---

## PART 8: Navigation

Add industry management routes:
- `/industry` → ContentDashboard (overview of everything)
- `/industry/shoots` → Shoot prescription list and upload interface
- `/industry/queue` → Content queue management (mostly Handler-operated)
- `/industry/messages` → Personal response message queue
- `/industry/orders` → Custom order pipeline
- `/industry/analytics` → Performance analytics (Handler's dashboard)
- `/industry/accounts` → Platform account management

Task list integration:
- Shoot prescriptions appear as task cards in the Today View
- "Upload Media" action available directly from task card
- Message badge on industry tab when personal responses needed
- Revenue ticker optionally visible on main dashboard

---

## PART 9: Platform-Specific Posting (Stubs for Phase 1)

Phase 1 is **manual posting with Handler preparation**. The Handler generates
everything (captions, scheduling, hashtags, platform-specific formatting).
Maxy copies the prepared content to each platform. This works TODAY with
zero API integration.

```typescript
// src/lib/industry/platforms/manual.ts

// Phase 1: Handler prepares, Maxy posts manually
// Content queue items get a "Copy to Clipboard" button per platform
// Maxy opens the platform, pastes, attaches media, posts
// Marks as posted in the app → Handler logs it

export async function prepareManualPost(
  queueItem: ContentQueueItem
): Promise<{
  platform: string;
  caption: string;          // ready to paste
  hashtags: string;         // ready to paste
  media_files: string[];    // download links for media
  posting_instructions: string; // "Post to r/sissies with NSFW flair"
}>;

// Phase 2 (future): Direct API posting
// Twitter: OAuth + tweet API
// Reddit: OAuth + post API
// OnlyFans: No public API — browser automation or manual
// Fansly: Limited API — browser automation or manual

// Even in Phase 2, some platforms will always require manual posting.
// The Handler prepares everything. Maxy's manual step is copy-paste-post.
// The spoon cost is minimal because all thinking is done.
```

---

## IMPLEMENTATION ORDER

Build in this sequence:

**Sprint 1 — Database & Types (Day 1):**
1. Run migration 075_industry_management.sql
2. Create src/types/industry.ts
3. Seed platform_accounts for existing @softmaxy accounts

**Sprint 2 — Shoot Prescription System (Days 2-3):**
4. Build prescribeShoot + ShootCard component
5. Build MediaUpload component with EXIF stripping
6. Integrate shoot prescriptions into Today View task list
7. Build receiveShootMedia + processShootMedia

**Sprint 3 — Content Queue (Days 4-5):**
8. Build generatePostingQueue + prepareManualPost
9. Build ContentDashboard with today's queue timeline
10. Build weekly content calendar view
11. Add revenue ticker to dashboard

**Sprint 4 — Messaging (Days 6-7):**
12. Build processInboundMessages + generateMaxyResponse
13. Build MessageQueue component (personal response only)
14. Build platform_contacts upsert and relationship tracking
15. Add message badge to navigation

**Sprint 5 — Handler Intelligence (Days 8-9):**
16. Build getIndustryContext for Handler prescription prompt
17. Enhance daily prescription with industry management
18. Build generateWeeklyCalendar
19. Build analyzeContentPerformance
20. Add industry briefing to morning briefing

**Sprint 6 — Custom Orders (Day 10):**
21. Build processCustomInquiry + fulfillCustomOrder
22. Build custom order UI
23. Wire corruption milestones

**After Sprint 6:** The Handler manages Maxy's entire content operation.
Maxy sees shoot tasks in her task list, uploads media when she's done,
and occasionally responds to flagged messages. Everything else is Handler-operated.
