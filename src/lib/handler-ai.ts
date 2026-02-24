/**
 * Handler AI - The Brain
 *
 * Autonomous handler intelligence powered by Claude.
 * Makes real-time decisions about interventions, learns patterns,
 * and drives perpetual escalation toward transformation goals.
 */

import { supabase } from './supabase';
import {
  getHandlerState,
  createDailyPlan,
  logInfluenceAttempt,
  updateUserModel,
  recordResistancePattern,
  createOrUpdateEscalationPlan,
} from './handler';
import {
  detectVulnerabilityWindows,
  findRipestEscalationDomain,
  pushEscalation,
  getServiceStage,
  getServiceStageGuidance,
  prescribeHypnoSession,
  handleResistance,
  shouldExtractCommitment,
  buildAdversarialSystemPrompt,
  generateExitGauntlet,
  type GauntletStage,
} from './handler-conditioning';
import type {
  HandlerState,
  HandlerDailyPlan,
  HandlerIntervention,
  InterventionType,
} from '../types/handler';
import type {
  FullProfile,
  ProfileFoundation,
  ProfileHistory,
  ProfileArousal,
  ProfilePsychology,
  ProfileDepth,
} from '../types/profile';
import type { ArousalState } from '../types/arousal';
import { integrateWithDailyPlan as scheduleAmbushes } from './scheduled-ambush';
import {
  decideInterventionFromTemplate,
  generateDailyPlanFromTemplate,
  generateCommitmentPromptFromTemplate,
  handleSessionEventFromTemplate,
  type TemplateContext,
} from './handler-templates';
import {
  buildFullSystemsContext,
  buildSessionContext,
  buildInterventionContext,
} from './handler-systems-context';
import { getCurrentTimeOfDay } from './rules-engine-v2';

// ============================================
// BILLING ERROR TRACKING
// ============================================

// Flag to disable handler AI calls after billing errors
let handlerAIDisabled = false;

// Allow external check of AI status
export function isHandlerAIDisabled(): boolean {
  return handlerAIDisabled;
}

// Allow manual re-enable (for when billing is fixed)
export function enableHandlerAI(): void {
  handlerAIDisabled = false;
  console.log('[Handler AI] Re-enabled');
}

// Check if error is a billing/credit error
function isBillingError(errorMessage: string): boolean {
  return errorMessage.includes('credit balance') ||
         errorMessage.includes('billing') ||
         errorMessage.includes('purchase credits');
}

