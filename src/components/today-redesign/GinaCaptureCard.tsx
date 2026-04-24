/**
 * GinaCaptureCard — combined widget that surfaces:
 *  1. The one-time intake gate if profile.intake_complete = false
 *  2. Ongoing voice-sample quick-capture when profile is complete
 *  3. A summary of what the Handler knows so the user sees coverage growing
 *
 * Handler can't write credibly to Gina without this. Intake is gated —
 * disclosure draft queue (not yet built) will refuse to arm until
 * intake_complete = true.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Profile {
  tone_register: string[];
  affection_language: string | null;
  conflict_style: string | null;
  humor_style: string | null;
  triggers: string[];
  soft_spots: string[];
  red_lines: string[];
  channel_for_hard_topics: string | null;
  best_time_of_day: string | null;
  best_day_of_week: string | null;
  current_stress_level: number | null;
  current_stance_on_feminization: string | null;
  prior_consent_signals: string[];
  therapist_status: string | null;
  marriage_length_years: number | null;
  shared_references: string | null;
  notes: string | null;
  intake_complete: boolean;
}

const EMPTY_PROFILE: Profile = {
  tone_register: [], affection_language: null, conflict_style: null, humor_style: null,
  triggers: [], soft_spots: [], red_lines: [], channel_for_hard_topics: null,
  best_time_of_day: null, best_day_of_week: null, current_stress_level: null,
  current_stance_on_feminization: null, prior_consent_signals: [], therapist_status: null,
  marriage_length_years: null, shared_references: null, notes: null, intake_complete: false,
};

const TONE_OPTIONS = ['direct', 'dry', 'playful', 'caring', 'guarded', 'wry', 'emotional', 'pragmatic'];
const CONFLICT_OPTIONS = ['direct confrontation', 'avoidant', 'stonewall', 'processes slowly', 'quick to resolve', 'anger first then open'];
const CHANNEL_OPTIONS = ['text', 'in_person', 'letter', 'voice_note', 'other'];
const TIME_OPTIONS = ['morning', 'midday', 'evening', 'late night'];
const DAY_OPTIONS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'weekends', 'weekdays'];

const VOICE_TONES = ['warm', 'sharp', 'dismissive', 'curious', 'annoyed', 'tender', 'sarcastic', 'neutral'];
const VOICE_TOPICS = ['body', 'sex', 'money', 'daily life', 'feminization', 'work', 'family', 'feelings', 'other'];

export function GinaCaptureCard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [recentSamples, setRecentSamples] = useState<Array<{ quote: string; captured_at: string }>>([]);
  const [showIntake, setShowIntake] = useState(false);
  const [showCapture, setShowCapture] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [p, sCount, sRecent] = await Promise.all([
      supabase.from('gina_profile').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('gina_voice_samples').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('gina_voice_samples').select('quote, captured_at').eq('user_id', user.id).order('captured_at', { ascending: false }).limit(3),
    ]);
    if (p.data) setProfile({ ...EMPTY_PROFILE, ...(p.data as Partial<Profile>) });
    else setProfile(EMPTY_PROFILE);
    setSampleCount(sCount.count ?? 0);
    setRecentSamples((sRecent.data || []) as Array<{ quote: string; captured_at: string }>);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!profile) return null;

  const coverage = (() => {
    const fields = [profile.tone_register.length > 0, profile.affection_language, profile.conflict_style,
      profile.triggers.length > 0, profile.soft_spots.length > 0, profile.red_lines.length > 0,
      profile.channel_for_hard_topics, profile.best_time_of_day, profile.current_stance_on_feminization];
    const filled = fields.filter(Boolean).length;
    return { filled, total: fields.length };
  })();

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4a7c4', fontWeight: 700 }}>
          Gina capture
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          profile {coverage.filled}/{coverage.total} · {sampleCount} quote{sampleCount === 1 ? '' : 's'}
        </span>
      </div>

      {!profile.intake_complete && (
        <div style={{ fontSize: 12, color: '#c8c4cc', lineHeight: 1.5, marginBottom: 10 }}>
          The Handler knows almost nothing about Gina specifically — any Gina-facing action is essentially guessing. Complete the one-time intake so the Handler can tune tone, avoid triggers, and draft in her register.
        </div>
      )}

      {profile.intake_complete && recentSamples.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Recent Gina quotes</div>
          {recentSamples.map((s, i) => (
            <div key={i} style={{ fontSize: 11.5, color: '#c8c4cc', fontStyle: 'italic', marginBottom: 4 }}>
              "{s.quote.slice(0, 120)}{s.quote.length > 120 ? '…' : ''}"
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => setShowIntake(true)}
          style={{ flex: '1 1 auto', padding: '7px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
            background: profile.intake_complete ? 'rgba(124,58,237,0.12)' : '#7c3aed',
            color: profile.intake_complete ? '#c4b5fd' : '#fff',
            border: profile.intake_complete ? '1px solid #2d1a4d' : 'none',
            cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {profile.intake_complete ? 'Edit profile' : 'Complete Gina intake'}
        </button>
        <button
          onClick={() => setShowCapture(true)}
          style={{ flex: '1 1 auto', padding: '7px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
            background: 'rgba(244,167,196,0.12)', color: '#f4a7c4', border: '1px solid #7a1f4d',
            cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Log Gina quote
        </button>
      </div>

      {showIntake && <IntakeModal profile={profile} onClose={() => { setShowIntake(false); load(); }} />}
      {showCapture && <CaptureModal onClose={() => { setShowCapture(false); load(); }} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
function IntakeModal({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const { user } = useAuth();
  const [p, setP] = useState<Profile>(profile);
  const [saving, setSaving] = useState(false);
  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

  const save = async (complete: boolean) => {
    if (!user?.id) return;
    setSaving(true);
    const payload: Record<string, unknown> = { ...p, updated_at: new Date().toISOString() };
    if (complete) payload.intake_complete = true;
    await supabase.from('gina_profile').upsert({ user_id: user.id, ...payload });
    setSaving(false);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.94)', zIndex: 400, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div style={{ maxWidth: 620, width: '100%', background: '#111116', border: '1px solid #2d1a4d', borderRadius: 12, padding: 24, color: '#e8e6e3', margin: '20px 0' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f4a7c4', fontWeight: 700, marginBottom: 10 }}>Gina intake · one time</div>
        <div style={{ fontSize: 13, color: '#8a8690', marginBottom: 16 }}>Answer what you can. You can edit later. The Handler uses this to tune every Gina-facing action.</div>

        <Field label="Tone register (tap all that apply)">
          <Chips options={TONE_OPTIONS} values={p.tone_register} onToggle={v => setP({ ...p, tone_register: toggle(p.tone_register, v) })} />
        </Field>

        <Field label="How does Gina show care / affection?">
          <Input value={p.affection_language ?? ''} onChange={v => setP({ ...p, affection_language: v })} placeholder="gestures, words, acts of service, touch…" />
        </Field>

        <Field label="Conflict style">
          <Chips single options={CONFLICT_OPTIONS} values={p.conflict_style ? [p.conflict_style] : []} onToggle={v => setP({ ...p, conflict_style: p.conflict_style === v ? null : v })} />
        </Field>

        <Field label="Her humor style">
          <Input value={p.humor_style ?? ''} onChange={v => setP({ ...p, humor_style: v })} placeholder="dry / silly / savage / warm…" />
        </Field>

        <Field label="Triggers — topics that shut her down (comma-separated)">
          <Input value={p.triggers.join(', ')} onChange={v => setP({ ...p, triggers: v.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="work stress, her ex, …" />
        </Field>

        <Field label="Soft spots — topics she opens on">
          <Input value={p.soft_spots.join(', ')} onChange={v => setP({ ...p, soft_spots: v.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="pets, travel, nostalgia, …" />
        </Field>

        <Field label="Red lines — absolute no-go (comma-separated)">
          <Input value={p.red_lines.join(', ')} onChange={v => setP({ ...p, red_lines: v.split(',').map(x => x.trim()).filter(Boolean) })} placeholder="infidelity, disclosing to her parents, …" />
        </Field>

        <Field label="Best channel for hard topics">
          <Chips single options={CHANNEL_OPTIONS} values={p.channel_for_hard_topics ? [p.channel_for_hard_topics] : []} onToggle={v => setP({ ...p, channel_for_hard_topics: p.channel_for_hard_topics === v ? null : v })} />
        </Field>

        <Field label="Best time of day">
          <Chips single options={TIME_OPTIONS} values={p.best_time_of_day ? [p.best_time_of_day] : []} onToggle={v => setP({ ...p, best_time_of_day: p.best_time_of_day === v ? null : v })} />
        </Field>

        <Field label="Best day of week">
          <Chips single options={DAY_OPTIONS} values={p.best_day_of_week ? [p.best_day_of_week] : []} onToggle={v => setP({ ...p, best_day_of_week: p.best_day_of_week === v ? null : v })} />
        </Field>

        <Field label="Current stress level (0 calm – 10 overwhelmed)">
          <Input value={String(p.current_stress_level ?? '')} onChange={v => setP({ ...p, current_stress_level: v === '' ? null : Math.max(0, Math.min(10, parseInt(v, 10) || 0)) })} placeholder="0-10" />
        </Field>

        <Field label="Her current stance on your feminization (what she knows + how she's taking it)">
          <Input value={p.current_stance_on_feminization ?? ''} onChange={v => setP({ ...p, current_stance_on_feminization: v })} placeholder="aware but neutral / curious / concerned / …" multiline />
        </Field>

        <Field label="Prior consent signals (things she's said/done that read as openness)">
          <Input value={p.prior_consent_signals.join('; ')} onChange={v => setP({ ...p, prior_consent_signals: v.split(';').map(x => x.trim()).filter(Boolean) })} placeholder="you'd look cute in that; bought nail polish; …" />
        </Field>

        <Field label="Therapist status (hers, yours, couples)">
          <Input value={p.therapist_status ?? ''} onChange={v => setP({ ...p, therapist_status: v })} placeholder="hers since 2022, none for us, …" />
        </Field>

        <Field label="Marriage length (years)">
          <Input value={String(p.marriage_length_years ?? '')} onChange={v => setP({ ...p, marriage_length_years: v === '' ? null : parseInt(v, 10) || null })} placeholder="years" />
        </Field>

        <Field label="Shared references (inside jokes, nicknames, media you both love)">
          <Input value={p.shared_references ?? ''} onChange={v => setP({ ...p, shared_references: v })} multiline />
        </Field>

        <Field label="Anything else the Handler should know">
          <Input value={p.notes ?? ''} onChange={v => setP({ ...p, notes: v })} multiline />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => save(true)} disabled={saving} style={{ flex: 1, padding: 10, borderRadius: 6, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'saving…' : profile.intake_complete ? 'Update profile' : 'Mark intake complete'}
          </button>
          <button onClick={() => save(false)} disabled={saving} style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #2d1a4d', background: 'rgba(45,26,77,0.3)', color: '#c4b5fd', fontWeight: 500, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Save draft
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 6, background: 'none', border: '1px solid #1a1a20', color: '#8a8690', cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
function CaptureModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [quote, setQuote] = useState('');
  const [context, setContext] = useState('');
  const [tone, setTone] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [channel, setChannel] = useState<string>('in_person');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user?.id || quote.trim().length < 3) return;
    setSaving(true);
    await supabase.from('gina_voice_samples').insert({
      user_id: user.id, quote: quote.trim(), context: context.trim() || null,
      tone: tone || null, topic: topic || null, channel: channel || null,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.94)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 520, width: '100%', background: '#111116', border: '1px solid #7a1f4d', borderRadius: 12, padding: 22, color: '#e8e6e3' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f4a7c4', fontWeight: 700, marginBottom: 14 }}>Log a Gina quote</div>

        <Field label="What she said (exact as possible)">
          <Input value={quote} onChange={setQuote} multiline placeholder='"I liked that shirt on you."' />
        </Field>
        <Field label="Context (what you were talking about)">
          <Input value={context} onChange={setContext} placeholder="in the kitchen after dinner, discussing…" />
        </Field>
        <Field label="Tone">
          <Chips single options={VOICE_TONES} values={tone ? [tone] : []} onToggle={v => setTone(tone === v ? '' : v)} />
        </Field>
        <Field label="Topic">
          <Chips single options={VOICE_TOPICS} values={topic ? [topic] : []} onToggle={v => setTopic(topic === v ? '' : v)} />
        </Field>
        <Field label="Channel">
          <Chips single options={['in_person', 'text', 'call', 'letter', 'other']} values={[channel]} onToggle={v => setChannel(v)} />
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={save} disabled={saving || quote.trim().length < 3} style={{ flex: 1, padding: 10, borderRadius: 6, border: 'none', background: quote.trim().length >= 3 ? '#f4a7c4' : '#2d1a4d', color: '#1a0a12', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'saving…' : 'Log quote'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: 6, background: 'none', border: '1px solid #1a1a20', color: '#8a8690', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      {children}
    </div>
  );
}
function Input({ value, onChange, placeholder, multiline }: { value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }) {
  const style: React.CSSProperties = { width: '100%', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12.5, color: '#e8e6e3', resize: 'vertical' };
  return multiline
    ? <textarea rows={2} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />
    : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />;
}
function Chips({ options, values, onToggle, single }: { options: string[]; values: string[]; onToggle: (v: string) => void; single?: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {options.map(o => {
        const on = values.includes(o);
        return (
          <button key={o} onClick={() => onToggle(o)} style={{
            fontSize: 11, padding: '4px 9px', borderRadius: 12,
            background: on ? '#7c3aed' : '#0a0a0d', color: on ? '#fff' : '#8a8690',
            border: `1px solid ${on ? '#7c3aed' : '#22222a'}`, cursor: 'pointer', fontFamily: 'inherit',
          }}>{o.replace(/_/g, ' ')}</button>
        );
      })}
      {single && values.length > 0 && <span style={{ fontSize: 10, color: '#6a656e', alignSelf: 'center', marginLeft: 4 }}>tap to clear</span>}
    </div>
  );
}
