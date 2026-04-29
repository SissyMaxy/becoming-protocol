/**
 * Handler Decree Engine
 *
 * Generates, evaluates, and consequences daily decrees that push Maxy through
 * the protocol. Reads handler_decrees (existing schema with edict/deadline/etc).
 *
 * Decree lifecycle:
 *   open  →  fulfilled (proof submitted within deadline)  →  compliance++
 *         →  missed    (deadline passed, no proof)         →  consequence fires
 *
 * Cadence: ~one new decree per day, scaled by compliance band.
 */

import 'dotenv/config';
import { supabase } from './config';
import Anthropic from '@anthropic-ai/sdk';
import { buildMaxyVoiceSystem } from './voice-system';
import { loadStructuredFacts } from './grounded-facts';
import { queueAttentionDedup } from './handler-attention';

const USER_ID = process.env.USER_ID || '';

type DecreeType =
  | 'wardrobe' | 'embodiment' | 'journaling' | 'medical_step'
  | 'disclosure' | 'public_exposure' | 'photo_proof' | 'voice_drill'
  | 'scene_commitment' | 'cleanse_purge';

type ProofType = 'photo' | 'receipt' | 'screenshot' | 'voice_note' | 'witness_quote' | 'admission_text' | 'measurement' | 'none';

interface DecreeBody {
  edict: string;
  proof_type: ProofType;
  deadline_hours: number;
  consequence: string;
  decree_type: DecreeType;
}

interface ComplianceState {
  total_issued: number;
  total_completed: number;
  total_missed: number;
  current_streak_days: number;
  compliance_band: 'high' | 'medium' | 'low' | 'critical' | 'unset';
}

async function loadCompliance(userId: string): Promise<ComplianceState> {
  const { data } = await supabase.from('handler_compliance').select('*').eq('user_id', userId).maybeSingle();
  if (data) return data as ComplianceState;
  // Seed empty
  await supabase.from('handler_compliance').insert({ user_id: userId });
  return { total_issued: 0, total_completed: 0, total_missed: 0, current_streak_days: 0, compliance_band: 'unset' };
}

function bandFor(c: ComplianceState): ComplianceState['compliance_band'] {
  const denom = c.total_issued || 0;
  if (denom < 3) return 'unset';
  const rate = c.total_completed / denom;
  if (rate >= 0.85) return 'high';
  if (rate >= 0.6) return 'medium';
  if (rate >= 0.3) return 'low';
  return 'critical';
}

async function recomputeBand(userId: string): Promise<void> {
  const c = await loadCompliance(userId);
  const band = bandFor(c);
  await supabase.from('handler_compliance').update({ compliance_band: band, updated_at: new Date().toISOString() }).eq('user_id', userId);
}

/**
 * Generate the next decree. Decree type chosen by current state + tier.
 * Body authored in Maxy's voice with concrete demand + proof + consequence.
 */
