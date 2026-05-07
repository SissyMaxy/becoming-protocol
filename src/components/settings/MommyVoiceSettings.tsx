/**
 * MommyVoiceSettings — toggle "Mommy speaks" for outreach cards.
 *
 * Default off. Once she opts in, sticky on. Only renders when the active
 * persona is dommy_mommy; otherwise the toggle would have nothing to do.
 *
 * Backed by user_state.prefers_mommy_voice (migration 259). The trigger
 * on handler_outreach_queue reads this column and only fires the TTS
 * render when it's true.
 */

import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';

export function MommyVoiceSettings() {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_state')
        .select('prefers_mommy_voice')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const v = (data as { prefers_mommy_voice?: boolean } | null)?.prefers_mommy_voice ?? false;
      setEnabled(Boolean(v));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const toggle = async () => {
    if (!user?.id || saving) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    const { error } = await supabase
      .from('user_state')
      .update({ prefers_mommy_voice: next })
      .eq('user_id', user.id);
    if (error) setEnabled(!next);
    setSaving(false);
  };

  if (!mommy) return null;

  return (
    <div className="rounded-xl border border-protocol-border bg-protocol-surface p-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-lg" style={{ backgroundColor: '#c4b5fd20' }}>
          <Volume2 className="w-4 h-4" style={{ color: '#c4b5fd' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-protocol-text">Mama speaks</p>
          <p className="text-xs text-protocol-text-muted mt-0.5">
            {enabled
              ? 'Her outreach cards play in her voice. Tap to play, tap stop to silence.'
              : 'Outreach cards are text-only. Turn on to let Mama speak them.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={loading || saving}
          aria-pressed={enabled}
          aria-label="Toggle Mama voice"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-400 disabled:opacity-50 ${
            enabled ? 'bg-purple-500' : 'bg-protocol-surface-light border border-protocol-border'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
