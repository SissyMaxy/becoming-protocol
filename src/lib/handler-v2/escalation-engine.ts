/**
 * Infinite Escalation Engine
 *
 * Removes the level ceiling across all domains. The CSV provides levels 1-5.
 * This engine generates level 6+ dynamically, ensuring the protocol never
 * plateaus and the Handler never runs out of material.
 */

import { supabase } from '../supabase';
import { HandlerParameters } from '../handler-parameters';
import { invokeWithAuth } from '../handler-ai';

/**
 * Check if pre-generation should trigger for a domain.
 * Called after every task completion.
 */
export async function checkEscalationTrigger(
  userId: string,
  domain: string,
  params: HandlerParameters,
): Promise<boolean> {
  const threshold = await params.get<number>('escalation.pre_generation_threshold', 0.8);

  // Get current max level for this domain from task_bank
  const { data: bankTasks } = await supabase
    .from('task_bank')
    .select('id, intensity')
    .eq('domain', domain)
    .eq('active', true);

  // Get generated tasks for this domain
  const { data: genTasks } = await supabase
    .from('generated_tasks')
    .select('id, level')
    .eq('user_id', userId)
    .eq('domain', domain)
    .eq('is_active', true);

  const allTaskIds = [
    ...(bankTasks || []).map(t => t.id),
    ...(genTasks || []).map(t => t.id),
  ];

  if (allTaskIds.length === 0) return false;

  // Count completions for these tasks
  const { count: completedCount } = await supabase
    .from('task_completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('task_id', allTaskIds);

  const completionRate = (completedCount || 0) / allTaskIds.length;

  if (completionRate >= threshold) {
    // Check if next level already generated
    const maxGenLevel = genTasks && genTasks.length > 0
      ? Math.max(...genTasks.map(t => t.level))
      : 5; // CSV goes to 5

    const { count: nextLevelCount } = await supabase
      .from('generated_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('domain', domain)
      .eq('level', maxGenLevel + 1)
      .eq('is_active', true);

    return (nextLevelCount || 0) === 0; // Trigger if next level doesn't exist
  }

  return false;
}

/**
 * Generate next-level tasks for a domain via the Handler AI.
 * Runs as a background operation.
 */
export async function generateNextLevel(
  userId: string,
  domain: string,
  params: HandlerParameters,
): Promise<number> {
  // Determine next level
  const { data: genTasks } = await supabase
    .from('generated_tasks')
    .select('level')
    .eq('user_id', userId)
    .eq('domain', domain)
    .eq('is_active', true)
    .order('level', { ascending: false })
    .limit(1);

  const currentMaxLevel = genTasks && genTasks.length > 0 ? genTasks[0].level : 5;
  const nextLevel = currentMaxLevel + 1;

  // Get completed tasks at current level for context
  const { data: completedTasks } = await supabase
    .from('task_completions')
    .select('task_id, created_at, task_bank(instruction, domain, category)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  const domainCompletions = (completedTasks || [])
    .filter(t => (t.task_bank as unknown as Record<string, unknown>)?.domain === domain)
    .map(t => (t.task_bank as unknown as Record<string, unknown>)?.instruction)
    .filter(Boolean);

  const tasksPerLevel = await params.get<{ min: number; max: number }>(
    'escalation.tasks_per_level', { min: 5, max: 8 }
  );

  const crossDomainAfter = await params.get<number>('escalation.cross_domain_after_level', 6);

  const prompt = `Generate ${tasksPerLevel.min}-${tasksPerLevel.max} tasks for domain "${domain}" at level ${nextLevel}.

Previously completed tasks in this domain:
${domainCompletions.slice(0, 10).map((t, i) => `${i + 1}. ${t}`).join('\n')}

RULES:
- Each task must exceed level ${currentMaxLevel} in difficulty, exposure, or depth
- Include at least one novel element per task
- Push past a current comfort boundary
${nextLevel >= crossDomainAfter ? '- At least one task should combine this domain with another domain' : ''}

Return JSON array. Each object:
{"category":"string","instruction":"string","subtext":"string","completion_type":"binary|duration|reflect","duration_minutes":number|null,"points":number,"affirmation":"string","trigger_condition":"string|null","time_window":"morning|daytime|evening|night|any","requires_privacy":"true|false","novel_element":"string","comfort_boundary_crossed":"string"}`;

  const { data, error } = await invokeWithAuth('handler-ai', {
    action: 'generate',
    userPrompt: prompt,
    maxTokens: 2000,
  });

  if (error || !data) {
    console.error('[Escalation] Generation failed:', error?.message);
    return 0;
  }

  // Parse response
  let tasks: Array<Record<string, unknown>> = [];
  try {
    const text = typeof data === 'string' ? data : (data as Record<string, unknown>)?.response as string || '';
    const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
    tasks = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('[Escalation] Parse failed:', parseErr);
    return 0;
  }

  // Insert generated tasks
  let inserted = 0;
  for (const task of tasks) {
    const { error: insertErr } = await supabase.from('generated_tasks').insert({
      user_id: userId,
      category: task.category || 'practice',
      domain,
      level: nextLevel,
      intensity: Math.min(5, nextLevel * 0.8),
      instruction: task.instruction,
      subtext: task.subtext || null,
      completion_type: task.completion_type || 'binary',
      duration_minutes: task.duration_minutes || null,
      points: task.points || nextLevel * 5,
      affirmation: task.affirmation || null,
      trigger_condition: task.trigger_condition || null,
      time_window: task.time_window || 'any',
      requires_privacy: task.requires_privacy || 'false',
      novel_element: task.novel_element || null,
      comfort_boundary_crossed: task.comfort_boundary_crossed || null,
      generated_by: 'handler_ai',
      generation_context: {
        next_level: nextLevel,
        domain_completions: domainCompletions.length,
      },
    });

    if (!insertErr) inserted++;
  }

  console.log(`[Escalation] Generated ${inserted} level-${nextLevel} tasks for ${domain}`);
  return inserted;
}

/**
 * Get generated tasks eligible for selection in the rules engine.
 */
export async function getEligibleGeneratedTasks(
  userId: string,
  domain?: string,
): Promise<Array<Record<string, unknown>>> {
  let query = supabase
    .from('generated_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (domain) {
    query = query.eq('domain', domain);
  }

  const { data } = await query;
  return data || [];
}
