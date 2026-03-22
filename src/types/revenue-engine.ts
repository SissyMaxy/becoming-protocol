/**
 * Revenue Engine Types
 * Type definitions for the autonomous revenue generation system.
 */

// ── AI-generated content ────────────────────────────────────────────

export type AIContentType =
  | 'tweet' | 'reply' | 'quote_tweet'
  | 'reddit_post' | 'reddit_comment'
  | 'fetlife_post' | 'fetlife_comment'
  | 'dm_response' | 'gfe_message' | 'sexting_message'
  | 'erotica' | 'caption' | 'journal_entry'
  | 'product_review' | 'bio_update' | 'engagement_bait';

export type AIContentStatus = 'generated' | 'scheduled' | 'posted' | 'failed';

export type GenerationStrategy =
  | 'personality' | 'engagement' | 'thirst'
  | 'vulnerability' | 'humor' | 'community';

export interface AIGeneratedContent {
  id: string;
  user_id: string;
  content_type: AIContentType;
  platform: string;
  content: string;
  target_subreddit: string | null;
  target_account: string | null;
  target_hashtags: string[];
  generation_prompt: string | null;
  generation_strategy: string | null;
  posted_at: string | null;
  engagement_likes: number;
  engagement_comments: number;
  engagement_shares: number;
  engagement_clicks: number;
  revenue_generated: number;
  variant: string | null;
  status: AIContentStatus;
  scheduled_at: string | null;
  created_at: string;
}

// ── Engagement targets ──────────────────────────────────────────────

export type EngagementTargetType =
  | 'similar_creator' | 'larger_creator' | 'potential_subscriber'
  | 'community_leader' | 'media_outlet';

export interface EngagementTarget {
  id: string;
  user_id: string;
  platform: string;
  target_handle: string;
  target_type: EngagementTargetType;
  follower_count: number | null;
  engagement_rate: number | null;
  strategy: string | null;
  interactions_count: number;
  last_interaction_at: string | null;
  followed_back: boolean;
  dm_opened: boolean;
  collaboration_potential: string | null;
  created_at: string;
}

// ── Content calendar ────────────────────────────────────────────────

export interface PlannedPost {
  time: string;
  content_type: AIContentType;
  strategy: string;
  topic?: string;
  text: string;
  platform: string;
  subreddit?: string;
  hashtags?: string[];
}

export interface RevenueContentCalendar {
  id: string;
  user_id: string;
  date: string;
  platform: string;
  planned_posts: PlannedPost[];
  actual_posts: number;
  total_engagement: number;
  revenue_generated: number;
  created_at: string;
}

// ── Paid conversations ──────────────────────────────────────────────

export type ConversationType =
  | 'dm_response' | 'gfe_daily' | 'sexting_session' | 'custom_request';

export interface PaidConversation {
  id: string;
  user_id: string;
  platform: string;
  subscriber_id: string;
  subscriber_name: string | null;
  conversation_type: ConversationType;
  handler_response: string;
  revenue: number;
  revenue_type: string | null;
  response_quality: string | null;
  requires_approval: boolean;
  approved: boolean | null;
  created_at: string;
}

// ── GFE subscribers ─────────────────────────────────────────────────

export type GFETier = 'basic' | 'premium' | 'vip';
export type GFEStatus = 'active' | 'paused' | 'cancelled';

export interface GFESubscriber {
  id: string;
  user_id: string;
  platform: string;
  subscriber_id: string;
  subscriber_name: string | null;
  tier: GFETier;
  monthly_rate: number;
  subscribed_at: string | null;
  known_preferences: string | null;
  conversation_history_summary: string | null;
  daily_message_sent_today: boolean;
  last_message_at: string | null;
  status: GFEStatus;
  created_at: string;
}

// ── Affiliate links ─────────────────────────────────────────────────

export interface AffiliateLink {
  id: string;
  user_id: string;
  product_name: string;
  product_category: string;
  product_url: string;
  affiliate_url: string;
  affiliate_program: string;
  clicks: number;
  conversions: number;
  revenue_generated: number;
  review_generated: boolean;
  last_mentioned_at: string | null;
  created_at: string;
}

// ── Revenue decisions ───────────────────────────────────────────────

export type RevenueDecisionType =
  | 'pricing_change' | 'promotion' | 'investment' | 'content_focus'
  | 'platform_rebalance' | 'tier_adjustment' | 'bundle_creation';

export interface RevenueDecision {
  id: string;
  user_id: string;
  decision_type: RevenueDecisionType;
  decision_data: Record<string, unknown>;
  rationale: string;
  revenue_before: number | null;
  revenue_after: number | null;
  projected_impact: number | null;
  executed: boolean;
  executed_at: string | null;
  created_at: string;
}

// ── Incoming DM (from auto-poster polling) ──────────────────────────

export interface IncomingDM {
  platform: string;
  senderId: string;
  senderName: string;
  content: string;
  isPaid: boolean;
  tipAmount?: number;
  timestamp: string;
}

// ── Content strategy definitions ────────────────────────────────────

export interface ContentStrategy {
  type: GenerationStrategy;
  frequency: string;
  platform: string;
  purpose: string;
  examples: string[];
}

// ── Weekly revenue review output ────────────────────────────────────

export interface WeeklyRevenueReview {
  pricing_changes: Array<{ platform: string; old_price: number; new_price: number; reason: string }>;
  promotions_to_run: Array<{ type: string; platform: string; details: string; duration_days: number }>;
  content_focus_this_week: string;
  platform_focus: string;
  investment_decisions: Array<{ type: string; amount: number; reason: string }>;
  projected_next_week: number;
  months_to_crossover: number;
}

// ── Erotica output ──────────────────────────────────────────────────

export interface GeneratedErotica {
  title: string;
  content: string;
  tags: string[];
  teaser: string;
}

// ── Content derivative (multiplication) ─────────────────────────────

export interface ContentDerivative {
  platform: string;
  type: string;
  caption_strategy: string;
  delay_hours: number;
  crop?: string;
  subreddit?: string;
  clip?: { start: number; end: number };
  extract?: string;
}
