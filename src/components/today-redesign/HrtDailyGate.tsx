/**
 * HrtDailyGate — compulsory daily modal forcing HRT funnel progression
 * or a written obstacle. App is unusable until one of the two lands.
 *
 * Two paths:
 *   1. ADVANCE — pick the new step, paste evidence, system advances
 *      hrt_funnel.current_step + logs irreversibility_ledger entry
 *   2. OBSTACLE — write ≥250 chars explaining what blocked today.
 *      System writes hrt_obstacles row. Missed-days counter increments.
 *
 * Triggers: daily at 7am user-local, catch-up all day until midnight.
 * Satisfied: either path written today.
 * Consequences when missed_days ≥ 7: financial bleed queued.
 * Consequences when missed_days ≥ 10: witness notification queued.
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

function dateKeyET(now: Date): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return `${p.find(x => x.type === 'year')!.value}-${p.find(x => x.type === 'month')!.value}-${p.find(x => x.type === 'day')!.value}`;
}
function hourET(now: Date): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).formatToParts(now);
  return parseInt(p.find(x => x.type === 'hour')?.value || '0', 10);
}

export function HrtDailyGate() {
  const { user } = useAuth();
  const [gateOpen, setGateOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('uncommitted');
  const [mode, setMode] = useState<'pick' | 'advance' | 'obstacle'>('pick');
  const [newStep, setNewStep] = useState<string>('');
  const [evidence, setEvidence] = useState('');
  const [obstacle, setObstacle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localKey = useCallback(() => `td_hrt_gate_${dateKeyET(new Date())}`, []);

  // Evaluator — runs every minute
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const evaluate = async () => {
      const now = new Date();
      // Only trigger at or after 7am ET; catch-up all day
      if (hourET(now) < 7) { setGateOpen(false); return; }
      // Local flag
      if (localStorage.getItem(localKey()) === '1') { setGateOpen(false); return; }
      // DB check — either an advance OR an obstacle today satisfies the gate
      const today = dateKeyET(now);
      const [{ data: fnl }, { count: obsCount }, { data: ledgerRow }] = await Promise.all([
        supabase.from('hrt_funnel').select('current_step').eq('user_id', user.id).maybeSingle(),
        supabase.from('hrt_obstacles').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('obstacle_date', today),
        supabase.from('irreversibility_ledger').select('id').eq('user_id', user.id).eq('category', 'hrt_step').gte('logged_at', `${today}T00:00:00`).limit(1).maybeSingle(),
      ]);
      if (!alive) return;
      const step = (fnl?.current_step as string) || 'uncommitted';
      setCurrentStep(step);
      if (step === 'adherent') { setGateOpen(false); return; }
      const satisfied = (obsCount ?? 0) > 0 || !!ledgerRow;
      if (satisfied) {
        localStorage.setItem(localKey(), '1');
        setGateOpen(false);
        return;
      }
      setGateOpen(true);
    };
    evaluate();
    const t = setInterval(evaluate, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [user?.id, localKey]);

  const idx = HRT_STEPS.indexOf(currentStep);
  const candidates = HRT_STEPS.slice(idx + 1);

  const submitAdvance = async () => {
    if (!user?.id || !newStep || evidence.trim().length < 10) {
      setError('Pick the next step and paste at least 10 characters of evidence.');
      return;
    }
    setSubmitting(true); setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { error: updErr } = await supabase.from('hrt_funnel')
        .update({ current_step: newStep, step_entered_at: new Date().toISOString(), days_stuck_on_step: 0, updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      if (updErr) throw updErr;
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
    if (!user?.id || obstacle.trim().length < 250) {
      setError(`Obstacle needs ${250 - obstacle.trim().length} more characters.`);
      return;
    }
    setSubmitting(true); setError(null);
    try {
      await supabase.from('hrt_obstacles').insert({
        user_id: user.id, funnel_step: currentStep, obstacle_text: obstacle.trim(),
      });
      // Increment missed days
      const { data: st } = await supabase.from('user_state').select('hrt_step_missed_days').eq('user_id', user.id).maybeSingle();
      const prev = (st?.hrt_step_missed_days as number) ?? 0;
      const next = prev + 1;
      await supabase.from('user_state').update({ hrt_step_missed_days: next }).eq('user_id', user.id);
      // Consequences: bleed at 7, witness at 10
      if (next >= 7) {
        const { data: recentBleed } = await supabase.from('financial_bleed_events').select('id')
          .eq('user_id', user.id).eq('reason', `hrt_daily_gate_missed: ${currentStep}`)
          .gte('created_at', new Date(Date.now() - 24 * 3600000).toISOString()).limit(1).maybeSingle();
        if (!recentBleed) {
          await supabase.from('financial_bleed_events').insert({
            user_id: user.id, amount_cents: 500 * next, reason: `hrt_daily_gate_missed: ${currentStep}`,
            tasks_missed: next, destination: 'queued', status: 'queued',
          });
        }
      }
      if (next >= 10) {
        await supabase.from('handler_outreach_queue').insert({
          user_id: user.id,
          message: `${next} days missed on HRT step ${STEP_LABELS[currentStep]}. Witness notification fires if you hit 14. Advance tomorrow or your witnesses see your stall.`,
          urgency: 'critical', trigger_reason: 'hrt_gate_witness_warning',
          scheduled_for: new Date().toISOString(),
          expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
        });
      }
      await supabase.from('handler_directives').insert({
        user_id: user.id, action: 'log_hrt_obstacle', target: currentStep,
        value: { obstacle: obstacle.trim().slice(0, 500), missed_days: next },
        reasoning: `User filed HRT obstacle (missed_days=${next})`,
      });
      localStorage.setItem(localKey(), '1');
      setGateOpen(false);
      setObstacle(''); setMode('pick');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSubmitting(false); }
  };

  if (!gateOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.96)', zIndex: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, backdropFilter: 'blur(10px)' }}>
      <div style={{ maxWidth: 600, width: '100%', background: '#111116', border: '1px solid #2d1a4d', borderRadius: 14, padding: 24, color: '#e8e6e3' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f4a7c4', fontWeight: 700, marginBottom: 8 }}>
          HRT daily check · {currentStep === 'uncommitted' ? 'commit or explain' : 'advance or explain'}
        </div>
        <div style={{ fontSize: 19, fontWeight: 600, color: '#fff', marginBottom: 6, letterSpacing: '-0.015em' }}>
          You are on: {STEP_LABELS[currentStep]}
        </div>
        <div style={{ fontSize: 12, color: '#8a8690', marginBottom: 18 }}>
          No third option. Either advance the funnel one step and paste evidence, or write ≥250 characters on what stopped you today. App stays locked until one lands.
        </div>

        {mode === 'pick' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setMode('advance')} disabled={candidates.length === 0}
              style={{ flex: 1, padding: '14px', borderRadius: 8, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              I advanced today → {candidates[0] ? STEP_LABELS[candidates[0]] : 'already adherent'}
            </button>
            <button onClick={() => setMode('obstacle')}
              style={{ flex: 1, padding: '14px', borderRadius: 8, border: '1px solid #2d1a4d', background: 'rgba(45,26,77,0.3)', color: '#c4b5fd', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              File obstacle → explain
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

        {mode === 'obstacle' && (
          <div>
            <div style={{ fontSize: 11.5, color: '#f4c272', marginBottom: 8 }}>
              Write ≥250 chars. Be specific — the Handler will use this to push you tomorrow. Naming the obstacle honestly is the minimum price for missing a day.
            </div>
            <textarea value={obstacle} onChange={e => setObstacle(e.target.value)} rows={8} placeholder="what specifically stopped me today…"
              style={{ width: '100%', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6, padding: 10, color: '#e8e6e3', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: obstacle.trim().length >= 250 ? '#5fc88f' : '#8a8690', marginTop: 6 }}>
              {obstacle.trim().length} / 250 chars
            </div>
            {error && <div style={{ fontSize: 11, color: '#f47272', marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={submitObstacle} disabled={obstacle.trim().length < 250 || submitting}
                style={{ flex: 1, padding: 10, borderRadius: 6, border: 'none', background: obstacle.trim().length >= 250 ? '#f4c272' : '#2d1a4d', color: obstacle.trim().length >= 250 ? '#1a0f00' : '#8a8690', fontWeight: 600, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                {submitting ? 'saving…' : 'Submit obstacle'}
              </button>
              <button onClick={() => { setMode('pick'); setError(null); }} style={{ padding: '10px 14px', borderRadius: 6, background: 'none', border: '1px solid #2d1a4d', color: '#8a8690', cursor: 'pointer', fontFamily: 'inherit' }}>back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
