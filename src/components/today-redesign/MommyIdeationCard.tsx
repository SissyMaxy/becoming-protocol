/**
 * MommyIdeationCard — operator visibility on the cross-model ideation panel.
 *
 * Pulls from the SECURITY DEFINER RPC `mommy_ideation_summary` (migration
 * 314) which reads service-role tables (mommy_ideation_log, mommy_code_wishes)
 * without weakening their RLS. Surfaces:
 *   - last run timestamp + per-provider ok/length
 *   - top-3 most-recent judged feature titles (parsed client-side from the
 *     raw judged blob — tolerates parse failures gracefully)
 *   - wish-status counts (queued / in_progress / shipped / rejected) for
 *     panel_ideation-sourced wishes in the last 30 days
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type Provider = 'anthropic' | 'openai' | 'openrouter';

interface ProviderStatus { ok: boolean; length: number; error: string | null; finish: string }
interface PanelSummary {
  anthropic?: ProviderStatus;
  openai?: ProviderStatus;
  openrouter?: ProviderStatus;
  counts?: Record<string, number>;
  judge_summary?: string | null;
  trigger?: string;
}
interface Summary {
  last_run_at: string | null;
  panel_summary: PanelSummary | null;
  judged_raw: string | null;
  wish_counts: Record<string, number>;
  runs_7d: number;
}
interface JudgedFeature {
  title: string;
  category?: string;
  effort?: string;
  panel_converged?: boolean;
}

function parseJudged(raw: string | null): JudgedFeature[] {
  if (!raw) return [];
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const tryParse = (s: string): unknown => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryParse(cleaned);
  if (!parsed) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) parsed = tryParse(m[0]);
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const features = (parsed as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features.slice(0, 3).map(f => {
    const r = f as Record<string, unknown>;
    return {
      title: String(r.title ?? '(untitled)'),
      category: typeof r.category === 'string' ? r.category : undefined,
      effort: typeof r.effort === 'string' ? r.effort : undefined,
      panel_converged: r.panel_converged === true,
    };
  });
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3600_000);
  if (hours < 1) return `${Math.floor(ms / 60_000)}m ago`;
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MommyIdeationCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('mommy_ideation_summary');
      if (!error && data) setSummary(data as Summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !summary) {
    return (
      <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 12, marginBottom: 16, color: '#8a8690', fontSize: 11 }}>
        Reading mommy ideation panel…
      </div>
    );
  }
  if (!summary) return null;

  const features = parseJudged(summary.judged_raw);
  const counts = summary.wish_counts ?? {};
  const shipped = counts.shipped ?? 0;
  const queued = counts.queued ?? 0;
  const inProgress = counts.in_progress ?? 0;
  const rejected = counts.rejected ?? 0;

  const ps = summary.panel_summary ?? {};
  const providerOk = (p: Provider) => (ps[p]?.ok === true);

  const allOk = providerOk('anthropic') && providerOk('openai') && providerOk('openrouter');
  const someOk = providerOk('anthropic') || providerOk('openai') || providerOk('openrouter');

  const tone = !summary.last_run_at
    ? { bg: 'linear-gradient(135deg, #1a0f0f 0%, #150a0a 100%)', border: '#7a3f3f', accent: '#fca5a5', label: 'NO DATA' }
    : !someOk
      ? { bg: 'linear-gradient(135deg, #1a0f0f 0%, #150a0a 100%)', border: '#a83f3f', accent: '#f87171', label: 'PANEL DOWN' }
      : !allOk
        ? { bg: 'linear-gradient(135deg, #1a1a0a 0%, #15150a 100%)', border: '#a8843f', accent: '#fbbf24', label: 'PARTIAL' }
        : { bg: 'linear-gradient(135deg, #14101e 0%, #0e0a18 100%)', border: '#7a3fa8', accent: '#c4b5fd', label: 'PANEL OK' };

  const ProviderDot = ({ p }: { p: Provider }) => {
    const st = ps[p];
    const ok = st?.ok === true;
    const color = !st ? '#3a3540' : ok ? '#86efac' : '#f87171';
    const label = p === 'anthropic' ? 'Anth' : p === 'openai' ? 'OpenAI' : 'Gemini';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#a8a3ad' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {label}
      </span>
    );
  };

  return (
    <div style={{
      background: tone.bg, border: `1px solid ${tone.border}`,
      borderLeft: `3px solid ${tone.border}`, borderRadius: 10,
      padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 9.5, color: tone.accent, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          MOMMY IDEATION · {tone.label}
        </span>
        <span style={{ fontSize: 10, color: '#5a5560', marginLeft: 'auto' }}>
          last run {timeAgo(summary.last_run_at)} · {summary.runs_7d} runs/7d
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
        <ProviderDot p="anthropic" />
        <ProviderDot p="openai" />
        <ProviderDot p="openrouter" />
      </div>

      {features.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: '#7a7480', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Top picks (judged)
          </div>
          {features.map((f, i) => (
            <div key={i} style={{ fontSize: 11, color: '#c4b5fd', padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#5a5560', fontSize: 10 }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>{f.title}</span>
              {f.category && (
                <span style={{ fontSize: 9, color: f.category === 'infra' ? '#86efac' : '#fbb6ce', background: f.category === 'infra' ? '#0a1a0e' : '#1a0a14', padding: '1px 5px', borderRadius: 3 }}>
                  {f.category === 'infra' ? 'infra' : 'kink'}
                </span>
              )}
              {f.effort && (
                <span style={{ fontSize: 9, color: '#7a7480', border: '1px solid #2d1a4d', padding: '0 4px', borderRadius: 3 }}>{f.effort}</span>
              )}
              {f.panel_converged && <span title="panel converged" style={{ fontSize: 9, color: '#fbbf24' }}>★</span>}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#5a5560', fontStyle: 'italic', marginBottom: 10 }}>
          (judged blob unparseable or empty — see full log)
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: '#a8a3ad', flexWrap: 'wrap', borderTop: '1px solid #15151b', paddingTop: 8 }}>
        <span>30d wishes (panel→builder):</span>
        {shipped > 0 && <span style={{ color: '#86efac' }}>{shipped} shipped</span>}
        {inProgress > 0 && <span style={{ color: '#fbbf24' }}>{inProgress} in progress</span>}
        {queued > 0 && <span style={{ color: '#c4b5fd' }}>{queued} queued</span>}
        {rejected > 0 && <span style={{ color: '#7a7480' }}>{rejected} rejected</span>}
        {shipped + inProgress + queued + rejected === 0 && <span style={{ color: '#5a5560', fontStyle: 'italic' }}>none yet</span>}
      </div>

      {ps.judge_summary && (
        <div style={{ fontSize: 10.5, color: '#8a8690', marginTop: 8, fontStyle: 'italic', lineHeight: 1.4 }}>
          {ps.judge_summary}
        </div>
      )}
    </div>
  );
}
