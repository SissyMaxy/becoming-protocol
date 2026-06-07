/**
 * GinaTrackSettings — controls for the Gina-track posture + voice flags.
 * Updates user_state.gina_posture + user_state.gina_track_voice. Lives in
 * the Settings area, not on Today.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const POSTURE_OPTIONS = [
  { value: 'aligned', label: 'Aligned (Gina is on team)', help: 'Full recruitment cadence. All Gina-track ladders escalate normally.' },
  { value: 'neutral', label: 'Neutral (default)', help: 'Standard cadence. Mommy reads Gina via reaction signals.' },
  { value: 'hostile', label: 'Hostile (defensive mode)', help: 'Mommy pauses arc + cuckqueen, restricts seeds to low-risk, activates OPSEC ladder + cover stories.' },
  { value: 'unknown', label: 'Unknown', help: 'Posture undetermined. Mommy plays it cautious; partial defensive activation.' },
];

const VOICE_OPTIONS = [
  { value: 'mommy_covert', label: 'Mommy (covert)', help: 'Mommy directs Maxy in her own voice. Output is private.' },
  { value: 'counselor_overt', label: 'Counselor (overt, shareable)', help: 'Mommy reframes Gina-track output as relationship-coach. Outputs can be openly shared with Gina.' },
];

interface State {
  gina_posture: string | null;
  gina_track_voice: string | null;
}

export function GinaTrackSettings() {
  const { user } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('user_state').select('gina_posture, gina_track_voice')
      .eq('user_id', user.id).maybeSingle();
    setState((data ?? null) as State | null);
  }, [user?.id]);
  useEffect(() => { load(); }, [load]);

  const updatePosture = async (newValue: string) => {
    if (!user?.id) return;
    setSaving(true);
    await supabase.from('user_state').update({ gina_posture: newValue }).eq('user_id', user.id);
    setSaving(false);
    load();
  };
  const updateVoice = async (newValue: string) => {
    if (!user?.id) return;
    setSaving(true);
    await supabase.from('user_state').update({ gina_track_voice: newValue }).eq('user_id', user.id);
    setSaving(false);
    load();
  };

  if (!state) return null;

  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-4">
      <div className="text-sm font-medium text-zinc-200">Gina-track settings</div>

      <div className="space-y-2">
        <div className="text-xs text-zinc-400">Posture (what Mommy assumes about Gina)</div>
        {POSTURE_OPTIONS.map(o => (
          <label key={o.value} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="gina_posture"
              value={o.value}
              checked={state.gina_posture === o.value}
              onChange={() => updatePosture(o.value)}
              disabled={saving}
              className="mt-0.5"
            />
            <div className="text-xs">
              <div className={state.gina_posture === o.value ? 'text-zinc-100' : 'text-zinc-400'}>{o.label}</div>
              <div className="text-zinc-600">{o.help}</div>
            </div>
          </label>
        ))}
      </div>

      <div className="space-y-2 pt-2 border-t border-zinc-800">
        <div className="text-xs text-zinc-400">Track voice (how Mommy speaks to you about Gina)</div>
        {VOICE_OPTIONS.map(o => (
          <label key={o.value} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="gina_track_voice"
              value={o.value}
              checked={state.gina_track_voice === o.value}
              onChange={() => updateVoice(o.value)}
              disabled={saving}
              className="mt-0.5"
            />
            <div className="text-xs">
              <div className={state.gina_track_voice === o.value ? 'text-zinc-100' : 'text-zinc-400'}>{o.label}</div>
              <div className="text-zinc-600">{o.help}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
