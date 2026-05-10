// Pure-function gate evaluation for Sniffies persona surfaces.
//
// Mirrors the logic in supabase/functions/_shared/sniffies-quote.ts
// (`loadSniffiesGate`). Twin file pattern — keep in sync. Centralizes
// the privacy semantics in a unit-testable place: every persona surface
// must pass through this gate before quoting Sniffies content.

import type { SniffiesSettings } from './types';

export type SniffiesUse = 'persona' | 'dares' | 'slip';

/**
 * Returns true iff the user has authorized Sniffies content for the
 * given surface. The master switch
 * (`sniffies_integration_enabled = true`) is always required; the
 * relevant granular flag must also be true.
 *
 * Treats a missing settings row (null) as "all flags off" — the safe
 * default. Pure function — no IO.
 */
export function evaluateSniffiesGate(
  settings: Partial<SniffiesSettings> | null | undefined,
  use: SniffiesUse,
): boolean {
  if (!settings) return false;
  if (!settings.sniffies_integration_enabled) return false;
  if (use === 'persona') return !!settings.persona_use_enabled;
  if (use === 'dares') return !!settings.dares_use_enabled;
  if (use === 'slip') return !!settings.slip_use_enabled;
  return false;
}