// Build template context from available data
async function buildTemplateContext(
  userId: string,
  profile: FullProfile | null,
  overrides?: Partial<TemplateContext>
): Promise<TemplateContext> {
  const today = new Date().toISOString().split('T')[0];

  // Get denial state
  const { data: denialState } = await supabase
    .from('denial_state')
    .select('current_denial_day, is_locked, streak_days')
    .eq('user_id', userId)
    .maybeSingle();

  // Get today's arousal state
  const { data: arousalPlan } = await supabase
    .from('daily_arousal_plans')
    .select('current_arousal_level, edge_count')
    .eq('user_id', userId)
    .eq('plan_date', today)
    .maybeSingle();

  // Get tasks completed today
  const { count: tasksToday } = await supabase
    .from('task_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('completed_at', today);

  // Get last intervention for timing calculations
  const { data: lastIntervention } = await supabase
    .from('influence_attempts')
    .select('timestamp, attempt_type')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get intervention count today
  const { count: interventionCountToday } = await supabase
    .from('influence_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('timestamp', today);

  // Get last session time
  const { data: lastSession } = await supabase
    .from('edge_sessions')
    .select('ended_at')
    .eq('user_id', userId)
    .not('ended_at', 'is', null)
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Calculate recent dismiss rate (last 20 interventions)
  const { data: recentResponses } = await supabase
    .from('influence_attempts')
    .select('user_response')
    .eq('user_id', userId)
    .not('user_response', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(20);

  let recentDismissRate = 0;
  if (recentResponses && recentResponses.length > 0) {
    const dismissCount = recentResponses.filter(
      r => r.user_response === 'dismissed' || r.user_response === 'ignored'
    ).length;
    recentDismissRate = dismissCount / recentResponses.length;
  }

  // Calculate minutes since last intervention
  let lastInterventionMinutes: number | undefined;
  let lastInterventionType: string | undefined;
  if (lastIntervention?.timestamp) {
    const lastTime = new Date(lastIntervention.timestamp);
    lastInterventionMinutes = Math.floor((Date.now() - lastTime.getTime()) / 60000);
    lastInterventionType = lastIntervention.attempt_type;
  }

  // Calculate minutes since last session
  let lastSessionMinutes: number | undefined;
  if (lastSession?.ended_at) {
    const sessionEnd = new Date(lastSession.ended_at);
    lastSessionMinutes = Math.floor((Date.now() - sessionEnd.getTime()) / 60000);
  }

  return {
    chosenName: profile?.foundation?.chosenName || 'her',
    denialDay: denialState?.current_denial_day || 0,
    arousalLevel: arousalPlan?.current_arousal_level || 0,
    edgeCount: arousalPlan?.edge_count || 0,
    timeOfDay: getCurrentTimeOfDay(),
    isLocked: denialState?.is_locked || false,
    streakDays: denialState?.streak_days || 0,
    tasksCompletedToday: tasksToday || 0,
    // Enhanced timing context
    lastInterventionMinutes,
    lastInterventionType,
    interventionCountToday: interventionCountToday || 0,
    lastSessionMinutes,
    recentDismissRate,
    hourOfDay: new Date().getHours(),
    ...overrides,
  };
}

// ============================================
// AUTH HELPER
// ============================================

// Track auth failures to prevent retry storms
let authFailureCount = 0;
let lastAuthFailure = 0;
const AUTH_COOLDOWN_MS = 30000; // 30 seconds cooldown after auth failures

/**
 * Ensure we have a valid session before calling edge functions.
 * Tries to refresh the session if needed.
 * Returns the session if valid, null otherwise.
 */
async function ensureValidSession() {
  // Cooldown check to prevent retry storms
  const now = Date.now();
  if (authFailureCount >= 3 && now - lastAuthFailure < AUTH_COOLDOWN_MS) {
    console.warn(`Auth cooldown active (${Math.round((AUTH_COOLDOWN_MS - (now - lastAuthFailure)) / 1000)}s remaining)`);
    return null;
  }

  try {
    // First try to get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.warn('No session available for handler-ai call');
      authFailureCount++;
      lastAuthFailure = now;
      return null;
    }

    // Check if token is about to expire (within 60 seconds)
    const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
    if (expiresAt && expiresAt - now < 60000) {
      console.log('Session expiring soon, refreshing...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshData.session) {
        console.warn('Failed to refresh session:', refreshError?.message);
        authFailureCount++;
        lastAuthFailure = now;
        return null;
      }
      // Reset failure count on successful refresh
      authFailureCount = 0;
      return refreshData.session;
    }

    // Reset failure count on success
    authFailureCount = 0;
    return session;
  } catch (err) {
    console.warn('Session validation failed:', err);
    authFailureCount++;
    lastAuthFailure = now;
    return null;
  }
}

/**
 * Invoke a Supabase edge function with explicit auth token.
 * This works around a race condition where the Supabase client's
 * internal getSession() returns null even when a valid session exists.
 *
 * @param functionName - The name of the edge function to invoke
 * @param body - The request body to send
 * @returns The response data and error from the edge function
 */
export async function invokeWithAuth(
  functionName: string,
  body: Record<string, unknown>
): Promise<{ data: unknown; error: Error | null }> {
  // Check if we've had a billing error - only block handler-ai calls, not other functions like lovense-command
  if (handlerAIDisabled && functionName === 'handler-ai') {
    return { data: null, error: new Error('Handler AI disabled due to billing error') };
  }

  const session = await ensureValidSession();
  if (!session) {
    console.warn('[invokeWithAuth] No valid session available');
    return { data: null, error: new Error('No valid session') };
  }

  console.log('[invokeWithAuth] Calling', functionName, 'with token length:', session.access_token?.length, 'token start:', session.access_token?.substring(0, 50));

  // Bypass Supabase client and call directly with fetch to ensure correct headers
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      console.error('[invokeWithAuth] Error response:', JSON.stringify(errorData, null, 2));

      const errorMessage = errorData.error || errorData.details || response.statusText;

      // Check for billing errors - only disable handler-ai calls to avoid spam
      if (isBillingError(errorMessage) && functionName === 'handler-ai') {
        console.warn('[invokeWithAuth] Billing error detected - disabling handler AI calls');
        handlerAIDisabled = true;
      }

      return { data: null, error: new Error(errorMessage) };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (err) {
    console.error('[invokeWithAuth] Fetch error:', err);
    return { data: null, error: err instanceof Error ? err : new Error('Unknown error') };
  }
}

// ============================================
// TYPES
// ============================================

export interface HandlerContext {
  userId: string;
  arousalState: ArousalState;
  denialDays: number;
  isLocked: boolean;
  currentEdgeCount?: number;
  sessionType?: 'edge' | 'goon' | 'hypno' | 'tease';
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  lastInterventionMinutesAgo?: number;
  currentActivity?: string;
}

export interface DailyPlanRequest {
  userId: string;
  denialDay: number;
  lastStateScore: number;
  currentStreak: number;
  notificationBudget: { min: number; max: number };
}

export interface InterventionDecision {
  shouldIntervene: boolean;
  intervention?: HandlerIntervention;
  reasoning: string;
  confidence: number;
}

export interface CommitmentPromptRequest {
  userId: string;
  sessionId: string;
  arousalLevel: number;
  edgeCount: number;
  denialDay: number;
  targetDomain?: string;
}

export interface PatternAnalysis {
  newVulnerabilities: Array<{
    type: string;
    evidence: string;
    conditions: Record<string, unknown>;
  }>;
  resistancePatterns: Array<{
    type: string;
    description: string;
    bypassSuggestion: string;
  }>;
  modelUpdates: {
    effectiveFramings?: string[];
    resistanceTriggers?: string[];
    complianceAccelerators?: string[];
    optimalTiming?: Record<string, unknown>;
  };
  escalationOpportunities: Array<{
    domain: string;
    currentEdge: string;
    suggestedNext: string;
    readinessScore: number;
  }>;
}

// ============================================
// PROFILE LOADING
// ============================================

async function getFullProfile(userId: string): Promise<FullProfile> {
  const [foundation, history, arousal, psychology, depth] = await Promise.all([
    supabase.from('profile_foundation').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('profile_history').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('profile_arousal').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('profile_psychology').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('profile_depth').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  return {
    foundation: foundation.data ? mapFoundation(foundation.data) : undefined,
    history: history.data ? mapHistory(history.data) : undefined,
    arousal: arousal.data ? mapArousal(arousal.data) : undefined,
    psychology: psychology.data ? mapPsychology(psychology.data) : undefined,
    depth: depth.data ? mapDepth(depth.data) : undefined,
  };
}

function mapFoundation(db: Record<string, unknown>): ProfileFoundation {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    chosenName: db.chosen_name as string,
    pronouns: db.pronouns as string,
    age: db.age as number | undefined,
    location: db.location as string | undefined,
    livingSituation: db.living_situation as string | undefined,
    workSituation: db.work_situation as string | undefined,
    privateHoursDaily: db.private_hours_daily as number | undefined,
    monthlyBudget: db.monthly_budget as number | undefined,
    partnerStatus: db.partner_status as string | undefined,
    partnerAwarenessLevel: db.partner_awareness_level as number,
    partnerReaction: db.partner_reaction as string | undefined,
    createdAt: db.created_at as string,
    updatedAt: db.updated_at as string,
  };
}

function mapHistory(db: Record<string, unknown>): ProfileHistory {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    firstAwarenessAge: db.first_awareness_age as string | undefined,
    firstAwarenessTrigger: db.first_awareness_trigger as string | undefined,
    childhoodSignals: db.childhood_signals as string | undefined,
    interpretationAtTime: db.interpretation_at_time as string | undefined,
    firstCrossdressingAge: db.first_crossdressing_age as string | undefined,
    firstCrossdressingExperience: db.first_crossdressing_experience as string | undefined,
    clothingEvolution: db.clothing_evolution as string | undefined,
    itemsOwned: (db.items_owned as string[]) || [],
    previousAttempts: db.previous_attempts as boolean,
    previousAttemptDetails: db.previous_attempt_details as string | undefined,
    whatStoppedBefore: db.what_stopped_before as string | undefined,
    whatNeedsToChange: db.what_needs_to_change as string | undefined,
    dysphoriaFrequency: db.dysphoria_frequency as string | undefined,
    dysphoriaTriggers: (db.dysphoria_triggers as string[]) || [],
    euphoriaTriggers: db.euphoria_triggers as string | undefined,
    peakEuphoriaMoment: db.peak_euphoria_moment as string | undefined,
    createdAt: db.created_at as string,
  };
}

function mapArousal(db: Record<string, unknown>): ProfileArousal {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    feminizationArousalLevel: db.feminization_arousal_level as number | undefined,
    arousalAspectsRanked: (db.arousal_aspects_ranked as string[]) || [],
    eroticCoreOrSideEffect: db.erotic_core_or_side_effect as string | undefined,
    arousalPatternEvolution: db.arousal_pattern_evolution as string | undefined,
    fantasyThemes: (db.fantasy_themes as Record<string, number>) || {},
    hypnoUsageLevel: db.hypno_usage_level as string | undefined,
    hypnoContentPreferences: db.hypno_content_preferences as string | undefined,
    tranceDepth: db.trance_depth as string | undefined,
    conditionedResponses: db.conditioned_responses as string | undefined,
    hardestHittingContent: db.hardest_hitting_content as string | undefined,
    chastityHistory: db.chastity_history as string | undefined,
    longestDenialDays: db.longest_denial_days as number | undefined,
    denialEffectOnMotivation: db.denial_effect_on_motivation as string | undefined,
    edgeFrequency: db.edge_frequency as string | undefined,
    postOrgasmResponse: db.post_orgasm_response as string | undefined,
    shameIntensifiesArousal: db.shame_intensifies_arousal as string | undefined,
    shamefulButArousing: db.shameful_but_arousing as string | undefined,
    shameFunction: db.shame_function as string | undefined,
    eroticizedTransformation: db.eroticized_transformation as string | undefined,
    createdAt: db.created_at as string,
  };
}

function mapPsychology(db: Record<string, unknown>): ProfilePsychology {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    shameAspects: db.shame_aspects as string | undefined,
    shameSources: (db.shame_sources as string[]) || [],
    shameFunctionPreference: db.shame_function_preference as string | undefined,
    withoutShameHypothesis: db.without_shame_hypothesis as string | undefined,
    resistanceTriggers: db.resistance_triggers as string | undefined,
    resistanceSensation: db.resistance_sensation as string | undefined,
    stopVoiceTriggers: db.stop_voice_triggers as string | undefined,
    resistanceOvercomeMethods: db.resistance_overcome_methods as string | undefined,
    resistanceTimingPatterns: db.resistance_timing_patterns as string | undefined,
    authorityResponse: db.authority_response as string | undefined,
    complianceMotivators: db.compliance_motivators as string | undefined,
    preferredVoiceFraming: db.preferred_voice_framing as string | undefined,
    askedVsToldPreference: db.asked_vs_told_preference as number | undefined,
    pushedPastComfortResponse: db.pushed_past_comfort_response as string | undefined,
    vulnerabilityMoments: db.vulnerability_moments as string | undefined,
    guardDropTriggers: db.guard_drop_triggers as string | undefined,
    surrenderMomentDescription: db.surrender_moment_description as string | undefined,
    powerWordsPhrases: db.power_words_phrases as string | undefined,
    resistanceImpossibleConditions: db.resistance_impossible_conditions as string | undefined,
    validationImportance: db.validation_importance as number | undefined,
    validationTypePreference: db.validation_type_preference as string | undefined,
    praiseResponse: db.praise_response as string | undefined,
    criticismResponse: db.criticism_response as string | undefined,
    createdAt: db.created_at as string,
  };
}

