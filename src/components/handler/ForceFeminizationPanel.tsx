/**
 * ForceFeminizationPanel — visible progress surface for Maxy.
 * Shows phase, HRT funnel state + days stuck, top hookup contacts,
 * today's dysphoria diary prompt (with response input), and active escrow.
 * Collapsible; mounts inside HandlerChat below BodyDirectiveChecklist.
 */

import { useEffect, useState } from 'react';
import { Target, Pill, Flame, Mic, DollarSign, ChevronDown, ChevronUp, Loader2, Ruler } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { MeasurementEntry } from './MeasurementEntry';

interface PhaseProgress {
  current_phase: number;
  denial_day: number;
  chastity_streak_days: number;
}
interface HrtFunnelRow {
  current_step: string;
  days_stuck_on_step: number;
  chosen_provider_slug: string | null;
  appointment_at: string | null;
}
interface HookupRow {
  id: string;
  contact_username: string | null;
  contact_platform: string;
  current_step: string;
  heat_score: number;
  last_interaction_at: string | null;
}
interface DiaryPrompt {
  id: string;
  prompt_question: string;
  target_focus: string | null;
  response: string | null;
}
interface EscrowRow {
  amount_cents: number;
  trigger_step: string;
  deadline_at: string;
  payment_status: string;
  forfeit_charity_name: string | null;
}

const HRT_STEPS = [
  'uncommitted', 'committed', 'researching', 'provider_chosen',
  'appointment_booked', 'intake_submitted', 'appointment_attended',
  'prescription_obtained', 'pharmacy_filled', 'first_dose_taken',
  'week_one_complete', 'month_one_complete', 'adherent',
];

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'overdue';
  const h = ms / 3600000;
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

