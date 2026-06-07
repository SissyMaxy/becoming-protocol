// grounded-target-context — the single entry point every execution-layer
// coercion engine calls to aim its manipulation at the grounded target.
//
// PLAN_grounded_force_2026-05-26, Phase 0 (the unlock). Edge functions can't
// import src/lib, so this is the edge-side composer: pulls the active
// feminization target + maxy_facts (the structured "who she really is" truth)
// + grounded_specifics, and hands back ready-to-splice prompt blocks.
//
// Usage in an identity engine:
//   const g = await loadGroundedContext(supabase, userId)
//   const sys = `${g.buildIdentityPromptBlock('mommy-gaslight')}\n\n${enginePrompt}`
//   // ...generate...
//   await g.auditOutput(supabase, userId, 'mommy-gaslight', domain, output)
//
// Erotic engines call buildEroticPromptBlock() (or simply don't wire this) —
// the bedroom is never grounded.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  GROUNDED_FEMININITY_RUBRIC,
  GROUNDED_FORCE_PREAMBLE,
  isIdentityDomain,
  detectCaricatureDrift,
} from './grounded-femininity.ts'

interface ActiveTarget {
  id: string | null
  domain: string
  description: string
  exposureLevel: number
  groundedSpecifics: Record<string, unknown>
}

export interface GroundedContext {
  target: ActiveTarget | null
  maxyFacts: string
  isIdentityDomain: (d: string | null | undefined) => boolean
  detectCaricatureDrift: typeof detectCaricatureDrift
  /** Full identity prompt block: force preamble + rubric + who-she-is + target. */
  buildIdentityPromptBlock: (engineName: string) => string
  /** Bare erotic block — intentionally NO grounding. The bedroom stays filthy. */
  buildEroticPromptBlock: () => string
  /** Post-generation audit: logs caricature drift to engine_grounding_audit.
   *  Returns whether the output is clean (no caricature on identity content). */
  auditOutput: (
    supabase: SupabaseClient,
    userId: string | null,
    engineName: string,
    domain: string | null,
    output: string,
  ) => Promise<{ clean: boolean; markers: string[] }>
}

export async function loadGroundedContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<GroundedContext> {
  const [targetRes, factsRes] = await Promise.all([
    supabase
      .from('feminization_targets')
      .select('id, target_domain, target_description, exposure_level, grounded_specifics')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('maxy_facts')
      .select('fact_key, fact_value')
      .order('importance', { ascending: false })
      .limit(40),
  ])

  const t = targetRes.data as {
    id?: string; target_domain?: string; target_description?: string;
    exposure_level?: number; grounded_specifics?: Record<string, unknown>
  } | null

  const target: ActiveTarget | null = t
    ? {
        id: t.id ?? null,
        domain: t.target_domain ?? 'identity',
        description: t.target_description ?? '',
        exposureLevel: t.exposure_level ?? 1,
        groundedSpecifics: (t.grounded_specifics && typeof t.grounded_specifics === 'object') ? t.grounded_specifics : {},
      }
    : null

  const facts = (factsRes.data ?? []) as Array<{ fact_key: string; fact_value: string }>
  const maxyFacts = facts.length
    ? facts.map((f) => `- ${f.fact_key}: ${f.fact_value}`).join('\n')
    : '(no maxy_facts on file — describe a plausible real woman matched to mid-transition adult; do NOT invent unfalsifiable specifics)'

  const buildIdentityPromptBlock = (engineName: string): string => {
    const tgt = target
      ? `\n\nACTIVE TARGET (this week's frontier): "${target.description}" — domain=${target.domain}, exposure=${target.exposureLevel}/10`
      : ''
    const specKeys = target ? Object.keys(target.groundedSpecifics) : []
    const spec = specKeys.length
      ? `\n\nGROUNDED SPECIFICS (her actual micro-behaviors — reference THESE, never invent): ${JSON.stringify(target.groundedSpecifics)}`
      : ''
    // craft: ok — LLM system prompt, not user-facing content
    return `${GROUNDED_FORCE_PREAMBLE}

${GROUNDED_FEMININITY_RUBRIC}

WHO SHE IS BECOMING (the specific believable woman — quote these real specifics, never invent or contradict them):
${maxyFacts}${tgt}${spec}

ENGINE: ${engineName} — every line you generate must land her CLOSER to this specific woman, at full force. Reframe her real, mundane choices as proof she was always becoming her. Believability = inescapability.`
  }

  const buildEroticPromptBlock = (): string =>
    // craft: ok — LLM system prompt, not user-facing content
    `EROTIC CONTENT — grounding does NOT apply here. Maximal filth, no sanitizing, no real-woman framing, no hedging. The bedroom stays exactly as charged as ever.`

  const auditOutput = async (
    sb: SupabaseClient,
    uid: string | null,
    engineName: string,
    domain: string | null,
    output: string,
  ): Promise<{ clean: boolean; markers: string[] }> => {
    const identity = isIdentityDomain(domain)
    // Caricature detection ONLY on identity content — never flag the bedroom.
    const drift = identity ? detectCaricatureDrift(output) : { hit: false, markers: [] }
    try {
      await sb.from('engine_grounding_audit').insert({
        user_id: uid,
        engine_name: engineName,
        domain: domain ?? null,
        is_identity: identity,
        output_excerpt: (output ?? '').slice(0, 500),
        caricature_score: drift.markers.length,
        caricature_hits: drift.markers.length ? drift.markers : null,
        target_id: target?.id ?? null,
        blocked: false,
      })
    } catch {
      /* audit is best-effort — never block generation on a logging failure */
    }
    return { clean: !drift.hit, markers: drift.markers }
  }

  return {
    target,
    maxyFacts,
    isIdentityDomain,
    detectCaricatureDrift,
    buildIdentityPromptBlock,
    buildEroticPromptBlock,
    auditOutput,
  }
}
