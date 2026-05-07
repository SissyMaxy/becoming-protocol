/**
 * Persona / Identity settings.
 *
 * Currently exposes:
 *   - Gaslight intensity selector (off / gentle / firm / cruel) — opt-in
 *     in-fantasy distortion layer for the Dommy Mommy persona.
 *   - Meta-frame reveal button — non-negotiable. Returns the truth diff
 *     for the last 24h, snaps intensity back to off for 24h.
 *   - One-time onboarding card the first time the user picks anything
 *     above 'off'.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Eye, ShieldOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import { supabase } from '../../lib/supabase';
import type { GaslightIntensity } from '../../lib/persona/distortion';

type Intensity = GaslightIntensity;

interface IntensityCopy {
  id: Intensity;
  label: string;
  description: string;
}

const INTENSITY_OPTIONS: IntensityCopy[] = [
  {
    id: 'off',
    label: 'Off',
    description: 'Mama always tells you exactly what you said and felt. Default.',
  },
  {
    id: 'gentle',
    label: 'Gentle',
    description: 'Rare, shallow misremembering — mostly tense shifts and small severity bumps.',
  },
  {
    id: 'firm',
    label: 'Firm',
    description: 'Routine misremembering — fabricated context, inflated counts, occasional unsaid promises.',
  },
  {
    id: 'cruel',
    label: 'Cruel',
    description: 'Frequent and obvious distortion — heavy fabrication, merged quotes, retroactive mood rewrites.',
  },
];

interface DistortionEntry {
  id: string;
  original: string;
  distorted: string;
  type: string;
  surface: string;
  intensity: string;
  affect: string | null;
  when: string;
  plain_summary: string;
}

interface RevealResponse {
  ok: boolean;
  trigger: string;
  intensity_at_break: string;
  cooldown_until: string;
  distortion_count: number;
  distortions: DistortionEntry[];
  notice: string;
}

export function PersonaSettings() {
  const { user, session } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [intensity, setIntensity] = useState<Intensity>('off');
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  const [ackAt, setAckAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState<Intensity | null>(null);
  const [reveal, setReveal] = useState<RevealResponse | null>(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const { data } = await supabase
        .from('user_state')
        .select('gaslight_intensity, gaslight_cooldown_until, gaslight_onboarding_ack_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setIntensity((data.gaslight_intensity as Intensity) ?? 'off');
        setCooldownUntil((data.gaslight_cooldown_until as string) ?? null);
        setAckAt((data.gaslight_onboarding_ack_at as string) ?? null);
      }
      setLoading(false);
    })();
  }, [user?.id]);

  const inCooldown = cooldownUntil ? new Date(cooldownUntil) > new Date() : false;
  const cooldownText = cooldownUntil && inCooldown
    ? `Locked off until ${new Date(cooldownUntil).toLocaleString()}`
    : null;

  const handlePick = async (next: Intensity) => {
    if (!user?.id || saving) return;
    if (inCooldown && next !== 'off') return;

    // First time picking anything above off → show onboarding
    if (next !== 'off' && !ackAt) {
      setShowOnboarding(next);
      return;
    }
    await persist(next);
  };

  const persist = async (next: Intensity) => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('user_state')
      .update({ gaslight_intensity: next })
      .eq('user_id', user.id);
    if (!error) setIntensity(next);
    setSaving(false);
  };

  const acknowledgeAndApply = async () => {
    if (!user?.id || !showOnboarding) return;
    setSaving(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('user_state')
      .update({
        gaslight_intensity: showOnboarding,
        gaslight_onboarding_ack_at: nowIso,
      })
      .eq('user_id', user.id);
    if (!error) {
      setIntensity(showOnboarding);
      setAckAt(nowIso);
    }
    setSaving(false);
    setShowOnboarding(null);
  };

  const triggerReveal = async () => {
    if (!session?.access_token || revealing) return;
    setRevealing(true);
    try {
      const r = await fetch('/api/handler/meta-frame-reveal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ trigger: 'settings_button' }),
      });
      if (r.ok) {
        const data = (await r.json()) as RevealResponse;
        setReveal(data);
        setIntensity('off');
        setCooldownUntil(data.cooldown_until);
      }
    } finally {
      setRevealing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 flex items-center justify-center text-sm opacity-70">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading persona settings…
      </div>
    );
  }

  const cardCls = isBambiMode
    ? 'bg-pink-50 border-pink-200'
    : 'bg-protocol-surface border-protocol-border';
  const headingCls = isBambiMode ? 'text-pink-700' : 'text-protocol-text';
  const mutedCls = isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted';

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-sm font-medium mb-3 ${mutedCls}`}>Mama's memory</h2>
        <div className={`rounded-xl border p-4 space-y-4 ${cardCls}`}>
          <div className="space-y-2">
            <p className={`text-sm ${headingCls}`}>
              Mama may misremember on purpose
            </p>
            <p className={`text-xs leading-relaxed ${mutedCls}`}>
              When this is on, Mama can surface your own past confessions with deliberate inaccuracies — tense shifts,
              severity bumps, fabricated context, retroactive mood rewrites. This is in-fantasy kink content. Default off.
              You can pull the truth out at any time using the button below or your safeword in chat.
            </p>
          </div>

          {cooldownText && (
            <div className={`text-xs rounded-md px-3 py-2 flex items-start gap-2 ${
              isBambiMode ? 'bg-amber-100 text-amber-800' : 'bg-amber-900/20 text-amber-300'
            }`}>
              <ShieldOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Cooldown active. {cooldownText}.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {INTENSITY_OPTIONS.map(opt => {
              const active = intensity === opt.id;
              const disabled = saving || (inCooldown && opt.id !== 'off');
              return (
                <button
                  key={opt.id}
                  onClick={() => handlePick(opt.id)}
                  disabled={disabled}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    active
                      ? isBambiMode
                        ? 'border-pink-400 bg-pink-100'
                        : 'border-protocol-accent bg-protocol-accent/10'
                      : isBambiMode
                        ? 'border-pink-200 bg-white hover:border-pink-300'
                        : 'border-protocol-border bg-protocol-surface-light hover:border-protocol-accent/30'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <p className={`text-sm font-medium ${active ? headingCls : mutedCls}`}>{opt.label}</p>
                  <p className={`text-xs mt-1 ${mutedCls} opacity-80`}>{opt.description}</p>
                </button>
              );
            })}
          </div>

          <button
            onClick={triggerReveal}
            disabled={revealing}
            className={`w-full p-3 rounded-lg border text-left flex items-center gap-3 ${
              isBambiMode
                ? 'border-pink-300 bg-white hover:bg-pink-50'
                : 'border-protocol-border bg-protocol-surface-light hover:border-protocol-accent/30'
            } ${revealing ? 'opacity-60' : ''}`}
          >
            <Eye className="w-4 h-4 shrink-0" />
            <div className="flex-1">
              <p className={`text-sm font-medium ${headingCls}`}>
                {revealing ? 'Pulling the truth…' : 'Show me the truth'}
              </p>
              <p className={`text-xs ${mutedCls}`}>
                Returns every distortion in the last 24 hours, with the actual stored text. Snaps intensity back to off for 24 hours.
              </p>
            </div>
          </button>

          {reveal && (
            <div className={`rounded-lg border p-3 space-y-3 ${
              isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-surface-light border-protocol-border'
            }`}>
              <div className="flex items-start gap-2">
                <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${mutedCls}`} />
                <p className={`text-xs leading-relaxed ${headingCls}`}>{reveal.notice}</p>
              </div>
              {reveal.distortions.map(d => (
                <div key={d.id} className={`text-xs space-y-1 border-t pt-2 ${
                  isBambiMode ? 'border-pink-100' : 'border-protocol-border'
                }`}>
                  <p className={`uppercase tracking-wide ${mutedCls}`}>
                    {d.type} · {d.surface} · {new Date(d.when).toLocaleString()}
                  </p>
                  <p className={mutedCls}><strong>What Mama said:</strong> {d.distorted}</p>
                  <p className={mutedCls}><strong>What you actually wrote:</strong> {d.original}</p>
                  <p className={`italic ${mutedCls}`}>{d.plain_summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showOnboarding && (
        <OnboardingCard
          intensity={showOnboarding}
          onCancel={() => setShowOnboarding(null)}
          onAcknowledge={acknowledgeAndApply}
          isBambiMode={isBambiMode}
          saving={saving}
        />
      )}
    </div>
  );
}

function OnboardingCard({ intensity, onCancel, onAcknowledge, isBambiMode, saving }: {
  intensity: Intensity;
  onCancel: () => void;
  onAcknowledge: () => void;
  isBambiMode: boolean;
  saving: boolean;
}) {
  const cardCls = isBambiMode
    ? 'bg-white border-pink-300'
    : 'bg-protocol-surface border-protocol-accent/40';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`max-w-md w-full rounded-xl border p-5 space-y-4 ${cardCls}`}>
        <h3 className={`text-base font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Before turning on “{intensity}”
        </h3>
        <ul className={`text-sm space-y-2 leading-relaxed ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          <li>Mama may misremember things on purpose. This is part of the experience.</li>
          <li>You can pull the truth at any time from this settings panel, or by using your safeword in chat.</li>
          <li>The reveal will reset intensity to off for 24 hours.</li>
          <li>Mama never distorts settings, billing, login, the safeword, medical, legal, or financial claims.</li>
        </ul>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              isBambiMode ? 'bg-pink-100 text-pink-700' : 'bg-protocol-surface-light text-protocol-text'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={onAcknowledge}
            disabled={saving}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white'
            } disabled:opacity-50`}
          >
            {saving ? 'Saving…' : 'I understand — turn it on'}
          </button>
        </div>
      </div>
    </div>
  );
}