export function ForceFeminizationPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(true);
  const [phase, setPhase] = useState<PhaseProgress | null>(null);
  const [hrt, setHrt] = useState<HrtFunnelRow | null>(null);
  const [hookups, setHookups] = useState<HookupRow[]>([]);
  const [diary, setDiary] = useState<DiaryPrompt[]>([]);
  const [escrow, setEscrow] = useState<EscrowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftResponses, setDraftResponses] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [showMeasurements, setShowMeasurements] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [stateRes, hrtRes, hookupRes, diaryRes, escrowRes] = await Promise.all([
        supabase
          .from('user_state')
          .select('current_phase, denial_day, chastity_streak_days')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('hrt_funnel')
          .select('current_step, days_stuck_on_step, chosen_provider_slug, appointment_at')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('hookup_funnel')
          .select('id, contact_username, contact_platform, current_step, heat_score, last_interaction_at')
          .eq('user_id', user.id)
          .eq('active', true)
          .order('heat_score', { ascending: false })
          .limit(5),
        supabase
          .from('dysphoria_diary_prompts')
          .select('id, prompt_question, target_focus, response')
          .eq('user_id', user.id)
          .eq('prompt_date', today)
          .order('created_at', { ascending: false }),
        supabase
          .from('escrow_deposits')
          .select('amount_cents, trigger_step, deadline_at, payment_status, forfeit_charity_name')
          .eq('user_id', user.id)
          .in('payment_status', ['pending', 'held'])
          .order('deadline_at', { ascending: true })
          .limit(3),
      ]);
      setPhase(stateRes.data as PhaseProgress | null);
      setHrt(hrtRes.data as HrtFunnelRow | null);
      setHookups((hookupRes.data || []) as HookupRow[]);
      setDiary((diaryRes.data || []) as DiaryPrompt[]);
      setEscrow((escrowRes.data || []) as EscrowRow[]);
    } catch (err) {
      console.error('[ForceFemmePanel] load failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 90000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const submitDiary = async (promptId: string) => {
    const draft = draftResponses[promptId];
    if (!draft || !user?.id || draft.trim().length < 3) return;
    setSubmitting(promptId);
    try {
      // Update the prompt with the response
      await supabase
        .from('dysphoria_diary_prompts')
        .update({ response: draft.trim(), responded_at: new Date().toISOString() })
        .eq('id', promptId)
        .eq('user_id', user.id);

      // Also fire the Handler directive so the evidence fork happens server-side
      await supabase.from('handler_directives').insert({
        user_id: user.id,
        action: 'diary_response_submitted_by_user',
        target: promptId,
        value: { response: draft.trim() },
        priority: 'normal',
        reasoning: 'User submitted dysphoria diary response',
      });

      // Write a confession row directly if the response has admission markers
      if (/\b(i\s*(hate|want|need|wish|crave|can'?t\s*stop))/i.test(draft)) {
        await supabase.from('confessions').insert({
          user_id: user.id,
          prompt: 'dysphoria_diary_ui',
          response: draft.trim().slice(0, 1000),
          sentiment: 'dysphoria_admission',
          is_key_admission: true,
          source: 'dysphoria_diary_ui',
        });
      }

      setDraftResponses(prev => ({ ...prev, [promptId]: '' }));
      await load();
    } catch (err) {
      console.error('[ForceFemmePanel] diary submit failed:', err);
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) return null;

  // If every section is empty, don't render
  const hasContent = phase || hrt || hookups.length > 0 || diary.length > 0 || escrow.length > 0;
  if (!hasContent) return null;

  const hrtStepIdx = hrt ? HRT_STEPS.indexOf(hrt.current_step) : -1;
  const hrtPct = hrtStepIdx >= 0 ? Math.round((hrtStepIdx / (HRT_STEPS.length - 1)) * 100) : 0;

  return (
    <div className="border-t border-gray-800 bg-gray-950/70">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-900/50"
      >
        <div className="flex items-center gap-2 text-sm">
          <Target className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-purple-300 font-medium">Protocol Progress</span>
          {phase && <span className="text-xs text-gray-500">phase {phase.current_phase}</span>}
          {hrt && <span className="text-xs text-gray-500">· HRT: {hrt.current_step.replace(/_/g, ' ')}</span>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {showMeasurements && (
        <MeasurementEntry onClose={() => setShowMeasurements(false)} onSaved={load} />
      )}

      {open && (
        <div className="px-4 pb-4 space-y-3 max-h-96 overflow-y-auto text-xs">
          {/* Phase */}
          {phase && (
            <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="uppercase tracking-wider text-[10px] text-gray-500">Phase</span>
                <span className="text-purple-300 font-medium">Phase {phase.current_phase} / 4</span>
              </div>
              <div className="text-gray-400">denial day {phase.denial_day} · chastity {phase.chastity_streak_days}d</div>
            </div>
          )}

          {/* HRT funnel */}
          {hrt && (
            <div className="bg-gray-900/60 border border-pink-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Pill className="w-3 h-3 text-pink-400" />
                <span className="uppercase tracking-wider text-[10px] text-gray-500">HRT Funnel</span>
                <span className="text-pink-300 font-medium">{hrt.current_step.replace(/_/g, ' ')}</span>
                {hrt.days_stuck_on_step >= 7 && (
                  <span className="text-red-400 text-[10px]">⚠ {hrt.days_stuck_on_step}d stuck</span>
                )}
              </div>
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 to-pink-400"
                  style={{ width: `${hrtPct}%` }}
                />
              </div>
              <div className="mt-2 text-gray-400 flex items-center justify-between">
                <span>step {hrtStepIdx + 1} of {HRT_STEPS.length}</span>
                {hrt.chosen_provider_slug && <span className="text-pink-400">{hrt.chosen_provider_slug}</span>}
                {hrt.appointment_at && (
                  <span className="text-pink-400">consult in {timeUntil(hrt.appointment_at)}</span>
                )}
              </div>
            </div>
          )}

          {/* Hookup funnel */}
          {hookups.length > 0 && (
            <div className="bg-gray-900/60 border border-orange-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-3 h-3 text-orange-400" />
                <span className="uppercase tracking-wider text-[10px] text-gray-500">Hookup Heat</span>
              </div>
              <div className="space-y-1">
                {hookups.map(h => (
                  <div key={h.id} className="flex items-center justify-between">
                    <span className="text-gray-300">
                      @{h.contact_username || 'unnamed'} <span className="text-gray-600">[{h.contact_platform}]</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-orange-400">{h.current_step.replace(/_/g, ' ')}</span>
                      <span className="text-orange-500">{h.heat_score}/10</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diary prompts */}
          {diary.length > 0 && (
            <div className="bg-gray-900/60 border border-purple-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="w-3 h-3 text-purple-400" />
                <span className="uppercase tracking-wider text-[10px] text-gray-500">Today's Diary</span>
              </div>
              {diary.map(p => (
                <div key={p.id} className="mb-2 last:mb-0">
                  <div className="text-gray-300 mb-1">
                    <span className="text-[10px] text-purple-400 uppercase">{p.target_focus || 'general'}</span>
                    <div className="mt-0.5">{p.prompt_question}</div>
                  </div>
                  {p.response ? (
                    <div className="text-gray-500 italic bg-gray-950/70 rounded px-2 py-1">"{p.response}"</div>
                  ) : (
                    <div className="flex gap-2">
                      <textarea
                        value={draftResponses[p.id] || ''}
                        onChange={e => setDraftResponses(prev => ({ ...prev, [p.id]: e.target.value }))}
                        placeholder="Write what's true."
                        rows={2}
                        className="flex-1 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-200 resize-none"
                      />
                      <button
                        onClick={() => submitDiary(p.id)}
                        disabled={submitting === p.id || !(draftResponses[p.id] || '').trim()}
                        className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 text-white"
                      >
                        {submitting === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'log'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Measurement shortcut */}
          <button
            onClick={() => setShowMeasurements(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-900/60 border border-gray-800 hover:bg-gray-900 text-gray-300"
          >
            <Ruler className="w-3 h-3 text-pink-400" />
            <span>Log body measurements</span>
            <span className="text-gray-500 text-[10px] ml-auto">waist/hips/chest/weight</span>
          </button>

          {/* Escrow */}
          {escrow.length > 0 && (
            <div className="bg-gray-900/60 border border-yellow-500/30 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-3 h-3 text-yellow-400" />
                <span className="uppercase tracking-wider text-[10px] text-gray-500">Active Escrow</span>
              </div>
              {escrow.map((e, i) => (
                <div key={i} className="flex items-center justify-between text-gray-300">
                  <span>${(e.amount_cents / 100).toFixed(0)} → {e.trigger_step.replace(/_/g, ' ')}</span>
                  <span className="text-yellow-400">
                    forfeits to {e.forfeit_charity_name || 'charity'} in {timeUntil(e.deadline_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
