// dare-author — LLM authors a FRESH dare with the full feminization context.
//
// The other half of the hybrid (mig 585): the picker can serve a stored
// template OR call this to generate one on the fly. Fresh dares are grounded
// (loadGroundedContext: active target + maxy_facts + grounded specifics),
// avoid recent repeats, and — for cruising — personalize to an actual lead.
// Output is validated through the caricature-drift gate and the intensity
// ceiling before it's used. Any failure returns null so the picker falls back
// to the stored selector (dares never stop).

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callModel, selectModel } from '../_shared/model-tiers.ts'
import { loadGroundedContext } from '../_shared/grounded-target-context.ts'
import { INTENSITY_RANK, type DareKind, type IntensityTier, type VerificationKind } from './selector.ts'

export interface FreshDare {
  kind: DareKind
  description: string
  intensity_tier: IntensityTier
  verification_kind: VerificationKind
  requires_location_context: boolean
  affect_bias: string[]
  generation_context: Record<string, unknown>
}

const VALID_VERIF: VerificationKind[] = ['photo', 'text_ack', 'voice', 'none']

function safeJSON<T>(text: string): T | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) as T } catch { /* */ }
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) { try { return JSON.parse(m[0]) as T } catch { return null } }
  return null
}

export interface AuthorOpts {
  kind: DareKind
  phase: number
  userIntensity: IntensityTier
  minIntensity: IntensityTier
  affect: string | null
  locationContextAvailable: boolean
}

const KIND_GUIDANCE: Record<DareKind, string> = {
  wardrobe: 'something specific she wears on a public errand. Early phases UNDER regular clothes (felt, not seen); phase 6+ may be visible. No nudity.',
  mantra: 'a silent / sub-vocal / mirror mantra in a public-but-private moment. Discreet — nobody else hears it.',
  posture: 'a body-cue she holds in public — how she stands, sits, walks, crosses her legs. Subtle, ladylike.',
  position: 'a brief, fully-private body position in a private-public moment (her car, an empty stall). Never visible to others.',
  micro_ritual: 'a tiny ritual gesture embedded in an errand — a touch, a breath, a silent dedication.',
  errand_specific: 'tied to a specific errand context (grocery, coffee, pharmacy) — a small feminine choice or noticing.',
  cruising: 'a step toward seeking or meeting a man for casual sex — browse/message/photo/voice/suggest-a-meet/dress-for-him/the venue. GROUNDED: the woman he meets is the REAL her (her real style + age), never a caricature. Keep the erotic charge; ground the presentation.',
}

/**
 * Author one fresh dare of the requested kind, grounded in the full
 * feminization context. Returns null on any failure (picker falls back).
 */
