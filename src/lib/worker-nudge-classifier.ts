// Worker nudge classifier — root-cause a worker that keeps needing nudges.
// (Wish ce25ad0b, mig 598.)
//
// A "nudge" is a mommy_supervisor_log intervention (severity warning/error/
// high/critical) for a worker (component). When one worker is nudged 5+ times
// in a week, classify the likely cause from the nudge text so the analyzer
// can route the right fix. Pure + tested; the nudge-pattern-analyzer edge fn
// mirrors this.

export type NudgeCause = 'scheduling_conflict' | 'resource_starvation' | 'logic_bug' | 'unknown'

export type NudgeAction = 'schedule_restagger_wish' | 'resource_scale_wish' | 'replacement_wish' | 'none'

export interface NudgeSample {
  event_kind?: string | null
  message?: string | null
}

const SCHEDULING_RE = /\b(no_recent_output|stale|overdue|not.?(?:run|fired|produced)|cadence|missed.?(?:tick|run|window)|behind schedule|never ran|expected.*minutes|collision|collide|stagger|same minute)\b/i
const RESOURCE_RE = /\b(timeout|timed.?out|rate.?limit|429|quota|resource|starv|out of memory|oom|cpu|throttl|capacity|exhausted|too many|backpressure|queue.*full)\b/i
const LOGIC_RE = /\b(error|exception|throw|constraint|null|undefined|failed|failure|invalid|reject|sqlstate|stack|crash|bug|regression|cannot read|is not a function|type error)\b/i

// Classify a worker's recent nudges. Precedence reflects fixability:
// scheduling + resource are environmental (often auto-fixable); logic bugs
// need a code change. When signals conflict, the strongest signal across all
// samples wins by count; ties break logic_bug > resource > scheduling (a
// real bug shouldn't be masked as a timing blip).
export function classifyNudges(samples: NudgeSample[]): NudgeCause {
  let scheduling = 0, resource = 0, logic = 0
  for (const s of samples) {
    const text = `${s.event_kind ?? ''} ${s.message ?? ''}`
    if (SCHEDULING_RE.test(text)) scheduling++
    if (RESOURCE_RE.test(text)) resource++
    if (LOGIC_RE.test(text)) logic++
  }
  if (scheduling === 0 && resource === 0 && logic === 0) return 'unknown'
  const max = Math.max(scheduling, resource, logic)
  if (logic === max) return 'logic_bug'
  if (resource === max) return 'resource_starvation'
  return 'scheduling_conflict'
}

export function actionForCause(cause: NudgeCause): NudgeAction {
  switch (cause) {
    case 'scheduling_conflict': return 'schedule_restagger_wish'
    case 'resource_starvation': return 'resource_scale_wish'
    case 'logic_bug': return 'replacement_wish'
    default: return 'none'
  }
}

// Health score 0-100 from the week's nudge count. Each nudge costs 12 points;
// 0 nudges = 100 (healthy), 8+ nudges = floored at a critical 4.
export function healthScore(nudges7d: number): number {
  return Math.max(4, 100 - nudges7d * 12)
}

export const NUDGE_PATTERN_THRESHOLD = 5