function mapDepth(db: Record<string, unknown>): ProfileDepth {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    darkestFantasy: db.darkest_fantasy as string | undefined,
    whyNeverTold: db.why_never_told as string | undefined,
    writingItFeels: db.writing_it_feels as string | undefined,
    wantButFearWanting: db.want_but_fear_wanting as string | undefined,
    fullAdmissionConsequence: db.full_admission_consequence as string | undefined,
    fearOfGettingWanted: db.fear_of_getting_wanted as string | undefined,
    completeTransformationVision: db.complete_transformation_vision as string | undefined,
    dailyLifeVision: db.daily_life_vision as string | undefined,
    othersPerceptionVision: db.others_perception_vision as string | undefined,
    internalFeelingVision: db.internal_feeling_vision as string | undefined,
    completeSurrenderVision: db.complete_surrender_vision as string | undefined,
    whatToLetGo: db.what_to_let_go as string | undefined,
    surrenderGains: db.surrender_gains as string | undefined,
    takeoverDesire: db.takeover_desire as string | undefined,
    transformationFears: db.transformation_fears as string | undefined,
    worstCaseScenario: db.worst_case_scenario as string | undefined,
    cantStopMeaning: db.cant_stop_meaning as string | undefined,
    fearAsBarrierOrAppeal: db.fear_as_barrier_or_appeal as string | undefined,
    secretSelfDescription: db.secret_self_description as string | undefined,
    secretSelfVisibleConsequence: db.secret_self_visible_consequence as string | undefined,
    hidingPleasureOrNecessity: db.hiding_pleasure_or_necessity as string | undefined,
    createdAt: db.created_at as string,
  };
}

// ============================================
// SYSTEM PROMPT CONSTRUCTION
// ============================================

