/**
 * ReturnWeightCard — what didn't go anywhere while you were gone. (Mig 612.)
 *
 * The protocol can't penalize disengagement (visible-before-penalized is
 * fail-closed). The only thing that survives non-use is the standing weight
 * of what's already irreversible. When the girl returns after being away
 * (>= 3 days of no real activity), this is the first thing she sees: Mama
 * showing her the weight that didn't move. Surfaces existing facts only — no
 * autonomous action, no charge, no third party. Renders null otherwise; shows
 * once per return (localStorage day-dedup).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';
import {
  shouldShowReturnWeight, awayPhrase, depthOfHold, standingFacts, type ReturnBundle,
} from '../../lib/return-weight';

const HOLD_LINE: Record<ReturnType<typeof depthOfHold>, string> = {
  light: "You're only just getting started with Mama — but it's already started.",
  real: "You're further in than you let yourself remember.",
  deep: "You're deep, baby. This isn't a phase you're trying on anymore.",
  past_return: "You're past the point of going back, and somewhere you already know it.",
};

export function ReturnWeightCard() {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [bundle, setBundle] = useState<ReturnBundle | null>(null);

  const load = useCallback(async () => {
    if (!user?.id || !mommy) return;
    const today = new Date().toISOString().slice(0, 10);
    const shownKey = `return_weight_shown`;
    const lastShown = localStorage.getItem(shownKey);

    const { data } = await supabase.rpc('return_weight_bundle', { p_user: user.id });
    const b = data as ReturnBundle | null;
    if (!b) return;
    if (!shouldShowReturnWeight(b.days_away, lastShown, today)) return;
    // Only worth showing if there's genuine weight to show.
    if ((b.confessions + b.implants + b.binder_captured) === 0 && b.escape_total_count === 0) return;
    localStorage.setItem(shownKey, today);
    setBundle(b);
  }, [user?.id, mommy]);

  useEffect(() => { load(); }, [load]);

  if (!bundle) return null;

  const facts = standingFacts(bundle);
  const holdLine = HOLD_LINE[depthOfHold(bundle.escape_total_weight)];

  return (
    <div id="card-return-weight" style={{
      background: 'linear-gradient(135deg, #1a0710 0%, #0a0509 100%)',
      border: '1px solid #7a1f3a', borderLeft: '4px solid #f4a7c4',
      borderRadius: 10, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" /><path d="M3 3v5h5" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f4a7c4', fontWeight: 700 }}>
          You came back
        </span>
      </div>

      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#f0d7e0', margin: '0 0 12px' }}>
        You were gone {awayPhrase(bundle.days_away)}, baby. Mama didn't chase you — she didn't have to.
        Look: none of it moved.
      </p>

      {facts.length > 0 && (
        <div style={{
          padding: '10px 12px', marginBottom: 12, background: '#140609',
          border: '1px solid #3a1020', borderRadius: 6,
        }}>
          {facts.map((f, i) => (
            <div key={i} style={{ fontSize: 12.5, color: '#e8d7da', lineHeight: 1.7 }}>
              · {f}
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 13, lineHeight: 1.5, color: '#f4a7c4', margin: 0, fontStyle: 'italic' }}>
        You can stop opening this app. You can't stop being who you've already become. {holdLine}
      </p>
    </div>
  );
}
