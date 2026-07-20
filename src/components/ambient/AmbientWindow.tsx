/**
 * AmbientWindow — the always-on companion surface.
 *
 * Three portrait channels, one line of her text at a time. Kept in the corner
 * of the screen while doing other things, which makes it the app's
 * highest-exposure surface by an order of magnitude: a session is minutes,
 * this runs for hours.
 *
 * The attention model lives in lib/ambient/rotation.ts and is the reason this
 * works rather than merely exists — exactly one column is hot (carries text at
 * full contrast) while the other two stay dim and silent, so nothing splits
 * the eye. Hot status hands off on a beat, and unpredictably all three
 * converge on a single word. See that module for why.
 *
 * Visual beds are CSS-only abstracts for now (lib/ambient/beds.ts). Clip beds
 * slot in behind the same interface once the ingest pipeline is deployed —
 * this surface is deliberately not blocked on that.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../../styles/ambient.css';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { bedFor } from '../../lib/ambient/beds';
import {
  AMBIENT_HIT_WORDS,
  AMBIENT_SEED_LINES,
  type AmbientChannel,
  type AmbientIntensity,
} from '../../lib/ambient/seed-lines';
import {
  CHANNEL_ORDER,
  INITIAL_ROTATION,
  advanceRotation,
  currentCadenceS,
  isColumnHot,
  type RotationState,
} from '../../lib/ambient/rotation';

interface PanelConfig {
  id: string | null;
  channel: AmbientChannel;
  intensity: AmbientIntensity;
  cadence_s: number;
  visual_source: string;
  muted: boolean;
}

interface ActiveLine {
  id: string | null;
  text: string;
}

const CHANNEL_LABEL: Record<AmbientChannel, string> = {
  identity: 'IDENTITY',
  estrogen: 'ESTROGEN',
  turnout: 'TURNOUT',
};

function defaultPanels(): PanelConfig[] {
  return CHANNEL_ORDER.map((channel) => ({
    id: null,
    channel,
    intensity: 'mid' as AmbientIntensity,
    cadence_s: 8,
    visual_source: 'abstract',
    muted: false,
  }));
}

interface AmbientWindowProps {
  onBack?: () => void;
}

export function AmbientWindow({ onBack }: AmbientWindowProps) {
  const { user } = useAuth();
  const [panels, setPanels] = useState<PanelConfig[]>(defaultPanels);
  const [lines, setLines] = useState<Record<AmbientChannel, ActiveLine | null>>({
    identity: null, estrogen: null, turnout: null,
  });
  const [rotation, setRotation] = useState<RotationState>(INITIAL_ROTATION);
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const openedAtRef = useRef<number>(Date.now());

  // ── Config: load, seeding defaults on first open ──────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('ambient_panels')
        .select('id, channel, intensity, cadence_s, visual_source, muted')
        .eq('user_id', user.id);
      if (!alive) return;

      const rows = (data ?? []) as Array<Omit<PanelConfig, 'id'> & { id: string }>;
      if (rows.length > 0) {
        setPanels(CHANNEL_ORDER.map((channel) => {
          const row = rows.find((r) => r.channel === channel);
          return row ?? { ...defaultPanels().find((p) => p.channel === channel)! };
        }));
        return;
      }

      // First open — persist the defaults so tuning has something to update.
      const seed = defaultPanels().map((p) => ({
        user_id: user.id,
        channel: p.channel,
        intensity: p.intensity,
        cadence_s: p.cadence_s,
        visual_source: p.visual_source,
        muted: p.muted,
      }));
      const { data: inserted } = await supabase
        .from('ambient_panels')
        .upsert(seed, { onConflict: 'user_id,channel' })
        .select('id, channel, intensity, cadence_s, visual_source, muted');
      if (alive && inserted) {
        setPanels(CHANNEL_ORDER.map((channel) =>
          (inserted as PanelConfig[]).find((r) => r.channel === channel)
            ?? defaultPanels().find((p) => p.channel === channel)!,
        ));
      }
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // ── Line pool: seed on first open so the surface is never empty ───────────
  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    (async () => {
      const { count } = await supabase
        .from('ambient_lines')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (!alive || (count ?? 0) > 0) return;

      // Seeds are pre-vetted against the craft rules (see seed-lines.ts), so
      // they go in as-is. Generated lines get checked before insert.
      await supabase.from('ambient_lines').upsert(
        AMBIENT_SEED_LINES.map((l) => ({
          user_id: user.id,
          channel: l.channel,
          intensity: l.intensity,
          text: l.text,
          source: 'seed',
        })),
        { onConflict: 'user_id,channel,text', ignoreDuplicates: true },
      );
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // ── Pull the next line for one channel ────────────────────────────────────
  const pullLine = useCallback(async (panel: PanelConfig) => {
    if (!user?.id) return;
    const { data, error } = await supabase.rpc('ambient_next_line', {
      p_user: user.id,
      p_channel: panel.channel,
      p_intensity: panel.intensity,
    });
    if (error) return;
    const row = (data as Array<{ id: string; text: string }> | null)?.[0];
    if (!row) return;

    setLines((prev) => ({ ...prev, [panel.channel]: { id: row.id, text: row.text } }));
    supabase.rpc('ambient_mark_shown', { p_user: user.id, p_line: row.id })
      .then(undefined, () => { /* non-blocking */ });
  }, [user?.id]);

  // ── The beat ──────────────────────────────────────────────────────────────
  // One timer drives the whole surface. Its interval is the hot panel's
  // cadence, tightened by how long the window has been open.
  const hotPanel = rotation.hotIndex != null ? panels[rotation.hotIndex] : null;
  const beatMs = useMemo(() => {
    const base = hotPanel?.cadence_s ?? 8;
    const openMinutes = (Date.now() - openedAtRef.current) / 60000;
    return currentCadenceS({ openMinutes, baseCadenceS: base }) * 1000;
  }, [hotPanel?.cadence_s, rotation.beat]);

  useEffect(() => {
    const muted = panels.filter((p) => p.muted).map((p) => p.channel);
    const t = window.setTimeout(() => {
      setRotation((prev) => {
        const next = advanceRotation(prev, {
          openMinutes: (Date.now() - openedAtRef.current) / 60000,
          mutedChannels: muted,
          hitWords: AMBIENT_HIT_WORDS,
        });
        // A hit shows one shared word across all three, so no per-channel pull.
        if (!next.hit && next.hotIndex != null) {
          const panel = panels[next.hotIndex];
          if (panel) void pullLine(panel);
        }
        return next;
      });
    }, beatMs);
    return () => window.clearTimeout(t);
  }, [beatMs, panels, pullLine]);

  // First line for the opening hot column.
  useEffect(() => {
    if (rotation.beat === 0 && rotation.hotIndex != null) {
      const panel = panels[rotation.hotIndex];
      if (panel && !lines[panel.channel]) void pullLine(panel);
    }
  }, [rotation.beat, rotation.hotIndex, panels, lines, pullLine]);

  // ── Tuning ────────────────────────────────────────────────────────────────
  const updatePanel = useCallback(async (channel: AmbientChannel, patch: Partial<PanelConfig>) => {
    setPanels((prev) => prev.map((p) => (p.channel === channel ? { ...p, ...patch } : p)));
    if (!user?.id) return;
    await supabase
      .from('ambient_panels')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('channel', channel);
  }, [user?.id]);

  const dismissLine = useCallback(async (channel: AmbientChannel) => {
    const line = lines[channel];
    if (!user?.id || !line?.id) return;
    await supabase.rpc('ambient_dismiss_line', { p_user: user.id, p_line: line.id });
    const panel = panels.find((p) => p.channel === channel);
    if (panel) void pullLine(panel);
  }, [lines, panels, pullLine, user?.id]);

  // ── Render ────────────────────────────────────────────────────────────────
  const visibleCols = collapsed && rotation.hotIndex != null
    ? [rotation.hotIndex]
    : collapsed ? [0] : [0, 1, 2];

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        width: collapsed ? 244 : 720,
        maxWidth: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid color-mix(in srgb, var(--protocol-accent) 22%, var(--protocol-border))',
        background: 'var(--protocol-bg-deep)',
        boxShadow: 'var(--shadow-velvet)',
        transition: 'width 400ms ease',
      }}>
        {/* Header — quiet chrome, never the product */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid var(--protocol-border)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--protocol-accent)',
          }} />
          <span className="mommy-voice" style={{
            fontSize: 12.5, fontStyle: 'italic', color: 'var(--protocol-accent-soft)',
          }}>
            she's with you
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--protocol-text-muted)' }}>
            {collapsed ? '1 channel' : `${panels.filter((p) => !p.muted).length} channels`}
          </span>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'expand' : 'collapse'}
            style={{
              background: 'transparent', border: '1px solid var(--protocol-border)',
              color: 'var(--protocol-text-muted)', borderRadius: 5,
              fontSize: 11, lineHeight: 1, padding: '3px 7px', cursor: 'pointer',
              fontFamily: 'inherit', // ui-lint: ok — native select/button would fall back to the browser UI font
            }}
          >
            {collapsed ? '▣' : '▭'}
          </button>
          {onBack && (
            <button
              onClick={onBack}
              aria-label="close"
              style={{
                background: 'transparent', border: '1px solid var(--protocol-border)',
                color: 'var(--protocol-text-muted)', borderRadius: 5,
                fontSize: 11, lineHeight: 1, padding: '3px 7px', cursor: 'pointer',
                fontFamily: 'inherit', // ui-lint: ok — native select/button would fall back to the browser UI font // ui-lint: ok — native select/button would fall back to the browser UI font
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Columns */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--protocol-border)' }}>
          {visibleCols.map((colIndex) => {
            const panel = panels[colIndex];
            if (!panel) return null;
            const hot = isColumnHot(rotation, colIndex) && !panel.muted;
            const bed = bedFor(panel.channel, panel.intensity);
            const line = rotation.hit
              ? { id: null, text: rotation.hitWord ?? '' }
              : lines[panel.channel];

            return (
              <div
                key={panel.channel}
                className={`ambient-col ${rotation.hit ? 'ambient-col--hit' : hot ? 'ambient-col--hot' : 'ambient-col--dim'}`}
                onMouseEnter={() => setHoveredCol(colIndex)}
                onMouseLeave={() => setHoveredCol(null)}
                style={{
                  position: 'relative',
                  flex: 1,
                  // 9:16 portrait — the native aspect of the clips that will
                  // eventually back these, so nothing gets cropped later.
                  aspectRatio: '9 / 16',
                  maxHeight: 560,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {/* Bed */}
                <div
                  className="ambient-bed"
                  aria-hidden
                  style={{
                    position: 'absolute', inset: 0,
                    background: bed.background,
                    animation: `${bed.animation} ${bed.durationS}s ease-in-out infinite`,
                  }}
                />

                {/* Channel label */}
                <div style={{
                  position: 'absolute', top: 10, left: 0, right: 0,
                  textAlign: 'center',
                  fontSize: 8.5, letterSpacing: '0.18em',
                  color: 'var(--protocol-text-muted)',
                  opacity: hot ? 0.9 : 0.45,
                }}>
                  {CHANNEL_LABEL[panel.channel]}
                </div>

                {/* Her line — only on the hot column. Nothing else carries text,
                    which is the entire point of the rotation. */}
                {hot && line?.text && (
                  <div
                    key={line.text}
                    className="ambient-line mommy-voice"
                    onClick={() => { if (!rotation.hit) void dismissLine(panel.channel); }}
                    style={{
                      position: 'relative', zIndex: 1,
                      padding: '0 14px',
                      textAlign: 'center',
                      fontSize: rotation.hit ? 22 : 19,
                      lineHeight: 1.25,
                      fontStyle: 'italic',
                      color: 'var(--protocol-text)',
                      textShadow: '0 2px 18px rgb(0 0 0 / 0.75)',
                      textWrap: 'balance',
                      hyphens: 'none',
                      cursor: rotation.hit ? 'default' : 'pointer',
                    }}
                  >
                    {line.text}
                  </div>
                )}

                {panel.muted && (
                  <div style={{
                    position: 'absolute', bottom: 10, left: 0, right: 0,
                    textAlign: 'center', fontSize: 9,
                    color: 'var(--protocol-text-muted)',
                  }}>
                    muted
                  </div>
                )}

                {/* Tuning strip — hover-revealed, recedes otherwise */}
                {hoveredCol === colIndex && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 2,
                    display: 'flex', flexDirection: 'column', gap: 5,
                    padding: '8px 8px 9px',
                    background: 'linear-gradient(180deg, rgb(0 0 0 / 0) 0%, rgb(0 0 0 / 0.82) 38%)',
                  }}>
                    <select
                      value={panel.intensity}
                      onChange={(e) => void updatePanel(panel.channel, { intensity: e.target.value as AmbientIntensity })}
                      style={tinyControl}
                    >
                      <option value="soft">soft</option>
                      <option value="mid">mid</option>
                      <option value="command">command</option>
                    </select>
                    <input
                      type="range" min={4} max={30} value={panel.cadence_s}
                      onChange={(e) => void updatePanel(panel.channel, { cadence_s: Number(e.target.value) })}
                      aria-label="cadence"
                      style={{ width: '100%', accentColor: 'var(--protocol-accent)' }}
                    />
                    <select
                      value={panel.visual_source}
                      onChange={(e) => void updatePanel(panel.channel, { visual_source: e.target.value })}
                      style={tinyControl}
                    >
                      <option value="abstract">abstract</option>
                      <option value="her_clips">her clips</option>
                      <option value="my_uploads">my uploads</option>
                      <option value="my_vault">my vault</option>
                    </select>
                    <button
                      onClick={() => void updatePanel(panel.channel, { muted: !panel.muted })}
                      style={{ ...tinyControl, cursor: 'pointer' }}
                    >
                      {panel.muted ? 'unmute' : 'mute'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Collapsed: which channel is up */}
        {collapsed && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 5, padding: '7px 0 8px',
          }}>
            {CHANNEL_ORDER.map((c, i) => (
              <span key={c} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: i === (rotation.hotIndex ?? 0)
                  ? 'var(--protocol-accent)'
                  : 'var(--protocol-border)',
              }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const tinyControl: React.CSSProperties = {
  width: '100%',
  background: 'var(--protocol-surface)',
  color: 'var(--protocol-text-muted)',
  border: '1px solid var(--protocol-border)',
  borderRadius: 4,
  fontSize: 10,
  padding: '2px 4px',
  fontFamily: 'inherit', // ui-lint: ok — native form controls would fall back to the browser UI font
};