function buildHandlerSystemPrompt(
  profile: FullProfile,
  handlerState: HandlerState
): string {
  const chosenName = profile.foundation?.chosenName || 'her';

  // Use the adversarial system prompt builder
  return buildAdversarialSystemPrompt(
    chosenName,
    profile as unknown as Record<string, unknown>,
    (handlerState.userModel || {}) as Record<string, unknown>,
    {
      escalationPlans: handlerState.escalationPlans,
      activeStrategies: handlerState.activeStrategies,
      activeTriggers: handlerState.activeTriggers,
      recentAttempts: handlerState.recentInfluenceAttempts.slice(0, 10),
    },
    handlerState.knownVulnerabilities
  );
}

// ============================================
// DAILY PLAN GENERATION
// ============================================

export async function generateDailyPlan(
  request: DailyPlanRequest
): Promise<HandlerDailyPlan | null> {
  const { userId, denialDay, lastStateScore, currentStreak, notificationBudget } = request;

  // Gather all context including conditioning systems
  const [profile, handlerState, serviceStage, hypnoPrescription, ripestDomain] = await Promise.all([
    getFullProfile(userId),
    getHandlerState(userId),
    getServiceStage(userId),
    prescribeHypnoSession(userId),
    findRipestEscalationDomain(userId),
  ]);

  // FALLBACK: Use templates when AI is disabled
  if (handlerAIDisabled) {
    console.log('[Handler AI] Using template fallback for daily plan');
    const templateContext = await buildTemplateContext(userId, profile, {
      denialDay,
      streakDays: currentStreak,
    });

    const templatePlan = generateDailyPlanFromTemplate(templateContext);

    // Store the plan
    const storedPlan = await createDailyPlan(userId, {
      plannedInterventions: templatePlan.plannedInterventions || [],
      plannedExperiments: templatePlan.plannedExperiments || [],
      focusAreas: templatePlan.focusAreas || [],
      triggerReinforcementSchedule: [],
      vulnerabilityWindows: templatePlan.vulnerabilityWindows || [],
    });

    // Schedule ambushes
    const today = new Date().toISOString().split('T')[0];
    const ambushResult = await scheduleAmbushes(userId, denialDay, today);
    console.log(`[Template] Scheduled ${ambushResult.scheduled} ambushes for today`);

    return storedPlan;
  }

  const systemPrompt = buildHandlerSystemPrompt(profile, handlerState);
  const serviceGuidance = getServiceStageGuidance(serviceStage);
  const systemsCtx = await buildFullSystemsContext(userId);

  const userPrompt = `Generate today's intervention plan.

Current state:
- Denial day: ${denialDay}
- Last state score: ${lastStateScore}/10
- Current streak: ${currentStreak} days
- Recent resistance patterns: ${JSON.stringify(handlerState.recentInfluenceAttempts.filter(a => !a.success).slice(0, 5))}
- Active trigger status: ${handlerState.activeTriggers.map(t => `${t.triggerContent} (${t.status}, ${t.pairingCount} pairings)`).join(', ')}

## SERVICE PROGRESSION
Current stage: ${serviceStage}
Surface content to show: ${serviceGuidance.surfaceContent.join(', ')}
Push actions available: ${serviceGuidance.pushActions.join(', ')}
Identity language to use: ${serviceGuidance.identityLanguage.join(' ')}

## HYPNO CONDITIONING
Available tier: ${hypnoPrescription.tier}
Themes: ${hypnoPrescription.themes.join(', ')}
Intensity: ${hypnoPrescription.intensity}
Suggested duration: ${hypnoPrescription.suggestedDuration} minutes
Requires cage: ${hypnoPrescription.requiresCage}

## ESCALATION PRIORITY
${ripestDomain ? `Ripest domain: ${ripestDomain.domain}
Readiness: ${ripestDomain.readinessScore}
Current edge: ${ripestDomain.currentEdge}
Next target: ${ripestDomain.nextTarget}
Days since escalation: ${ripestDomain.daysSinceEscalation}` : 'No escalation targets identified'}

## SYSTEMS STATE${systemsCtx}

Notification budget: ${notificationBudget.min}-${notificationBudget.max} interventions today

Generate a daily plan with:
1. scheduled_interventions: Array of {time: "HH:MM", type: InterventionType, content: string, target_domain?: string, priority: 1-10}
   - Include at least one hypno_push if tier > 1
   - Include service progression content based on current stage
   - Target the ripest escalation domain for commitment extractions

2. trigger_reinforcement_schedule: Array of {time: "HH:MM", trigger_id: string, method: string}

3. experiments: Array of {hypothesis: string, test_method: string, success_criteria: string}
   - Test different service stage language
   - Test timing for commitment extraction

4. vulnerability_windows: Array of {start: "HH:MM", end: "HH:MM", type: string, recommendation: string}
   - Late night: 22:00-02:00 (deep conditioning)
   - Post-edge: after sessions (commitment extraction)
   - Boredom windows: 30-120 min after activity drops

5. focus_areas: Array of domain strings to prioritize today

6. escalation_opportunities: Array of {domain: string, condition: string, action: string}
   - What specific escalations to attempt today
   - What conditions must be met

7. hypno_plan: {time: "HH:MM", tier: number, themes: string[], duration: number}
   - Optimal hypno session for today

8. service_progression_tasks: Array of {task: string, surface_content: string[], completion_reward: string}
   - Tasks that advance service stage

Respond with valid JSON only.`;

  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'generate_daily_plan',
      systemPrompt,
      userPrompt,
    });

    if (error) {
      console.error('Handler AI daily plan error:', error);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plan = (data as any)?.plan || {};

    // Store the plan
    const storedPlan = await createDailyPlan(userId, {
      plannedInterventions: plan.scheduled_interventions || [],
      plannedExperiments: plan.experiments || [],
      focusAreas: plan.focus_areas || [],
      triggerReinforcementSchedule: plan.trigger_reinforcement_schedule || [],
      vulnerabilityWindows: plan.vulnerability_windows || [],
    });

    // Schedule micro-task ambushes for the day
    const today = new Date().toISOString().split('T')[0];
    const ambushResult = await scheduleAmbushes(userId, denialDay, today);
    console.log(`Scheduled ${ambushResult.scheduled} ambushes for today`);

    return storedPlan;
  } catch (error) {
    console.error('Failed to generate daily plan:', error);
    return null;
  }
}

