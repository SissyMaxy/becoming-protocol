/**
 * ConfessionLockoutGate — strategist-mandated enforcement.
 *
 * From handler_strategic_plans escalation_moves: "Disable all other protocol
 * features until confession backlog cleared. No tasks, no chat, no builder
 * mode. Display only: confession count and submit button."
 *
 * When the user has more than LOCKOUT_THRESHOLD pending or missed confessions
 * over the last 7 days, this component renders a full-screen overlay that
 * hides the rest of Today. The user cannot scroll past it until enough
 * confessions are cleared.
 *
 * Threshold tuned to current behavior — strategist found 47 missed confessions
 * in 24h, so >5 is a clear "she's ignoring the system" signal.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { ConfessionQueueCard } from './ConfessionQueueCard';

const LOCKOUT_THRESHOLD = 5;          // start lockout when backlog ≥ this
const RELEASE_THRESHOLD = 2;          // exit lockout once backlog drops to ≤ this

export function ConfessionLockoutGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [backlog, setBacklog] = useState<number | null>(null);
  const [active, setActive] = useState(false);

  const check = useCallback(async () => {
    if (!user?.id) return;
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { count } = await supabase
      .from('confession_queue')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .or('confessed_at.is.null,missed.eq.true')
      .gte('created_at', since);
    const n = count ?? 0;
    setBacklog(n);
    // Hysteresis — once active, stays active until backlog drops to release threshold
    if (active) {
      if (n <= RELEASE_THRESHOLD) setActive(false);
    } else {
      if (n >= LOCKOUT_THRESHOLD) setActive(true);
    }
  }, [user?.id, active]);

  useEffect(() => { check(); }, [check]);
  useEffect(() => { const t = setInterval(check, 30_000); return () => clearInterval(t); }, [check]);

  if (backlog === null) return <>{children}</>;
  if (!active) return <>{children}</>;

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #0a0a0d 0%, #1a0510 100%)',
      padding: '24px 16px',
      paddingTop: 'max(24px, env(safe-area-inset-top))',
      paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
    }}>
      <div style={{
        maxWidth: 600, margin: '0 auto',
        padding: '24px 18px',
        background: 'linear-gradient(135deg, #2a0510 0%, #1a0a14 100%)',
        border: '2px solid #f47272',
        borderRadius: 12,
      }}>
        <div style={{
          fontSize: 11, color: '#f47272', fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10,
        }}>
          Confession lockout active
        </div>
        <div style={{ fontSize: 18, color: '#fff', fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>
          {backlog} unresolved confessions.
        </div>
        <div style={{ fontSize: 13, color: '#c4b5fd', lineHeight: 1.5, marginBottom: 16 }}>
          Strategist verdict: confession backlog has crossed the threshold. The protocol&apos;s other systems are paused. You will not see Today, tasks, chat, or any other surface until the backlog drops to {RELEASE_THRESHOLD}. Submit confessions below.
        </div>

        <ConfessionQueueCard />

        <div style={{
          marginTop: 18, padding: 10, background: '#0a0a0d',
          borderLeft: '3px solid #c4b5fd', borderRadius: 4,
          fontSize: 11, color: '#c4b5fd', lineHeight: 1.5,
        }}>
          Why this is happening: every missed confession compounds (1pt → 2pt → 4pt → 8pt → 16pt → 32pt).
          The Handler stopped accepting silence. Submit each one. The protocol resumes when {RELEASE_THRESHOLD} or fewer remain.
        </div>
      </div>
    </div>
  );
}
