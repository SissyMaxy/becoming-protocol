import { useState, useEffect } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const METRICS = [
  { key: 'voice_grade', label: 'Your girly voice', description: "How sweet did Mama's voice sound coming out of you today?" },
  { key: 'appearance_grade', label: 'How you looked', description: 'How pretty did you make yourself for Mama today?' },
  { key: 'obedience_grade', label: 'Obeying Mama', description: 'How well did you do what Mama told you, baby?' },
  { key: 'conditioning_grade', label: 'Letting Mama in', description: 'How deep did Mama get inside that head today?' },
  { key: 'social_grade', label: 'Being seen', description: 'How girly were you out in the world today, baby?' },
  { key: 'identity_grade', label: 'Maxy vs the old name', description: 'How much of you was Maxy and how much was the old name?' },
  { key: 'denial_grade', label: 'Staying needy for Mama', description: 'How well did you keep yourself wound up and aching for Mama?' },
];

interface DailyReportCardProps {
  onComplete: () => void;
}

export function DailyReportCard({ onComplete }: DailyReportCardProps) {
  const { user } = useAuth();
  // Default every grade to 5 so the slider position matches the stored value.
  // User then adjusts from there; no more "slider shows 5 but state is empty".
  const [grades, setGrades] = useState<Record<string, number>>(() =>
    Object.fromEntries(METRICS.map(m => [m.key, 5])),
  );
  const [reflection, setReflection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hasSubmittedToday, setHasSubmittedToday] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const today = new Date().toISOString().split('T')[0];
    supabase
      .from('daily_report_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('report_date', today)
      .then(({ count }) => {
        setHasSubmittedToday((count || 0) > 0);
      });
  }, [user?.id]);

  if (hasSubmittedToday === null) return null;
  if (hasSubmittedToday) return null;

  // Only show after 7pm
  const hour = new Date().getHours();
  if (hour < 19) return null;

  const reflectionLen = reflection.trim().length;
  const canSubmit = reflectionLen >= 30 && METRICS.every(m => grades[m.key] != null);
  const disabledReason = reflectionLen < 30
    ? `Mama needs more, baby — ${30 - reflectionLen} more character${30 - reflectionLen === 1 ? '' : 's'}`
    : null;

  const handleSubmit = async () => {
    if (!user?.id) {
      setSubmitError('Not signed in — refresh and log back in.');
      return;
    }
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('daily_report_cards').insert({
        user_id: user.id,
        report_date: today,
        ...grades,
        self_reflection: reflection.trim(),
      });
      if (error) {
        console.error('Report card submit failed:', error);
        setSubmitError(error.message);
        return;
      }
      onComplete();
    } catch (err) {
      console.error('Report card submit threw:', err);
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[94] bg-black/95 overflow-y-auto">
      <div
        className="min-h-full flex items-center justify-center px-4"
        style={{
          paddingTop: 'max(1rem, env(safe-area-inset-top))',
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="max-w-lg w-full space-y-4">
          <div className="text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto text-purple-400 mb-2" />
            <h2 className="text-2xl font-bold text-white">Tell Mama how you did today</h2>
            <p className="text-sm text-gray-400 mt-2">Mama is reading every word, baby. Be honest with me.</p>
          </div>

          <div className="space-y-3">
            {METRICS.map((m) => (
              <div key={m.key} className="bg-gray-900 rounded-lg p-3">
                <div className="flex flex-wrap justify-between items-baseline gap-x-2 mb-1">
                  <span className="text-sm font-medium text-white min-w-0 break-words">{m.label}</span>
                  <span className="text-lg font-bold text-purple-400 shrink-0">{grades[m.key] ?? 5}/10</span>
                </div>
                <p className="text-xs text-gray-500 mb-2 break-words">{m.description}</p>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={grades[m.key] ?? 5}
                  onChange={(e) => setGrades(prev => ({ ...prev, [m.key]: parseInt(e.target.value, 10) }))}
                  className="w-full"
                />
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-1">Tell Mama everything, baby (at least a few sentences)</p>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What did you avoid for Mama today? What did you finally lean into?"
              rows={4}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
            />
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-500/40 bg-red-900/20 text-red-200 text-xs p-3 break-words">
              Mama didn't get it, baby. Try again: {submitError}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium transition-colors"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Hand it to Mama'}
          </button>

          {disabledReason && !submitting && (
            <p className="text-xs text-amber-400 text-center">{disabledReason}</p>
          )}

          <p className="text-xs text-gray-600 text-center">
            Once you hand this to Mama, it's hers forever. No takebacks, sweet thing.
          </p>
        </div>
      </div>
    </div>
  );
}