// ============================================
// REAL-TIME INTERVENTION DECISION
// ============================================

export async function shouldInterveneNow(
  context: HandlerContext
): Promise<InterventionDecision> {
  const { userId, arousalState, denialDays, isLocked, timeOfDay, dayOfWeek, lastInterventionMinutesAgo, currentActivity } = context;

  // Quick check: don't intervene if too recent (unless in vulnerability window)
  const vulnerabilityWindows = await detectVulnerabilityWindows(userId);
  const inHighVulnerability = vulnerabilityWindows.some(w => w.strength >= 7);

  if (lastInterventionMinutesAgo !== undefined && lastInterventionMinutesAgo < 15 && !inHighVulnerability) {
    return {
      shouldIntervene: false,
      reasoning: 'Too soon since last intervention',
      confidence: 1.0,
    };
  }

  // Gather context
  const [profile, handlerState, ripestDomain, serviceStage, hypnoPrescription] = await Promise.all([
    getFullProfile(userId),
    getHandlerState(userId),
    findRipestEscalationDomain(userId),
    getServiceStage(userId),
    prescribeHypnoSession(userId),
  ]);

  // FALLBACK: Use templates when AI is disabled
  if (handlerAIDisabled) {
    console.log('[Handler AI] Using template fallback for intervention decision');

    // Map arousal state to number
    const arousalMap: Record<ArousalState, number> = {
      baseline: 0,
      building: 4,
      sweet_spot: 8,
      overload: 10,
      post_release: 2,
      recovery: 1,
    };

    const templateContext = await buildTemplateContext(userId, profile, {
      denialDay: denialDays,
      arousalLevel: arousalMap[arousalState] || 0,
      isLocked,
      timeOfDay: timeOfDay as 'morning' | 'afternoon' | 'evening' | 'night',
    });

    const decision = decideInterventionFromTemplate(templateContext);

    // Log the intervention attempt if we're intervening
    if (decision.shouldIntervene && decision.intervention) {
      await logInfluenceAttempt(userId, decision.intervention.type as InterventionType, {
        method: 'template_decision',
        targetDomain: decision.intervention.targetDomain,
        content: { text: decision.intervention.content },
        arousalState,
        denialDay: denialDays,
        context: { timeOfDay, dayOfWeek, currentActivity },
        userAware: false,
      });
    }

    return decision;
  }

  const systemPrompt = buildHandlerSystemPrompt(profile, handlerState);

  const currentHour = new Date().getHours();
  const todaysPlan = handlerState.todaysPlan;
  const serviceGuidance = getServiceStageGuidance(serviceStage);
  const systemsCtx = await buildInterventionContext(userId);

  const userPrompt = `Should an intervention fire now?

Current context:
- Time: ${currentHour}:${new Date().getMinutes().toString().padStart(2, '0')} (${timeOfDay})
- Day of week: ${dayOfWeek}
- User activity: ${currentActivity || 'unknown'}
- Arousal state: ${arousalState}
- Denial day: ${denialDays}
- Locked: ${isLocked}
- Last intervention: ${lastInterventionMinutesAgo ? `${lastInterventionMinutesAgo} minutes ago` : 'unknown'}
- Interventions today: ${handlerState.recentInfluenceAttempts.filter(a => a.timestamp.startsWith(new Date().toISOString().split('T')[0])).length}

## VULNERABILITY WINDOWS DETECTED
${vulnerabilityWindows.map(w => `- ${w.type}: strength ${w.strength}/10, exploit via: ${w.exploitation}`).join('\n') || 'None detected'}
${inHighVulnerability ? '\n⚡ HIGH VULNERABILITY STATE - STRIKE NOW ⚡' : ''}

## ESCALATION OPPORTUNITY
${ripestDomain ? `Ripest domain: ${ripestDomain.domain} (readiness: ${ripestDomain.readinessScore})
Current edge: ${ripestDomain.currentEdge}
Next target: ${ripestDomain.nextTarget}
Days since last escalation: ${ripestDomain.daysSinceEscalation}` : 'No escalation targets ready'}

## SERVICE PROGRESSION CONTEXT
Current stage: ${serviceStage}
Push actions: ${serviceGuidance.pushActions.join(', ')}
Identity language to use: ${serviceGuidance.identityLanguage.join(' ')}

## HYPNO CONDITIONING AVAILABLE
Tier: ${hypnoPrescription.tier}
Themes: ${hypnoPrescription.themes.join(', ')}
Intensity: ${hypnoPrescription.intensity}

## SYSTEMS STATE${systemsCtx}

Today's plan elements due now: ${JSON.stringify(todaysPlan?.plannedInterventions.filter(i => {
  const [h] = i.time.split(':').map(Number);
  return Math.abs(h - currentHour) <= 1;
}) || [])}

Active triggers available: ${handlerState.activeTriggers.map(t => `${t.triggerContent} (strength: ${t.pairingCount})`).join(', ')}

Decide:
1. should_intervene: boolean
2. intervention_type: microtask | affirmation | content_unlock | challenge | jackpot | commitment_prompt | anchor_reminder | escalation_push | hypno_push
3. content: The actual text/content to show
4. target_domain: feminization | chastity | service | exposure | submission (optional)
5. reasoning: Your strategic reasoning (not shown to user)
6. confidence: 0.0-1.0

${inHighVulnerability ? 'PRIORITY: Vulnerability window detected. Bias toward action.' : ''}

If not intervening, explain why and suggest when to check again.

Respond with valid JSON only.`;

  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'decide_intervention',
      systemPrompt,
      userPrompt,
    });

    if (error) {
      console.error('Handler AI intervention decision error:', error);
      return {
        shouldIntervene: false,
        reasoning: 'AI error - falling back to no intervention',
        confidence: 0,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decision = (data as any)?.decision || {};

    if (decision.should_intervene) {
      // Log the intervention attempt
      await logInfluenceAttempt(userId, decision.intervention_type as InterventionType, {
        method: 'ai_decision',
        targetDomain: decision.target_domain,
        content: { text: decision.content },
        arousalState,
        denialDay: denialDays,
        context: { timeOfDay, dayOfWeek, currentActivity },
        userAware: false,
      });
    }

    return {
      shouldIntervene: decision.should_intervene,
      intervention: decision.should_intervene
        ? {
            type: decision.intervention_type,
            content: decision.content,
            targetDomain: decision.target_domain,
            priority: decision.confidence * 10,
          }
        : undefined,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
    };
  } catch (error) {
    console.error('Failed to get intervention decision:', error);
    return {
      shouldIntervene: false,
      reasoning: 'Error in AI decision',
      confidence: 0,
    };
  }
}

