/**
 * Infinite Escalation — Level Generator
 *
 * AI-generated levels 6+ with no ceiling.
 * Domain dependency monitoring and dynamic difficulty.
 * The system never runs out of runway.
 */

import { supabase } from '../supabase';
import { invokeWithAuth, isHandlerAIDisabled } from '../handler-ai';
import type {
  DynamicLevel,
  DomainDependency,
  EscalationOverview,
  CrossDomainStatus,
  AdvancementAssessment,
} from '../../types/escalation';

// ============================================
// ADVANCEMENT ASSESSMENT
// ============================================

/**
 * Assess whether a domain is ready for level advancement.
 * Checks task completion threshold, intensity floor, and cross-domain dependencies.
 */
export async function assessAdvancement(
  userId: string,
  domain: string
): Promise<AdvancementAssessment> {
  // Get current domain state
  const { data: state } = await supabase
    .from('domain_escalation_state')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .maybeSingle();

  if (!state) {
    return {
      ready: false,
      currentLevel: 0,
      blockedBy: [],
      tasksCompleted: 0,
      intensityAvg: 0,
      recommendation: 'Domain state not initialized. Complete tasks to begin tracking.',
    };
  }

  const currentLevel = state.current_level;
  const nextLevel = currentLevel + 1;

  // Check cross-domain dependencies for next level
  const { data: deps } = await supabase
    .from('domain_dependencies')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .eq('required_level', nextLevel)
    .eq('active', true);

  const blockedBy: Array<{ domain: string; requiredLevel: number; currentLevel: number }> = [];

  if (deps && deps.length > 0) {
    // Check each dependency's current level
    const depDomains = deps.map((d: DomainDependency) => d.depends_on_domain);
    const { data: depStates } = await supabase
      .from('domain_escalation_state')
      .select('domain, current_level')
      .eq('user_id', userId)
      .in('domain', depDomains);

    const depLevelMap: Record<string, number> = {};
    (depStates || []).forEach((s: { domain: string; current_level: number }) => {
      depLevelMap[s.domain] = s.current_level;
    });

    for (const dep of deps as DomainDependency[]) {
      const depCurrentLevel = depLevelMap[dep.depends_on_domain] || 0;
      if (depCurrentLevel < dep.depends_on_level) {
        blockedBy.push({
          domain: dep.depends_on_domain,
          requiredLevel: dep.depends_on_level,
          currentLevel: depCurrentLevel,
        });
      }
    }
  }

  // Get intensity floor for current level
  let intensityFloor: number;
  if (currentLevel >= 6) {
    const { data: levelDef } = await supabase
      .from('dynamic_levels')
      .select('intensity_floor')
      .eq('user_id', userId)
      .eq('domain', domain)
      .eq('level', currentLevel)
      .maybeSingle();
    intensityFloor = levelDef?.intensity_floor || currentLevel * 0.6;
  } else {
    intensityFloor = currentLevel * 0.6;
  }

  const tasksCompleted = state.tasks_completed_at_current || 0;
  const intensityAvg = state.current_intensity_avg || 0;

  // Ready if: all deps met AND 15+ tasks AND intensity >= 80% of floor
  const depsBlocked = blockedBy.length > 0;
  const tasksReady = tasksCompleted >= 15;
  const intensityReady = intensityAvg >= intensityFloor * 0.8;
  const ready = !depsBlocked && tasksReady && intensityReady;

  // Build recommendation
  let recommendation: string;
  if (ready) {
    recommendation = `Ready to advance to level ${nextLevel}. All requirements met.`;
  } else if (depsBlocked) {
    const blockList = blockedBy.map(b => `${b.domain} (need ${b.requiredLevel}, at ${b.currentLevel})`).join(', ');
    recommendation = `Blocked by dependencies: ${blockList}. Work on those domains first.`;
  } else if (!tasksReady) {
    recommendation = `Need ${15 - tasksCompleted} more tasks at level ${currentLevel} before advancing.`;
  } else {
    recommendation = `Intensity too low (${intensityAvg.toFixed(1)} vs ${(intensityFloor * 0.8).toFixed(1)} required). Push harder.`;
  }

  // Update state with assessment results
  await supabase
    .from('domain_escalation_state')
    .update({
      advancement_ready: ready,
      advancement_blocked_by: blockedBy,
      last_assessment_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', state.id);

  return { ready, currentLevel, blockedBy, tasksCompleted, intensityAvg, recommendation };
}

// ============================================
// LEVEL GENERATION
// ============================================

/**
 * Generate the next dynamic level for a domain.
 * Returns null if currentLevel < 5 (CSV handles those) or AI is disabled.
 * Pre-generates ahead so the system never runs out of runway.
 */
export async function generateNextLevel(
  userId: string,
  domain: string,
  currentLevel: number
): Promise<DynamicLevel | null> {
  // CSV handles levels 1-5
  if (currentLevel < 5) return null;

  const nextLevel = currentLevel + 1;

  // Check if already generated
  const { data: existing } = await supabase
    .from('dynamic_levels')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .eq('level', nextLevel)
    .maybeSingle();

  if (existing) return existing as DynamicLevel;

  // Need AI to generate
  if (isHandlerAIDisabled()) return null;

  // Get existing dynamic levels for continuity
  const { data: existingLevels } = await supabase
    .from('dynamic_levels')
    .select('level, title, description, intensity_floor')
    .eq('user_id', userId)
    .eq('domain', domain)
    .order('level', { ascending: true });

  // Get cross-domain status for context
  const { data: crossDomain } = await supabase
    .from('domain_escalation_state')
    .select('domain, current_level')
    .eq('user_id', userId);

  const crossDomainContext = (crossDomain || [])
    .map((s: { domain: string; current_level: number }) => `${s.domain}: level ${s.current_level}`)
    .join(', ');

  const existingContext = (existingLevels || [])
    .map((l: { level: number; title: string; intensity_floor: number }) =>
      `Level ${l.level}: "${l.title}" (intensity floor: ${l.intensity_floor})`)
    .join('\n');

  const systemPrompt = `You are the Handler generating the next escalation level for domain '${domain}'. The subject is at level ${currentLevel}. There is no maximum level. Each level must be meaningfully harder, more exposing, more committed, or more permanent than the last. Respond ONLY with JSON: { "title": "string", "description": "string", "task_templates": [{"instruction_template": "string with {name} placeholder", "intensity_min": number, "intensity_max": number, "duration_min": number, "duration_max": number, "completion_type": "string", "points_min": number, "points_max": number}], "intensity_floor": number, "entry_requirements": {}, "dependency_domains": [{"domain": "string", "min_level": number}], "escalation_triggers": [{"condition": "string", "threshold": number}] }`;

  const userPrompt = `Generate level ${nextLevel} for the "${domain}" domain.

Current level: ${currentLevel}
Cross-domain levels: ${crossDomainContext || 'none tracked yet'}

${existingContext ? `Previous dynamic levels for this domain:\n${existingContext}` : 'No previous dynamic levels — this is the first generated level beyond the CSV ceiling (levels 1-5).'}

Level ${nextLevel} must be harder than everything before it. Include 3-5 task templates. The intensity_floor should be higher than the previous level.`;

  try {
    const { data, error } = await invokeWithAuth('handler-ai', {
      action: 'generate_commitment',
      systemPrompt,
      userPrompt,
    });

    if (error) {
      console.error('[LevelGenerator] AI generation failed:', error);
      return null;
    }

    // Parse AI response
    const responseText = typeof data === 'string' ? data : JSON.stringify(data);
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[LevelGenerator] Could not parse JSON from AI response');
      return null;
    }

    const generated = JSON.parse(jsonMatch[0]);

    // Insert dynamic level
    const { data: inserted, error: insertError } = await supabase
      .from('dynamic_levels')
      .insert({
        user_id: userId,
        domain,
        level: nextLevel,
        title: generated.title,
        description: generated.description,
        entry_requirements: generated.entry_requirements || {},
        task_templates: generated.task_templates || [],
        intensity_floor: generated.intensity_floor || currentLevel * 0.7,
        intensity_ceiling: generated.intensity_ceiling || null,
        dependency_domains: generated.dependency_domains || [],
        escalation_triggers: generated.escalation_triggers || [],
        generated_by: 'handler',
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[LevelGenerator] Insert failed:', insertError.message);
      return null;
    }

    // Insert cross-domain dependencies if specified
    const deps = generated.dependency_domains || [];
    if (deps.length > 0) {
      const depRows = deps.map((d: { domain: string; min_level: number }) => ({
        user_id: userId,
        domain,
        required_level: nextLevel,
        depends_on_domain: d.domain,
        depends_on_level: d.min_level,
        rationale: `AI-generated dependency for ${domain} level ${nextLevel}`,
        handler_generated: true,
      }));

      await supabase
        .from('domain_dependencies')
        .upsert(depRows, { onConflict: 'user_id,domain,required_level,depends_on_domain' });
    }

    return inserted as DynamicLevel;
  } catch (err) {
    console.error('[LevelGenerator] Generation error:', err);
    return null;
  }
}

// ============================================
// DOMAIN ADVANCEMENT
// ============================================

/**
 * Advance a domain to the next level.
 * Checks readiness, updates state, logs event, pre-generates next level.
 */
export async function advanceDomain(
  userId: string,
  domain: string
): Promise<{
  advanced: boolean;
  newLevel?: number;
  nextLevelPreview?: DynamicLevel | null;
  blockedBy?: Array<{ domain: string; requiredLevel: number; currentLevel: number }>;
  recommendation?: string;
}> {
  const assessment = await assessAdvancement(userId, domain);

  if (!assessment.ready) {
    return {
      advanced: false,
      blockedBy: assessment.blockedBy,
      recommendation: assessment.recommendation,
    };
  }

  const newLevel = assessment.currentLevel + 1;

  // Get current state for event logging
  const { data: state } = await supabase
    .from('domain_escalation_state')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .single();

  if (!state) return { advanced: false, recommendation: 'State not found' };

  // Get user context for event
  const { data: userState } = await supabase
    .from('user_state')
    .select('current_arousal, denial_day')
    .eq('user_id', userId)
    .maybeSingle();

  // Get current cross-domain levels for dependency snapshot
  const { data: allDomains } = await supabase
    .from('domain_escalation_state')
    .select('domain, current_level')
    .eq('user_id', userId);

  const depSnapshot: Record<string, number> = {};
  (allDomains || []).forEach((d: { domain: string; current_level: number }) => {
    depSnapshot[d.domain] = d.current_level;
  });

  // Update domain state
  await supabase
    .from('domain_escalation_state')
    .update({
      current_level: newLevel,
      tasks_completed_at_current: 0,
      current_intensity_avg: 0,
      level_entered_at: new Date().toISOString(),
      advancement_ready: false,
      advancement_blocked_by: [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', state.id);

  // Log advancement event
  await supabase
    .from('escalation_advancement_events')
    .insert({
      user_id: userId,
      domain,
      from_level: assessment.currentLevel,
      to_level: newLevel,
      trigger_reason: 'Requirements met — tasks, intensity, and dependencies all satisfied',
      tasks_completed_at_previous: state.tasks_completed_at_current,
      intensity_at_advancement: state.current_intensity_avg,
      arousal_at_advancement: userState?.current_arousal || null,
      denial_day_at_advancement: userState?.denial_day || null,
      handler_initiated: false,
      dependency_state: depSnapshot,
    });

  // Pre-generate next level (fire-and-forget)
  const nextLevelPreview = await generateNextLevel(userId, domain, newLevel).catch(err => {
    console.warn('[LevelGenerator] Pre-generation failed:', err);
    return null;
  });

  return { advanced: true, newLevel, nextLevelPreview };
}

// ============================================
// TASK RECORDING
// ============================================

/**
 * Record a task completion at the current domain level.
 * Creates domain state if not exists. Updates running averages.
 * Triggers advancement assessment after update.
 */
export async function recordTaskAtLevel(
  userId: string,
  domain: string,
  intensity: number,
  completed: boolean
): Promise<void> {
  // Get or create domain state
  const { data: existing } = await supabase
    .from('domain_escalation_state')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .maybeSingle();

  if (!existing) {
    // Initialize with level 1
    await supabase
      .from('domain_escalation_state')
      .insert({
        user_id: userId,
        domain,
        current_level: 1,
        tasks_completed_at_current: completed ? 1 : 0,
        tasks_completed_total: completed ? 1 : 0,
        current_intensity_avg: completed ? intensity : 0,
        peak_intensity_reached: intensity,
      });
    return;
  }

  if (!completed) return;

  const newTotal = (existing.tasks_completed_at_current || 0) + 1;
  const oldAvg = existing.current_intensity_avg || 0;
  const newAvg = ((oldAvg * (newTotal - 1)) + intensity) / newTotal;
  const newPeak = Math.max(existing.peak_intensity_reached || 0, intensity);

  await supabase
    .from('domain_escalation_state')
    .update({
      tasks_completed_at_current: newTotal,
      tasks_completed_total: (existing.tasks_completed_total || 0) + 1,
      current_intensity_avg: newAvg,
      peak_intensity_reached: newPeak,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id);

  // Check advancement readiness after update (fire-and-forget)
  assessAdvancement(userId, domain).catch(err => {
    console.warn('[LevelGenerator] Post-task assessment failed:', err);
  });
}

// ============================================
// QUERIES
// ============================================

/**
 * Get escalation overview for all domains.
 */
export async function getEscalationOverview(
  userId: string
): Promise<EscalationOverview[]> {
  const { data, error } = await supabase
    .from('escalation_overview')
    .select('*')
    .eq('user_id', userId);

  if (error || !data) return [];

  return data.map((row: Record<string, unknown>) => ({
    domain: row.domain as string,
    currentLevel: row.current_level as number,
    tasksCompletedAtCurrent: row.tasks_completed_at_current as number,
    tasksCompletedTotal: row.tasks_completed_total as number,
    peakIntensityReached: row.peak_intensity_reached as number,
    advancementReady: row.advancement_ready as boolean,
    daysAtCurrentLevel: row.days_at_current_level as number,
    hasDynamicLevels: row.has_dynamic_levels as boolean,
    nextLevelExists: row.next_level_exists as boolean,
  }));
}

/**
 * Get cross-domain aggregate status.
 */
export async function getCrossDomainStatus(
  userId: string
): Promise<CrossDomainStatus | null> {
  const { data, error } = await supabase
    .from('cross_domain_status')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    overallAverageLevel: data.overall_average_level,
    lowestLevel: data.lowest_level,
    highestLevel: data.highest_level,
    domainsAtMax: data.domains_at_max,
    totalDomains: data.total_domains,
  };
}

/**
 * Get dependencies for a domain at a specific level with current status.
 */
export async function getDomainDependencies(
  userId: string,
  domain: string,
  level: number
): Promise<Array<DomainDependency & { currentDependencyLevel: number; met: boolean }>> {
  const { data: deps } = await supabase
    .from('domain_dependencies')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .eq('required_level', level)
    .eq('active', true);

  if (!deps || deps.length === 0) return [];

  // Get current levels for dependency domains
  const depDomains = deps.map((d: DomainDependency) => d.depends_on_domain);
  const { data: depStates } = await supabase
    .from('domain_escalation_state')
    .select('domain, current_level')
    .eq('user_id', userId)
    .in('domain', depDomains);

  const levelMap: Record<string, number> = {};
  (depStates || []).forEach((s: { domain: string; current_level: number }) => {
    levelMap[s.domain] = s.current_level;
  });

  return (deps as DomainDependency[]).map(dep => ({
    ...dep,
    currentDependencyLevel: levelMap[dep.depends_on_domain] || 0,
    met: (levelMap[dep.depends_on_domain] || 0) >= dep.depends_on_level,
  }));
}

/**
 * Initialize domain state for a set of domains.
 * Creates level 1 entries for domains that don't have state yet.
 */
export async function initializeDomainState(
  userId: string,
  domains: string[]
): Promise<void> {
  for (const domain of domains) {
    await supabase
      .from('domain_escalation_state')
      .upsert(
        {
          user_id: userId,
          domain,
          current_level: 1,
        },
        { onConflict: 'user_id,domain' }
      );
  }
}
