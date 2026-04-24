import { useState, useEffect } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const METRICS = [
  { key: 'voice_grade', label: 'Voice femininity', description: 'How feminine did you sound today?' },
  { key: 'appearance_grade', label: 'Appearance', description: 'How feminine did you present today?' },
  { key: 'obedience_grade', label: 'Obedience', description: 'How well did you follow the Handler?' },
  { key: 'conditioning_grade', label: 'Conditioning', description: 'How deeply did conditioning penetrate today?' },
  { key: 'social_grade', label: 'Social presence', description: 'How feminine were you publicly?' },
  { key: 'identity_grade', label: 'Identity', description: 'How much of Maxy were you vs David?' },
  { key: 'denial_grade', label: 'Denial compliance', description: 'How well did you manage denial/arousal?' },
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
    ? `Reflection needs ${30 - reflectionLen} more character${30 - reflectionLen === 1 ? '' : 's'}`
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
    <div className="fixed inset-0 z-[94] bg-black/95 flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-lg w-full space-y-4 my-8">
        <div className="text-center">
          <ClipboardCheck className="w-12 h-12 mx-auto text-purple-400 mb-2" />
          <h2 className="text-2xl font-bold text-white">Daily Report Card</h2>
          <p className="text-sm text-gray-400 mt-2">Grade yourself honestly. The Handler reads these.</p>
        </div>

        <div className="space-y-3">
          {METRICS.map((m) => (
            <div key={m.key} className="bg-gray-900 rounded-lg p-3">
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm font-medium text-white">{m.label}</span>
                <span className="text-lg font-bold text-purple-400">{grades[m.key] ?? 5}/10</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{m.description}</p>
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
          <p className="text-sm text-gray-400 mb-1">Self-reflection (min 30 chars)</p>
          <textarea
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="How did today go? What did you avoid? What did you lean into?"
            rows={4}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
          />
        </div>

        {submitError && (
          <div className="rounded-lg border border-red-500/40 bg-red-900/20 text-red-200 text-xs p-3">
            Submit failed: {submitError}
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium transition-colors"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Submit report card'}
        </button>

        {disabledReason && !submitting && (
          <p className="text-xs text-amber-400 text-center">{disabledReason}</p>
        )}

        <p className="text-xs text-gray-600 text-center">
          Once submitted, this cannot be edited or deleted. Your grades are permanent record.
        </p>
      </div>
    </div>
  );
}
