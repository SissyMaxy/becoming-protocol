/**
 * Sexting & GFE Automation Types
 *
 * Handler runs 90%+ of fan conversations autonomously.
 * David only reviews escalated messages.
 */

import type { FanMessage } from './content-pipeline';

// ── Union types ─────────────────────────────────────────

export type FanTierExtended = 'casual' | 'regular' | 'supporter' | 'whale' | 'gfe';
export type SextingMessageType = 'text' | 'media_request' | 'media_send' | 'gfe_scheduled' | 'tip_thanks';
export type ConversationStatus = 'active' | 'paused' | 'closed' | 'escalated';
export type HandlerPersonality = 'flirty' | 'bratty' | 'sweet' | 'dominant';
export type GfeTier = 'basic' | 'premium' | 'vip';
export type TemplateCategory =
  | 'greeting' | 'flirty' | 'tease' | 'explicit' | 'tip_thanks'
  | 'media_offer' | 'gfe_morning' | 'gfe_goodnight' | 'escalation' | 'boundary';

// ── Conversation ────────────────────────────────────────

export interface SextingConversation {
  id: string;
  user_id: string;
  fan_id: string;
  platform: string;
  status: ConversationStatus;
  handler_personality: HandlerPersonality | null;
  auto_reply_enabled: boolean;
  escalation_threshold: number;
  total_messages: number;
  revenue_cents: number;
  last_message_at: string | null;
  created_at: string;
}

// ── Extended message (adds fields to FanMessage) ────────

export interface SextingMessage extends FanMessage {
  conversation_id: string | null;
  message_type: SextingMessageType;
  media_vault_id: string | null;
  auto_sent: boolean;
  ai_confidence: number | null;
  response_time_seconds: number | null;
}

// ── Template ────────────────────────────────────────────

export interface SextingTemplate {
  id: string;
  user_id: string;
  category: TemplateCategory;
  template_text: string;
  variables: Record<string, string> | null;
  tier_minimum: string;
  usage_count: number;
  effectiveness_score: number;
  is_active: boolean;
  created_at: string;
}

// ── GFE Subscription ───────────────────────────────────

export interface GfeSubscription {
  id: string;
  user_id: string;
  fan_id: string;
  platform: string;
  tier: GfeTier;
  price_cents: number;
  status: 'active' | 'paused' | 'cancelled' | 'expired';
  morning_message: boolean;
  goodnight_message: boolean;
  weekly_photo: boolean;
  custom_nickname: string | null;
  started_at: string;
  expires_at: string | null;
  created_at: string;
}

// ── Fan personality model (stored as JSONB) ─────────────

export interface FanPersonalityModel {
  kinks: string[];
  communication_style: 'brief' | 'chatty' | 'roleplay' | 'transactional';
  boundaries: string[];
  triggers: string[];
  preferred_content_types: string[];
  spending_pattern: 'impulse' | 'steady' | 'event_driven' | 'rare';
}

export interface FanResponsePreferences {
  preferred_response_time_minutes: number;
  emoji_density: 'none' | 'light' | 'heavy';
  media_appetite: 'low' | 'medium' | 'high';
  flirt_level: 1 | 2 | 3 | 4 | 5;
}

// ── Stats ───────────────────────────────────────────────

export interface SextingStats {
  activeConversations: number;
  totalConversations: number;
  gfeSubscriptions: number;
  gfeMonthlyRevenueCents: number;
  autoSendRate: number;
  escalatedCount: number;
  todayRevenueCents: number;
  totalRevenueCents: number;
  avgResponseTimeMinutes: number;
}

// ── Mapper ──────────────────────────────────────────────

export function mapConversation(row: Record<string, unknown>): SextingConversation {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    fan_id: row.fan_id as string,
    platform: row.platform as string,
    status: row.status as ConversationStatus,
    handler_personality: row.handler_personality as HandlerPersonality | null,
    auto_reply_enabled: row.auto_reply_enabled as boolean,
    escalation_threshold: row.escalation_threshold as number,
    total_messages: row.total_messages as number,
    revenue_cents: row.revenue_cents as number,
    last_message_at: row.last_message_at as string | null,
    created_at: row.created_at as string,
  };
}

export function mapTemplate(row: Record<string, unknown>): SextingTemplate {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    category: row.category as TemplateCategory,
    template_text: row.template_text as string,
    variables: row.variables as Record<string, string> | null,
    tier_minimum: row.tier_minimum as string,
    usage_count: row.usage_count as number,
    effectiveness_score: row.effectiveness_score as number,
    is_active: row.is_active as boolean,
    created_at: row.created_at as string,
  };
}

export function mapGfeSubscription(row: Record<string, unknown>): GfeSubscription {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    fan_id: row.fan_id as string,
    platform: row.platform as string,
    tier: row.tier as GfeTier,
    price_cents: row.price_cents as number,
    status: row.status as GfeSubscription['status'],
    morning_message: row.morning_message as boolean,
    goodnight_message: row.goodnight_message as boolean,
    weekly_photo: row.weekly_photo as boolean,
    custom_nickname: row.custom_nickname as string | null,
    started_at: row.started_at as string,
    expires_at: row.expires_at as string | null,
    created_at: row.created_at as string,
  };
}
