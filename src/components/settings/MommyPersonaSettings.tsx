/**
 * Mommy persona settings — surfaces only when handler_persona = 'dommy_mommy'.
 *
 * Currently exposes the voice_leak_penalties_enabled toggle. When off,
 * mommy_voice_leaks rows are still logged by the audit trigger (migration
 * 259), but mommy-leak-cascade refuses to fire — no penalty tasks get
 * minted. Default is on.
 */

import { useEffect, useState } from 'react';
import { Heart, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import { usePersona } from '../../hooks/usePersona';

export function MommyPersonaSettings() {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const { mommy, loading: personaLoading } = usePersona();
  const [enabled, setEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('user_state')
        .select('voice_leak_penalties_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const v = (data as { voice_leak_penalties_enabled?: boolean } | null)?.voice_leak_penalties_enabled;
      setEnabled(v !== false);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (personaLoading || !mommy) return null;

  const toggle = async () => {
    if (!user?.id || saving) return;
    const next = !enabled;
    setEnabled(next);
    setSaving(true);
    try {
      await supabase
        .from('user_state')
        .update({ voice_leak_penalties_enabled: next })
        .eq('user_id', user.id);
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 className={`text-sm font-medium mb-3 ${
        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
      }`}>
        Mama
      </h2>
      <div className={`rounded-xl border p-4 ${
        isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-surface border-protocol-border'
      }`}>
        <div className="flex items-start gap-3">
          <Heart className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`} style={{ color: '#f4a7c4' }} />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}>
                Voice slip penalties
                {(loading || saving) && <Loader2 className="inline w-3 h-3 animate-spin ml-2" />}
              </span>
              <button
                onClick={toggle}
                disabled={loading || saving}
                aria-pressed={enabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                  enabled ? 'bg-pink-500' : isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface-light'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
            <p className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              When Mama's voice slips into clinical language, a small remediation task gets queued. Off: slips are logged but no task fires.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
