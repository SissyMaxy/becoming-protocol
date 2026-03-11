/**
 * PreCommitmentCard — Handler-prescribed task for capturing commitments during high arousal.
 * The commitment gets quoted back during post-release lockout.
 */

import { useState } from 'react';
import { Lock, Check } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useUserState } from '../../hooks/useUserState';
import { recordPreCommitment } from '../../lib/post-release-engine';
import { supabase } from '../../lib/supabase';

interface PreCommitmentCardProps {
  onComplete?: () => void;
}

export function PreCommitmentCard({ onComplete }: PreCommitmentCardProps) {
  const { isBambiMode } = useBambiMode();
  const { userState } = useUserState();
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const arousalLevel = userState?.currentArousal ?? 0;
  const canSubmit = text.trim().length >= 10 && !isSaving;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await recordPreCommitment(user.id, text.trim(), arousalLevel);

      // Update last_pre_commitment_at on user_state
      await supabase
        .from('user_state')
        .update({
          last_pre_commitment_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);

      setSaved(true);
      onComplete?.();
    } catch (err) {
      console.error('[PreCommitment] Failed to save:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (saved) {
    return (
      <div className={`rounded-2xl p-5 ${
        isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-full ${
            isBambiMode ? 'bg-emerald-100' : 'bg-emerald-500/10'
          }`}>
            <Check className={`w-4 h-4 ${
              isBambiMode ? 'text-emerald-600' : 'text-emerald-400'
            }`} />
          </div>
          <span className={`text-sm font-medium ${
            isBambiMode ? 'text-emerald-700' : 'text-emerald-400'
          }`}>
            Locked
          </span>
        </div>
        <p className={`text-xs ${
          isBambiMode ? 'text-pink-400' : 'text-white/30'
        }`}>
          She'll see this when she needs it.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-5 ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-full ${
          isBambiMode ? 'bg-pink-100' : 'bg-indigo-500/10'
        }`}>
          <Lock className={`w-4 h-4 ${
            isBambiMode ? 'text-pink-600' : 'text-indigo-400'
          }`} />
        </div>
        <span className={`text-sm font-semibold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          Pre-Commitment
        </span>
      </div>

      {/* Handler prompt */}
      <p className={`text-sm italic mb-4 ${
        isBambiMode ? 'text-pink-500' : 'text-white/50'
      }`}>
        "You know what's coming tonight. Before it happens — commit."
      </p>

      {/* Textarea */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="I won't delete anything. I won't..."
        rows={3}
        className={`w-full rounded-lg px-3 py-2 text-sm resize-none mb-3 ${
          isBambiMode
            ? 'bg-white border border-pink-200 text-pink-700 placeholder:text-pink-300'
            : 'bg-white/5 border border-white/10 text-white/80 placeholder:text-white/20'
        }`}
      />

      {/* Arousal indicator */}
      <div className="flex items-center gap-2 mb-4">
        <span className={`text-xs ${
          isBambiMode ? 'text-pink-400' : 'text-white/30'
        }`}>
          Current arousal:
        </span>
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((level) => (
            <div
              key={level}
              className={`w-2.5 h-2.5 rounded-full ${
                level <= arousalLevel
                  ? isBambiMode ? 'bg-pink-500' : 'bg-indigo-400'
                  : isBambiMode ? 'bg-pink-200' : 'bg-white/10'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
          canSubmit
            ? isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30'
            : isBambiMode
              ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
              : 'bg-white/5 border border-white/5 text-white/20 cursor-not-allowed'
        }`}
      >
        {isSaving ? 'Locking...' : 'Commit'}
      </button>

      <p className={`text-xs text-center mt-2 ${
        isBambiMode ? 'text-pink-300' : 'text-white/20'
      }`}>
        This will be shown to you after release.
      </p>
    </div>
  );
}
