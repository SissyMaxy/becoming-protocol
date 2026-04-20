/**
 * Hard Mode Controls
 *
 * Manual toggle for Hard Mode state. Entering Hard Mode auto-creates a
 * de-escalation task (same as the cron). Exiting requires confirmation because
 * it bypasses the normal exit flow.
 */

import { useState } from 'react';
import { Flame, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  userId: string;
  active: boolean;
  onChange: () => void;
}

export function HardModeControls({ userId, active, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);

  const enter = async () => {
    setBusy(true);
    try {
      await supabase
        .from('user_state')
        .update({
          hard_mode_active: true,
          hard_mode_entered_at: new Date().toISOString(),
          hard_mode_reason: 'Manual entry by Maxy',
        })
        .eq('user_id', userId);
      await supabase.from('hard_mode_transitions').insert({
        user_id: userId,
        transition: 'entered',
        reason: 'Manual entry',
      });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const exit = async () => {
    setBusy(true);
    try {
      await supabase
        .from('user_state')
        .update({
          hard_mode_active: false,
          hard_mode_exit_task_id: null,
        })
        .eq('user_id', userId);
      await supabase.from('hard_mode_transitions').insert({
        user_id: userId,
        transition: 'exited',
        reason: 'Manual exit (override)',
      });
      setConfirmExit(false);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    return (
      <div className="p-3 rounded-lg border border-red-500/30 bg-red-950/10 space-y-2">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-red-400" />
          <span className="text-sm font-medium">Hard Mode override</span>
        </div>
        <div className="text-xs text-gray-400">
          Manually exit bypasses the de-escalation task. Transition is still logged.
        </div>
        {confirmExit ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmExit(false)}
              className="flex-1 py-2 rounded bg-gray-800 text-gray-300 text-xs"
            >
              Cancel
            </button>
            <button
              onClick={exit}
              disabled={busy}
              className="flex-1 py-2 rounded bg-red-600 text-white text-xs font-semibold flex items-center justify-center gap-1 disabled:bg-gray-700"
            >
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm exit'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmExit(true)}
            className="w-full py-2 rounded bg-gray-800 border border-red-500/30 text-red-300 text-xs flex items-center justify-center gap-1"
          >
            <AlertTriangle className="w-3 h-3" />
            Override exit (without de-escalation task)
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={enter}
      disabled={busy}
      className="w-full p-2 rounded-lg border border-dashed border-red-500/30 bg-red-950/10 text-red-300/70 text-xs flex items-center justify-center gap-1 hover:bg-red-950/20 disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : (
        <>
          <Flame className="w-3 h-3" />
          Manual Hard Mode entry
        </>
      )}
    </button>
  );
}
