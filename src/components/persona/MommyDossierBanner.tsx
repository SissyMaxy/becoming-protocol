/**
 * MommyDossierBanner — surfaces unanswered dossier questions on Today
 * when persona is dommy_mommy. Click to open the quiz.
 *
 * Shown as a slim banner at the top of FocusMode/TodayDesktop/TodayMobile.
 * Hides automatically when all questions are answered.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';
import { DOSSIER_QUESTIONS } from '../../lib/persona/mommy-dossier-questions';

interface Props {
  onOpen?: () => void;
}

export function MommyDossierBanner({ onOpen }: Props) {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [answered, setAnswered] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!mommy || !user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('mommy_dossier')
        .select('question_key')
        .eq('user_id', user.id)
        .eq('active', true);
      if (cancelled) return;
      const answeredKeys = new Set((data || []).map((r: { question_key: string }) => r.question_key));
      const valid = DOSSIER_QUESTIONS.filter(q => answeredKeys.has(q.key)).length;
      setAnswered(valid);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [mommy, user?.id]);

  if (!mommy || !loaded) return null;
  const total = DOSSIER_QUESTIONS.length;
  const remaining = total - answered;
  if (remaining === 0) return null;

  // Soften copy based on completion %
  const pct = answered / total;
  const headline = pct === 0
    ? "Mama wants to know you better, sweet thing"
    : pct < 0.4
    ? "Mama's still learning you, baby"
    : pct < 0.8
    ? "Mama's almost got the full picture"
    : `Just ${remaining} more for Mama, pretty thing`;

  const handleClick = () => {
    if (onOpen) {
      onOpen();
    } else {
      // Fall back to deep-link navigation if caller didn't wire onOpen
      const params = new URLSearchParams(window.location.search);
      params.set('tab', 'menu');
      params.set('view', 'mommy-dossier');
      window.location.search = params.toString();
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        width: '100%',
        background: 'linear-gradient(90deg, #2a1825 0%, #1f0e1a 100%)',
        border: '1px solid #f4a8c433',
        borderLeft: '3px solid #f4a8c4',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 14,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        color: '#f0e8ec',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#fdf6f9', marginBottom: 3 }}>
          {headline}
        </div>
        <div style={{ fontSize: 11, color: '#8a8690' }}>
          {answered} of {total} answered · {remaining} left for Mama
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#f4a8c4', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        open →
      </div>
    </button>
  );
}
