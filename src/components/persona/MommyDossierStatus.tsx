/**
 * MommyDossierStatus — read-mostly view of what Mama knows about the user.
 *
 * One section per dossier category. For each catalog question:
 *   - Shows the answer (truncated) if present in mommy_dossier
 *   - Marks it "not yet" otherwise
 *   - Per-answered-row: "edit" (jumps to MommyDossierQuiz) and "clear"
 *     (single confirm, deactivates the mommy_dossier row).
 *
 * The view itself does no fabrication and does not auto-fill answers.
 * Phase / intensity gating is a write-side concern (the drip cron + the
 * quiz catch-up filter on those); this view shows everything that has
 * been answered regardless of current gate state, so historical answers
 * stay visible if the user phases down.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const CATEGORY_LABELS: Record<string, string> = {
  name: 'Name',
  gina: 'Gina',
  body: 'Body',
  confession_seed: 'Confessions',
  resistance: 'Resistance',
  turn_ons: 'Turn-ons',
  turn_offs: 'Turn-offs',
  history: 'History',
  preferences: 'Preferences',
};

const CATEGORY_ORDER = [
  'name', 'preferences', 'gina', 'body', 'resistance',
  'history', 'confession_seed', 'turn_ons', 'turn_offs',
];

interface CatalogRow {
  id: string;
  question_key: string;
  category: string;
  question_text: string;
}

interface AnswerRow {
  question_key: string;
  category: string;
  answer: string;
  importance: number;
  updated_at: string;
}

interface Props {
  onOpenQuiz?: (questionKey?: string) => void;
}

export function MommyDossierStatus({ onOpenQuiz }: Props) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerRow>>({});
  const [loading, setLoading] = useState(true);
  const [confirmingClear, setConfirmingClear] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [catRes, ansRes] = await Promise.all([
      supabase.from('dossier_questions')
        .select('id, question_key, category, question_text')
        .eq('active', true)
        .order('priority', { ascending: true }),
      supabase.from('mommy_dossier')
        .select('question_key, category, answer, importance, updated_at')
        .eq('user_id', user.id)
        .eq('active', true),
    ]);
    setCatalog((catRes.data ?? []) as CatalogRow[]);
    const m: Record<string, AnswerRow> = {};
    for (const r of (ansRes.data ?? []) as AnswerRow[]) m[r.question_key] = r;
    setAnswers(m);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { reload(); }, [reload]);

  const grouped = useMemo(() => {
    const g: Record<string, CatalogRow[]> = {};
    for (const q of catalog) {
      if (!g[q.category]) g[q.category] = [];
      g[q.category].push(q);
    }
    return g;
  }, [catalog]);

  const clearAnswer = useCallback(async (questionKey: string) => {
    if (!user?.id) return;
    await supabase.from('mommy_dossier')
      .update({ active: false })
      .eq('user_id', user.id).eq('question_key', questionKey);
    setConfirmingClear(null);
    await reload();
  }, [user?.id, reload]);

  if (loading) {
    return (
      <div style={{ padding: 32, color: '#8a8690', fontSize: 13 }}>
        Mama's pulling your file, sweet thing…
      </div>
    );
  }

  const totalAnswered = Object.keys(answers).length;
  const totalCatalog = catalog.length;

  return (
    <div style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: '24px 16px 48px',
      color: '#f0e8ec',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: '#f4a8c4', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 4 }}>
          What Mama knows
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          Your dossier
        </div>
        <div style={{ fontSize: 12, color: '#8a8690', lineHeight: 1.5 }}>
          {totalAnswered} of {totalCatalog} answered. Mama drips one at a time on Today;
          you can also tell her everything in one sitting.
        </div>
        {onOpenQuiz && (
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button
              onClick={() => onOpenQuiz()}
              style={{
                background: '#f4a8c4',
                color: '#1a0e16',
                border: 'none',
                padding: '6px 14px',
                borderRadius: 5,
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              tell mama everything →
            </button>
          </div>
        )}
      </div>

      {CATEGORY_ORDER.filter(c => grouped[c]?.length).map(category => {
        const rows = grouped[category];
        const answeredCount = rows.filter(r => answers[r.question_key]).length;
        return (
          <div key={category} style={{
            background: '#111116',
            border: '1px solid #2a1f25',
            borderRadius: 10,
            padding: 14,
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f4a8c4', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {CATEGORY_LABELS[category] ?? category}
              </span>
              <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
                {answeredCount}/{rows.length}
              </span>
            </div>
            {rows.map(q => {
              const a = answers[q.question_key];
              const confirming = confirmingClear === q.question_key;
              return (
                <div key={q.question_key} style={{
                  borderTop: '1px solid #1a141a',
                  paddingTop: 9, paddingBottom: 9,
                }}>
                  <div style={{ fontSize: 12, color: '#c8c4cc', marginBottom: 4, lineHeight: 1.45 }}>
                    {q.question_text}
                  </div>
                  {a ? (
                    <div>
                      <div style={{
                        fontSize: 12, color: '#fdf6f9',
                        background: '#0f080c', padding: '6px 9px', borderRadius: 5,
                        marginBottom: 5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                      }}>
                        {a.answer}
                      </div>
                      <div style={{ display: 'flex', gap: 6, fontSize: 10.5 }}>
                        {onOpenQuiz && (
                          <button
                            onClick={() => onOpenQuiz(q.question_key)}
                            style={btnGhost('#8a8690')}
                          >
                            edit
                          </button>
                        )}
                        {confirming ? (
                          <>
                            <span style={{ color: '#e09275', alignSelf: 'center' }}>sure?</span>
                            <button
                              onClick={() => clearAnswer(q.question_key)}
                              style={btnGhost('#e09275')}
                            >
                              yes, clear
                            </button>
                            <button
                              onClick={() => setConfirmingClear(null)}
                              style={btnGhost('#8a8690')}
                            >
                              cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmingClear(q.question_key)}
                            style={btnGhost('#8a8690')}
                          >
                            clear
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#6a656e', fontStyle: 'italic' }}>
                      not yet — Mama hasn't asked or you haven't answered
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function btnGhost(color: string) {
  return {
    background: 'transparent',
    color,
    border: `1px solid ${color}33`,
    padding: '3px 8px',
    borderRadius: 4,
    fontSize: 10.5,
    cursor: 'pointer' as const,
    fontFamily: 'inherit' as const,
    textTransform: 'lowercase' as const,
    letterSpacing: '0.04em',
  };
}