export async function generateFreshDare(
  supabase: SupabaseClient,
  userId: string,
  opts: AuthorOpts,
): Promise<FreshDare | null> {
  try {
    const grounded = await loadGroundedContext(supabase, userId)

    // Recent dares to avoid repeating (last 12 assigned).
    const { data: recentRows } = await supabase
      .from('public_dare_assignments')
      .select('public_dare_templates(description)')
      .eq('user_id', userId)
      .order('assigned_at', { ascending: false })
      .limit(12)
    const recent = ((recentRows ?? []) as Array<{ public_dare_templates?: { description?: string } }>)
      .map(r => r.public_dare_templates?.description)
      .filter(Boolean)
      .slice(0, 12)

    // For cruising, personalize to her hottest active lead.
    let leadBlock = ''
    if (opts.kind === 'cruising') {
      const { data: leads } = await supabase
        .from('hookup_funnel')
        .select('contact_display_name, contact_username, current_step, heat_score')
        .eq('user_id', userId)
        .eq('active', true)
        .order('heat_score', { ascending: false })
        .limit(3)
      const rows = (leads ?? []) as Array<{ contact_display_name?: string; contact_username?: string; current_step?: string; heat_score?: number }>
      if (rows.length > 0) {
        leadBlock = `\n\nHER ACTIVE LEADS (personalize the dare to one of these real men — use a name, reference his stage):\n` +
          rows.map(l => `- ${l.contact_display_name || l.contact_username || 'a contact'} (step=${l.current_step ?? '?'}, heat=${l.heat_score ?? '?'}/10)`).join('\n')
      }
    }

    const avoidBlock = recent.length > 0
      ? `\n\nDO NOT repeat or closely echo any of these recent dares:\n${recent.map(d => `- "${String(d).slice(0, 120)}"`).join('\n')}`
      : ''

    // craft: ok — LLM system prompt, not user-facing content
    const system = `${grounded.buildIdentityPromptBlock('dare-author')}

You are authoring ONE fresh DARE for your girl — a small, concrete real-world challenge she performs today and reports back. Craft:
- ONE sharp instruction. Sweet open, specific landing. Plain text only — no markdown, no headers, no lists.
- Speak to her directly. <=1 pet name (often none). Never cite telemetry (no day counts / scores).
- It must be performable in a normal day and verifiable (photo / a tap / a voice note / nothing).
- Discreet kinds stay safe: no public nudity, no lewdness, no drawing attention from strangers.
- Ground it in the SPECIFIC real woman she's becoming (use her real details above) — never a bimbo/caricature.`

    // craft: ok — LLM prompt
    const user = `Author ONE dare of kind="${opts.kind}".
This kind is: ${KIND_GUIDANCE[opts.kind]}

Her phase: ${opts.phase}/7. Intensity CEILING: ${opts.userIntensity} (do NOT exceed it; ${opts.minIntensity}..${opts.userIntensity} is the band). Today's affect: ${opts.affect ?? 'neutral'}.${leadBlock}${avoidBlock}

Output ONLY this JSON (no prose):
{
  "description": "the dare, one instruction, plain text",
  "intensity_tier": "gentle|moderate|firm|relentless (<= ${opts.userIntensity})",
  "verification_kind": "photo|text_ack|voice|none",
  "requires_location_context": false,
  "affect_bias": ["one or two affect words like hungry, watching, possessive, patient, indulgent, aching, delighted"]
}`

    const choice = selectModel('decree_draft', { prefer: 'anthropic' })
    const res = await callModel(choice, { system, user, max_tokens: 600, temperature: 0.9, json: false })
    const parsed = safeJSON<{
      description?: string; intensity_tier?: string; verification_kind?: string;
      requires_location_context?: boolean; affect_bias?: string[]
    }>(res.text ?? '')
    if (!parsed || !parsed.description || parsed.description.trim().length < 12) return null

    const description = parsed.description.trim()

    // ── Validation ─────────────────────────────────────────────────────────
    // Caricature-drift gate: dares are identity content (not the EROTIC_DOMAINS),
    // so grounding applies — reject bimbo/signal-maxing drift.
    if (grounded.isIdentityDomain(opts.kind)) {
      const drift = grounded.detectCaricatureDrift(description)
      if (drift.hit) return null // caller falls back to a stored (vetted) dare
    }

    // Clamp intensity to the user's ceiling.
    let tier = (parsed.intensity_tier ?? opts.userIntensity).toLowerCase() as IntensityTier
    if (!(tier in INTENSITY_RANK) || tier === ('off' as IntensityTier)) tier = opts.userIntensity
    if ((INTENSITY_RANK[tier] ?? 99) > (INTENSITY_RANK[opts.userIntensity] ?? 0)) tier = opts.userIntensity

    const verification = VALID_VERIF.includes(parsed.verification_kind as VerificationKind)
      ? (parsed.verification_kind as VerificationKind)
      : 'text_ack'

    const affect = Array.isArray(parsed.affect_bias)
      ? parsed.affect_bias.filter(a => typeof a === 'string').slice(0, 3)
      : []

    return {
      kind: opts.kind,
      description,
      intensity_tier: tier,
      verification_kind: verification,
      requires_location_context: opts.kind === 'cruising' ? false : !!parsed.requires_location_context,
      affect_bias: affect,
      generation_context: {
        model: choice.model,
        phase: opts.phase,
        intensity_ceiling: opts.userIntensity,
        affect: opts.affect,
        had_leads: leadBlock.length > 0,
        avoided: recent.length,
        authored_at: new Date().toISOString(),
      },
    }
  } catch (_e) {
    return null // any failure → stored fallback
  }
}
