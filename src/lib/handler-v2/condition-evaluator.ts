/**
 * Extended Trigger Condition Evaluator
 *
 * Replaces hardcoded condition maps with an extensible expression evaluator.
 * Supports legacy string conditions AND new expression syntax.
 *
 * Legacy: 'denial_day_3plus', 'gina_away', 'peak_arousal'
 * New: 'recovery_score > 60 AND voice_tasks_declined_streak < 2'
 */

import type { UserState } from './types';

/**
 * Flatten nested UserState into dot-notation vars for expression evaluation.
 */
function flattenState(state: UserState): Record<string, unknown> {
  return {
    denial_day: state.denialDay,
    streak: state.streakDays,
    arousal: state.currentArousal,
    time_of_day: state.timeOfDay,
    gina_home: state.ginaHome,
    in_session: state.inSession,
    edge_count: state.edgeCount || 0,
    tasks_today: state.tasksCompletedToday,
    odometer: state.odometer,
    // Whoop context
    recovery_score: (state as unknown as Record<string, unknown>).whoopRecoveryScore ?? -1,
    sleep_performance: (state as unknown as Record<string, unknown>).whoopSleepPerformance ?? -1,
    day_strain: (state as unknown as Record<string, unknown>).whoopDayStrain ?? -1,
  };
}

/**
 * Evaluate a trigger condition against the full UserState.
 * Returns true if condition is met (task should be served).
 */
export function evaluateCondition(condition: string | null | undefined, state: UserState): boolean {
  if (!condition || condition === 'none' || condition === 'any') return true;

  // Legacy conditions (backward compatibility with CSV trigger_condition strings)
  const legacy: Record<string, () => boolean> = {
    'denial_day_3plus': () => state.denialDay >= 3,
    'denial_day_5plus': () => state.denialDay >= 5,
    'denial_day_7plus': () => state.denialDay >= 7,
    'denial_day_8plus': () => state.denialDay >= 8,
    'denial_48hr+': () => state.denialDay >= 2,
    'denial_72hr+': () => state.denialDay >= 3,
    'denial_week+': () => state.denialDay >= 7,
    'gina_away': () => !state.ginaHome,
    'gina_home': () => state.ginaHome,
    'post_edge': () => state.inSession && state.sessionType === 'edge',
    'edge_5plus': () => (state.edgeCount || 0) >= 5,
    'edge_8plus': () => (state.edgeCount || 0) >= 8,
    'peak_arousal': () => state.currentArousal >= 4,
    'high_arousal': () => state.currentArousal >= 3,
    'low_arousal': () => state.currentArousal <= 1,
    'random_interrupt': () => Math.random() < 0.3,
    'morning': () => state.timeOfDay === 'morning',
    'evening': () => state.timeOfDay === 'evening',
    'night': () => state.timeOfDay === 'night',
    'daytime': () => ['morning', 'afternoon'].includes(state.timeOfDay),
    'streak_3plus': () => state.streakDays >= 3,
    'streak_7plus': () => state.streakDays >= 7,
    'streak_14plus': () => state.streakDays >= 14,
    'streak_30plus': () => state.streakDays >= 30,
    // Whoop-aware conditions
    'green_recovery': () => ((state as unknown as Record<string, unknown>).whoopRecoveryScore as number ?? 100) >= 67,
    'yellow_recovery': () => {
      const s = (state as unknown as Record<string, unknown>).whoopRecoveryScore as number ?? 100;
      return s >= 34 && s < 67;
    },
    'red_recovery': () => ((state as unknown as Record<string, unknown>).whoopRecoveryScore as number ?? 100) < 34,
  };

  if (legacy[condition]) {
    return legacy[condition]();
  }

  // Expression evaluation for generated task conditions
  return evaluateExpression(condition, flattenState(state));
}

/**
 * Simple safe expression evaluator. Supports:
 * - Comparisons: >, <, >=, <=, ==, !=
 * - Boolean: AND, OR
 * - Variable references to flattened state
 * NEVER uses eval().
 */
function evaluateExpression(expr: string, vars: Record<string, unknown>): boolean {
  try {
    // Split on AND first
    if (expr.includes(' AND ')) {
      return expr.split(' AND ').every(clause => evaluateExpression(clause.trim(), vars));
    }

    // Then OR
    if (expr.includes(' OR ')) {
      return expr.split(' OR ').some(clause => evaluateExpression(clause.trim(), vars));
    }

    // Single comparison: "recovery_score > 60"
    const match = expr.match(/^(\w+)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
    if (match) {
      const [, key, op, rawValue] = match;
      const left = vars[key];
      const right = isNaN(Number(rawValue)) ? rawValue.replace(/['"]/g, '') : Number(rawValue);

      switch (op) {
        case '>': return (left as number) > (right as number);
        case '<': return (left as number) < (right as number);
        case '>=': return (left as number) >= (right as number);
        case '<=': return (left as number) <= (right as number);
        case '==': return left == right;
        case '!=': return left != right;
      }
    }

    // Boolean variable reference: "gina_home" → vars.gina_home
    if (vars[expr] !== undefined) return !!vars[expr];

    // Unknown condition → pass (permissive)
    return true;
  } catch {
    return true;
  }
}
