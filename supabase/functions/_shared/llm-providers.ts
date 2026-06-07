// llm-providers.ts — multi-provider routing for content generators.
//
// Three providers in parallel: Anthropic, OpenAI, OpenRouter. Each
// generates independent output for the same prompt. Consensus (or
// disagreement) is auditable. Reduces "one AI persuading her" reading
// of generated content — when 3 independent models produce convergent
// observations, it lands as triangulated reality.
//
// Env vars expected:
//   ANTHROPIC_API_KEY (existing)
//   OPENAI_API_KEY    (new)
//   OPENROUTER_API_KEY (new)
//
// Providers degrade gracefully: a missing API key skips that provider,
// the caller still gets results from whichever providers responded.

export type Provider = 'anthropic' | 'openai' | 'openrouter';

export interface LlmCallResult {
  provider: Provider;
  model: string;
  text: string;
  latency_ms: number;
  error?: string;
}

interface CallOpts {
  prompt: string;
  max_tokens?: number;
  system?: string;
}

const ANTHROPIC_MODEL = 'claude-opus-4-7';
const OPENAI_MODEL = 'gpt-4o-2024-11-20';
// OpenRouter routes to Llama 3.3 70B as a 3rd independent voice (different
// architecture than Claude/GPT, different training). Adjust freely.
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct';

async function callAnthropic(opts: CallOpts): Promise<LlmCallResult> {
  const t0 = Date.now();
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return { provider: 'anthropic', model: ANTHROPIC_MODEL, text: '', latency_ms: 0, error: 'no_api_key' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: opts.max_tokens ?? 4000,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
      }),
    });
    const j = await res.json();
    if (!res.ok) return { provider: 'anthropic', model: ANTHROPIC_MODEL, text: '', latency_ms: Date.now() - t0, error: JSON.stringify(j).slice(0, 300) };
    const text = j?.content?.[0]?.text ?? '';
    return { provider: 'anthropic', model: ANTHROPIC_MODEL, text, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { provider: 'anthropic', model: ANTHROPIC_MODEL, text: '', latency_ms: Date.now() - t0, error: String(e).slice(0, 300) };
  }
}

async function callOpenAI(opts: CallOpts): Promise<LlmCallResult> {
  const t0 = Date.now();
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return { provider: 'openai', model: OPENAI_MODEL, text: '', latency_ms: 0, error: 'no_api_key' };
  try {
    const messages = opts.system
      ? [{ role: 'system', content: opts.system }, { role: 'user', content: opts.prompt }]
      : [{ role: 'user', content: opts.prompt }];
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_tokens: opts.max_tokens ?? 4000,
        messages,
      }),
    });
    const j = await res.json();
    if (!res.ok) return { provider: 'openai', model: OPENAI_MODEL, text: '', latency_ms: Date.now() - t0, error: JSON.stringify(j).slice(0, 300) };
    const text = j?.choices?.[0]?.message?.content ?? '';
    return { provider: 'openai', model: OPENAI_MODEL, text, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { provider: 'openai', model: OPENAI_MODEL, text: '', latency_ms: Date.now() - t0, error: String(e).slice(0, 300) };
  }
}

async function callOpenRouter(opts: CallOpts): Promise<LlmCallResult> {
  const t0 = Date.now();
  const key = Deno.env.get('OPENROUTER_API_KEY');
  if (!key) return { provider: 'openrouter', model: OPENROUTER_MODEL, text: '', latency_ms: 0, error: 'no_api_key' };
  try {
    const messages = opts.system
      ? [{ role: 'system', content: opts.system }, { role: 'user', content: opts.prompt }]
      : [{ role: 'user', content: opts.prompt }];
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: opts.max_tokens ?? 4000,
        messages,
      }),
    });
    const j = await res.json();
    if (!res.ok) return { provider: 'openrouter', model: OPENROUTER_MODEL, text: '', latency_ms: Date.now() - t0, error: JSON.stringify(j).slice(0, 300) };
    const text = j?.choices?.[0]?.message?.content ?? '';
    return { provider: 'openrouter', model: OPENROUTER_MODEL, text, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { provider: 'openrouter', model: OPENROUTER_MODEL, text: '', latency_ms: Date.now() - t0, error: String(e).slice(0, 300) };
  }
}

// Call a single provider by name.
export async function callProvider(provider: Provider, opts: CallOpts): Promise<LlmCallResult> {
  switch (provider) {
    case 'anthropic': return callAnthropic(opts);
    case 'openai': return callOpenAI(opts);
    case 'openrouter': return callOpenRouter(opts);
  }
}

// Fire all three providers in parallel. Returns results in deterministic
// order [anthropic, openai, openrouter]. Failed providers return with
// error set but don't throw — caller decides how to handle.
export async function callAllProviders(opts: CallOpts): Promise<LlmCallResult[]> {
  return await Promise.all([
    callAnthropic(opts),
    callOpenAI(opts),
    callOpenRouter(opts),
  ]);
}

// Call providers with fallback: try preferred, fall back to others on error.
// Returns the first successful result.
export async function callWithFallback(opts: CallOpts, preferred: Provider[] = ['anthropic', 'openai', 'openrouter']): Promise<LlmCallResult> {
  let lastError: LlmCallResult | null = null;
  for (const p of preferred) {
    const result = await callProvider(p, opts);
    if (!result.error && result.text.length > 0) return result;
    lastError = result;
  }
  return lastError ?? { provider: preferred[0], model: '', text: '', latency_ms: 0, error: 'all_providers_failed' };
}
