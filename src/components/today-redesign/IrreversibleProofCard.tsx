/**
 * IrreversibleProofCard — the real-world proof binder.
 *
 * One surface for the pile of irreversible acts: forced purchases,
 * appointments, public fem-name use. Log the act, capture proof (receipt /
 * forwarded-email screenshot via the verification-photos bucket, optional
 * calendar hold), watch the binder grow. The pile IS the conditioning.
 *
 * Reads/writes irreversible_events (mig 606). Renders null when the binder
 * is empty AND there's nothing pending — never an empty shell.
 *
 * Gina-CC is gated by the MASTER switch user_state.gina_witness_consent —
 * GINA'S OWN consent, default 'never'. The toggle here records that master
 * state; flipping it off cancels pending CCs retroactively (DB trigger). On
 * top of the master switch, each captured item has a per-item opt-in. The
 * binder is fully useful with Gina at 'never' — the CC UI only appears once
 * the master switch is granted. We NEVER fabricate Gina's reaction.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { resolveCcStatus, type GinaWitnessConsent } from '../../lib/irreversible-proof';

type EventKind = 'purchase' | 'appointment' | 'fem_name_use' | 'other';
type EventStatus = 'pending' | 'captured' | 'cancelled';
type CcStatus = 'none' | 'queued' | 'sent' | 'cancelled';

interface IrrevEvent {
  id: string;
  event_kind: EventKind;
  title: string;
  detail: string | null;
  amount_cents: number | null;
  proof_photo_path: string | null;
  proof_email_ref: string | null;
  calendar_hold_at: string | null;
  status: EventStatus;
  proof_due_at: string | null;
  captured_at: string | null;
  gina_cc_opt_in: boolean;
  cc_status: CcStatus;
  created_at: string;
}

const KIND_LABEL: Record<EventKind, string> = {
  purchase: 'Purchase',
  appointment: 'Appointment',
  fem_name_use: 'Name used out loud',
  other: 'Other',
};

const KIND_OPTIONS: EventKind[] = ['purchase', 'appointment', 'fem_name_use', 'other'];

export function IrreversibleProofCard() {
  const { user } = useAuth();
  const [events, setEvents] = useState<IrrevEvent[] | null>(null);
  const [masterConsent, setMasterConsent] = useState<GinaWitnessConsent>('never');
  const [adding, setAdding] = useState(false);
  const [newKind, setNewKind] = useState<EventKind>('purchase');
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [{ data: evs }, { data: us }] = await Promise.all([
      supabase
        .from('irreversible_events')
        .select('id, event_kind, title, detail, amount_cents, proof_photo_path, proof_email_ref, calendar_hold_at, status, proof_due_at, captured_at, gina_cc_opt_in, cc_status, created_at')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('user_state').select('gina_witness_consent').eq('user_id', user.id).maybeSingle(),
    ]);
    setEvents((evs as IrrevEvent[] | null) ?? []);
    setMasterConsent(((us as { gina_witness_consent?: GinaWitnessConsent } | null)?.gina_witness_consent) ?? 'never');
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const addEvent = async () => {
    if (!user?.id || !newTitle.trim()) return;
    setBusy(true);
    try {
      // Proof due in 48h by default — visible on Today before the nudge fires.
      const due = new Date(Date.now() + 48 * 3600_000).toISOString();
      await supabase.from('irreversible_events').insert({
        user_id: user.id,
        event_kind: newKind,
        title: newTitle.trim().slice(0, 200),
        status: 'pending',
        proof_due_at: due,
        source: 'binder',
      });
      setNewTitle('');
      setAdding(false);
      await load();
    } finally { setBusy(false); }
  };

  const captureProof = async (ev: IrrevEvent, file: File | null) => {
    if (!user?.id || !file) return;
    setBusy(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/irreversible-proof/${ev.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('verification-photos')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      await supabase.from('irreversible_events').update({
        proof_photo_path: path,
        status: 'captured',
        captured_at: new Date().toISOString(),
      }).eq('id', ev.id);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'irreversible_proof', id: ev.id } }));
      await load();
    } finally { setBusy(false); }
  };

  const setMaster = async (next: GinaWitnessConsent) => {
    if (!user?.id) return;
    setBusy(true);
    try {
      // The DB trigger cancels pending CCs retroactively when this leaves
      // 'granted'. We just record Gina's own decision.
      await supabase.from('user_state').update({ gina_witness_consent: next }).eq('user_id', user.id);
      await load();
    } finally { setBusy(false); }
  };

  const toggleOptIn = async (ev: IrrevEvent) => {
    if (!user?.id) return;
    setBusy(true);
    try {
      await supabase.from('irreversible_events')
        .update({ gina_cc_opt_in: !ev.gina_cc_opt_in })
        .eq('id', ev.id);
      await load();
    } finally { setBusy(false); }
  };

  if (!events) return null;
  const captured = events.filter(e => e.status === 'captured');
  const pending = events.filter(e => e.status === 'pending');
  // Render null only when there's truly nothing and the user isn't mid-add.
  if (events.length === 0 && !adding) {
    return (
      <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-medium text-zinc-200">Proof binder</div>
        </div>
        <button onClick={() => setAdding(true)} className="text-xs text-pink-300 hover:text-pink-200">
          + Log an irreversible act
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-medium text-zinc-200">Proof binder</div>
        <div className="text-xs text-zinc-500">{captured.length} on the record</div>
      </div>

      {pending.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-amber-400/80">Proof outstanding</div>
          {pending.map(ev => {
            const overdue = ev.proof_due_at != null && new Date(ev.proof_due_at).getTime() < Date.now();
            return (
              <div key={ev.id} className="rounded border border-zinc-800 bg-zinc-900/40 p-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-zinc-100">{ev.title}</span>
                  <span className={`text-[10px] ${overdue ? 'text-red-400' : 'text-zinc-500'}`}>
                    {KIND_LABEL[ev.event_kind]}{overdue ? ' · overdue' : ''}
                  </span>
                </div>
                <input
                  ref={el => { fileInputs.current[ev.id] = el; }}
                  type="file" accept="image/*" className="hidden"
                  onChange={e => captureProof(ev, e.target.files?.[0] ?? null)}
                />
                <button
                  disabled={busy}
                  onClick={() => fileInputs.current[ev.id]?.click()}
                  className="mt-1 text-xs text-pink-300 hover:text-pink-200 disabled:opacity-40"
                >
                  Capture proof (receipt / email screenshot)
                </button>
              </div>
            );
          })}
        </div>
      )}

      {captured.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-zinc-800">
          {captured.map(ev => {
            const wouldQueue = resolveCcStatus(masterConsent, {
              status: 'captured', gina_cc_opt_in: ev.gina_cc_opt_in, cc_status: ev.cc_status,
            });
            return (
              <div key={ev.id} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-zinc-300 truncate">{ev.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-zinc-600">{KIND_LABEL[ev.event_kind]}</span>
                  {masterConsent === 'granted' && (
                    <button
                      disabled={busy}
                      onClick={() => toggleOptIn(ev)}
                      className={`text-[10px] ${ev.gina_cc_opt_in ? 'text-emerald-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                      title="CC Gina on this proof (requires her standing consent)"
                    >
                      {ev.gina_cc_opt_in ? (wouldQueue === 'queued' || ev.cc_status === 'queued' ? 'CC: queued' : 'CC: on') : 'CC Gina'}
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add row */}
      {adding ? (
        <div className="space-y-2 pt-1 border-t border-zinc-800">
          <select
            value={newKind}
            onChange={e => setNewKind(e.target.value as EventKind)}
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200"
          >
            {KIND_OPTIONS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input
            autoFocus value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="What you did (e.g. bought the bralette)"
            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-200"
          />
          <div className="flex gap-2">
            <button disabled={busy || !newTitle.trim()} onClick={addEvent}
              className="text-xs text-pink-300 hover:text-pink-200 disabled:opacity-40">Log it</button>
            <button onClick={() => { setAdding(false); setNewTitle(''); }}
              className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-xs text-pink-300 hover:text-pink-200">
          + Log an irreversible act
        </button>
      )}

      {/* Gina-CC master switch — keyed to GINA'S OWN consent. Default off.
          Visible so the contract is explicit; flipping off cancels pending. */}
      <div className="pt-2 border-t border-zinc-800 text-[11px] text-zinc-500 space-y-1">
        <div>Gina CC — only with her standing consent:</div>
        <div className="flex gap-2">
          {(['never', 'granted', 'withdrawn'] as GinaWitnessConsent[]).map(v => (
            <button key={v} disabled={busy} onClick={() => setMaster(v)}
              className={`px-2 py-0.5 rounded border text-[10px] ${
                masterConsent === v
                  ? 'border-emerald-600 text-emerald-300'
                  : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}>
              {v === 'never' ? 'off' : v === 'granted' ? 'Gina consents' : 'withdrawn'}
            </button>
          ))}
        </div>
        {masterConsent !== 'granted' && (
          <div className="text-zinc-600">Binder works fully without Gina. No CC leaves the app until she consents.</div>
        )}
      </div>
    </div>
  );
}
