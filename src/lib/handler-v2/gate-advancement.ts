/**
 * Gate Level Advancement — Item 8
 *
 * Auto-escalation proposals during high compliance.
 * Tracks approval rates per permission domain.
 * Advances gate levels when compliance exceeds threshold.
 */

import { supabase } from '../supabase';

interface GateStatus {
  domain: string;
  currentLevel: number;
  approvalRate: number;
  totalRequests: number;
  totalApproved: number;
  eligible: boolean; // Ready for advancement
  proposedLevel?: number;
}

/**
 * Calculate approval rates and check for advancement eligibility.
 */
export async function evaluateGates(userId: string): Promise<GateStatus[]> {
  const { data: gates } = await supabase
    .from('handler_standing_permissions')
    .select('*')
    .eq('user_id', userId);

  if (!gates) return [];

  const results: GateStatus[] = [];

  for (const gate of gates) {
    const totalRequests = gate.total_requests || 0;
    const totalApproved = gate.total_approved || 0;
    const approvalRate = totalRequests > 0 ? totalApproved / totalRequests : 0;

    // Advancement criteria:
    // - At least 10 requests at current level
    // - Approval rate >= 85%
    // - Current level < max (5)
    const eligible = totalRequests >= 10 && approvalRate >= 0.85 && (gate.level || 1) < 5;

    results.push({
      domain: gate.domain,
      currentLevel: gate.level || 1,
      approvalRate,
      totalRequests,
      totalApproved,
      eligible,
      proposedLevel: eligible ? (gate.level || 1) + 1 : undefined,
    });
  }

  return results;
}

/**
 * Advance eligible gates. Called during high-compliance periods.
 * Returns the domains that were advanced.
 */
export async function advanceEligibleGates(userId: string): Promise<string[]> {
  const gates = await evaluateGates(userId);
  const advanced: string[] = [];

  for (const gate of gates) {
    if (!gate.eligible || !gate.proposedLevel) continue;

    await supabase
      .from('handler_standing_permissions')
      .update({
        level: gate.proposedLevel,
        last_advanced_at: new Date().toISOString(),
        // advancement_history updated below
      })
      .eq('user_id', userId)
      .eq('domain', gate.domain);

    // Direct update for advancement history
    const { data: current } = await supabase
      .from('handler_standing_permissions')
      .select('advancement_history')
      .eq('user_id', userId)
      .eq('domain', gate.domain)
      .single();

    const history = (current?.advancement_history as Array<Record<string, unknown>>) || [];
    history.push({
      from: gate.currentLevel,
      to: gate.proposedLevel,
      approvalRate: gate.approvalRate,
      totalRequests: gate.totalRequests,
      timestamp: new Date().toISOString(),
    });

    await supabase
      .from('handler_standing_permissions')
      .update({ advancement_history: history })
      .eq('user_id', userId)
      .eq('domain', gate.domain);

    advanced.push(gate.domain);
  }

  return advanced;
}

/**
 * Build gate context for Handler prompt.
 */
export async function buildGateContext(userId: string): Promise<string> {
  const gates = await evaluateGates(userId);
  if (gates.length === 0) return '';

  const eligible = gates.filter(g => g.eligible);
  if (eligible.length === 0) return '';

  const lines = ['## Permission Escalation Opportunities'];
  for (const g of eligible) {
    lines.push(`- ${g.domain}: level ${g.currentLevel} → ${g.proposedLevel} (${(g.approvalRate * 100).toFixed(0)}% approval over ${g.totalRequests} requests)`);
  }

  return lines.join('\n');
}