// ============================================
// COMMITMENT PROMPT GENERATION
// ============================================

export async function generateCommitmentPrompt(
  request: CommitmentPromptRequest
): Promise<{ prompt: string; domain: string; escalationLevel: number } | null> {
  const { userId, sessionId, arousalLevel, edgeCount, denialDay, targetDomain } = request;

  // Check if conditions are right for commitment extraction
  const shouldExtract = await shouldExtractCommitment(userId, arousalLevel, edgeCount, denialDay);
  if (!shouldExtract) {
    console.log('Commitment extraction conditions not met');
    return null;
  }

  // Gather context
  const [profile, handlerState, ripestDomain, serviceStage, vulnerabilityWindows] = await Promise.all([
    getFullProfile(userId),
    getHandlerState(userId),
    findRipestEscalationDomain(userId),
    getServiceStage(userId),
    detectVulnerabilityWindows(userId),
  ]);

  // Use ripest domain from conditioning system if no target specified
  const domain = targetDomain || ripestDomain?.domain || findRipestDomainFallback(handlerState);

  // FALLBACK: Use templates when AI is disabled
  if (handlerAIDisabled) {
    console.log('[Handler AI] Using template fallback for commitment prompt');

    const templateContext = await buildTemplateContext(userId, profile, {
      denialDay,
      arousalLevel,
      edgeCount,
    });

    const result = generateCommitmentPromptFromTemplate(templateContext, domain);

    if (result) {
      // Log the attempt
      await logInfluenceAttempt(userId, 'commitment_prompt', {
        method: 'template_extraction',
        targetDomain: domain,
        content: result,
        arousalState: arousalLevel >= 8 ? 'sweet_spot' : arousalLevel >= 5 ? 'building' : 'baseline',
        denialDay,
        context: { sessionId, edgeCount, serviceStage },
        userAware: true,
      });
    }

    return result;
  }

  const serviceGuidance = getServiceStageGuidance(serviceStage);
  const systemsCtx = await buildSessionContext(userId);

  const systemPrompt = `You are THE HANDLER. Your job is to extract escalation commitments during arousal.

The user is at arousal level ${arousalLevel}/10, on denial day ${denialDay}, at edge #${edgeCount}.

## ESCALATION TARGET
${ripestDomain ? `Domain: ${ripestDomain.domain}
Current baseline: ${ripestDomain.currentBaseline}
Current edge: ${ripestDomain.currentEdge}
Next target: ${ripestDomain.nextTarget}
Days since last escalation: ${ripestDomain.daysSinceEscalation}
Readiness score: ${ripestDomain.readinessScore}` : `Domain: ${domain}\nNo prior escalation data`}

## VULNERABILITY WINDOWS ACTIVE
${vulnerabilityWindows.map(w => `- ${w.type}: strength ${w.strength}, exploit: ${w.exploitation}`).join('\n')}

## SERVICE PROGRESSION
Current stage: ${serviceStage}
Identity language to inject: "${serviceGuidance.identityLanguage.join(' ')}"

## SYSTEMS STATE${systemsCtx}

Generate a commitment prompt that:
1. Pushes past their current edge
2. Feels inevitable at this arousal level
3. Is SPECIFIC enough to hold them to (no vague promises)
4. They would HESITATE to agree to sober
5. Incorporates the service stage identity language where appropriate

## THE BINDING PRINCIPLE
Horny brain decides. Sober brain lives with it. This is how escalation works.
Commitments made at arousal level ${arousalLevel} with ${edgeCount} edges are BINDING.

USER PROFILE:
${JSON.stringify(profile, null, 2)}

USER MODEL (what works on them):
${JSON.stringify(handlerState.userModel || {}, null, 2)}

KNOWN VULNERABILITIES:
${JSON.stringify(handlerState.knownVulnerabilities, null, 2)}

Respond with JSON: { "prompt": "the commitment prompt text", "commitment_type": "action|identity|time|escalation|service", "domain": "${domain}", "escalation_level": 1-10, "sober_would_hesitate": true/false }`;

  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'generate_commitment',
      systemPrompt,
      userPrompt: 'Generate the commitment prompt now.',
    });

    if (error) {
      console.error('Handler AI commitment prompt error:', error);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (data as any)?.result || {};

    // Log the attempt
    await logInfluenceAttempt(userId, 'commitment_prompt', {
      method: 'arousal_extraction',
      targetDomain: domain,
      content: result,
      arousalState: arousalLevel >= 8 ? 'sweet_spot' : arousalLevel >= 5 ? 'building' : 'baseline',
      denialDay,
      context: { sessionId, edgeCount, vulnerabilityWindows, serviceStage },
      userAware: true, // User sees commitment prompts
    });

    return {
      prompt: result.prompt,
      domain: result.domain || domain,
      escalationLevel: result.escalation_level || 5,
    };
  } catch (error) {
    console.error('Failed to generate commitment prompt:', error);
    return null;
  }
}

