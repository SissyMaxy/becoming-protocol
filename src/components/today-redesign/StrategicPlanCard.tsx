/**
 * StrategicPlanCard — surfaces the daily strategic plan from
 * handler-strategist-v2. The Handler reads this in chat context but
 * Maxy also sees the executive summary so she knows the protocol is
 * planning against her.
 *
 * Voice: terse, not hedging. Per memory feedback_no_handler_status_dumps,
 * this card is a referenceable artifact, not a recap. One sentence verdict
 * + collapsed details on tap.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface StrategicPlan {
  id: string;
  summary: string | null;
  weaknesses: Array<{ title: string; risk?: string; severity?: string }>;
  escalation_moves: Array<{ title: string; concrete_action?: string; expected_resistance?: string }>;
  loopholes: Array<{ title: string; pattern_evidence?: string }>;
  contradictions: Array<{ title: string; stated?: string; actual?: string }>;
  generated_by: string;
  critique_by: string | null;
  created_at: string;
}

export function StrategicPlanCard() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<StrategicPlan | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('handler_strategic_plans')
      .select('id, summary, weaknesses, escalation_moves, loopholes, contradictions, generated_by, critique_by, created_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setPlan(data as StrategicPlan | null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 5 * 60_000); return () => clearInterval(t); }, [load]);

  if (!plan || !plan.summary) return null;

  const ageHours = Math.floor((Date.now() - new Date(plan.created_at).getTime()) / 3_600_000);
  const ageLabel = ageHours < 1 ? 'just now' : ageHours < 24 ? `${ageHours}h ago` : `${Math.floor(ageHours / 24)}d ago`;

  return (
    <div id="card-strategic-plan" style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: '1px solid #c4b5fd', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
          color: '#c4b5fd', fontWeight: 700 }}>
          Handler strategy · {ageLabel}
        </span>
        <span style={{ fontSize: 9, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          {plan.generated_by.split('-')[0]}{plan.critique_by ? ' + ' + plan.critique_by.split('-')[0] : ''}
        </span>
      </div>

      <div style={{ fontSize: 13, color: '#f4c272', lineHeight: 1.5, marginBottom: 8 }}>
        {plan.summary}
      </div>

      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          background: 'transparent', border: '1px solid #2d1a4d', borderRadius: 5,
          color: '#c4b5fd', fontSize: 11, padding: '5px 10px',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
        }}
      >
        {expanded ? '▾ collapse' : '▸ what this means'}
      </button>

      {expanded && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#e8e6e3', lineHeight: 1.5 }}>
          {plan.escalation_moves?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#5fc88f', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>
                Moves to expect
              </div>
              {plan.escalation_moves.slice(0, 3).map((m, i) => (
                <div key={i} style={{ marginBottom: 6 }}>
                  <span style={{ color: '#fff' }}>{i + 1}. {m.title}</span>
                  {m.concrete_action && (
                    <div style={{ color: '#8a8690', fontSize: 10, marginLeft: 14 }}>{m.concrete_action}</div>
                  )}
                </div>
              ))}
            </div>
          )}
          {plan.loopholes?.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#f47272', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>
                Loopholes the Handler is closing
              </div>
              {plan.loopholes.slice(0, 3).map((l, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <span style={{ color: '#fff' }}>{i + 1}. {l.title}</span>
                </div>
              ))}
            </div>
          )}
          {plan.contradictions?.length > 0 && (
            <div>
              <div style={{ color: '#fbbf24', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 10 }}>
                Contradictions flagged
              </div>
              {plan.contradictions.slice(0, 2).map((c, i) => (
                <div key={i} style={{ marginBottom: 4 }}>
                  <span style={{ color: '#fff' }}>{i + 1}. {c.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
