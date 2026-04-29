// model-tiers — shared effort-tier router for all Handler agents.
//
// Maps a task descriptor to a concrete model + provider. Centralizes the
// cost-vs-quality decision so we can change tier ceilings in one place.
//
// Tiers:
//   S0 — free/very cheap. Mistral 7B / Hermes Free / Gemini Flash. Routine
//        regex augmentation, classifier first-pass. ~$0.001/call.
//   S1 — cheap. gpt-4o-mini / Gemini Flash. Slip detection, slop second-judge,
//        chat trigger classify, content-type tag. ~$0.005/call.
//   S2 — mid. Claude Haiku / gpt-4o. Mantra/decree drafts, narrative reframe
//        candidate, voice-match grading. ~$0.02/call.
//   S3 — premium. Claude Sonnet / gpt-4o. Strategic planning, code audit,
//        deep state synthesis, multi-step reasoning. ~$0.08/call.
//   S4 — peak / jury. Claude Sonnet + gpt-4o both, judge picks. Irrevocable
//        decisions: hard-mode entry rationale, persona shift, narrative arc
//        change, decree text Maxy will post publicly. ~$0.20/call.

export type Tier = 'S0' | 'S1' | 'S2' | 'S3' | 'S4'

export type Provider = 'anthropic' | 'openai' | 'openrouter'

export interface ModelChoice {
  /** Provider hostname to use (api.anthropic.com / api.openai.com / openrouter.ai) */
  provider: Provider
  /** Model id as the provider expects it */
  model: string
  /** Optional secondary model for jury / cross-critique */
  jury?: { provider: Provider; model: string }
  /** Tier label for logging */
  tier: Tier
}

const ANTHROPIC_HAIKU = 'claude-haiku-4-5-20251001'
const ANTHROPIC_SONNET = 'claude-sonnet-4-20250514'
const OPENAI_MINI = 'gpt-4o-mini'
const OPENAI_4O = 'gpt-4o'
const OR_GEMINI_FLASH = 'google/gemini-2.0-flash-001'
const OR_HERMES_FREE = 'nousresearch/hermes-3-llama-3.1-405b:free'

/** Task → tier mapping. Add new entries when wiring new agents. */
const TASK_TIERS: Record<string, Tier> = {
  // S0
  ambient_affirmation: 'S0',
  // S1
  slip_classify: 'S1',
  slop_second_judge: 'S1',
  text_classify: 'S1',
  chat_trigger_classify: 'S1',
  authenticity_grade: 'S1',
  // S2
  reframe_draft: 'S2',
  decree_draft: 'S2',
  voice_match_grade: 'S2',
  caption_generate: 'S2',
  // S3
  code_audit: 'S3',
  strategic_plan: 'S3',
  state_synthesis: 'S3',
  body_trajectory_analysis: 'S3',
  handler_chat_completion: 'S3',
  // S4
  hard_mode_entry: 'S4',
  persona_shift: 'S4',
  narrative_arc_change: 'S4',
  public_decree_text: 'S4',
}

/** Default model per tier — pluggable via env overrides. */
function defaultForTier(tier: Tier, prefer?: Provider): ModelChoice {
  switch (tier) {
    case 'S0':
      return { provider: 'openrouter', model: OR_HERMES_FREE, tier }
    case 'S1':
      return prefer === 'anthropic'
        ? { provider: 'openrouter', model: OR_GEMINI_FLASH, tier }
        : { provider: 'openrouter', model: OPENAI_MINI, tier }
    case 'S2':
      return prefer === 'openai'
        ? { provider: 'openai', model: OPENAI_4O, tier }
        : { provider: 'anthropic', model: ANTHROPIC_HAIKU, tier }
    case 'S3':
      return prefer === 'openai'
        ? { provider: 'openai', model: OPENAI_4O, tier }
        : { provider: 'anthropic', model: ANTHROPIC_SONNET, tier }
    case 'S4':
      return {
        provider: 'anthropic',
        model: ANTHROPIC_SONNET,
        jury: { provider: 'openai', model: OPENAI_4O },
        tier,
      }
  }
}

/**
 * Pick a model for a task. The `task` key looks up the tier; if you want
 * to override the provider preference (e.g., alternate weekly), pass `prefer`.
 */
export function selectModel(task: string, opts?: {
  prefer?: Provider
  override_tier?: Tier
}): ModelChoice {
  const tier = opts?.override_tier ?? TASK_TIERS[task] ?? 'S2'
  return defaultForTier(tier, opts?.prefer)
}

/**
 * Alternating-week auditor lens. Returns 'anthropic' on even ISO weeks,
 * 'openai' on odd weeks. Used by the code-audit agent so each lens reads
 * each file roughly half the time.
 */
export function alternatingProvider(seed?: number): Provider {
  const week = seed ?? Math.floor(Date.now() / (7 * 24 * 3600 * 1000))
  return week % 2 === 0 ? 'anthropic' : 'openai'
}

/**
 * Resolve API key from Deno env for a given provider. Throws if missing
 * so callers fail fast rather than emit silent no-op responses.
 */
export function getApiKey(provider: Provider): string {
  const env = (k: string) => Deno.env.get(k) ?? ''
  switch (provider) {
    case 'anthropic': {
      const k = env('ANTHROPIC_API_KEY')
      if (!k) throw new Error('ANTHROPIC_API_KEY missing')
      return k
    }
    case 'openai': {
      const k = env('OPENAI_API_KEY')
      if (!k) throw new Error('OPENAI_API_KEY missing')
      return k
    }
    case 'openrouter': {
      const k = env('OPENROUTER_API_KEY')
      if (!k) throw new Error('OPENROUTER_API_KEY missing')
      return k
    }
  }
}

/**
 * Single-shot chat completion against any provider. Returns the assistant
 * text or throws. Keeps the per-provider request shape isolated so callers
 * don't have to re-implement it for every agent.
 */
export async function callModel(choice: ModelChoice, opts: {
  system: string
  user: string
  max_tokens?: number
  temperature?: number
  json?: boolean
}): Promise<{ text: string; finish: string; model: string }> {
  const { provider, model } = choice
  const apiKey = getApiKey(provider)
  const max_tokens = opts.max_tokens ?? 1500
  const temperature = opts.temperature ?? 0.5

  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens,
        temperature,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      }),
    })
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const data = await r.json() as { content: Array<{ type: string; text?: string }>; stop_reason?: string }
    const text = data.content?.find(c => c.type === 'text')?.text ?? ''
    return { text, finish: data.stop_reason ?? 'stop', model }
  }

  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://openrouter.ai/api/v1/chat/completions'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://becoming-protocol.vercel.app'
    headers['X-Title'] = 'Becoming Protocol'
  }
  const r = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens,
      temperature,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
    }),
  })
  if (!r.ok) throw new Error(`${provider} ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const data = await r.json() as {
    choices?: Array<{ message: { content: string }; finish_reason: string }>
    model?: string
  }
  const text = data.choices?.[0]?.message?.content ?? ''
  const finish = data.choices?.[0]?.finish_reason ?? 'stop'
  return { text, finish, model: data.model ?? model }
}
