// Compliance Gating System (Feature 36)
// Features the user WANTS are gated behind compliance with tasks she's AVOIDING.
// She can't cherry-pick the fun parts and skip the hard parts.

import { supabase } from './supabase';

// ===========================================
// TYPES
// ===========================================

export interface ComplianceGate {
  id: string;
  userId: string;
  blockedFeature: GateableFeature;
  requiredAction: string;
  reason: string;
  createdAt: string;
  fulfilledAt: string | null;
  expiresAt: string | null;
}

export type GateableFeature =
  | 'edge_session'               // Can't start a session until...
  | 'content_library'            // Can't browse content until...
  | 'session_tier_above_3'       // Can't access high-tier content until...
  | 'release_eligibility'        // Can't be considered for release until...
  | 'conditioning_arc_next'      // Can't start next conditioning session until...
  | 'dashboard_evidence'         // Can't see evidence dashboard until...
  | 'inspiration_feed';          // Can't see community mirror until...

export interface UserComplianceState {
  userId: string;
  daysSinceVoicePractice: number;
  tasksDeclinedThisWeek: number;
  ignoredSessionsThisCycle: number;
  sessionsWithoutReflection: number;
  euphoriaEntriesThisWeek: number;
  daysOnProtocol: number;
  avoidedDomains: Record<string, number>;  // domain -> days since last activity
}

// ===========================================
// DATABASE OPERATIONS
// ===========================================

export async function getActiveGates(userId: string): Promise<ComplianceGate[]> {
  const { data, error } = await supabase
    .from('compliance_gates')
    .select('*')
    .eq('user_id', userId)
    .is('fulfilled_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

  if (error) {
    console.error('Error fetching compliance gates:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    blockedFeature: row.blocked_feature as GateableFeature,
    requiredAction: row.required_action,
    reason: row.reason || '',
    createdAt: row.created_at,
    fulfilledAt: row.fulfilled_at,
    expiresAt: row.expires_at,
  }));
}

