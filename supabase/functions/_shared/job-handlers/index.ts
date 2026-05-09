// Job-kind router for the job-worker. Each kind below corresponds to one of
// the six edge functions that used to do their work synchronously and time
// out at 150s. The worker calls routeJobKind(kind, supabase, payload) inside
// a 25s timeout race; the handler returns plain data on success, throws on
// failure (the worker decides retry vs terminal-fail based on attempts).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  runHandlerAutonomous,
  isValidHandlerAutonomousAction,
} from './handler-autonomous.ts'
import {
  runConditioningEngine,
  isValidConditioningEngineAction,
} from './conditioning-engine.ts'
import {
  runSendNotificationsScan,
  runSendNotificationsSend,
} from './send-notifications.ts'
import { runDeviceControl } from './device-control.ts'
import { runForceProcessor } from './force-processor.ts'
import {
  runHandlerRevenue,
  isValidRevenueAction,
} from './handler-revenue.ts'

export type JobKind =
  | `handler-autonomous:${string}`
  | `conditioning-engine:${string}`
  | 'send-notifications:scan'
  | 'send-notifications:send'
  | 'device-control:run'
  | 'force-processor:run'
  | `handler-revenue:${string}`

export async function routeJobKind(
  kind: string,
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Each `kind` is "<group>:<sub>". Group selects the module, sub picks the
  // action when the module is action-driven.
  const colon = kind.indexOf(':')
  if (colon < 0) throw new Error(`malformed job kind (no colon): ${kind}`)
  const group = kind.slice(0, colon)
  const sub   = kind.slice(colon + 1)

  switch (group) {
    case 'handler-autonomous': {
      if (!isValidHandlerAutonomousAction(sub)) {
        throw new Error(`unknown handler-autonomous action: ${sub}`)
      }
      return runHandlerAutonomous(supabase, {
        action: sub,
        user_id: typeof payload.user_id === 'string' ? payload.user_id : undefined,
      })
    }
    case 'conditioning-engine': {
      if (!isValidConditioningEngineAction(sub)) {
        throw new Error(`unknown conditioning-engine action: ${sub}`)
      }
      return runConditioningEngine(supabase, { action: sub })
    }
    case 'send-notifications': {
      if (sub === 'scan') return runSendNotificationsScan(supabase)
      if (sub === 'send') {
        const id = typeof payload.notification_id === 'string' ? payload.notification_id : ''
        if (!id) throw new Error('send-notifications:send requires payload.notification_id')
        return runSendNotificationsSend(supabase, { notification_id: id })
      }
      throw new Error(`unknown send-notifications sub: ${sub}`)
    }
    case 'device-control': {
      if (sub !== 'run') throw new Error(`unknown device-control sub: ${sub}`)
      return runDeviceControl(supabase)
    }
    case 'force-processor': {
      if (sub !== 'run') throw new Error(`unknown force-processor sub: ${sub}`)
      return runForceProcessor(supabase)
    }
    case 'handler-revenue': {
      if (!isValidRevenueAction(sub)) {
        throw new Error(`unknown handler-revenue action: ${sub}`)
      }
      return runHandlerRevenue(supabase, {
        action: sub,
        user_id: typeof payload.user_id === 'string' ? payload.user_id : undefined,
        data:    payload.data && typeof payload.data === 'object'
                 ? payload.data as Record<string, unknown>
                 : undefined,
      })
    }
    default:
      throw new Error(`unknown job-kind group: ${group} (full kind: ${kind})`)
  }
}

// Set of kinds that are NEVER retried — used by the worker to short-circuit
// retry decisions. Validation errors and unknown-action errors fall here.
export const NON_RETRYABLE_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /^unknown\s/i,
  /^malformed\s/i,
  /required for/i,
  /requires payload/i,
]

export function isNonRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return NON_RETRYABLE_ERROR_PATTERNS.some((re) => re.test(msg))
}