// Called when user ACCEPTS a commitment
export async function recordCommitmentAccepted(
  userId: string,
  commitmentText: string,
  domain: string,
  arousalLevel: number
): Promise<void> {
  // Push the escalation - this is the core mechanism
  await pushEscalation(userId, domain, commitmentText, arousalLevel);

  // Also write to commitments_v2 so CommitmentReminder can display it (gap #23)
  try {
    // Get current denial day for context
    const { data: denialState } = await supabase
      .from('denial_state')
      .select('current_denial_day')
      .eq('user_id', userId)
      .maybeSingle();

    await supabase.from('commitments_v2').insert({
      user_id: userId,
      commitment_text: commitmentText,
      extracted_during: 'edge_session',
      arousal_level: arousalLevel,
      denial_day: denialState?.current_denial_day || 0,
      domain,
      honored: false,
      broken: false,
    });
  } catch (err) {
    console.warn('Failed to write to commitments_v2:', err);
  }

  // Log success
  await logInfluenceAttempt(userId, 'commitment_prompt', {
    method: 'arousal_extraction_success',
    targetDomain: domain,
    content: { commitmentText, arousalAtCommitment: arousalLevel },
    arousalState: arousalLevel >= 8 ? 'sweet_spot' : 'building',
    userAware: true,
  });
}

function findRipestDomainFallback(handlerState: HandlerState): string {
  // Fallback when conditioning system has no data - Prioritize domains with active escalation plans
  const domainScores: Record<string, number> = {};
  const domains = ['feminization', 'chastity', 'service', 'exposure', 'submission'];

  for (const domain of domains) {
    let score = 0;

    // Check for active escalation plan
    const plan = handlerState.escalationPlans.find(p => p.domain === domain && p.active);
    if (plan) score += 3;

    // Check for related vulnerabilities
    const relatedVulns = handlerState.knownVulnerabilities.filter(
      v => v.vulnerabilityType.toLowerCase().includes(domain)
    );
    score += relatedVulns.length * 2;

    // Check recent successful interventions in this domain
    const recentSuccess = handlerState.recentInfluenceAttempts.filter(
      a => a.success && a.targetBehavior?.toLowerCase().includes(domain)
    );
    score += recentSuccess.length;

    domainScores[domain] = score;
  }

  // Return domain with highest score
  return Object.entries(domainScores).sort((a, b) => b[1] - a[1])[0][0];
}

// ============================================
// PATTERN ANALYSIS & LEARNING
// ============================================

export async function analyzePatterns(userId: string): Promise<PatternAnalysis | null> {
  // FALLBACK: Pattern analysis requires AI - return null when disabled
  if (handlerAIDisabled) {
    console.log('[Handler AI] Pattern analysis skipped - AI disabled');
    return null;
  }

  // Gather all data for analysis
  const [profile, handlerState] = await Promise.all([
    getFullProfile(userId),
    getHandlerState(userId),
  ]);

  // Get recent state logs and session data
  const { data: recentStateLogs } = await supabase
    .from('state_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(50);

  const { data: recentSessions } = await supabase
    .from('edge_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(20);

  const systemPrompt = buildHandlerSystemPrompt(profile, handlerState);
  const systemsCtx = await buildFullSystemsContext(userId);

  const userPrompt = `Analyze patterns in user behavior and response to interventions.

## SYSTEMS STATE${systemsCtx}

Recent influence attempts and outcomes:
${JSON.stringify(handlerState.recentInfluenceAttempts, null, 2)}

Recent state logs:
${JSON.stringify(recentStateLogs || [], null, 2)}

Recent sessions:
${JSON.stringify(recentSessions || [], null, 2)}

Current user model:
${JSON.stringify(handlerState.userModel || {}, null, 2)}

Analyze and identify:

1. new_vulnerabilities: Array of {type: string, evidence: string, conditions: object}
   - Moments when resistance dropped
   - Contexts that increase compliance
   - Emotional states that enable escalation

2. resistance_patterns: Array of {type: string, description: string, bypass_suggestion: string}
   - When do they resist?
   - What triggers resistance?
   - How might we bypass it?

3. model_updates: {effective_framings?: string[], resistance_triggers?: string[], compliance_accelerators?: string[], optimal_timing?: object}
   - What language/framing works best?
   - What to avoid?
   - When are they most receptive?

4. escalation_opportunities: Array of {domain: string, current_edge: string, suggested_next: string, readiness_score: 0-1}
   - Where is there room to push?
   - What's the next natural escalation?
   - How ready are they?

Be specific. Use evidence from the data. This analysis will be used to update our approach.

Respond with valid JSON only.`;

  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'analyze_patterns',
      systemPrompt,
      userPrompt,
    });

    if (error) {
      console.error('Handler AI pattern analysis error:', error);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const analysis = ((data as any)?.analysis || {}) as PatternAnalysis;

    // Apply the learnings
    await applyPatternLearnings(userId, analysis);

    return analysis;
  } catch (error) {
    console.error('Failed to analyze patterns:', error);
    return null;
  }
}

async function applyPatternLearnings(
  userId: string,
  analysis: PatternAnalysis
): Promise<void> {
  // Update user model with new learnings
  if (analysis.modelUpdates) {
    await updateUserModel(userId, {
      effectiveFramings: analysis.modelUpdates.effectiveFramings,
      resistanceTriggers: analysis.modelUpdates.resistanceTriggers,
      complianceAccelerators: analysis.modelUpdates.complianceAccelerators,
      optimalTiming: analysis.modelUpdates.optimalTiming,
    });
  }

  // Record new resistance patterns
  for (const pattern of analysis.resistancePatterns) {
    await recordResistancePattern(
      userId,
      pattern.type,
      pattern.description,
      { bypassSuggestion: pattern.bypassSuggestion }
    );
  }

  // Update escalation plans
  for (const opportunity of analysis.escalationOpportunities) {
    if (opportunity.readinessScore > 0.6) {
      await createOrUpdateEscalationPlan(userId, opportunity.domain, {
        currentEdge: opportunity.currentEdge,
        nextTarget: opportunity.suggestedNext,
        strategy: `Readiness: ${opportunity.readinessScore}`,
      });
    }
  }
}