export async function createGate(
  userId: string,
  gate: Omit<ComplianceGate, 'id' | 'userId' | 'createdAt' | 'fulfilledAt'>
): Promise<ComplianceGate | null> {
  // Check if similar gate already exists
  const existing = await getActiveGates(userId);
  const alreadyExists = existing.some(
    g => g.blockedFeature === gate.blockedFeature && g.requiredAction === gate.requiredAction
  );
  if (alreadyExists) return null;

  const { data, error } = await supabase
    .from('compliance_gates')
    .insert({
      user_id: userId,
      blocked_feature: gate.blockedFeature,
      required_action: gate.requiredAction,
      reason: gate.reason,
      expires_at: gate.expiresAt,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating compliance gate:', error);
    return null;
  }

  return {
    id: data.id,
    userId: data.user_id,
    blockedFeature: data.blocked_feature as GateableFeature,
    requiredAction: data.required_action,
    reason: data.reason || '',
    createdAt: data.created_at,
    fulfilledAt: data.fulfilled_at,
    expiresAt: data.expires_at,
  };
}

export async function fulfillGate(gateId: string): Promise<boolean> {
  const { error } = await supabase
    .from('compliance_gates')
    .update({ fulfilled_at: new Date().toISOString() })
    .eq('id', gateId);

  if (error) {
    console.error('Error fulfilling gate:', error);
    return false;
  }

  return true;
}

export async function fulfillGateByAction(
  userId: string,
  requiredAction: string
): Promise<boolean> {
  const { error } = await supabase
    .from('compliance_gates')
    .update({ fulfilled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('required_action', requiredAction)
    .is('fulfilled_at', null);

  if (error) {
    console.error('Error fulfilling gate by action:', error);
    return false;
  }

  return true;
}

// ===========================================
// GATE EVALUATION LOGIC
// ===========================================

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Evaluate what compliance gates should exist based on user state.
 * Creates new gates if conditions are met.
 */
export async function evaluateComplianceGates(
  state: UserComplianceState
): Promise<ComplianceGate[]> {
  const newGates: Array<Omit<ComplianceGate, 'id' | 'userId' | 'createdAt' | 'fulfilledAt'>> = [];

  // Voice avoidance gates edge sessions
  if (state.daysSinceVoicePractice >= 3) {
    newGates.push({
      blockedFeature: 'edge_session',
      requiredAction: 'voice_practice_5_minutes',
      reason: `Voice practice blocked edge sessions. ${state.daysSinceVoicePractice} days avoided. 5 minutes of voice practice unlocks tonight's session.`,
      expiresAt: null,
    });
  }

  // Skipped tasks gate high-tier content
  if (state.tasksDeclinedThisWeek >= 3) {
    newGates.push({
      blockedFeature: 'session_tier_above_3',
      requiredAction: 'complete_3_consecutive_tasks',
      reason: `3 declines this week locked high-tier content. Complete 3 tasks in a row to restore access.`,
      expiresAt: null,
    });
  }

  // Ignored Handler sessions gate release eligibility
  if (state.ignoredSessionsThisCycle >= 1) {
    newGates.push({
      blockedFeature: 'release_eligibility',
      requiredAction: 'complete_ignored_session_type',
      reason: `You ignored a session I initiated. Release eligibility is suspended until that session is completed.`,
      expiresAt: null,
    });
  }

  // No reflection logged gates next session
  if (state.sessionsWithoutReflection >= 2) {
    newGates.push({
      blockedFeature: 'edge_session',
      requiredAction: 'write_reflection_on_last_session',
      reason: `2 sessions without reflection. Write a reflection before the next session. I need to hear what happened.`,
      expiresAt: null,
    });
  }

  // No euphoria logged this week gates content library
  if (state.euphoriaEntriesThisWeek === 0 && state.daysOnProtocol >= 14) {
    newGates.push({
      blockedFeature: 'content_library',
      requiredAction: 'log_one_euphoria_moment',
      reason: `No euphoria logged this week. Before you browse content, tell me one non-sexual moment where being her felt right. Just one.`,
      expiresAt: addDays(new Date(), 2).toISOString(),
    });
  }

  // Check for avoided domains
  for (const [domain, daysSince] of Object.entries(state.avoidedDomains)) {
    if (daysSince >= 5) {
      // Severe avoidance - gate multiple features
      newGates.push({
        blockedFeature: 'edge_session',
        requiredAction: `complete_${domain}_task`,
        reason: `${daysSince} days avoiding ${domain}. Complete one ${domain} task to unlock edge sessions.`,
        expiresAt: null,
      });
    } else if (daysSince >= 3) {
      // Moderate avoidance - gate content
      newGates.push({
        blockedFeature: 'session_tier_above_3',
        requiredAction: `complete_${domain}_task`,
        reason: `${daysSince} days avoiding ${domain}. Complete one ${domain} task to unlock high-tier content.`,
        expiresAt: null,
      });
    }
  }

  // Create new gates in database
  const createdGates: ComplianceGate[] = [];
  for (const gate of newGates) {
    const created = await createGate(state.userId, gate);
    if (created) {
      createdGates.push(created);
    }
  }

  // Return all active gates (existing + newly created)
  return getActiveGates(state.userId);
}

// ===========================================
// FEATURE ACCESS CHECKING
// ===========================================

export interface FeatureAccessResult {
  allowed: boolean;
  gate: ComplianceGate | null;
  reason: string | null;
}

/**
 * Check if a specific feature is accessible or gated
 */
export async function checkFeatureAccess(
  userId: string,
  feature: GateableFeature
): Promise<FeatureAccessResult> {
  const gates = await getActiveGates(userId);
  const blockingGate = gates.find(g => g.blockedFeature === feature);

  if (blockingGate) {
    return {
      allowed: false,
      gate: blockingGate,
      reason: blockingGate.reason,
    };
  }

  return {
    allowed: true,
    gate: null,
    reason: null,
  };
}

/**
 * Get all features that are currently gated for a user
 */
export async function getGatedFeatures(userId: string): Promise<Map<GateableFeature, ComplianceGate>> {
  const gates = await getActiveGates(userId);
  const gatedFeatures = new Map<GateableFeature, ComplianceGate>();

  for (const gate of gates) {
    // Only store the first gate for each feature (most important)
    if (!gatedFeatures.has(gate.blockedFeature)) {
      gatedFeatures.set(gate.blockedFeature, gate);
    }
  }

  return gatedFeatures;
}

// ===========================================
// ACTION MAPPING
// ===========================================

export interface RequiredActionInfo {
  action: string;
  label: string;
  description: string;
  route?: string;        // Where to navigate to complete this
  component?: string;    // Component to render
}

export function getActionInfo(requiredAction: string): RequiredActionInfo {
  const actionMap: Record<string, RequiredActionInfo> = {
    'voice_practice_5_minutes': {
      action: 'voice_practice_5_minutes',
      label: 'Voice Practice',
      description: '5 minutes of voice practice',
      route: '/sessions?type=voice',
    },
    'complete_3_consecutive_tasks': {
      action: 'complete_3_consecutive_tasks',
      label: 'Complete Tasks',
      description: 'Complete 3 tasks in a row',
      route: '/',
    },
    'complete_ignored_session_type': {
      action: 'complete_ignored_session_type',
      label: 'Complete Session',
      description: 'Complete the session you ignored',
      route: '/sessions',
    },
    'write_reflection_on_last_session': {
      action: 'write_reflection_on_last_session',
      label: 'Write Reflection',
      description: 'Reflect on your last session',
      route: '/journal',
    },
    'log_one_euphoria_moment': {
      action: 'log_one_euphoria_moment',
      label: 'Log Euphoria',
      description: 'Log one moment of non-sexual euphoria',
      component: 'EuphoriaCapture',
    },
  };

  // Handle dynamic domain-based actions
  if (requiredAction.startsWith('complete_') && requiredAction.endsWith('_task')) {
    const domain = requiredAction.replace('complete_', '').replace('_task', '');
    return {
      action: requiredAction,
      label: `Complete ${domain} task`,
      description: `Complete one task in the ${domain} domain`,
      route: '/',
    };
  }

  return actionMap[requiredAction] || {
    action: requiredAction,
    label: 'Complete action',
    description: requiredAction.replace(/_/g, ' '),
    route: '/',
  };
}

export default {
  getActiveGates,
  createGate,
  fulfillGate,
  fulfillGateByAction,
  evaluateComplianceGates,
  checkFeatureAccess,
  getGatedFeatures,
  getActionInfo,
};
