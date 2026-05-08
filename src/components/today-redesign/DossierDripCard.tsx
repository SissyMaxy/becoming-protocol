/**
 * DossierDripCard — surfaces a pending dossier_question outreach as a
 * Today card with the appropriate input UI for the question's response
 * kind. Submitting writes both dossier_question_responses (answered) and
 * mommy_dossier (the persistent answer the chat consumer reads), then
 * marks the outreach delivered.
 *
 * Skipping marks the response row skipped; the selector won't surface
 * the same question for 14 days.
 *
 * Hides itself when no pending dossier outreach exists for the user.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';

type ResponseKind = 'text' | 'single_choice' | 'multi_choice' | 'numeric' | 'yes_no';

interface PendingDossier {
  outreachId: string;
  responseId: string;
  questionId: string;
  questionKey: string;
  category: string;
  questionText: string;
  placeholder: string | null;
  responseKind: ResponseKind;
  choices: Array<{ value: string; label: string }> | null;
  importance: number;
  tone: 'soft' | 'direct' | 'filthy';
  inputLength: 'short' | 'long';
}

const TONE_ACCENT: Record<PendingDossier['tone'], string> = {
  soft: '#f4a8c4',
  direct: '#e09275',
  filthy: '#c75d8a',
};

export function DossierDripCard() {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [pending, setPending] = useState<PendingDossier | null>(null);
  const [draft, setDraft] = useState('');
  const [choiceDraft, setChoiceDraft] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id || !mommy) {
      setPending(null);
      return;
    }
    const { data: rows } = await supabase
      .from('dossier_question_responses')
      .select(`
        id, question_id, question_key, outreach_id,
        dossier_questions!inner(
          id, category, question_text, placeholder,
          expected_response_kind, choices, importance, tone, input_length
        )
      `)
      .eq('user_id', user.id)
      .is('answered_at', null)
      .eq('skipped', false)
      .not('outreach_id', 'is', null)
      .not('delivered_at', 'is', null)
      .order('delivered_at', { ascending: true })
      .limit(1);
    type Row = {
      id: string;
      question_id: string;
      question_key: string;
      outreach_id: string;
      dossier_questions: {
        id: string;
        category: string;
        question_text: string;
        placeholder: string | null;
        expected_response_kind: ResponseKind;
        choices: Array<{ value: string; label: string }> | null;
        importance: number;
        tone: 'soft' | 'direct' | 'filthy';
        input_length: 'short' | 'long';
      };
    };
    // PostgREST embeds the related row(s) at `dossier_questions`; an
    // !inner join with a one-to-many relationship can be typed as either
    // an object or array. Normalize via unknown.
    const raw = (rows ?? [])[0] as unknown as
      | (Omit<Row, 'dossier_questions'> & {
          dossier_questions: Row['dossier_questions'] | Row['dossier_questions'][];
        })
      | undefined;
    if (!raw) {
      setPending(null);
      return;
    }
    const dq = Array.isArray(raw.dossier_questions)
      ? raw.dossier_questions[0]
      : raw.dossier_questions;
    if (!dq) {
      setPending(null);
      return;
    }
    setPending({
      outreachId: raw.outreach_id,
      responseId: raw.id,
      questionId: raw.question_id,
      questionKey: raw.question_key,
      category: dq.category,
      questionText: dq.question_text,
      placeholder: dq.placeholder,
      responseKind: dq.expected_response_kind,
      choices: dq.choices,
      importance: dq.importance,
      tone: dq.tone,
      inputLength: dq.input_length,
    });
    setDraft('');
    setChoiceDraft([]);
  }, [user?.id, mommy]);

  useEffect(() => { load(); }, [load]);

  const ackOutreach = useCallback(async (outreachId: string) => {
    await supabase.from('handler_outreach_queue')
      .update({ delivered_at: new Date().toISOString(), status: 'delivered' })
      .eq('id', outreachId);
  }, []);

  const submit = useCallback(async () => {
    if (!user?.id || !pending) return;
    setSubmitting(true);
    try {
      const responseText = pending.responseKind === 'multi_choice' || pending.responseKind === 'single_choice'
        ? choiceDraft.join(', ')
        : draft.trim();
      if (!responseText) return;

      await supabase.from('dossier_question_responses')
        .update({
          answered_at: new Date().toISOString(),
          response_text: responseText,
          response_choices: choiceDraft.length > 0 ? choiceDraft : null,
        })
        .eq('id', pending.responseId);

      await supabase.from('mommy_dossier').upsert({
        user_id: user.id,
        question_key: pending.questionKey,
        category: pending.category,
        answer: responseText,
        importance: pending.importance,
        source: 'quiz',
        active: true,
      }, { onConflict: 'user_id,question_key' });

      await ackOutreach(pending.outreachId);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'dossier_answered', id: pending.responseId } }));
      await load();
    } finally {
      setSubmitting(false);
    }
  }, [user?.id, pending, draft, choiceDraft, ackOutreach, load]);

  const skip = useCallback(async () => {
    if (!user?.id || !pending) return;
    setSubmitting(true);
    try {
      await supabase.from('dossier_question_responses')
        .update({ skipped: true, skip_reason: 'today_card_skip' })
        .eq('id', pending.responseId);
      await ackOutreach(pending.outreachId);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'dossier_skipped', id: pending.responseId } }));
      await load();
    } finally {
      setSubmitting(false);
    }
  }, [user?.id, pending, ackOutreach, load]);

  const accent = useMemo(() => (pending ? TONE_ACCENT[pending.tone] : '#f4a8c4'), [pending]);

  if (!mommy || !pending) return null;

  const renderInput = () => {
    if (pending.responseKind === 'yes_no') {
      return (
        <div style={{ display: 'flex', gap: 8 }}>
          {['yes', 'no'].map(v => (
            <button
              key={v}
              onClick={() => setDraft(v)}
              style={{
                flex: 1,
                background: draft === v ? accent : 'transparent',
                color: draft === v ? '#1a0e16' : '#c8c4cc',
                border: `1px solid ${accent}55`,
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      );
    }
    if (pending.responseKind === 'numeric') {
      return (
        <input
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="number for Mama"
          style={inputStyle(accent)}
        />
      );
    }
    if (pending.responseKind === 'single_choice' && pending.choices) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {pending.choices.map(c => (
            <button
              key={c.value}
              onClick={() => setChoiceDraft([c.value])}
              style={{
                background: choiceDraft.includes(c.value) ? `${accent}33` : 'transparent',
                color: '#c8c4cc',
                border: `1px solid ${accent}55`,
                borderRadius: 6,
                padding: '8px 12px',
                textAlign: 'left',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      );
    }
    if (pending.responseKind === 'multi_choice' && pending.choices) {
      const toggle = (v: string) =>
        setChoiceDraft(curr => curr.includes(v) ? curr.filter(x => x !== v) : [...curr, v]);
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {pending.choices.map(c => (
            <button
              key={c.value}
              onClick={() => toggle(c.value)}
              style={{
                background: choiceDraft.includes(c.value) ? `${accent}33` : 'transparent',
                color: '#c8c4cc',
                border: `1px solid ${accent}55`,
                borderRadius: 6,
                padding: '6px 10px',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      );
    }
    if (pending.inputLength === 'long') {
      return (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={5}
          style={{ ...inputStyle(accent), resize: 'vertical', lineHeight: 1.5 }}
          placeholder="answer for Mama, baby…"
        />
      );
    }
    return (
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder="answer for Mama, baby…"
        style={inputStyle(accent)}
      />
    );
  };

  const canSubmit =
    !submitting && (
      pending.responseKind === 'multi_choice' || pending.responseKind === 'single_choice'
        ? choiceDraft.length > 0
        : draft.trim().length > 0
    );

  return (
    <div style={{
      background: 'linear-gradient(140deg, #2a1825 0%, #1f0e1a 100%)',
      border: `1px solid ${accent}33`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: accent, fontWeight: 700 }}>
          Mama wants to know
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto' }}>
          {pending.category.replace(/_/g, ' ')}
        </span>
      </div>
      <div style={{ fontSize: 14, color: '#fdf6f9', lineHeight: 1.5, marginBottom: 10, fontWeight: 500 }}>
        {pending.questionText}
      </div>
      {pending.placeholder && (
        <div style={{ fontSize: 11, color: '#8a8690', fontStyle: 'italic', marginBottom: 10, lineHeight: 1.5 }}>
          {pending.placeholder}
        </div>
      )}
      <div style={{ marginBottom: 10 }}>
        {renderInput()}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        <button
          onClick={skip}
          disabled={submitting}
          style={{
            background: 'transparent',
            color: '#8a8690',
            border: '1px solid #2a1f25',
            padding: '6px 12px',
            borderRadius: 5,
            fontSize: 11,
            cursor: submitting ? 'default' : 'pointer',
            fontFamily: 'inherit',
            textTransform: 'lowercase',
            letterSpacing: '0.04em',
          }}
        >
          skip for now
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          style={{
            background: canSubmit ? accent : '#3a3035',
            color: canSubmit ? '#1a0e16' : '#6a656e',
            border: 'none',
            padding: '6px 14px',
            borderRadius: 5,
            fontSize: 11,
            fontWeight: 700,
            cursor: canSubmit ? 'pointer' : 'default',
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {submitting ? 'saving…' : 'tell mama →'}
        </button>
      </div>
    </div>
  );
}

function inputStyle(accent: string): CSSProperties {
  return {
    width: '100%',
    background: '#0f080c',
    color: '#f0e8ec',
    border: `1px solid ${accent}33`,
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  };
}
