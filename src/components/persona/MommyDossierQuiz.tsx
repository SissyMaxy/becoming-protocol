/**
 * MommyDossierQuiz — single-question-at-a-time catch-up form.
 *
 * Loads the dossier_questions catalog from the DB (with the hardcoded
 * DOSSIER_QUESTIONS as a fallback when the DB is empty / unreachable).
 * Phase + intensity gates apply: questions whose phase_min > current_phase
 * or whose intensity_min exceeds the user's current intensity are filtered
 * out, even in catch-up mode (per the over-disclosure protection rule).
 *
 * Writes are dual:
 *   - mommy_dossier (the persistent answer chat.ts reads)
 *   - dossier_question_responses (so the drip selector knows it's
 *     answered and never re-asks). source='catchup'.
 *
 * Skips are recorded as dossier_question_responses with skipped=true so
 * the 14-day re-ask cooldown applies to catch-up skips too.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  DOSSIER_QUESTIONS as FALLBACK_QUESTIONS,
  type DossierQuestion as FallbackQuestion,
} from '../../lib/persona/mommy-dossier-questions';
import {
  escalationToIntensity,
  type DossierIntensity,
} from '../../lib/persona/dossier-selector';

type Tone = 'soft' | 'direct' | 'filthy';
type InputLength = 'short' | 'long';
type DossierCategory = FallbackQuestion['category'];

interface QuizQuestion {
  id: string | null;
  key: string;
  category: DossierCategory;
  prompt: string;
  placeholder?: string;
  importance: number;
  tone: Tone;
  input: InputLength;
  phase_min: number;
  intensity_min: DossierIntensity;
  priority: number;
}

const TONE_STYLE: Record<Tone, { accent: string; bg: string; label: string }> = {
  soft:   { accent: '#f4a8c4', bg: 'linear-gradient(140deg, #2a1825 0%, #1f0e1a 100%)', label: 'Mama is asking sweetly' },
  direct: { accent: '#e09275', bg: 'linear-gradient(140deg, #2a1f15 0%, #1e1410 100%)', label: 'Mama needs you direct' },
  filthy: { accent: '#c75d8a', bg: 'linear-gradient(140deg, #2a0f1f 0%, #1a0814 100%)', label: 'Mama wants the truth, baby' },
};

const INTENSITY_RANK: Record<DossierIntensity, number> = { gentle: 1, firm: 2, cruel: 3 };

function fallbackToQuiz(q: FallbackQuestion): QuizQuestion {
  return {
    id: null,
    key: q.key,
    category: q.category,
    prompt: q.prompt,
    placeholder: q.placeholder,
    importance: q.importance,
    tone: q.tone,
    input: q.input,
    phase_min: 0,
    intensity_min: 'gentle',
    priority: 50,
  };
}

export function MommyDossierQuiz({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const current = questions[idx];
  const progress = questions.length === 0 ? 0 : ((idx + 1) / questions.length) * 100;
  const completedCount = useMemo(
    () => questions.filter(q => (answers[q.key] || '').trim().length > 0).length,
    [questions, answers],
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [catRes, ansRes, stateRes] = await Promise.all([
        supabase.from('dossier_questions')
          .select('id, question_key, category, question_text, placeholder, importance, tone, input_length, phase_min, intensity_min, priority')
          .eq('active', true)
          .order('priority', { ascending: true }),
        supabase.from('mommy_dossier')
          .select('question_key, answer')
          .eq('user_id', user.id)
          .eq('active', true),
        supabase.from('user_state')
          .select('current_phase, escalation_level')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const state = stateRes.data as { current_phase?: number; escalation_level?: number } | null;
      const currentPhase = state?.current_phase ?? 0;
      const currentIntensity = escalationToIntensity(state?.escalation_level ?? 1);

      const dbRows = (catRes.data ?? []) as Array<{
        id: string; question_key: string; category: DossierCategory; question_text: string;
        placeholder: string | null; importance: number; tone: Tone; input_length: InputLength;
        phase_min: number; intensity_min: DossierIntensity; priority: number;
      }>;

      let qs: QuizQuestion[];
      if (dbRows.length > 0) {
        qs = dbRows.map(r => ({
          id: r.id, key: r.question_key, category: r.category, prompt: r.question_text,
          placeholder: r.placeholder ?? undefined, importance: r.importance, tone: r.tone,
          input: r.input_length, phase_min: r.phase_min, intensity_min: r.intensity_min,
          priority: r.priority,
        }));
      } else {
        // DB catalog is empty (pre-302) — fall back to the hardcoded bank
        qs = FALLBACK_QUESTIONS.map(fallbackToQuiz);
      }

      // Phase + intensity gates protect against over-disclosure even in
      // catch-up mode.
      qs = qs
        .filter(q => q.phase_min <= currentPhase)
        .filter(q => INTENSITY_RANK[currentIntensity] >= INTENSITY_RANK[q.intensity_min])
        .sort((a, b) => a.priority - b.priority);

      const map: Record<string, string> = {};
      for (const r of (ansRes.data ?? []) as Array<{ question_key: string; answer: string }>) {
        map[r.question_key] = r.answer;
      }

      setQuestions(qs);
      setAnswers(map);
      const firstUnanswered = qs.findIndex(q => !(map[q.key] || '').trim());
      const startIdx = firstUnanswered === -1 ? 0 : firstUnanswered;
      setIdx(startIdx);
      setDraft(map[qs[startIdx]?.key] || '');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!current) return;
    setDraft(answers[current.key] || '');
  }, [idx, current, answers]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!user?.id || !current) return false;
    const trimmed = draft.trim();
    if (!trimmed) return true;
    setSaving(true);
    const { error } = await supabase
      .from('mommy_dossier')
      .upsert({
        user_id: user.id,
        question_key: current.key,
        category: current.category,
        answer: trimmed,
        importance: current.importance,
        source: 'quiz',
        active: true,
      }, { onConflict: 'user_id,question_key' });

    // Mirror to dossier_question_responses so the drip selector knows
    // it's been answered. Only when the DB catalog is the source of truth
    // (current.id present) — fallback questions don't have a question_id
    // to bind to.
    if (current.id) {
      await supabase.from('dossier_question_responses').insert({
        user_id: user.id,
        question_id: current.id,
        question_key: current.key,
        delivered_at: new Date().toISOString(),
        answered_at: new Date().toISOString(),
        response_text: trimmed,
        source: 'catchup',
      });
    }
    setSaving(false);
    if (error) {
      console.error('[MommyDossierQuiz] save failed:', error.message);
      return false;
    }
    setAnswers(prev => ({ ...prev, [current.key]: trimmed }));
    return true;
  }, [user?.id, current, draft]);

  const next = useCallback(async () => {
    const ok = await save();
    if (!ok) return;
    if (idx < questions.length - 1) setIdx(i => i + 1);
  }, [save, idx, questions.length]);

  const back = useCallback(() => {
    if (idx > 0) setIdx(i => i - 1);
  }, [idx]);

  const skip = useCallback(async () => {
    if (current?.id && user?.id) {
      // Record the skip so the drip selector honors the 14-day cooldown
      // even when the user skips during catch-up.
      await supabase.from('dossier_question_responses').insert({
        user_id: user.id,
        question_id: current.id,
        question_key: current.key,
        skipped: true,
        skip_reason: 'catchup_skip',
        source: 'catchup',
      });
    }
    if (idx < questions.length - 1) setIdx(i => i + 1);
  }, [current, user?.id, idx, questions.length]);

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#8a8690', fontSize: 13 }}>
        Mama's pulling your file, sweet thing…
      </div>
    );
  }

  if (!current) {
    return (
      <div style={{ padding: 32, color: '#c8c4cc', fontSize: 14, lineHeight: 1.6 }}>
        That's all of it, baby. Mama has what she needs. You can close this and come back anytime to update.
      </div>
    );
  }

  const tone = TONE_STYLE[current.tone];
  const isLastQ = idx === questions.length - 1;

  return (
    <div style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: '32px 24px 48px',
      background: tone.bg,
      borderRadius: 16,
      color: '#f0e8ec',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: tone.accent, fontWeight: 700 }}>
          Mama's Dossier · {tone.label}
        </span>
        {onClose && (
          <button onClick={onClose} style={{
            background: 'transparent', color: '#8a8690', border: 'none',
            fontSize: 11, cursor: 'pointer', padding: 4,
          }}>
            close
          </button>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8a8690', marginBottom: 5 }}>
          <span>Question {idx + 1} of {questions.length}</span>
          <span>{completedCount} answered · {questions.length - completedCount} left for Mama</span>
        </div>
        <div style={{ height: 3, background: '#2a1f25', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progress}%`,
            background: tone.accent,
            transition: 'width 240ms ease',
          }} />
        </div>
      </div>

      <div style={{ fontSize: 17, lineHeight: 1.55, color: '#fdf6f9', marginBottom: 12, fontWeight: 500 }}>
        {current.prompt}
      </div>
      {current.placeholder && (
        <div style={{ fontSize: 12, color: '#8a8690', marginBottom: 18, fontStyle: 'italic', lineHeight: 1.5 }}>
          {current.placeholder}
        </div>
      )}

      {current.input === 'long' ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={6}
          style={{
            width: '100%',
            background: '#0f080c',
            color: '#f0e8ec',
            border: `1px solid ${tone.accent}33`,
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 14,
            lineHeight: 1.55,
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
          }}
          placeholder="answer for Mama, baby…"
        />
      ) : (
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          style={{
            width: '100%',
            background: '#0f080c',
            color: '#f0e8ec',
            border: `1px solid ${tone.accent}33`,
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            outline: 'none',
          }}
          placeholder="answer for Mama, baby…"
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, gap: 12 }}>
        <button
          onClick={back}
          disabled={idx === 0}
          style={{
            background: 'transparent',
            color: idx === 0 ? '#3a3035' : '#8a8690',
            border: '1px solid #2a1f25',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 12,
            fontFamily: 'inherit',
            cursor: idx === 0 ? 'default' : 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          ← back
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={skip}
            disabled={isLastQ}
            style={{
              background: 'transparent',
              color: isLastQ ? '#3a3035' : '#8a8690',
              border: '1px solid #2a1f25',
              padding: '8px 14px',
              borderRadius: 6,
              fontSize: 11.5,
              fontFamily: 'inherit',
              cursor: isLastQ ? 'default' : 'pointer',
              textTransform: 'lowercase',
              letterSpacing: '0.04em',
            }}
          >
            skip for now
          </button>
          <button
            onClick={next}
            disabled={saving}
            style={{
              background: tone.accent,
              color: '#1a0e16',
              border: 'none',
              padding: '8px 18px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {saving ? 'saving…' : isLastQ ? 'done for Mama' : 'next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
