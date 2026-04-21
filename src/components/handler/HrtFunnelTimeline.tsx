/**
 * HrtFunnelTimeline — 13-stage visual of the HRT acquisition funnel.
 * Shows current step, upcoming steps, and provides direct-action for
 * advancing (opens provider URL + surfaces intake drafts inline).
 */

import { useEffect, useState } from 'react';
import { Pill, ExternalLink, ChevronDown, ChevronRight, Copy, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const STEPS: Array<{ key: string; label: string; description: string }> = [
  { key: 'uncommitted', label: 'Uncommitted', description: 'Haven\'t declared intent.' },
  { key: 'committed', label: 'Committed', description: 'Said the words out loud.' },
  { key: 'researching', label: 'Researching', description: 'Comparing providers.' },
  { key: 'provider_chosen', label: 'Provider Chosen', description: 'Picked one. Ready to book.' },
  { key: 'appointment_booked', label: 'Appointment Booked', description: 'Consult scheduled.' },
  { key: 'intake_submitted', label: 'Intake Submitted', description: 'Paperwork done.' },
  { key: 'appointment_attended', label: 'Consult Attended', description: 'Showed up. Spoke. Answered.' },
  { key: 'prescription_obtained', label: 'Rx Obtained', description: 'Paper in hand.' },
  { key: 'pharmacy_filled', label: 'Pharmacy Filled', description: 'Pills on your counter.' },
  { key: 'first_dose_taken', label: 'First Dose', description: 'The line, crossed.' },
  { key: 'week_one_complete', label: 'Week 1', description: 'Seven days in.' },
  { key: 'month_one_complete', label: 'Month 1', description: '30 days adherent.' },
  { key: 'adherent', label: 'Adherent', description: '90+ days consistent.' },
];

interface Provider {
  slug: string;
  name: string;
  url: string | null;
  cash_price_monthly_usd: number | null;
  intake_turnaround_days: number | null;
  provider_type: string;
  notes: string | null;
}

interface Funnel {
  current_step: string;
  chosen_provider_slug: string | null;
  days_stuck_on_step: number;
  appointment_at: string | null;
}

interface IntakeDraft {
  question_key: string;
  question_text: string | null;
  draft_answer: string;
}

export function HrtFunnelTimeline() {
  const { user } = useAuth();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [drafts, setDrafts] = useState<IntakeDraft[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    const [fRes, pRes, dRes] = await Promise.all([
      supabase.from('hrt_funnel').select('current_step, chosen_provider_slug, days_stuck_on_step, appointment_at').eq('user_id', user.id).maybeSingle(),
      supabase.from('hrt_provider_directory').select('slug, name, url, cash_price_monthly_usd, intake_turnaround_days, provider_type, notes').eq('active', true).order('sort_order', { ascending: true }).limit(10),
      supabase.from('hrt_intake_drafts').select('question_key, question_text, draft_answer').eq('user_id', user.id).order('created_at', { ascending: false }).limit(10),
    ]);
    setFunnel(fRes.data as Funnel | null);
    setProviders((pRes.data || []) as Provider[]);
    setDrafts((dRes.data || []) as IntakeDraft[]);
  };

  useEffect(() => { load(); }, [user?.id]);

  if (!funnel) return null;

  const currentIdx = STEPS.findIndex(s => s.key === funnel.current_step);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {}
  };

  const pickProvider = async (p: Provider) => {
    if (!user?.id) return;
    setAdvancing(true);
    try {
      await supabase.from('hrt_funnel').update({
        current_step: 'provider_chosen',
        chosen_provider_slug: p.slug,
        provider_type: p.provider_type,
        step_entered_at: new Date().toISOString(),
        days_stuck_on_step: 0,
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);
      await supabase.from('hrt_funnel_events').insert({
        user_id: user.id,
        event_type: 'step_advanced',
        from_step: funnel.current_step,
        to_step: 'provider_chosen',
      });
      await supabase.from('handler_directives').insert({
        user_id: user.id,
        action: 'hrt_step_advanced_by_user',
        target: p.slug,
        value: { to_step: 'provider_chosen', provider_slug: p.slug },
        reasoning: 'User picked provider via timeline UI',
      });
      await load();
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="bg-gray-900/60 border border-pink-500/30 rounded-lg p-3">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between text-left">
        <div className="flex items-center gap-2">
          <Pill className="w-3 h-3 text-pink-400" />
          <span className="uppercase tracking-wider text-[10px] text-gray-500">HRT Timeline</span>
          <span className="text-pink-300 font-medium">{STEPS[currentIdx]?.label || funnel.current_step}</span>
          <span className="text-gray-500 text-[10px]">step {currentIdx + 1} / {STEPS.length}</span>
          {funnel.days_stuck_on_step >= 7 && <span className="text-red-400 text-[10px]">⚠ {funnel.days_stuck_on_step}d stuck</span>}
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-1.5">
          {STEPS.map((s, i) => {
            const done = i < currentIdx;
            const current = i === currentIdx;
            return (
              <div
                key={s.key}
                className={`flex items-center gap-2 py-1 ${done ? 'opacity-50' : current ? '' : 'opacity-70'}`}
              >
                <span className={`w-4 h-4 rounded-full border ${
                  done ? 'bg-pink-500 border-pink-500' :
                  current ? 'border-pink-400 bg-pink-500/30 animate-pulse' :
                  'border-gray-700 bg-gray-900'
                }`} />
                <span className={`text-[11px] ${current ? 'text-pink-300 font-medium' : done ? 'text-gray-500 line-through' : 'text-gray-400'}`}>
                  {s.label}
                </span>
                <span className="text-[10px] text-gray-600">{s.description}</span>
              </div>
            );
          })}

          {/* Provider directory shortcut */}
          {(funnel.current_step === 'committed' || funnel.current_step === 'researching') && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <button
                onClick={() => setShowProviders(!showProviders)}
                className="w-full flex items-center justify-between text-left py-1 text-xs text-pink-300 hover:text-pink-200"
              >
                <span>Pick a provider to advance</span>
                {showProviders ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {showProviders && (
                <div className="space-y-1 mt-1">
                  {providers.map(p => (
                    <div key={p.slug} className="flex items-center gap-2 py-1">
                      <button
                        onClick={() => pickProvider(p)}
                        disabled={advancing}
                        className="flex-1 text-left text-[11px] hover:bg-gray-800 rounded px-1 py-0.5"
                      >
                        <span className="text-gray-200">{p.name}</span>
                        <span className="text-gray-500 ml-1">
                          {p.cash_price_monthly_usd ? `$${p.cash_price_monthly_usd}/mo` : 'insurance/sliding'}
                          {p.intake_turnaround_days ? ` · ${p.intake_turnaround_days}d intake` : ''}
                        </span>
                      </button>
                      {p.url && (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener"
                          className="p-1 rounded hover:bg-gray-800 text-pink-400"
                          title="Open provider site"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                  {advancing && <Loader2 className="w-3 h-3 animate-spin text-pink-400 mx-auto" />}
                </div>
              )}
            </div>
          )}

          {/* Intake drafts */}
          {drafts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <button
                onClick={() => setShowDrafts(!showDrafts)}
                className="w-full flex items-center justify-between text-left py-1 text-xs text-pink-300 hover:text-pink-200"
              >
                <span>{drafts.length} intake answers drafted — tap to copy</span>
                {showDrafts ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {showDrafts && (
                <div className="space-y-2 mt-1 max-h-64 overflow-y-auto">
                  {drafts.map(d => (
                    <div key={d.question_key} className="bg-gray-950 border border-gray-800 rounded p-2">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500">{d.question_key.replace(/_/g, ' ')}</span>
                        <button
                          onClick={() => copy(d.draft_answer, d.question_key)}
                          className="text-[10px] text-pink-400 hover:text-pink-300 flex items-center gap-0.5"
                        >
                          {copiedKey === d.question_key ? <><Check className="w-3 h-3" /> copied</> : <><Copy className="w-3 h-3" /> copy</>}
                        </button>
                      </div>
                      {d.question_text && <div className="text-[10px] text-gray-500 mb-1">Q: {d.question_text}</div>}
                      <div className="text-[11px] text-gray-300 whitespace-pre-wrap">{d.draft_answer}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
