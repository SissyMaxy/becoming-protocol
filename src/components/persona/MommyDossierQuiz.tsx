/**
 * MommyDossierQuiz — single-question-at-a-time form that fills in the
 * mommy_dossier table. Answers feed mommy-scheme + chat reply.
 *
 * Design:
 *  - One question on screen, FocusMode-style
 *  - Progress bar showing N of M
 *  - Skip / Back / Save-and-continue
 *  - Loads existing answers on mount; user can revisit + edit
 *  - Saves on every answer, not just at end (no "lost progress" risk)
 *  - Mama-voice headers matching question tone (soft / direct / filthy)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { DOSSIER_QUESTIONS, type DossierQuestion } from '../../lib/persona/mommy-dossier-questions';

interface AnswerRow {
  question_key: string;
  answer: string;
}

const TONE_STYLE: Record<DossierQuestion['tone'], { accent: string; bg: string; label: string }> = {
  soft:   { accent: '#f4a8c4', bg: 'linear-gradient(140deg, #2a1825 0%, #1f0e1a 100%)', label: 'Mama is asking sweetly' },
  direct: { accent: '#e09275', bg: 'linear-gradient(140deg, #2a1f15 0%, #1e1410 100%)', label: 'Mama needs you direct' },
  filthy: { accent: '#c75d8a', bg: 'linear-gradient(140deg, #2a0f1f 0%, #1a0814 100%)', label: 'Mama wants the truth, baby' },
};

export function MommyDossierQuiz({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const questions = DOSSIER_QUESTIONS;
  const current: DossierQuestion | undefined = questions[idx];
  const progress = questions.length === 0 ? 0 : ((idx + 1) / questions.length) * 100;
  const completedCount = useMemo(
    () => questions.filter(q => (answers[q.key] || '').trim().length > 0).length,
    [questions, answers],
  );

  // Load existing answers
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('mommy_dossier')
        .select('question_key, answer')
        .eq('user_id', user.id)
        .eq('active', true);
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const r of (data || []) as AnswerRow[]) {
        map[r.question_key] = r.answer;
      }
      setAnswers(map);
      // Auto-jump to first unanswered
      const firstUnanswered = questions.findIndex(q => !(map[q.key] || '').trim());
      const startIdx = firstUnanswered === -1 ? 0 : firstUnanswered;
      setIdx(startIdx);
      setDraft(map[questions[startIdx]?.key] || '');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, questions]);

  // Re-load draft when question changes
  useEffect(() => {
    if (!current) return;
    setDraft(answers[current.key] || '');
  }, [idx, current, answers]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!user?.id || !current) return false;
    const trimmed = draft.trim();
    if (!trimmed) return true; // skip-as-empty is fine
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

  const skip = useCallback(() => {
    if (idx < questions.length - 1) setIdx(i => i + 1);
  }, [idx, questions.length]);

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
      {/* Header + close */}
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

      {/* Progress */}
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

      {/* Question prompt */}
      <div style={{ fontSize: 17, lineHeight: 1.55, color: '#fdf6f9', marginBottom: 12, fontWeight: 500 }}>
        {current.prompt}
      </div>
      {current.placeholder && (
        <div style={{ fontSize: 12, color: '#8a8690', marginBottom: 18, fontStyle: 'italic', lineHeight: 1.5 }}>
          {current.placeholder}
        </div>
      )}

      {/* Answer input */}
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

      {/* Action row */}
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
