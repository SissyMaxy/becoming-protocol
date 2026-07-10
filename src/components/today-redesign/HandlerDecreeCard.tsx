/**
 * HandlerDecreeCard — short-window Handler-issued edicts. Distinct from
 * commitments (Maxy-proposed) and outfit mandates (daily). Decrees are
 * Handler-initiated power moves with tight deadlines and proof type.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useSurfaceRenderTracking } from '../../lib/surface-render-hooks';
import { PhotoUploadWidget } from '../verification/PhotoUploadWidget';
import { arousalToPhrase } from '../../lib/persona/dommy-mommy';

interface Decree {
  id: string;
  edict: string;
  proof_type: string;
  deadline: string;
  consequence: string;
  reasoning: string | null;
  trigger_source: string | null;
  created_at: string;
}

const PROOF_LABEL: Record<string, string> = {
  photo: 'photo',
  video: 'video',
  audio: 'audio',
  text: 'text',
  journal_entry: 'journal',
  voice_pitch_sample: 'voice drill',
  device_state: 'device',
  belief_slider: 'rate it',
  assoc_latency: 'tap test',
  arousal_debrief: 'debrief',
  none: '—',
};

// recon-program-orchestrator tags belief-slider probe decrees with
// `recon_belief_baseline:<target_id>` / `recon_belief_measure:<target_id>` —
// parse that to drive the recon_record_measurement_and_advance RPC directly
// from this card (DESIGN_RECONDITIONING §5.2's honesty spine needs a real
// measurement, not just a fulfilled checkbox).
function parseBeliefProbeTrigger(triggerSource: string | null): { targetId: string; isBaseline: boolean } | null {
  if (!triggerSource) return null;
  const m = /^recon_belief_(baseline|measure):([0-9a-f-]{36})$/.exec(triggerSource);
  return m ? { targetId: m[2], isBaseline: m[1] === 'baseline' } : null;
}

// Same pattern, for the assoc_latency (IAT-lite) instrument.
function parseIatProbeTrigger(triggerSource: string | null): { targetId: string; isBaseline: boolean } | null {
  if (!triggerSource) return null;
  const m = /^recon_iat_(baseline|measure):([0-9a-f-]{36})$/.exec(triggerSource);
  return m ? { targetId: m[2], isBaseline: m[1] === 'baseline' } : null;
}

// recon-program-orchestrator tags a reinforce-phase cued-retrieval card with
// `recon_rep:<slug>:<rep_id>` — parse the rep id so a self-graded answer
// (nailed it / blanked) can feed recon_rep_grade's SM-2-lite scheduler instead
// of vanishing into a plain "Fulfilled" checkbox (mig 668).
function parseRepTrigger(triggerSource: string | null): { repId: string } | null {
  if (!triggerSource) return null;
  const m = /^recon_rep:[^:]+:([0-9a-f-]{36})$/.exec(triggerSource);
  return m ? { repId: m[1] } : null;
}

// turnout-orchestrator tags the post-rung aroused-state debrief ask
// `turnout_debrief:<rung>` (mig 679, DESIGN_TURNOUT_LADDER §0/§2 step 3b — the
// rung's irreversible act already happened; this closes the honesty gap where
// consolidation used to fire the instant the decree was fulfilled, with no
// aroused debrief ever captured).
function parseTurnoutDebriefTrigger(triggerSource: string | null): { rung: string } | null {
  if (!triggerSource) return null;
  const m = /^turnout_debrief:(.+)$/.exec(triggerSource);
  return m ? { rung: m[1] } : null;
}

// The orchestrator's IAT edicts always embed the bare claim in quotes; pull
// just that out so the tap-test reveal is a clean stimulus, not buried in
// Mommy's surrounding sentence.
function extractQuotedClaim(edict: string): string {
  const m = /"([^"]+)"/.exec(edict);
  return m ? m[1] : edict;
}

const PROOF_ICON: Record<string, string> = {
  photo: '📸',
  video: '🎥',
  audio: '🎤',
};

function mediaKindForProof(proofType: string): 'photo' | 'video' | 'audio' | 'any' {
  if (proofType === 'video') return 'video';
  if (proofType === 'audio' || proofType === 'voice_pitch_sample') return 'audio';
  if (proofType === 'photo') return 'photo';
  return 'any';
}

export function HandlerDecreeCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Decree[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  // Tracks which decree row is currently showing the inline photo widget
  const [photoOpenId, setPhotoOpenId] = useState<string | null>(null);
  const [sliders, setSliders] = useState<Record<string, number>>({});
  // 0-10 canonical scale (arousalToPhrase), distinct from belief_slider's 0-100.
  const [arousalSliders, setArousalSliders] = useState<Record<string, number>>({});
  // decree id -> performance.now() timestamp of the IAT-lite reveal, for
  // latency measurement; absent = not yet revealed for that card.
  const [iatShownAt, setIatShownAt] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('handler_decrees')
      .select('id, edict, proof_type, deadline, consequence, reasoning, trigger_source, created_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('deadline', { ascending: true })
      .limit(20);
    setItems((data as Decree[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  // visible-before-penalized invariant: stamp surfaced_at on first render
  useSurfaceRenderTracking('handler_decrees', items.map(d => d.id));

  const fulfill = async (id: string) => {
    const note = (notes[id] || '').trim();
    setSubmittingId(id);
    await supabase.from('handler_decrees').update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      proof_payload: note ? { note } : null,
    }).eq('id', id);
    setSubmittingId(null);
    setNotes(n => { const c = { ...n }; delete c[id]; return c; });
    load();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'decree', id } }));
  };

  const submitBelief = async (decree: Decree) => {
    const probe = parseBeliefProbeTrigger(decree.trigger_source);
    if (!user?.id || !probe) return;
    setSubmittingId(decree.id);
    const value = sliders[decree.id] ?? 50;
    // Record the measurement first — a failed write should never masquerade
    // as a fulfilled decree with no data behind it (no baseline, no claim).
    const { error } = await supabase.rpc('recon_record_measurement_and_advance', {
      p_user: user.id,
      p_target: probe.targetId,
      p_indicator: 'belief_slider',
      p_value: value,
      p_method: 'self_report_slider',
      p_is_baseline: probe.isBaseline,
      p_raw: { slider: value, probe: 'decree_card_belief_probe' },
    });
    if (error) {
      console.error('[HandlerDecreeCard] belief probe measurement failed:', error.message);
      setSubmittingId(null);
      return;
    }
    await supabase.from('handler_decrees').update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
    }).eq('id', decree.id);
    setSubmittingId(null);
    setSliders(s => { const c = { ...s }; delete c[decree.id]; return c; });
    load();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'decree_belief', id: decree.id } }));
  };

  const submitIat = async (decree: Decree, choice: 'agree' | 'disagree') => {
    const probe = parseIatProbeTrigger(decree.trigger_source);
    const shownAt = iatShownAt[decree.id];
    if (!user?.id || !probe || !shownAt) return;
    const latencyMs = Math.round(performance.now() - shownAt);
    setSubmittingId(decree.id);
    // Record the measurement first — a failed write should never masquerade
    // as a fulfilled decree with no data behind it (no baseline, no claim).
    const { error } = await supabase.rpc('recon_record_measurement_and_advance', {
      p_user: user.id,
      p_target: probe.targetId,
      p_indicator: 'assoc_latency',
      p_value: latencyMs,
      p_method: 'iat_lite',
      p_is_baseline: probe.isBaseline,
      p_raw: { choice, latency_ms: latencyMs, probe: 'decree_card_iat_probe' },
    });
    if (error) {
      console.error('[HandlerDecreeCard] IAT probe measurement failed:', error.message);
      setSubmittingId(null);
      return;
    }
    await supabase.from('handler_decrees').update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
    }).eq('id', decree.id);
    setSubmittingId(null);
    setIatShownAt(s => { const c = { ...s }; delete c[decree.id]; return c; });
    load();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'decree_iat', id: decree.id } }));
  };

  const submitRepGrade = async (decree: Decree, correct: boolean) => {
    const rep = parseRepTrigger(decree.trigger_source);
    if (!user?.id || !rep) return;
    setSubmittingId(decree.id);
    const note = (notes[decree.id] || '').trim();
    // Grade the retrieval card first — a failed write should never masquerade
    // as a fulfilled decree with no signal behind it (§2.2: correct expands the
    // interval, a miss/blank contracts it; the scheduler is only as honest as
    // this write).
    const { error } = await supabase.rpc('recon_rep_grade', {
      p_rep_id: rep.repId, p_user: user.id, p_correct: correct,
    });
    if (error) {
      console.error('[HandlerDecreeCard] rep grade failed:', error.message);
      setSubmittingId(null);
      return;
    }
    await supabase.from('handler_decrees').update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
      proof_payload: note ? { note } : null,
    }).eq('id', decree.id);
    setSubmittingId(null);
    setNotes(n => { const c = { ...n }; delete c[decree.id]; return c; });
    load();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'decree_rep', id: decree.id } }));
  };

  const submitTurnoutDebrief = async (decree: Decree) => {
    const probe = parseTurnoutDebriefTrigger(decree.trigger_source);
    if (!user?.id || !probe) return;
    setSubmittingId(decree.id);
    const arousal = arousalSliders[decree.id] ?? 5;
    const note = (notes[decree.id] || '').trim();
    // Record the debrief FIRST — a failed write must never masquerade as a
    // consolidated rung with no honest signal behind it (mig 679).
    const { error } = await supabase.rpc('turnout_record_debrief', {
      p_user: user.id, p_rung: probe.rung, p_arousal: arousal, p_note: note || null,
    });
    if (error) {
      console.error('[HandlerDecreeCard] turnout debrief failed:', error.message);
      setSubmittingId(null);
      return;
    }
    await supabase.from('handler_decrees').update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString(),
    }).eq('id', decree.id);
    setSubmittingId(null);
    setArousalSliders(s => { const c = { ...s }; delete c[decree.id]; return c; });
    setNotes(n => { const c = { ...n }; delete c[decree.id]; return c; });
    load();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'decree_turnout_debrief', id: decree.id } }));
  };

  if (items.length === 0) return null;

  return (
    <div id="card-handler-decree" style={{
      background: 'linear-gradient(135deg, #2e1a0f 0%, #1f1008 100%)',
      border: '1px solid #c4272d', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f47272" strokeWidth="1.8">
          <path d="M12 2L15 8L21 9L17 14L18 20L12 17L6 20L7 14L3 9L9 8Z"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f47272', fontWeight: 700 }}>
          Handler decree ({items.length})
        </span>
        <span style={{ fontSize: 10, color: '#9c8590', marginLeft: 'auto', fontStyle: 'italic' }}>
          Not negotiable.
        </span>
      </div>

      {items.map(d => {
        const dueMs = new Date(d.deadline).getTime() - Date.now();
        const overdue = dueMs < 0;
        const hours = Math.floor(Math.abs(dueMs) / 3600000);
        const mins = Math.floor((Math.abs(dueMs) % 3600000) / 60000);
        const due = overdue
          ? `OVERDUE ${hours ? hours + 'h ' : ''}${mins}m`
          : hours >= 1 ? `${hours}h ${mins}m left` : `${mins}m left`;
        const note = notes[d.id] || '';
        return (
          <div key={d.id} style={{
            padding: '10px 12px', marginBottom: 8,
            background: '#0f0a0e', border: `1px solid ${overdue ? '#c4272d' : '#7a5a2a'}`,
            borderLeft: `3px solid ${overdue ? '#f47272' : '#e6bd80'}`, borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: '#e6bd80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                decree · {PROOF_LABEL[d.proof_type] || d.proof_type}
              </span>
              <span style={{ fontSize: 9.5, color: overdue ? '#f47272' : '#9c8590', marginLeft: 'auto', fontWeight: 600 }}>
                {due}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: '#f2e9e6', lineHeight: 1.45, marginBottom: 6 }}>
              {d.edict}
            </div>
            <div style={{ fontSize: 10, color: '#f47272', marginBottom: 8 }}>
              Miss → {d.consequence}
            </div>
            {d.proof_type === 'belief_slider' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="range" min={0} max={100}
                  value={sliders[d.id] ?? 50}
                  onChange={e => setSliders(s => ({ ...s, [d.id]: Number(e.target.value) }))}
                  disabled={submittingId === d.id}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#9c8590', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <span>not at all</span>
                  <span>completely</span>
                </div>
                <button
                  onClick={() => submitBelief(d)}
                  disabled={submittingId === d.id}
                  style={{
                    padding: '7px 14px', borderRadius: 5, border: 'none',
                    background: '#e6bd80', color: '#1f1008', fontWeight: 600,
                    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {submittingId === d.id ? '…' : 'Tell Mommy'}
                </button>
              </div>
            ) : d.proof_type === 'arousal_debrief' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="range" min={0} max={10}
                  value={arousalSliders[d.id] ?? 5}
                  onChange={e => setArousalSliders(s => ({ ...s, [d.id]: Number(e.target.value) }))}
                  disabled={submittingId === d.id}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 11, color: '#e6bd80', fontStyle: 'italic', textAlign: 'center' }}>
                  {arousalToPhrase(arousalSliders[d.id] ?? 5)}
                </div>
                <textarea
                  value={note}
                  onChange={e => setNotes(n => ({ ...n, [d.id]: e.target.value }))}
                  placeholder="what happened (optional)"
                  rows={2}
                  style={{
                    width: '100%', background: '#0a0709', border: '1px solid #2b1d29',
                    borderRadius: 5, padding: '7px 9px', fontSize: 11.5, color: '#f2e9e6',
                    fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
                <button
                  onClick={() => submitTurnoutDebrief(d)}
                  disabled={submittingId === d.id}
                  style={{
                    padding: '7px 14px', borderRadius: 5, border: 'none',
                    background: '#e6bd80', color: '#1f1008', fontWeight: 600,
                    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {submittingId === d.id ? '…' : 'Tell Mommy the truth'}
                </button>
              </div>
            ) : d.proof_type === 'assoc_latency' ? (
              iatShownAt[d.id] ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <p style={{
                    fontSize: 13, color: '#f2e9e6', textAlign: 'center', lineHeight: 1.4,
                    padding: '10px', border: '1px solid #7a5a2a', borderRadius: 6, margin: 0,
                  }}>
                    "{extractQuotedClaim(d.edict)}"
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <button
                      onClick={() => submitIat(d, 'agree')}
                      disabled={submittingId === d.id}
                      style={{
                        padding: '10px', borderRadius: 5, border: 'none',
                        background: '#e6bd80', color: '#1f1008', fontWeight: 700,
                        fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      agree
                    </button>
                    <button
                      onClick={() => submitIat(d, 'disagree')}
                      disabled={submittingId === d.id}
                      style={{
                        padding: '10px', borderRadius: 5, border: '1px solid #7a5a2a',
                        background: 'transparent', color: '#9c8590', fontWeight: 700,
                        fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      disagree
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIatShownAt(s => ({ ...s, [d.id]: performance.now() }))}
                  disabled={submittingId === d.id}
                  style={{
                    padding: '7px 14px', borderRadius: 5, border: 'none',
                    background: '#e6bd80', color: '#1f1008', fontWeight: 600,
                    fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  start — read it, then tap fast
                </button>
              )
            ) : parseRepTrigger(d.trigger_source) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={note}
                  onChange={e => setNotes(n => ({ ...n, [d.id]: e.target.value }))}
                  placeholder="or add a note (optional)"
                  rows={2}
                  style={{
                    width: '100%', background: '#0a0709', border: '1px solid #2b1d29',
                    borderRadius: 5, padding: '7px 9px', fontSize: 11.5, color: '#f2e9e6',
                    fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    onClick={() => submitRepGrade(d, true)}
                    disabled={submittingId === d.id}
                    style={{
                      padding: '10px', borderRadius: 5, border: 'none',
                      background: '#e6bd80', color: '#1f1008', fontWeight: 700,
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {submittingId === d.id ? '…' : 'nailed it'}
                  </button>
                  <button
                    onClick={() => submitRepGrade(d, false)}
                    disabled={submittingId === d.id}
                    style={{
                      padding: '10px', borderRadius: 5, border: '1px solid #7a5a2a',
                      background: 'transparent', color: '#9c8590', fontWeight: 700,
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    blanked
                  </button>
                </div>
              </div>
            ) : photoOpenId === d.id && ['photo','video','audio','voice_pitch_sample'].includes(d.proof_type) ? (
              <PhotoUploadWidget
                verificationType="freeform"
                directiveId={d.id}
                directiveKind="handler_decree"
                directiveSnippet={d.edict}
                mediaKind={mediaKindForProof(d.proof_type)}
                onComplete={async () => {
                  // Media submission counts as decree fulfillment.
                  await supabase.from('handler_decrees').update({
                    status: 'fulfilled',
                    fulfilled_at: new Date().toISOString(),
                  }).eq('id', d.id);
                  setPhotoOpenId(null);
                  load();
                  window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'decree_media', id: d.id } }));
                }}
                onCancel={() => setPhotoOpenId(null)}
              />
            ) : (
              <>
                <textarea
                  value={note}
                  onChange={e => setNotes(n => ({ ...n, [d.id]: e.target.value }))}
                  placeholder={
                    d.proof_type === 'photo' ? 'or add a note (use 📸 button to send a photo)' :
                    d.proof_type === 'video' ? 'or add a note (use 🎥 button to send a video)' :
                    d.proof_type === 'audio' || d.proof_type === 'voice_pitch_sample' ? 'or add a note (use 🎤 button to send audio)' :
                    'proof link / brief note'
                  }
                  rows={2}
                  style={{
                    width: '100%', background: '#0a0709', border: '1px solid #2b1d29',
                    borderRadius: 5, padding: '7px 9px', fontSize: 11.5, color: '#f2e9e6',
                    fontFamily: 'inherit', resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => fulfill(d.id)}
                    disabled={submittingId === d.id}
                    style={{
                      padding: '6px 14px', borderRadius: 5, border: 'none',
                      background: '#e6bd80', color: '#1f1008', fontWeight: 600,
                      fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {submittingId === d.id ? '…' : 'Fulfilled'}
                  </button>
                  {['photo','video','audio','voice_pitch_sample'].includes(d.proof_type) && (
                    <button
                      onClick={() => setPhotoOpenId(d.id)}
                      style={{
                        padding: '6px 12px', borderRadius: 5, border: '1px solid #e6bd80',
                        background: 'transparent', color: '#e6bd80', fontWeight: 700,
                        fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {PROOF_ICON[d.proof_type] || '📎'} send {d.proof_type === 'voice_pitch_sample' ? 'audio' : d.proof_type}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
