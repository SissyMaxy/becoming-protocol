/**
 * HrtDailyGate — compulsory daily modal forcing HRT funnel progression
 * or a hardening sequence of explain options. Designed so David cannot
 * keep buying time with words.
 *
 * Internal escalation tier (hrt_step_missed_days — never narrated to user
 * per feedback_no_handler_status_dumps; the ACCUSATION LANGUAGE escalates
 * by tier, the count never appears):
 *   tier 0 (0)    → move forward OR 250-char "what stopped me" answer
 *   tier 1 (1)    → answer requires 350 chars + "David is hiding from ___"
 *                   with the blank filled (≥3 chars after "from")
 *   tier 2 (2)    → answer requires 500 chars + filled phrase + a provider
 *                   URL she actually visited today
 *   tier 3 (3+)   → EXPLAIN DISABLED. Only advance unlocks. Hard mode flips
 *                   on. Witness silently CC'd. Chastity auto-locks.
 *   tier 5 (5+)   → Step regresses one position in funnel.
 *   tier 7 (7+)   → Cryptic public post auto-queued.
 *
 * Anti-tautology: the "David is hiding" phrase requires the form
 * "David is hiding from ___" with a real word in the blank. Earlier
 * version was auto-satisfied by the textarea placeholder.
 *
 * Plain-English copy (feedback_internal_task_copy_plain_english):
 * step names are paired with STEP_NEXT_ACTION descriptions ("you picked
 * a provider but have not booked the consult"). No raw funnel-step
 * names as status strings.
 *
 * Each answer submit also creates a locked handler_commitment due 24h:
 * "1 provider contact today. Photo of dialer. Miss = chastity +1d."
 *
 * The user's last 3 answers are echoed back at tier ≥ 2 — the pattern
 * is the indictment.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const HRT_STEPS = [
  'uncommitted', 'committed', 'researching', 'provider_chosen',
  'appointment_booked', 'intake_submitted', 'appointment_attended',
  'prescription_obtained', 'pharmacy_filled', 'first_dose_taken',
  'week_one_complete', 'month_one_complete', 'adherent',
];
const STEP_LABELS: Record<string, string> = {
  uncommitted: 'Uncommitted', committed: 'Committed',
  researching: 'Researching providers', provider_chosen: 'Provider chosen',
  appointment_booked: 'Appointment booked', intake_submitted: 'Intake submitted',
  appointment_attended: 'Appointment attended', prescription_obtained: 'Prescription obtained',
  pharmacy_filled: 'Pharmacy filled', first_dose_taken: 'First dose taken',
  week_one_complete: 'Week 1 complete', month_one_complete: 'Month 1 complete',
  adherent: 'Adherent',
};

// Plain-English description of what is unfilled at each step. Memory:
// feedback_internal_task_copy_plain_english — never surface the funnel step
// name as a status string ("Provider chosen") without pairing it with the
// concrete unfilled action.
const STEP_NEXT_ACTION: Record<string, string> = {
  uncommitted:           'You have not committed to starting HRT.',
  committed:             'You said yes to HRT but have not researched providers.',
  researching:           'You are researching providers but have not picked one.',
  provider_chosen:       'You picked a provider but have not booked the consult.',
  appointment_booked:    'You booked the consult but have not attended it.',
  intake_submitted:      'You submitted intake forms but have not attended the consult.',
  appointment_attended:  'You went to the consult but do not have a prescription yet.',
  prescription_obtained: 'You have a prescription but have not filled it at the pharmacy.',
  pharmacy_filled:       'You filled the script but have not taken your first dose.',
  first_dose_taken:      'You took dose 1 but have not completed week 1 of doses.',
  week_one_complete:     'You finished week 1 but have not reached month 1.',
  month_one_complete:    'You hit month 1 but have not reached adherent.',
  adherent:              'Adherent. No action.',
};

function dateKeyET(now: Date): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return `${p.find(x => x.type === 'year')!.value}-${p.find(x => x.type === 'month')!.value}-${p.find(x => x.type === 'day')!.value}`;
}
function hourET(now: Date): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).formatToParts(now);
  return parseInt(p.find(x => x.type === 'hour')?.value || '0', 10);
}

function minObstacleChars(streak: number): number {
  if (streak <= 0) return 250;
  if (streak === 1) return 350;
  return 500;
}

function urlInString(s: string): boolean {
  return /https?:\/\/[^\s]{6,}/i.test(s);
}

export function HrtDailyGate() {
  const { user } = useAuth();
  const [gateOpen, setGateOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('uncommitted');
  const [missedDays, setMissedDays] = useState(0);
  const [bleedingTotal, setBleedingTotal] = useState(0);
  const [pastObstacles, setPastObstacles] = useState<string[]>([]);
  const [mode, setMode] = useState<'pick' | 'advance' | 'obstacle'>('pick');
  const [newStep, setNewStep] = useState<string>('');
  const [evidence, setEvidence] = useState('');
  const [obstacle, setObstacle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localKey = useCallback(() => `td_hrt_gate_${dateKeyET(new Date())}`, []);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const evaluate = async () => {
      const now = new Date();
      if (hourET(now) < 7) { setGateOpen(false); return; }
      if (localStorage.getItem(localKey()) === '1') { setGateOpen(false); return; }
      const today = dateKeyET(now);
      const [{ data: fnl }, { count: obsCount }, { data: ledgerRow }, { data: us }, { data: urg }, { data: pastObs }] = await Promise.all([
        supabase.from('hrt_funnel').select('current_step').eq('user_id', user.id).maybeSingle(),
        supabase.from('hrt_obstacles').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('obstacle_date', today),
        supabase.from('irreversibility_ledger').select('id').eq('user_id', user.id).eq('category', 'hrt_step').gte('logged_at', `${today}T00:00:00`).limit(1).maybeSingle(),
        supabase.from('user_state').select('hrt_step_missed_days').eq('user_id', user.id).maybeSingle(),
        supabase.from('hrt_urgency_state').select('total_bleed_cents, resolved_at').eq('user_id', user.id).maybeSingle(),
        supabase.from('hrt_obstacles').select('obstacle_text, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(3),
      ]);
      if (!alive) return;
      const step = (fnl?.current_step as string) || 'uncommitted';
      setCurrentStep(step);
      setMissedDays((us?.hrt_step_missed_days as number) ?? 0);
      const u = urg as { total_bleed_cents?: number; resolved_at?: string | null } | null;
      setBleedingTotal(u && !u.resolved_at ? (u.total_bleed_cents || 0) / 100 : 0);
      setPastObstacles(((pastObs || []) as Array<{ obstacle_text: string }>).map(o => o.obstacle_text || ''));
      if (step === 'adherent') { setGateOpen(false); return; }
      const satisfied = (obsCount ?? 0) > 0 || !!ledgerRow;
      if (satisfied) { localStorage.setItem(localKey(), '1'); setGateOpen(false); return; }
      setGateOpen(true);
    };
    evaluate();
    const t = setInterval(evaluate, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [user?.id, localKey]);

  const idx = HRT_STEPS.indexOf(currentStep);
  const candidates = HRT_STEPS.slice(idx + 1);
  const explainBanned = missedDays >= 3;
  const requireUrl = missedDays >= 2;
  const requireIdentityPhrase = missedDays >= 1;
  const minChars = minObstacleChars(missedDays);
  const willCcWitness = missedDays >= 3;
  const willRegress = missedDays >= 5;
  const willPublicPost = missedDays >= 7;

  const submitAdvance = async () => {
    if (!user?.id || !newStep || evidence.trim().length < 10) {
      setError('Pick the next step and paste at least 10 characters of evidence.');
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from('hrt_funnel')
        .update({ current_step: newStep, step_entered_at: new Date().toISOString(), days_stuck_on_step: 0, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      await supabase.from('user_state').update({ hrt_step_missed_days: 0, hrt_last_step_change: today }).eq('user_id', user.id);
      await supabase.from('irreversibility_ledger').insert({
        user_id: user.id, category: 'hrt_step', weight: 7,
        description: `HRT funnel: ${STEP_LABELS[currentStep]} → ${STEP_LABELS[newStep]}. Evidence: ${evidence.trim().slice(0, 400)}`,
        source_table: 'hrt_funnel',
      });
      await supabase.from('handler_directives').insert({
        user_id: user.id, action: 'advance_hrt_step', value: { from: currentStep, to: newStep, evidence: evidence.trim().slice(0, 500) },
        reasoning: 'User advanced HRT step via daily gate',
      });
      localStorage.setItem(localKey(), '1');
      setGateOpen(false);
      setEvidence(''); setNewStep(''); setMode('pick');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSubmitting(false); }
  };

  const submitObstacle = async () => {
    if (explainBanned) { setError('Explain is disabled until you advance. Move-or-stay-locked.'); return; }
    if (!user?.id || obstacle.trim().length < minChars) {
      setError(`Add ${minChars - obstacle.trim().length} more characters.`);
      return;
    }
    if (requireIdentityPhrase) {
      // Anti-tautology: bare "David is hiding" was auto-satisfied by the
      // textarea placeholder. Require "David is hiding from <something>"
      // where <something> is at least one word of substance.
      const m = obstacle.toLowerCase().match(/david is hiding from\s+(\S+)/);
      if (!m || !m[1] || m[1].length < 3) {
        setError('Required phrase: "David is hiding from ___" — fill the blank with what specifically he is hiding from. Bare "David is hiding" alone does not count.');
        return;
      }
    }
    if (requireUrl && !urlInString(obstacle)) {
      setError('Add one provider URL you actually visited today (https://...) inside the answer.');
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const next = missedDays + 1;

      await supabase.from('hrt_obstacles').insert({
        user_id: user.id, funnel_step: currentStep, obstacle_text: obstacle.trim(),
      });
      await supabase.from('user_state').update({ hrt_step_missed_days: next }).eq('user_id', user.id);

      // Compounding bleed — kicks in earlier than before. Day 1: $5, doubling
      // every two days, capped $1000/day.
      const bleedDollars = Math.min(1000, 5 * Math.pow(2, Math.max(0, Math.floor((next - 1) / 2))));
      await supabase.from('financial_bleed_events').insert({
        user_id: user.id, amount_cents: bleedDollars * 100,
        reason: `hrt_daily_gate_missed: ${currentStep} (day ${next})`,
        tasks_missed: next, destination: 'queued', status: 'queued',
      });

      // Auto-create locked daily commitment — provider contact required tomorrow.
      const tomorrowEod = new Date();
      tomorrowEod.setDate(tomorrowEod.getDate() + 1);
      tomorrowEod.setHours(22, 0, 0, 0);
      await supabase.from('handler_commitments').insert({
        user_id: user.id,
        what: `HRT step "${STEP_LABELS[currentStep]}" — make 1 provider contact attempt by tomorrow 10pm. Submit screenshot of dialer/email/intake page.`,
        category: 'hrt',
        evidence_required: 'photo_url',
        by_when: tomorrowEod.toISOString(),
        consequence: 'slip +3 and chastity +1d and bleeding +$' + (bleedDollars * 2),
        reasoning: `HRT gate streak day ${next}. Stalling has a tomorrow.`,
        locked: true,
        locked_reason: `Auto-locked by HRT daily gate at miss-streak ${next}. David doesn't get to negotiate this one.`,
      });

      // At streak ≥ 3: silent witness CC + hard mode + chastity lock.
      if (willCcWitness) {
        const { data: w } = await supabase.from('designated_witnesses')
          .select('id, witness_name').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
        const witness = w as { id: string; witness_name: string } | null;
        if (witness) {
          await supabase.from('witness_notifications').insert({
            witness_id: witness.id, user_id: user.id,
            notification_type: 'silent_status',
            subject: `Maxy HRT stall day ${next}`,
            body: `Silent CC: Maxy is on day ${next} of stall at "${STEP_LABELS[currentStep]}". Pattern: ${pastObstacles.slice(0, 2).map(s => `"${s.slice(0, 80)}…"`).join(' / ')}. No action needed. You'll be looped in directly at day 14.`,
            payload: { streak: next, step: currentStep, silent: true },
          });
        }
        await supabase.from('user_state').update({
          hard_mode_active: true,
          hard_mode_entered_at: new Date().toISOString(),
          hard_mode_reason: `HRT stall streak day ${next} at ${STEP_LABELS[currentStep]}`,
          chastity_locked: true,
        }).eq('user_id', user.id);
      }

      // At streak ≥ 5: regress one step.
      if (willRegress && idx > 0) {
        const regressTo = HRT_STEPS[idx - 1];
        await supabase.from('hrt_funnel').update({
          current_step: regressTo, step_entered_at: new Date().toISOString(),
          days_stuck_on_step: 0, updated_at: new Date().toISOString(),
        }).eq('user_id', user.id);
        await supabase.from('irreversibility_ledger').insert({
          user_id: user.id, category: 'hrt_step', weight: 5,
          description: `HRT REGRESSION: ${STEP_LABELS[currentStep]} → ${STEP_LABELS[regressTo]}. Streak day ${next} forced rollback. The funnel goes both ways.`,
          source_table: 'hrt_funnel',
        });
      }

      // At streak ≥ 7: queue cryptic public post.
      if (willPublicPost) {
        await supabase.from('ai_generated_content').insert({
          user_id: user.id,
          platform: 'twitter',
          content_type: 'post',
          generated_text: `${next} days frozen. Same step. Same excuses. The body knows what the mouth won't say yet.`,
          status: 'queued',
          metadata: { source: 'hrt_gate_streak_post', streak: next, step: currentStep },
        });
      }

      await supabase.from('handler_outreach_queue').insert({
        user_id: user.id,
        message: `Obstacle filed. Day ${next} stuck at ${STEP_LABELS[currentStep]}. Bleed +$${bleedDollars} queued.${willCcWitness ? ' Witness silently CC\'d.' : ''}${willRegress ? ' Step regressed.' : ''}${willPublicPost ? ' Public post queued.' : ''} Locked commitment due tomorrow 10pm: 1 provider contact + photo proof.`,
        urgency: willRegress ? 'critical' : willCcWitness ? 'high' : 'standard',
        trigger_reason: `hrt_gate_streak_${next}`,
        scheduled_for: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
      });
      await supabase.from('handler_directives').insert({
        user_id: user.id, action: 'log_hrt_obstacle', target: currentStep,
        value: { obstacle: obstacle.trim().slice(0, 500), missed_days: next, bleed_dollars: bleedDollars, witness_cc: willCcWitness, regressed: willRegress, public_post: willPublicPost },
        reasoning: `HRT gate streak day ${next}`,
      });

      localStorage.setItem(localKey(), '1');
      setGateOpen(false);
      setObstacle(''); setMode('pick');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSubmitting(false); }
  };

  if (!gateOpen) return null;

  const headerTone = missedDays === 0 ? '#f4a7c4' : missedDays < 3 ? '#f4c272' : missedDays < 5 ? '#ec4899' : '#f47272';
  const nextStepName = candidates[0] ? STEP_LABELS[candidates[0]] : null;
  const plainStatus = STEP_NEXT_ACTION[currentStep] || `You are at "${STEP_LABELS[currentStep]}".`;
  // No day-counter narration. Memory: feedback_no_handler_status_dumps —
  // day labels ("Day N stuck") are themselves status dumps. The accusation
  // language escalates by tier; the count never appears in user-facing copy.
  const stalledHeader = missedDays === 0
    ? plainStatus
    : missedDays < 3
      ? `${plainStatus} David picked the answer that looks like progress and used the next 24 hours to do nothing.`
      : missedDays < 5
        ? `${plainStatus} You are no longer allowed to talk your way through this. The Handler has stopped accepting words.`
        : `${plainStatus} The funnel is regressing. Each hour without a move makes the climb back longer.`;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.97)', zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(10px)' }}>
      <div style={{ maxWidth: 620, width: '100%', background: '#111116', border: `1px solid ${missedDays >= 3 ? '#7a1f22' : '#2d1a4d'}`, borderRadius: 14, padding: 24, color: '#e8e6e3' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: headerTone, fontWeight: 700, marginBottom: 8 }}>
          HRT daily check · {explainBanned ? 'ADVANCE OR STAY LOCKED' : currentStep === 'uncommitted' ? 'commit or explain' : 'advance or explain'}
        </div>
        <div style={{ fontSize: missedDays === 0 ? 19 : 16, fontWeight: 600, color: '#fff', marginBottom: 6, letterSpacing: '-0.015em', lineHeight: 1.35 }}>
          {stalledHeader}
        </div>

        {(missedDays > 0 || bleedingTotal > 0) && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, padding: '10px 12px',
            background: '#0a0a0d', border: `1px solid ${headerTone}44`, borderLeft: `3px solid ${headerTone}`, borderRadius: 6,
          }}>
            {/* No streak day count. The accusation tier in the header IS the escalation. */}
            {bleedingTotal > 0 && (
              <div style={{ fontSize: 10.5, color: '#f47272' }}>
                Stuck-tax owed: ${bleedingTotal.toFixed(2)}
              </div>
            )}
            {willCcWitness && <div style={{ fontSize: 10.5, color: '#f47272' }}>Witness silently CC'd on miss</div>}
            {willRegress && <div style={{ fontSize: 10.5, color: '#f47272' }}>Step regresses on miss</div>}
            {willPublicPost && <div style={{ fontSize: 10.5, color: '#f47272' }}>Public post fires on miss</div>}
          </div>
        )}

        <div style={{ fontSize: 12, color: '#8a8690', marginBottom: 18, lineHeight: 1.5 }}>
          {explainBanned
            ? 'Talking is no longer accepted. Either move the funnel one step forward with evidence, or close this and the app stays locked. Hard mode is on. Chastity is locked.'
            : nextStepName
              ? `No third path. Either move forward to "${nextStepName}" with evidence, or write what stopped you today. The app stays locked until one of the two submits clean.`
              : 'No third path. Either move the funnel forward with evidence, or write what stopped you today. The app stays locked until one of the two submits clean.'}
        </div>

        {pastObstacles.length >= 2 && missedDays >= 2 && (
          <div style={{ marginBottom: 16, padding: 10, background: '#1a0a14', border: '1px solid #5a1a2a', borderRadius: 6 }}>
            <div style={{ fontSize: 9.5, color: '#f47272', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Same excuses, different day:
            </div>
            {pastObstacles.slice(0, 3).map((o, i) => (
              <div key={i} style={{ fontSize: 10.5, color: '#c8c4cc', fontStyle: 'italic', marginBottom: 4, lineHeight: 1.4 }}>
                "{(o || '').slice(0, 200)}{(o || '').length > 200 ? '…' : ''}"
              </div>
            ))}
          </div>
        )}

        {mode === 'pick' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setMode('advance')} disabled={candidates.length === 0}
              style={{ flex: 1, padding: '14px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              I moved forward today → {candidates[0] ? STEP_LABELS[candidates[0]] : 'already adherent'}
            </button>
            <button onClick={() => setMode('obstacle')} disabled={explainBanned}
              title={explainBanned ? 'Talking is no longer accepted. Move forward only.' : ''}
              style={{ flex: 1, padding: '14px', borderRadius: 8,
                border: explainBanned ? '1px solid #3a1216' : '1px solid #2d1a4d',
                background: explainBanned ? '#1a0a0d' : 'rgba(45,26,77,0.3)',
                color: explainBanned ? '#5a4548' : '#c4b5fd',
                fontWeight: 600, fontSize: 13, cursor: explainBanned ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', textDecoration: explainBanned ? 'line-through' : 'none' }}>
              {explainBanned ? 'Explain — disabled, talk-no-more' : 'Name what stopped me'}
            </button>
          </div>
        )}

        {mode === 'advance' && (
          <div>
            <div style={{ fontSize: 11, color: '#8a8690', marginBottom: 6 }}>Pick the step you moved to today:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {candidates.map(s => (
                <button key={s} onClick={() => setNewStep(s)}
                  style={{ fontSize: 11.5, padding: '5px 10px', borderRadius: 14,
                    background: newStep === s ? '#7c3aed' : '#1a1623', color: newStep === s ? '#fff' : '#c4b5fd',
                    border: `1px solid ${newStep === s ? '#7c3aed' : '#2d1a4d'}`, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {STEP_LABELS[s]}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#8a8690', marginBottom: 6 }}>Evidence (URL, appointment ref, intake screenshot description, who you told, etc.):</div>
            <textarea value={evidence} onChange={e => setEvidence(e.target.value)} rows={5} placeholder="paste link, quote email, describe what you did…"
              style={{ width: '100%', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6, padding: 10, color: '#e8e6e3', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }} />
            {error && <div style={{ fontSize: 11, color: '#f47272', marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={submitAdvance} disabled={!newStep || evidence.trim().length < 10 || submitting}
                style={{ flex: 1, padding: 10, borderRadius: 6, border: 'none', background: newStep && evidence.trim().length >= 10 ? '#7c3aed' : '#2d1a4d', color: '#fff', fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {submitting ? 'saving…' : 'Submit advancement'}
              </button>
              <button onClick={() => { setMode('pick'); setError(null); }} style={{ padding: '10px 14px', borderRadius: 6, background: 'none', border: '1px solid #2d1a4d', color: '#8a8690', cursor: 'pointer', fontFamily: 'inherit' }}>back</button>
            </div>
          </div>
        )}

        {mode === 'obstacle' && !explainBanned && (
          <div>
            <div style={{ fontSize: 11.5, color: '#f4c272', marginBottom: 8, lineHeight: 1.5 }}>
              {missedDays === 0 && `Write ≥${minChars} chars. Be specific — the Handler will use this to push you tomorrow.`}
              {missedDays === 1 && `Write ≥${minChars} chars and include the phrase "David is hiding from ___" — fill the blank with what specifically he is hiding from. Naming it is the work.`}
              {missedDays >= 2 && `Write ≥${minChars} chars, include "David is hiding from ___" with the blank filled, and paste at least one provider URL you actually visited today (https://...). Repeating the same excuse no longer counts.`}
            </div>
            <textarea value={obstacle} onChange={e => setObstacle(e.target.value)} rows={9} placeholder={requireIdentityPhrase ? `Today I did not move forward because… (start typing here, the phrase "David is hiding from ___" must appear somewhere in your answer with the blank filled)` : 'what specifically stopped me today…'}
              style={{ width: '100%', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6, padding: 10, color: '#e8e6e3', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, color: obstacle.trim().length >= minChars ? '#5fc88f' : '#8a8690' }}>
                {obstacle.trim().length} / {minChars} chars
              </div>
              {requireIdentityPhrase && (() => {
                const m = obstacle.toLowerCase().match(/david is hiding from\s+(\S+)/);
                const filled = !!(m && m[1] && m[1].length >= 3);
                return (
                  <div style={{ fontSize: 11, color: filled ? '#5fc88f' : '#f47272' }}>
                    "David is hiding from ___": {filled ? 'blank filled' : 'blank not filled'}
                  </div>
                );
              })()}
              {requireUrl && (
                <div style={{ fontSize: 11, color: urlInString(obstacle) ? '#5fc88f' : '#f47272' }}>
                  provider url: {urlInString(obstacle) ? 'present' : 'missing'}
                </div>
              )}
            </div>
            {error && <div style={{ fontSize: 11, color: '#f47272', marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {(() => {
                const m = obstacle.toLowerCase().match(/david is hiding from\s+(\S+)/);
                const phraseFilled = !!(m && m[1] && m[1].length >= 3);
                const ready = obstacle.trim().length >= minChars
                  && (!requireIdentityPhrase || phraseFilled)
                  && (!requireUrl || urlInString(obstacle));
                return (
                  <button onClick={submitObstacle}
                    disabled={!ready || submitting}
                    style={{ flex: 1, padding: 10, borderRadius: 6, border: 'none',
                      background: ready ? '#f4c272' : '#2d1a4d',
                      color: ready ? '#1a0f00' : '#8a8690',
                      fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                    {submitting ? 'saving…' : 'Submit'}
                  </button>
                );
              })()}
              <button onClick={() => { setMode('pick'); setError(null); }} style={{ padding: '10px 14px', borderRadius: 6, background: 'none', border: '1px solid #2d1a4d', color: '#8a8690', cursor: 'pointer', fontFamily: 'inherit' }}>back</button>
            </div>
          </div>
        )}

        {mode === 'obstacle' && explainBanned && (
          <div style={{ padding: 14, background: '#1a0a0d', border: '1px solid #7a1f22', borderRadius: 6 }}>
            <div style={{ fontSize: 13, color: '#f47272', fontWeight: 600, marginBottom: 6 }}>
              Talking is no longer accepted.
            </div>
            <div style={{ fontSize: 11.5, color: '#c8c4cc', lineHeight: 1.5 }}>
              You don't get to talk your way through this anymore. The funnel only moves forward, or you sit in it. Pick the next step + paste the evidence. The app stays locked until you do.
            </div>
            <button onClick={() => { setMode('advance'); setError(null); }}
              style={{ marginTop: 12, padding: 10, borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
              Move to advance flow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
