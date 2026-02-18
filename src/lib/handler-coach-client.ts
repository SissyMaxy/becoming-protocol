// Handler Coach Client
// Client-side library to interact with the handler-coach edge function

import { supabase } from './supabase';
import { generatePrefill, PrefillContext } from './prefill-generator';

export interface UserState {
  user_id: string;
  denial_day: number;
  arousal_level: number;
  mood: string;
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'late_night';
  gina_present: boolean;
  last_task?: string;
  streak_days: number;
  avoided_domains?: string[];
  last_session_completed_at?: string;
  last_session_type?: string;
  just_completed_task?: string;
  just_completed_session?: boolean;
  engagement_rating?: number;
  had_breakthrough_yesterday?: boolean;
  had_session_last_night?: boolean;
  last_engagement_level?: number;
  last_reflection_text?: string;
  last_goal_text?: string;
  current_tier?: number;
  sessions_completed?: number;
  domain_last_completed?: Record<string, string>;
  completed_today?: boolean;
}

export type RequestType = 'daily_briefing' | 'task_framing' | 'session_guidance' | 'reflection' | 'check_in';

export interface CoachRequest {
  user_id: string;
  request_type: RequestType;
  user_state: UserState;
  prefill: string;
  context?: Record<string, unknown>;
}

export interface CoachResponse {
  message: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Call the handler coach API
 */
export async function callCoachAPI(request: CoachRequest): Promise<CoachResponse> {
  const { data, error } = await supabase.functions.invoke('handler-coach', {
    body: request
  });

  if (error) {
    console.error('Handler Coach API Error:', error);
    throw new Error(error.message || 'Failed to call coach API');
  }

  return data as CoachResponse;
}

/**
 * Get a coach message with auto-generated prefill
 */
export async function getCoachMessage(
  requestType: RequestType,
  userState: UserState,
  context?: Record<string, unknown>
): Promise<string> {
  const prefillContext: PrefillContext = {
    denial_day: userState.denial_day,
    arousal_level: userState.arousal_level,
    time_of_day: userState.time_of_day,
    mood: userState.mood,
    gina_present: userState.gina_present,
    streak_days: userState.streak_days,
    last_completed_task: userState.last_task ?? '',
    days_avoiding_domain: 0, // Will be calculated below if domain context provided
    just_completed_session: userState.just_completed_session,
    engagement_rating: userState.engagement_rating,
    had_session_last_night: userState.had_session_last_night,
    avoided_domains: userState.avoided_domains,
    request_type: requestType,
    task_category: context?.domain as string ?? '',
    task_tier: context?.tier as number ?? 0,
    session_type: context?.session_type as string,
  };

  // Calculate days avoiding domain if we have domain_last_completed data
  if (context?.domain && userState.domain_last_completed) {
    const lastCompleted = userState.domain_last_completed[context.domain as string];
    if (lastCompleted) {
      const daysSince = Math.floor((Date.now() - new Date(lastCompleted).getTime()) / 86400000);
      prefillContext.days_avoiding_domain = daysSince;
    }
  }

  const prefill = generatePrefill(prefillContext);

  const response = await callCoachAPI({
    user_id: userState.user_id,
    request_type: requestType,
    user_state: userState,
    prefill,
    context
  });

  return response.message;
}

/**
 * Get morning briefing from the coach
 */
export async function getMorningBriefing(userState: UserState): Promise<string> {
  return getCoachMessage('daily_briefing', userState);
}

/**
 * Get task framing from the coach
 */
export async function getTaskFraming(
  userState: UserState,
  task: { instruction: string; domain: string; tier?: number }
): Promise<string> {
  return getCoachMessage('task_framing', userState, {
    task: task.instruction,
    domain: task.domain,
    tier: task.tier || 1
  });
}

/**
 * Get post-session reflection prompt from the coach
 */
export async function getReflectionPrompt(
  userState: UserState,
  sessionType: string,
  engagement: number
): Promise<string> {
  return getCoachMessage('reflection', {
    ...userState,
    just_completed_session: true,
    engagement_rating: engagement
  }, {
    session_type: sessionType,
    engagement
  });
}

/**
 * Get check-in message from the coach (for Handler-initiated sessions)
 */
export async function getCheckInMessage(
  userState: UserState,
  trigger: string
): Promise<string> {
  return getCoachMessage('check_in', userState, { trigger });
}

/**
 * Determine the time of day based on current hour
 */
export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'late_night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late_night';
}

/**
 * Build user state from various sources
 */
export async function buildUserState(userId: string): Promise<UserState> {
  // Fetch denial day from user profile or denial cycles
  const { data: profile } = await supabase
    .from('user_profile')
    .select('denial_day, streak_days, arousal_level')
    .eq('user_id', userId)
    .single();

  // Fetch last session info
  const { data: lastSession } = await supabase
    .from('edge_sessions')
    .select('completed_at, session_type, engagement_rating')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  // Fetch mood from recent mood check-ins
  const { data: moodData } = await supabase
    .from('mood_checkins')
    .select('mood')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .single();

  // Check if Gina is present (from physical state log)
  const { data: physicalState } = await supabase
    .from('physical_state_log')
    .select('*')
    .eq('user_id', userId)
    .order('logged_at', { ascending: false })
    .limit(1)
    .single();

  // Determine if session was last night
  const hadSessionLastNight = lastSession?.completed_at
    ? isLastNight(new Date(lastSession.completed_at))
    : false;

  // Get domain completion dates
  const { data: domainCompletions } = await supabase
    .from('task_completions')
    .select('domain, completed_at')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false });

  const domainLastCompleted: Record<string, string> = {};
  if (domainCompletions) {
    domainCompletions.forEach(completion => {
      if (!domainLastCompleted[completion.domain]) {
        domainLastCompleted[completion.domain] = completion.completed_at;
      }
    });
  }

  // Calculate avoided domains (not completed in 3+ days)
  const avoidedDomains: string[] = [];
  const threeDaysAgo = Date.now() - (3 * 86400000);
  Object.entries(domainLastCompleted).forEach(([domain, lastDate]) => {
    if (new Date(lastDate).getTime() < threeDaysAgo) {
      avoidedDomains.push(domain);
    }
  });

  return {
    user_id: userId,
    denial_day: profile?.denial_day || 0,
    arousal_level: profile?.arousal_level || 5,
    mood: moodData?.mood || 'okay',
    time_of_day: getTimeOfDay(),
    gina_present: physicalState?.gina_home ?? false,
    streak_days: profile?.streak_days || 0,
    avoided_domains: avoidedDomains,
    last_session_completed_at: lastSession?.completed_at,
    last_session_type: lastSession?.session_type,
    had_session_last_night: hadSessionLastNight,
    last_engagement_level: lastSession?.engagement_rating,
    domain_last_completed: domainLastCompleted
  };
}

/**
 * Check if a date was "last night" (yesterday evening/night)
 */
function isLastNight(date: Date): boolean {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const dateDay = date.toDateString();
  const yesterdayStr = yesterday.toDateString();

  // If it's morning and the session was yesterday
  if (now.getHours() < 12 && dateDay === yesterdayStr) {
    const sessionHour = date.getHours();
    return sessionHour >= 18; // Session was after 6pm yesterday
  }

  return false;
}

export default {
  callCoachAPI,
  getCoachMessage,
  getMorningBriefing,
  getTaskFraming,
  getReflectionPrompt,
  getCheckInMessage,
  buildUserState,
  getTimeOfDay
};
