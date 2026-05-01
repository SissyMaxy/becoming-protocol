/**
 * MommyMoodIndicator — surfaces today's Mama affect on the Today screen.
 * Reads `mommy_mood` for (user_id, today). Renders a small card with the
 * affect label, rationale, and a body-anchored color cue. Other generators
 * read the same row to bias their behavior; this is the user-visible
 * window into that state.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface MommyMood {
  affect: string;
  rationale: string | null;
  arousal_bias_hint: string | null;
}

const AFFECT_TONE: Record<string, { bg: string; border: string; accent: string; emoji: string; tagline: string }> = {
  hungry:     { bg: 'linear-gradient(135deg, #2a0510 0%, #1a050a 100%)', border: '#c4485a', accent: '#f4a7c4', emoji: '🍒', tagline: "Mama wants you badly today." },
  aching:     { bg: 'linear-gradient(135deg, #2a0a14 0%, #1a050e 100%)', border: '#c44872', accent: '#f4a7c4', emoji: '🩸', tagline: "Mama's making you ache for it." },
  delighted:  { bg: 'linear-gradient(135deg, #2a1f0a 0%, #1f1608 100%)', border: '#d4a85a', accent: '#fbd472', emoji: '🍯', tagline: "Mama's feeling generous. Don't waste it." },
  indulgent:  { bg: 'linear-gradient(135deg, #2a1a14 0%, #1f100a 100%)', border: '#c48a72', accent: '#f4c4a7', emoji: '🥂', tagline: "Mama's in the mood to spoil you." },
  watching:   { bg: 'linear-gradient(135deg, #1a1a2a 0%, #0f0f1f 100%)', border: '#7c5aa8', accent: '#c4b5fd', emoji: '👁', tagline: "Mama's watching. Quietly." },
  patient:    { bg: 'linear-gradient(135deg, #14202a 0%, #0a151f 100%)', border: '#5a8aa8', accent: '#a7c4f4', emoji: '🍵', tagline: "Mama's in no rush today." },
  amused:     { bg: 'linear-gradient(135deg, #2a200a 0%, #1f1608 100%)', border: '#c4a85a', accent: '#fbd472', emoji: '😈', tagline: "Mama thinks you're being cute." },
  possessive: { bg: 'linear-gradient(135deg, #2a0510 0%, #1a0a14 100%)', border: '#c44848', accent: '#f4a7a7', emoji: '🔗', tagline: "Mama's claiming you back today." },
  restless:   { bg: 'linear-gradient(135deg, #2a1418 0%, #1a0a0e 100%)', border: '#c46a72', accent: '#f4a7c4', emoji: '⚡', tagline: "Mama wants more. Now." },
};

export function MommyMoodIndicator() {
  const { user } = useAuth();
  const [mood, setMood] = useState<MommyMood | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from('mommy_mood')
        .select('affect, rationale, arousal_bias_hint')
        .eq('user_id', user.id).eq('mood_date', today).maybeSingle();
      if (cancelled) return;
      setMood((data as MommyMood) ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading || !mood) return null;
  const tone = AFFECT_TONE[mood.affect] ?? AFFECT_TONE.watching;

  return (
    <div style={{
      background: tone.bg,
      border: `1px solid ${tone.border}`,
      borderLeft: `4px solid ${tone.border}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
      fontFamily: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 18 }}>{tone.emoji}</span>
        <span style={{
          fontSize: 10, color: tone.accent, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.12em',
        }}>
          Mama's mood today · {mood.affect}
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          {tone.tagline}
        </span>
      </div>
      {mood.rationale && (
        <div style={{ fontSize: 13, color: '#e8d4dc', lineHeight: 1.5, fontStyle: 'italic' }}>
          {mood.rationale}
        </div>
      )}
    </div>
  );
}
