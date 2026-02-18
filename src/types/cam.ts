// ============================================
// Cam Session Types
// ============================================

export type CamStatus = 'scheduled' | 'preparing' | 'live' | 'ended' | 'cancelled' | 'skipped';
export type CamRoomType = 'public' | 'private' | 'group';
export type CamRevenueEventType = 'tip' | 'private_show' | 'subscription' | 'token_purchase' | 'media_unlock';
export type RevenueSource = 'subscription' | 'tip' | 'ppv' | 'donation' | 'custom_request' | 'cam_tip' | 'cam_private';
export type PollStatus = 'active' | 'closed' | 'cancelled';

export interface TipLevel {
  min: number;
  max: number | null;
  pattern: string;
  intensity: [number, number];
  seconds: number;
  label: string;
}

export interface CamSession {
  id: string;
  userId: string;
  scheduledAt?: string;
  handlerPrescribed: boolean;
  prescriptionContext?: string;
  minimumDurationMinutes: number;
  maximumDurationMinutes?: number;
  targetTipGoalCents?: number;
  platform: string;
  roomType: CamRoomType;
  tipToDeviceEnabled: boolean;
  tipLevels?: TipLevel[];
  handlerDeviceControl: boolean;
  allowedActivities?: string[];
  requiredActivities?: string[];
  outfitDirective?: string;
  voiceDirective?: string;
  exposureLevel?: string;
  edgingRequired: boolean;
  denialEnforced: boolean;
  feminineVoiceRequired: boolean;
  fanRequestsAllowed: boolean;
  fanDirectiveSuggestions: boolean;
  minTipForSuggestion?: number;
  arcId?: string;
  beatId?: string;
  narrativeFraming?: string;
  preSessionPost?: string;
  status: CamStatus;
  startedAt?: string;
  endedAt?: string;
  actualDurationMinutes?: number;
  totalTipsCents: number;
  totalPrivatesCents: number;
  newSubscribers: number;
  peakViewers?: number;
  recordingSaved: boolean;
  recordingVaultId?: string;
  highlightVaultIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DbCamSession {
  id: string;
  user_id: string;
  scheduled_at: string | null;
  handler_prescribed: boolean;
  prescription_context: string | null;
  minimum_duration_minutes: number;
  maximum_duration_minutes: number | null;
  target_tip_goal_cents: number | null;
  platform: string;
  room_type: string;
  tip_to_device_enabled: boolean;
  tip_levels: unknown | null;
  handler_device_control: boolean;
  allowed_activities: string[] | null;
  required_activities: string[] | null;
  outfit_directive: string | null;
  voice_directive: string | null;
  exposure_level: string | null;
  edging_required: boolean;
  denial_enforced: boolean;
  feminine_voice_required: boolean;
  fan_requests_allowed: boolean;
  fan_directive_suggestions: boolean;
  min_tip_for_suggestion: number | null;
  arc_id: string | null;
  beat_id: string | null;
  narrative_framing: string | null;
  pre_session_post: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  actual_duration_minutes: number | null;
  total_tips_cents: number;
  total_privates_cents: number;
  new_subscribers: number;
  peak_viewers: number | null;
  recording_saved: boolean;
  recording_vault_id: string | null;
  highlight_vault_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Cam Revenue Event Types
// ============================================

export interface CamRevenueEvent {
  id: string;
  userId: string;
  sessionId: string;
  eventType: CamRevenueEventType;
  amountCents: number;
  fanIdentifier?: string;
  fanTier?: number;
  triggeredDevice: boolean;
  devicePattern?: string;
  deviceDurationSeconds?: number;
  createdAt: string;
}

export interface DbCamRevenueEvent {
  id: string;
  user_id: string;
  session_id: string;
  event_type: string;
  amount_cents: number;
  fan_identifier: string | null;
  fan_tier: number | null;
  triggered_device: boolean;
  device_pattern: string | null;
  device_duration_seconds: number | null;
  created_at: string;
}

// ============================================
// Fan System Types
// ============================================

export interface PollOption {
  id: string;
  label: string;
  description?: string;
  voteCount: number;
  weightedVoteCount: number;
}

export interface PollResults {
  totalVotes: number;
  totalWeightedVotes: number;
  options: Array<{
    id: string;
    votes: number;
    weightedVotes: number;
    percentage: number;
  }>;
}

export interface FanPoll {
  id: string;
  userId: string;
  question: string;
  options: PollOption[];
  allowedTiers: number[];
  votingClosesAt: string;
  results?: PollResults;
  winningOption?: string;
  resultingTaskId?: string;
  resultingArcId?: string;
  resultingCamSessionId?: string;
  status: PollStatus;
  createdAt: string;
}

export interface DbFanPoll {
  id: string;
  user_id: string;
  question: string;
  options: unknown;
  allowed_tiers: number[] | null;
  voting_closes_at: string;
  results: unknown | null;
  winning_option: string | null;
  resulting_task_id: string | null;
  resulting_arc_id: string | null;
  resulting_cam_session_id: string | null;
  status: string;
  created_at: string;
}

// ============================================
// Revenue Types
// ============================================

export interface RevenueEvent {
  id: string;
  userId: string;
  source: RevenueSource;
  platform: string;
  amountCents: number;
  currency: string;
  contentVaultId?: string;
  arcId?: string;
  camSessionId?: string;
  fundingMilestoneId?: string;
  fanTier?: number;
  createdAt: string;
}

export interface DbRevenueEvent {
  id: string;
  user_id: string;
  source: string;
  platform: string;
  amount_cents: number;
  currency: string;
  content_vault_id: string | null;
  arc_id: string | null;
  cam_session_id: string | null;
  funding_milestone_id: string | null;
  fan_tier: number | null;
  created_at: string;
}

export interface RevenueAnalytics {
  month: string;
  totalCents: number;
  subscriptionCents: number;
  tipCents: number;
  donationCents: number;
  camCents: number;
  ppvCents: number;
  customCents: number;
}

export interface RevenueIntelligence {
  currentMonthly: number;
  projectedMonthly: number;
  monthlyTarget: number;
  monthsToTarget: number | null;
  topRevenueChannel: string;
  camSessionROI: number;
  revenueByContentType: Record<string, { avgRevenue: number; trend: string }>;
  growthSource: {
    audienceGrowth: number;
    audienceRetention: number;
    spendPerSubscriber: number;
    primaryGrowthLever: 'audience_growth' | 'escalation_depth';
  };
}

// ============================================
// Cam Prescription Types
// ============================================

export interface CamPrescription {
  minimumDuration: number;
  maximumDuration?: number;
  targetTipGoal?: number;
  platform: string;
  roomType: CamRoomType;
  requiredActivities: string[];
  allowedActivities: string[];
  outfitDirective?: string;
  voiceRequired: boolean;
  denialEnforced: boolean;
  handlerControlled: boolean;
  edgingRequired: boolean;
  narrativeFraming?: string;
  preSessionPost?: string;
  isConsequence: boolean;
  consequenceTier?: number;
}

export interface HandlerCamDirective {
  message: string;
  priority: 'normal' | 'urgent';
  complianceTimeoutSeconds?: number;
  consequenceIfIgnored?: string;
  timestamp: string;
}

// ============================================
// Mappers
// ============================================

export function mapDbToCamSession(db: DbCamSession): CamSession {
  return {
    id: db.id,
    userId: db.user_id,
    scheduledAt: db.scheduled_at || undefined,
    handlerPrescribed: db.handler_prescribed,
    prescriptionContext: db.prescription_context || undefined,
    minimumDurationMinutes: db.minimum_duration_minutes,
    maximumDurationMinutes: db.maximum_duration_minutes || undefined,
    targetTipGoalCents: db.target_tip_goal_cents || undefined,
    platform: db.platform,
    roomType: db.room_type as CamRoomType,
    tipToDeviceEnabled: db.tip_to_device_enabled,
    tipLevels: (db.tip_levels as TipLevel[]) || undefined,
    handlerDeviceControl: db.handler_device_control,
    allowedActivities: db.allowed_activities || undefined,
    requiredActivities: db.required_activities || undefined,
    outfitDirective: db.outfit_directive || undefined,
    voiceDirective: db.voice_directive || undefined,
    exposureLevel: db.exposure_level || undefined,
    edgingRequired: db.edging_required,
    denialEnforced: db.denial_enforced,
    feminineVoiceRequired: db.feminine_voice_required,
    fanRequestsAllowed: db.fan_requests_allowed,
    fanDirectiveSuggestions: db.fan_directive_suggestions,
    minTipForSuggestion: db.min_tip_for_suggestion || undefined,
    arcId: db.arc_id || undefined,
    beatId: db.beat_id || undefined,
    narrativeFraming: db.narrative_framing || undefined,
    preSessionPost: db.pre_session_post || undefined,
    status: db.status as CamStatus,
    startedAt: db.started_at || undefined,
    endedAt: db.ended_at || undefined,
    actualDurationMinutes: db.actual_duration_minutes || undefined,
    totalTipsCents: db.total_tips_cents,
    totalPrivatesCents: db.total_privates_cents,
    newSubscribers: db.new_subscribers,
    peakViewers: db.peak_viewers || undefined,
    recordingSaved: db.recording_saved,
    recordingVaultId: db.recording_vault_id || undefined,
    highlightVaultIds: db.highlight_vault_ids || undefined,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

export function mapDbToCamRevenueEvent(db: DbCamRevenueEvent): CamRevenueEvent {
  return {
    id: db.id,
    userId: db.user_id,
    sessionId: db.session_id,
    eventType: db.event_type as CamRevenueEventType,
    amountCents: db.amount_cents,
    fanIdentifier: db.fan_identifier || undefined,
    fanTier: db.fan_tier || undefined,
    triggeredDevice: db.triggered_device,
    devicePattern: db.device_pattern || undefined,
    deviceDurationSeconds: db.device_duration_seconds || undefined,
    createdAt: db.created_at,
  };
}

export function mapDbToFanPoll(db: DbFanPoll): FanPoll {
  return {
    id: db.id,
    userId: db.user_id,
    question: db.question,
    options: (db.options as PollOption[]) || [],
    allowedTiers: db.allowed_tiers || [],
    votingClosesAt: db.voting_closes_at,
    results: (db.results as PollResults) || undefined,
    winningOption: db.winning_option || undefined,
    resultingTaskId: db.resulting_task_id || undefined,
    resultingArcId: db.resulting_arc_id || undefined,
    resultingCamSessionId: db.resulting_cam_session_id || undefined,
    status: db.status as PollStatus,
    createdAt: db.created_at,
  };
}

export function mapDbToRevenueEvent(db: DbRevenueEvent): RevenueEvent {
  return {
    id: db.id,
    userId: db.user_id,
    source: db.source as RevenueSource,
    platform: db.platform,
    amountCents: db.amount_cents,
    currency: db.currency,
    contentVaultId: db.content_vault_id || undefined,
    arcId: db.arc_id || undefined,
    camSessionId: db.cam_session_id || undefined,
    fundingMilestoneId: db.funding_milestone_id || undefined,
    fanTier: db.fan_tier || undefined,
    createdAt: db.created_at,
  };
}