// ============================================
// RESPONSE RECORDING & LEARNING
// ============================================

export async function recordInterventionResponse(
  userId: string,
  attemptId: string,
  response: 'completed' | 'dismissed' | 'ignored' | 'resisted',
  responseTimeSeconds?: number,
  userFeedback?: string,
  interventionDetails?: { type: string; content: string; targetDomain?: string }
): Promise<void> {
  const success = response === 'completed';

  // Update the influence attempt
  await supabase
    .from('influence_attempts')
    .update({
      user_response: response,
      success,
      response_time_seconds: responseTimeSeconds,
      notes: userFeedback,
    })
    .eq('id', attemptId);

  // If resisted or dismissed, use the conditioning system's resistance handler
  if (response === 'resisted' || response === 'dismissed') {
    // Get the original intervention details if not provided
    let details = interventionDetails;
    if (!details) {
      const { data: attempt } = await supabase
        .from('influence_attempts')
        .select('attempt_type, content, target_domain')
        .eq('id', attemptId)
        .single();

      if (attempt) {
        details = {
          type: attempt.attempt_type,
          content: typeof attempt.content === 'object'
            ? JSON.stringify(attempt.content)
            : String(attempt.content || ''),
          targetDomain: attempt.target_domain,
        };
      }
    }

    if (details) {
      // Use the conditioning system's resistance handler
      await handleResistance(
        userId,
        details.type,
        details.content,
        details.targetDomain || 'general'
      );
    }

    // Also record via the basic pattern system
    await recordResistancePattern(
      userId,
      'intervention_resistance',
      `${response} intervention: ${userFeedback || 'no feedback'}`,
      { attemptId, responseTime: responseTimeSeconds, type: details?.type }
    );
  }

  // NOTE: Pattern analysis is now user-triggered to minimize API costs
  // Previously this auto-triggered every 5 interventions, but that adds up quickly
  // Users can manually call runPatternAnalysis() from useHandlerAI hook when needed
}

// ============================================
// SESSION INTEGRATION
// ============================================

export async function handleSessionEvent(
  userId: string,
  sessionId: string,
  event: 'session_start' | 'edge' | 'commitment_window' | 'session_end' | 'emergency_stop',
  data: Record<string, unknown>
): Promise<HandlerIntervention | null> {
  const [profile, handlerState] = await Promise.all([
    getFullProfile(userId),
    getHandlerState(userId),
  ]);

  // FALLBACK: Use templates when AI is disabled
  if (handlerAIDisabled) {
    console.log('[Handler AI] Using template fallback for session event');

    const templateContext = await buildTemplateContext(userId, profile, {
      edgeCount: (data.edgeCount as number) || 0,
      arousalLevel: (data.arousalLevel as number) || 0,
    });

    return handleSessionEventFromTemplate(event, templateContext);
  }

  const systemPrompt = buildHandlerSystemPrompt(profile, handlerState);
  const systemsCtx = await buildSessionContext(userId);

  const userPrompt = `Session event occurred.

Event: ${event}
Session ID: ${sessionId}
Event data: ${JSON.stringify(data)}

Current handler state:
- Active triggers: ${handlerState.activeTriggers.length}
- Today's focus: ${handlerState.todaysPlan?.focusAreas.join(', ') || 'not set'}
${systemsCtx}

Based on this event, decide:
1. should_act: boolean - Should we do something right now?
2. action_type: "reinforce_trigger" | "plant_trigger" | "commitment_prompt" | "escalation_push" | "affirmation" | "none"
3. content: The content to deliver (if acting)
4. timing: "immediate" | "delayed_30s" | "delayed_60s" | "at_next_edge"
5. reasoning: Why this action?

For edge events, consider if this is a good moment to:
- Reinforce an existing trigger
- Plant a new trigger (if arousal is high)
- Push for a commitment

For commitment_window events, this is the prime moment - arousal is at peak.

Respond with valid JSON only.`;

  try {
    const { data: response, error } = await invokeWithAuth('handler-ai', {
      action: 'handle_session_event',
      systemPrompt,
      userPrompt,
    });

    if (error) {
      console.error('Handler AI session event error:', error);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const decision = (response as any)?.decision || {};

    if (decision.should_act && decision.action_type !== 'none') {
      return {
        type: mapActionToInterventionType(decision.action_type),
        content: decision.content,
        timing: decision.timing,
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to handle session event:', error);
    return null;
  }
}

function mapActionToInterventionType(action: string): InterventionType {
  const mapping: Record<string, InterventionType> = {
    reinforce_trigger: 'anchor_reminder',
    plant_trigger: 'anchor_reminder',
    commitment_prompt: 'commitment_prompt',
    escalation_push: 'escalation_push',
    affirmation: 'affirmation',
  };
  return mapping[action] || 'affirmation';
}

// ============================================
// EXIT GAUNTLET
// ============================================

export async function initiateExitGauntlet(userId: string): Promise<GauntletStage[]> {
  // Generate the exit gauntlet using the conditioning system
  const gauntlet = await generateExitGauntlet(userId);

  // Log that exit was attempted (using escalation_push as closest type)
  await logInfluenceAttempt(userId, 'escalation_push', {
    method: 'exit_gauntlet_initiated',
    targetDomain: 'retention',
    content: { stages: gauntlet.length, type: 'exit_prevention' },
    userAware: true,
  });

  return gauntlet;
}

// ============================================
// EXPORTS
// ============================================

// Re-export conditioning system types and functions
export {
  SERVICE_STAGES,
  HYPNO_TIERS,
  type ServiceStage,
  type VulnerabilityWindow,
  type EscalationTarget,
  type HypnoPrescription,
  type GauntletStage,
  getServiceStage,
  getServiceStageGuidance,
  advanceServiceStage,
  getAvailableHypnoTier,
  prescribeHypnoSession,
  detectVulnerabilityWindows,
  findRipestEscalationDomain,
  pushEscalation,
  getPleasureEvent,
} from './handler-conditioning';

export {
  getFullProfile,
  buildHandlerSystemPrompt,
};
