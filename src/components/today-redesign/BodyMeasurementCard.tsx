/**
 * BodyMeasurementCard — weekly mandatory body measurement capture.
 *
 * Handler demands waist, hips, chest, weight every Sunday. Cron creates a
 * commitment with 48h deadline if none logged in past 7 days. This card is
 * the capture surface — paste the numbers, submit, Handler sees the delta
 * in context next turn.
 *
 * Also shows a compact trendline of last 8 weeks so Maxy can see progress.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Measurement {
  id: string;
  measured_at: string;
  weight_kg: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  chest_cm: number | null;
  thigh_cm: number | null;
  neck_cm: number | null;
}

const TARGETS = { waist_cm: 76, hips_cm: 95, chest_cm: 95 };

export function BodyMeasurementCard() {
  const { user } = useAuth();
  const [history, setHistory] = useState<Measurement[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    weight_kg: '', waist_cm: '', hips_cm: '', chest_cm: '', thigh_cm: '', neck_cm: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('body_measurements')
      .select('id, measured_at, weight_kg, waist_cm, hips_cm, chest_cm, thigh_cm, neck_cm')
      .eq('user_id', user.id)
      .order('measured_at', { ascending: false })
      .limit(8);
    setHistory((data || []) as Measurement[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!user?.id) return;
    setSubmitting(true);
    const parse = (v: string) => v.trim() === '' ? null : parseFloat(v);
    const payload = {
      user_id: user.id,
      weight_kg: parse(form.weight_kg),
      waist_cm: parse(form.waist_cm),
      hips_cm: parse(form.hips_cm),
      chest_cm: parse(form.chest_cm),
      thigh_cm: parse(form.thigh_cm),
      neck_cm: parse(form.neck_cm),
      notes: form.notes.trim() || null,
    };
    // Require at least one measurement
    const anyPresent = [payload.weight_kg, payload.waist_cm, payload.hips_cm, payload.chest_cm, payload.thigh_cm, payload.neck_cm].some(v => v != null);
    if (!anyPresent) { setSubmitting(false); return; }

    await supabase.from('body_measurements').insert(payload);

    // Fulfill any pending weekly measurement commitment
    await supabase.from('handler_commitments')
      .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfillment_note: 'Measurements logged via BodyMeasurementCard' })
      .eq('user_id', user.id)
      .eq('category', 'body_proof')
      .eq('status', 'pending')
      .ilike('what', '%measurement%');

    setForm({ weight_kg: '', waist_cm: '', hips_cm: '', chest_cm: '', thigh_cm: '', neck_cm: '', notes: '' });
    setShowForm(false);
    setSubmitting(false);
    load();
  };

  const latest = history[0];
  const previous = history[1];
  const ageDays = latest ? Math.floor((Date.now() - new Date(latest.measured_at).getTime()) / 86400000) : null;
  const isStale = ageDays == null || ageDays >= 7;

  const delta = (key: keyof Measurement): string | null => {
    if (!latest || !previous) return null;
    const a = latest[key] as number | null;
    const b = previous[key] as number | null;
    if (a == null || b == null) return null;
    const d = a - b;
    if (Math.abs(d) < 0.1) return '—';
    return `${d > 0 ? '+' : ''}${d.toFixed(1)}`;
  };

  const progressToTarget = (value: number | null | undefined, target: number): string | null => {
    if (value == null) return null;
    const diff = value - target;
    if (Math.abs(diff) < 0.5) return 'at target';
    return diff > 0 ? `${diff.toFixed(1)} from target` : `${Math.abs(diff).toFixed(1)} past target`;
  };

  return (
    <div style={{
      background: isStale ? 'linear-gradient(92deg, #2a1f0a 0%, #1f1608 100%)' : '#111116',
      border: `1px solid ${isStale ? '#7a5a1f' : '#2d1a4d'}`,
      borderRadius: 10, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isStale ? '#f4c272' : '#c4b5fd'} strokeWidth="1.8">
          <path d="M3 6h18M3 12h18M3 18h18" /><circle cx="7" cy="6" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="17" cy="18" r="1" fill="currentColor"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: isStale ? '#f4c272' : '#c4b5fd', fontWeight: 700 }}>
          Body measurements
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {latest ? `${ageDays}d ago` : 'none logged'}
        </span>
      </div>

      {history.length >= 2 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>trend · last {history.length} entries</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            <Sparkline label="weight" values={history.map(h => h.weight_kg).filter((v): v is number => v != null).reverse()} directionColor="#c4b5fd" />
            <Sparkline label="waist" values={history.map(h => h.waist_cm).filter((v): v is number => v != null).reverse()} directionColor="#6ee7b7" invert />
            <Sparkline label="hips" values={history.map(h => h.hips_cm).filter((v): v is number => v != null).reverse()} directionColor="#f4a7c4" />
          </div>
        </div>
      )}

      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
          <MetricPill label="weight" value={latest.weight_kg != null ? `${latest.weight_kg}kg` : '—'} delta={delta('weight_kg')} />
          <MetricPill label="waist" value={latest.waist_cm != null ? `${latest.waist_cm}cm` : '—'} delta={delta('waist_cm')} target={progressToTarget(latest.waist_cm, TARGETS.waist_cm)} />
          <MetricPill label="hips" value={latest.hips_cm != null ? `${latest.hips_cm}cm` : '—'} delta={delta('hips_cm')} target={progressToTarget(latest.hips_cm, TARGETS.hips_cm)} />
          <MetricPill label="chest" value={latest.chest_cm != null ? `${latest.chest_cm}cm` : '—'} delta={delta('chest_cm')} target={progressToTarget(latest.chest_cm, TARGETS.chest_cm)} />
          <MetricPill label="thigh" value={latest.thigh_cm != null ? `${latest.thigh_cm}cm` : '—'} delta={delta('thigh_cm')} />
          <MetricPill label="neck" value={latest.neck_cm != null ? `${latest.neck_cm}cm` : '—'} delta={delta('neck_cm')} />
        </div>
      )}

      {isStale && (
        <div style={{ fontSize: 11.5, color: '#f4c272', marginBottom: 10, lineHeight: 1.5 }}>
          Weekly measurement mandate. {latest ? 'Data is over a week old.' : 'Nothing logged yet.'} Miss the 48h deadline and slip +3 + bleed +$15. Log today or explain the refusal.
        </div>
      )}

      {!showForm ? (
        <button onClick={() => setShowForm(true)} style={{
          width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none',
          background: isStale ? '#7c3aed' : 'rgba(124,58,237,0.15)',
          color: isStale ? '#fff' : '#c4b5fd', fontWeight: 600, fontSize: 11.5, cursor: 'pointer',
          fontFamily: 'inherit',
        }}>
          {latest ? 'Log new measurement' : '+ Log first measurement'}
        </button>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          <Field label="weight (kg)" value={form.weight_kg} onChange={v => setForm({ ...form, weight_kg: v })} placeholder="e.g. 89.5" />
          <Field label="waist (cm)" value={form.waist_cm} onChange={v => setForm({ ...form, waist_cm: v })} placeholder="narrowest" />
          <Field label="hips (cm)" value={form.hips_cm} onChange={v => setForm({ ...form, hips_cm: v })} placeholder="widest" />
          <Field label="chest (cm)" value={form.chest_cm} onChange={v => setForm({ ...form, chest_cm: v })} placeholder="across nipples" />
          <Field label="thigh (cm)" value={form.thigh_cm} onChange={v => setForm({ ...form, thigh_cm: v })} placeholder="widest" />
          <Field label="neck (cm)" value={form.neck_cm} onChange={v => setForm({ ...form, neck_cm: v })} placeholder="middle" />
          <div style={{ gridColumn: '1 / -1' }}>
            <input
              type="text"
              placeholder="notes (optional)"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              style={{ width: '100%', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, padding: '6px 9px', fontSize: 11, color: '#e8e6e3', fontFamily: 'inherit', marginTop: 2 }}
            />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={submit} disabled={submitting} style={{
              flex: 1, padding: '7px 12px', borderRadius: 6, border: 'none',
              background: '#7c3aed', color: '#fff', fontWeight: 600, fontSize: 11.5,
              cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}>{submitting ? 'saving…' : 'Submit'}</button>
            <button onClick={() => setShowForm(false)} style={{
              padding: '7px 12px', borderRadius: 6,
              background: 'none', border: '1px solid #22222a', color: '#8a8690',
              fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricPill({ label, value, delta, target }: { label: string; value: string; delta: string | null; target?: string | null }) {
  const deltaColor = !delta || delta === '—' ? '#6a656e'
    : (delta.startsWith('+') && (label === 'hips' || label === 'chest')) || (delta.startsWith('-') && (label === 'waist' || label === 'weight' || label === 'neck' || label === 'thigh'))
    ? '#6ee7b7' : '#f4a7c4';
  return (
    <div style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6, padding: '6px 9px' }}>
      <div style={{ fontSize: 9, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 13.5, color: '#e8e6e3', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {delta && <div style={{ fontSize: 9.5, color: deltaColor, fontVariantNumeric: 'tabular-nums' }}>{delta}</div>}
      {target && <div style={{ fontSize: 9, color: '#8a8690', marginTop: 1 }}>{target}</div>}
    </div>
  );
}

function Sparkline({ label, values, directionColor, invert }: { label: string; values: number[]; directionColor: string; invert?: boolean }) {
  if (values.length < 2) {
    return (
      <div style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, padding: '5px 7px' }}>
        <div style={{ fontSize: 9, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: 10, color: '#5a555e', fontStyle: 'italic' }}>—</div>
      </div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 80;
  const height = 24;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y.toFixed(1)}`;
  }).join(' ');

  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  // "Good" direction depends on metric: weight/waist shrinking = green, hips growing = green
  const goodDirection = invert ? delta < 0 : delta > 0;
  const sparkColor = Math.abs(delta) < 0.1 ? '#8a8690' : goodDirection ? directionColor : '#f47272';

  return (
    <div style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, padding: '5px 7px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        <span style={{ fontSize: 9, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: 9.5, color: sparkColor, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          {delta > 0 ? '+' : ''}{delta.toFixed(1)}
        </span>
      </div>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <polyline points={points} fill="none" stroke={sparkColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: '#8a8690', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5,
          padding: '6px 9px', fontSize: 11.5, color: '#e8e6e3', fontFamily: 'inherit',
        }}
      />
    </div>
  );
}
