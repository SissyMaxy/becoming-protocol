/**
 * LettersSettings — toggles for the letters archive feature.
 *
 *   1. "Save letters from Mama" — master switch on user_state.letters_archive_enabled.
 *      Default ON once the user has chosen a feminine name (per spec); the dossier
 *      check enforces that — if no feminine name is set, the toggle is forced off
 *      and disabled until they pick one.
 *
 *   2. "Read letters aloud automatically" — controls user_state.letters_autoplay_voice.
 *      Default OFF; only auto-plays TTS when opening a letter if this is on.
 */

import { useEffect, useState } from 'react';
import { Mail, Volume2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export function LettersSettings() {
  const { user } = useAuth();
  const [archiveEnabled, setArchiveEnabled] = useState<boolean | null>(null);
  const [autoplay, setAutoplay] = useState<boolean | null>(null);
  const [hasFeminineName, setHasFeminineName] = useState<boolean | null>(null);
  const [saving, setSaving] = useState<'archive' | 'autoplay' | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [stateRes, dossierRes] = await Promise.all([
        supabase.from('user_state')
          .select('letters_archive_enabled, letters_autoplay_voice')
          .eq('user_id', user.id).maybeSingle(),
        supabase.from('mommy_dossier')
          .select('answer_text')
          .eq('user_id', user.id)
          .eq('question_key', 'feminine_name_chosen')
          .eq('active', true)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const s = stateRes.data as { letters_archive_enabled?: boolean; letters_autoplay_voice?: boolean } | null;
      setArchiveEnabled(s?.letters_archive_enabled ?? true);
      setAutoplay(s?.letters_autoplay_voice ?? false);
      const answer = (dossierRes.data as { answer_text?: string } | null)?.answer_text || '';
      // Treat any non-empty, non-deferred answer as "has chosen a feminine name."
      const deferred = /still\s+(figuring|deciding|choosing)|haven['’]?t|protocol\s+(to\s+)?choose|don['’]?t know|no idea/i;
      setHasFeminineName(answer.trim().length > 0 && !deferred.test(answer));
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const update = async (col: 'letters_archive_enabled' | 'letters_autoplay_voice', value: boolean) => {
    if (!user?.id) return;
    setSaving(col === 'letters_archive_enabled' ? 'archive' : 'autoplay');
    try {
      await supabase.from('user_state').update({ [col]: value }).eq('user_id', user.id);
      if (col === 'letters_archive_enabled') setArchiveEnabled(value);
      if (col === 'letters_autoplay_voice') setAutoplay(value);
    } finally {
      setSaving(null);
    }
  };

  if (archiveEnabled === null || autoplay === null || hasFeminineName === null) {
    return <div className="text-xs text-gray-500">Loading…</div>;
  }

  // Per spec: archive defaults ON only after a feminine name is set; otherwise
  // off and disabled. We show the toggle either way for clarity.
  const archiveDisabled = !hasFeminineName;
  const effectiveArchive = archiveDisabled ? false : archiveEnabled;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-protocol-border bg-protocol-surface p-4">
        <div className="flex items-start gap-3">
          <Mail className="w-4 h-4 mt-0.5 text-[#c4956a]" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-200">
                Save letters from Mama
              </span>
              <Toggle
                value={effectiveArchive}
                disabled={archiveDisabled}
                saving={saving === 'archive'}
                onChange={v => update('letters_archive_enabled', v)}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {archiveDisabled
                ? 'Pick a feminine name in the dossier first — letters need a name to be addressed to.'
                : 'Praise + bedtime + acknowledged recall get filed in your letters archive.'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-protocol-border bg-protocol-surface p-4">
        <div className="flex items-start gap-3">
          <Volume2 className="w-4 h-4 mt-0.5 text-[#c4956a]" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-200">
                Read letters aloud by default
              </span>
              <Toggle
                value={autoplay}
                saving={saving === 'autoplay'}
                onChange={v => update('letters_autoplay_voice', v)}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Opens auto-play TTS when you tap a letter. Off by default — voice is opt-in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ToggleProps {
  value: boolean;
  disabled?: boolean;
  saving?: boolean;
  onChange: (v: boolean) => void;
}

function Toggle({ value, disabled, saving, onChange }: ToggleProps) {
  return (
    <button
      onClick={() => !disabled && !saving && onChange(!value)}
      disabled={disabled || saving}
      style={{
        width: 38, height: 22, borderRadius: 11,
        background: value ? '#5c0a1e' : '#2a2a30',
        border: '1px solid ' + (value ? '#c4956a' : '#444'),
        position: 'relative', transition: 'all 120ms ease',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled || saving ? 'not-allowed' : 'pointer',
      }}
    >
      {saving ? (
        <Loader2 size={11} style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)', color: '#c4956a',
          animation: 'spin 1s linear infinite',
        }} />
      ) : (
        <span style={{
          position: 'absolute', top: 2,
          left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: value ? '#c4956a' : '#888',
          transition: 'left 120ms ease',
        }} />
      )}
    </button>
  );
}