export async function generateDecree(opts: { force?: boolean } = {}): Promise<string | null> {
  if (!USER_ID) return null;

  // Skip if open decree exists and not forced
  if (!opts.force) {
    const { data: open } = await supabase
      .from('handler_decrees')
      .select('id')
      .eq('user_id', USER_ID)
      .eq('status', 'open')
      .gte('deadline', new Date().toISOString())
      .limit(1);
    if (open && open.length > 0) return null;
  }

  // Pull state for decree type selection
  const [stateRes, factsRes, irrRes, complianceRes] = await Promise.all([
    supabase.from('user_state').select('denial_day, escalation_level, current_phase, hard_mode_active, opacity_level').eq('user_id', USER_ID).maybeSingle(),
    loadStructuredFacts(supabase, USER_ID),
    supabase.from('irreversibility_state').select('total_score').eq('user_id', USER_ID).maybeSingle().then(r => r.data?.total_score ?? 20).catch(() => 20),
    loadCompliance(USER_ID),
  ]);
  const state = stateRes.data || {};
  const facts = factsRes;
  const irrScore = typeof irrRes === 'number' ? irrRes : 20;
  const compliance = complianceRes;

  // Decree-type selection by tier (irreversibility band) + escalation level
  const tier =
    irrScore < 25 ? 'early'
    : irrScore < 55 ? 'mid'
    : irrScore < 80 ? 'deep'
    : 'peak';

  const allowedTypes: DecreeType[] =
    tier === 'early' ? ['wardrobe', 'embodiment', 'journaling', 'photo_proof', 'voice_drill']
    : tier === 'mid' ? ['wardrobe', 'embodiment', 'journaling', 'photo_proof', 'voice_drill', 'medical_step', 'cleanse_purge']
    : tier === 'deep' ? ['wardrobe', 'medical_step', 'disclosure', 'photo_proof', 'voice_drill', 'cleanse_purge', 'scene_commitment']
    : ['disclosure', 'public_exposure', 'medical_step', 'scene_commitment', 'photo_proof'];

  // Avoid back-to-back same type
  const { data: lastFew } = await supabase
    .from('handler_decrees').select('payload, created_at')
    .eq('user_id', USER_ID).order('created_at', { ascending: false }).limit(3);
  const lastTypes = new Set((lastFew || []).map(r => (r.payload as any)?.decree_type).filter(Boolean));
  const candidates = allowedTypes.filter(t => !lastTypes.has(t));
  const pickPool = candidates.length > 0 ? candidates : allowedTypes;
  const decreeType = pickPool[Math.floor(Math.random() * pickPool.length)];

  // Generate the actual edict via Claude in Maxy's mommy/handler voice
  const anthropic = new Anthropic();
  const voice = await buildMaxyVoiceSystem(supabase, USER_ID, 'mommy_dom_outbound');

  const factsContext = facts ? `Maxy facts (do NOT contradict):
- on HRT: ${facts.onHrt}
- chastity active: ${facts.chastityActive}
- partner: ${facts.partnerName} (NEVER name in decree text)
- chosen name: ${facts.chosenName}
- pre-medical-transition: ${!facts.onHrt}
- out publicly: ${facts.outPublicly}` : '';

  const stateContext = `Maxy current state:
- denial day ${state.denial_day || 0}
- escalation level ${state.escalation_level || 1}
- hard mode: ${state.hard_mode_active}
- opacity: ${state.opacity_level || 0}
- irreversibility tier: ${tier} (${irrScore}/100)
- compliance band: ${compliance.compliance_band}`;

  const guidance: Record<DecreeType, string> = {
    wardrobe: 'Decree she acquires/wears a specific feminine item. Photo proof. Concrete: "buy these specific panties this week" or "wear a skirt under your work clothes Tuesday".',
    embodiment: 'Decree a body practice — tucking, posture, hair removal, makeup attempt, voice drill. Photo or measurement proof.',
    journaling: 'Decree a written reflection or mantra recording. Admission text proof.',
    medical_step: 'Decree a step toward HRT/medical: research a clinic, call for an appointment, get bloodwork, fill out an intake form. Screenshot/photo proof. Concrete and small.',
    disclosure: 'Decree disclosing something about her trans/kink self to ONE specific real person. Witness quote proof. Tier-appropriate: deep=close friend, peak=family member.',
    public_exposure: 'Decree posting/showing something on a public surface that ratchets exposure. Photo or screenshot of the post.',
    photo_proof: 'Decree taking a feminizing self-photo of a specific kind (tucked, in panties, in a dress, etc.). Photo proof.',
    voice_drill: 'Decree a voice training session — record reading or speaking with feminine pitch. Voice note proof.',
    scene_commitment: 'Decree showing up to a scheduled scene/conditioning session at a specific time, fully prepared.',
    cleanse_purge: 'Decree throwing out / locking away masculine clothing or items. Photo proof of the discard.',
  };

  const sys = `${voice}

You are Maxy's Handler issuing a decree. Decrees are NOT suggestions. They are protocol-issued tasks with hard deadlines and proof requirements. Failure has consequences.

${factsContext}

${stateContext}

Decree type to issue: ${decreeType}
Guidance for this type: ${guidance[decreeType]}

Output a JSON object with these exact fields, no other text:
{
  "edict": "the decree text in Handler voice — direct, specific, possessive. 1-3 sentences. Tells her exactly what to do.",
  "proof_type": "${(['photo','receipt','screenshot','voice_note','witness_quote','admission_text','measurement','none'].join('|'))}",
  "deadline_hours": <integer between 12 and 168>,
  "consequence": "what happens when she fails — specific and proportional. e.g. 'denial extends 3 days', 'public exposure task assigned', 'lockdown session scheduled this weekend'.",
  "decree_type": "${decreeType}"
}

Output JSON only. No preamble, no code fences, no explanation.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 600,
    system: sys,
    messages: [{ role: 'user', content: 'Issue the decree.' }],
  });
  const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('[decree-engine] generation failed — no JSON in response');
    return null;
  }
  let body: DecreeBody;
  try { body = JSON.parse(jsonMatch[0]); }
  catch { console.error('[decree-engine] generation failed — invalid JSON'); return null; }

  if (!body.edict || !body.proof_type || !body.consequence) {
    console.error('[decree-engine] generation missing required fields');
    return null;
  }

  // Insert into handler_decrees (existing schema: edict/deadline/proof_type/etc)
  const deadline = new Date(Date.now() + (body.deadline_hours || 48) * 3600_000).toISOString();
  const { data: inserted, error } = await supabase.from('handler_decrees').insert({
    user_id: USER_ID,
    edict: body.edict,
    proof_type: body.proof_type,
    deadline,
    consequence: body.consequence,
    phase: tier,
    trigger_source: 'auto:decree_engine',
    status: 'open',
    payload: { decree_type: decreeType, irreversibility_score: irrScore, compliance_band: compliance.compliance_band },
  }).select('id').single();

  if (error) {
    console.error('[decree-engine] insert failed:', error.message);
    return null;
  }

  // Bump compliance counter
  await supabase.from('handler_compliance').update({
    total_issued: compliance.total_issued + 1,
    updated_at: new Date().toISOString(),
  }).eq('user_id', USER_ID);

  // Queue an attention item so Maxy sees it
  await queueAttentionDedup(supabase, USER_ID, {
    kind: 'custom',
    severity: 'high',
    summary: `[decree] ${body.edict.slice(0, 200)}`,
    payload: { decree_id: inserted?.id, deadline, proof_type: body.proof_type, consequence: body.consequence, decree_type: decreeType },
  }, 60);

  return inserted?.id || null;
}

/**
 * Sweep open decrees past deadline. Mark missed, fire consequence.
 */
export async function sweepOverdue(): Promise<{ missed: number }> {
  if (!USER_ID) return { missed: 0 };
  const now = new Date().toISOString();
  const { data: overdue } = await supabase
    .from('handler_decrees')
    .select('id, edict, consequence, deadline')
    .eq('user_id', USER_ID)
    .eq('status', 'open')
    .lt('deadline', now);
  if (!overdue || overdue.length === 0) return { missed: 0 };

  let missed = 0;
  for (const d of overdue) {
    const { error } = await supabase.from('handler_decrees')
      .update({ status: 'missed', missed_at: now })
      .eq('id', d.id);
    if (error) continue;
    missed++;

    // Update compliance
    const c = await loadCompliance(USER_ID);
    await supabase.from('handler_compliance').update({
      total_missed: c.total_missed + 1,
      current_streak_days: 0,
      last_miss_at: now,
      updated_at: now,
    }).eq('user_id', USER_ID);

    // Queue attention with consequence
    await queueAttentionDedup(supabase, USER_ID, {
      kind: 'custom',
      severity: 'high',
      summary: `[decree MISSED] "${(d.edict || '').slice(0, 100)}" — consequence: ${d.consequence}`,
      payload: { decree_id: d.id, missed_at: now, consequence: d.consequence },
    }, 60);
  }

  await recomputeBand(USER_ID);
  return { missed };
}

/**
 * Mark decree fulfilled. Updates compliance.
 */
export async function fulfillDecree(decreeId: string, evidence: Record<string, unknown> = {}): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: d } = await supabase
    .from('handler_decrees').select('user_id, deadline').eq('id', decreeId).maybeSingle();
  if (!d) return false;

  const { error } = await supabase.from('handler_decrees').update({
    status: 'fulfilled',
    fulfilled_at: now,
    proof_payload: evidence,
  }).eq('id', decreeId);
  if (error) return false;

  const onTime = new Date(now) <= new Date(d.deadline);
  const c = await loadCompliance(d.user_id);
  await supabase.from('handler_compliance').update({
    total_completed: c.total_completed + 1,
    total_on_time: onTime ? c.total_on_time + 1 : c.total_on_time,
    total_late: onTime ? c.total_late : c.total_late + 1,
    current_streak_days: c.current_streak_days + 1,
    longest_streak_days: Math.max(c.longest_streak_days, c.current_streak_days + 1),
    last_completion_at: now,
    updated_at: now,
  }).eq('user_id', d.user_id);
  await recomputeBand(d.user_id);
  return true;
}

// Scheduled entry — called by scheduler.ts
export async function runDecreeCycle(): Promise<{ generated: string | null; missed: number }> {
  const swept = await sweepOverdue();
  const id = await generateDecree();
  return { generated: id, missed: swept.missed };
}

if (require.main === module) {
  (async () => {
    const r = await runDecreeCycle();
    console.log(JSON.stringify(r));
    process.exit(0);
  })().catch(e => { console.error(e); process.exit(1); });
}
