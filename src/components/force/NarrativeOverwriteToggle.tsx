/**
 * Narrative Overwrite toggle
 *
 * Lets Maxy flip narrative_overwrite_active on/off. When turning ON,
 * queues a backfill of recent journal/timeline/shame entries.
 */

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { invalidateOverwriteCache } from '../../lib/force/narrative-surface';

interface Props {
  userId: string;
  active: boolean;
  onChange: () => void;
}

export function NarrativeOverwriteToggle({ userId, active, onChange }: Props) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const newActive = !active;
      await supabase
        .from('user_state')
        .update({
          narrative_overwrite_active: newActive,
          narrative_overwrite_since: newActive ? new Date().toISOString() : null,
        })
        .eq('user_id', userId);
      invalidateOverwriteCache();

      if (newActive) {
        // Queue backfill — dynamic import to avoid loading this into main bundle
        try {
          const { enableOverwrite } = await import('../../lib/force/narrative-overwrite');
          await enableOverwrite(userId, 50);
        } catch (err) {
          console.error('[Overwrite] backfill queue failed:', err);
        }
      }
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-lg border border-protocol-border bg-protocol-surface">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-pink-400" />
        <span className="text-sm font-medium">Narrative overwrite</span>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded ${active ? 'bg-pink-900/40 text-pink-300' : 'bg-gray-800 text-gray-500'}`}>
          {active ? 'ACTIVE' : 'off'}
        </span>
      </div>
      <div className="text-xs text-protocol-text-muted mb-3">
        When on, your journal / timeline / photo captions display Maxy's reading of them by default. Originals are preserved one tap deep in the audit view.
      </div>
      <button
        onClick={toggle}
        disabled={busy}
        className={`w-full py-2 rounded-lg text-sm font-medium ${
          active
            ? 'bg-gray-800 border border-protocol-border text-gray-300 hover:bg-gray-700'
            : 'bg-pink-600 text-white hover:bg-pink-700'
        } disabled:opacity-50`}
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            {active ? 'Disabling' : 'Enabling + backfilling'}
          </span>
        ) : active ? (
          'Disable (originals become default)'
        ) : (
          'Enable (Maxy reads your past)'
        )}
      </button>
    </div>
  );
}
