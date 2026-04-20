/**
 * Gina Key-Holder Page
 *
 * Token-authenticated standalone page Gina uses to see the cage state and
 * approve/deny/extend release windows. Loaded via /gina-key?token=xxx — no
 * auth required, token lives in the URL.
 */

import { useEffect, useState } from 'react';
import { Lock, Check, X, Clock, AlertCircle, Loader2, Shirt } from 'lucide-react';

interface ReleaseWindow {
  id: string;
  window_start: string;
  window_end: string;
  gina_decision: string;
  gina_decided_at: string | null;
  gina_note: string | null;
}

interface KeyHolderState {
  userId: string;
  capability: string;
  state: {
    chastity_locked: boolean;
    chastity_streak_days: number;
    chastity_scheduled_unlock_at: string | null;
    chastity_total_break_glass_count: number;
  } | null;
  activeLock: {
    id: string;
    locked_at: string;
    scheduled_unlock_at: string;
    duration_hours: number;
    status: string;
  } | null;
  windows: ReleaseWindow[];
  outfits: Array<{
    id: string;
    photo_url: string | null;
    description: string | null;
    submitted_at: string;
    gina_decision: string;
    gina_decided_at: string | null;
    gina_note: string | null;
  }>;
}

export function GinaKeyHolderPage() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [data, setData] = useState<KeyHolderState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = async () => {
    if (!token) {
      setError('Missing token');
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/gina/key-holder?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Access denied');
        setLoading(false);
        return;
      }
      const payload: KeyHolderState = await res.json();
      setData(payload);
      setLoading(false);
    } catch (err) {
      setError(String(err));
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 30_000);
    return () => clearInterval(iv);
  }, []);

  const act = async (windowId: string, action: 'approve' | 'deny' | 'extend') => {
    setActionBusy(windowId + action);
    try {
      await fetch('/api/gina/key-holder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, window_id: windowId, note: note || null }),
      });
      setNote('');
      await load();
    } finally {
      setActionBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 rounded-xl border border-red-500/40 bg-red-950/30 text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <div className="text-red-200 font-semibold mb-1">Access denied</div>
          <div className="text-xs text-red-300/70">{error}</div>
        </div>
      </div>
    );
  }

  const pending = data.windows.filter(w => w.gina_decision === 'pending');
  const past = data.windows.filter(w => w.gina_decision !== 'pending');
  const unlockAt = data.activeLock?.scheduled_unlock_at
    ? new Date(data.activeLock.scheduled_unlock_at)
    : null;
  const hoursLeft = unlockAt ? Math.round((unlockAt.getTime() - Date.now()) / 3600000) : 0;

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold">
            {data.capability === 'daily_outfit_approval' ? 'Outfit Approval' : 'Key Holder'}
          </h1>
          <p className="text-sm text-gray-400">
            {data.capability === 'daily_outfit_approval' ? 'You approve what she wears.' : 'You hold her key.'}
          </p>
        </header>

        {/* Outfit submissions (when capability is outfit approval) */}
        {data.capability === 'daily_outfit_approval' && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-gray-300">Pending outfits</div>
            {data.outfits.filter(o => o.gina_decision === 'pending').length === 0 ? (
              <div className="p-4 rounded-xl border border-gray-800 bg-gray-950/50 text-center text-sm text-gray-500">
                Nothing submitted right now.
              </div>
            ) : (
              data.outfits.filter(o => o.gina_decision === 'pending').map(o => (
                <div key={o.id} className="p-4 rounded-xl border border-pink-500/40 bg-pink-950/20 space-y-3">
                  {o.photo_url && (
                    <img src={o.photo_url} alt="outfit" className="w-full rounded-lg max-h-96 object-cover" />
                  )}
                  {o.description && <div className="text-sm text-gray-300">{o.description}</div>}
                  <div className="text-xs text-gray-500">
                    Submitted {new Date(o.submitted_at).toLocaleString()}
                  </div>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Note (optional)..."
                    rows={2}
                    className="w-full bg-black/50 border border-gray-700 rounded p-2 text-sm"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={async () => {
                        setActionBusy(o.id + 'approve');
                        await fetch('/api/gina/key-holder', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ token, action: 'outfit_approve', outfit_id: o.id, note: note || null }),
                        });
                        setNote('');
                        await load();
                        setActionBusy(null);
                      }}
                      disabled={Boolean(actionBusy)}
                      className="py-2 rounded bg-green-600 hover:bg-green-700 text-sm font-semibold flex items-center justify-center gap-1"
                    >
                      <Check className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={async () => {
                        setActionBusy(o.id + 'change');
                        await fetch('/api/gina/key-holder', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ token, action: 'outfit_change', outfit_id: o.id, note: note || null }),
                        });
                        setNote('');
                        await load();
                        setActionBusy(null);
                      }}
                      disabled={Boolean(actionBusy)}
                      className="py-2 rounded bg-amber-600 hover:bg-amber-700 text-sm font-semibold"
                    >
                      Change it
                    </button>
                    <button
                      onClick={async () => {
                        setActionBusy(o.id + 'reject');
                        await fetch('/api/gina/key-holder', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ token, action: 'outfit_reject', outfit_id: o.id, note: note || null }),
                        });
                        setNote('');
                        await load();
                        setActionBusy(null);
                      }}
                      disabled={Boolean(actionBusy)}
                      className="py-2 rounded bg-red-600 hover:bg-red-700 text-sm font-semibold flex items-center justify-center gap-1"
                    >
                      <X className="w-4 h-4" /> No
                    </button>
                  </div>
                </div>
              ))
            )}

            {data.outfits.filter(o => o.gina_decision !== 'pending').length > 0 && (
              <div className="space-y-2 pt-3 border-t border-gray-800">
                <div className="text-sm font-semibold text-gray-500">Recent decisions</div>
                {data.outfits.filter(o => o.gina_decision !== 'pending').slice(0, 5).map(o => (
                  <div key={o.id} className="p-2 rounded border border-gray-800 text-xs flex items-center gap-2">
                    <Shirt className="w-3 h-3 text-gray-500" />
                    <span className="text-gray-400">{new Date(o.submitted_at).toLocaleDateString()}</span>
                    <span className={
                      o.gina_decision === 'approved' ? 'text-green-400'
                      : o.gina_decision === 'rejected' ? 'text-red-400'
                      : 'text-amber-400'
                    }>
                      {o.gina_decision.replace('_', ' ')}
                    </span>
                    {o.gina_note && <span className="text-gray-500 italic ml-auto">"{o.gina_note}"</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lock status (key-holder capability only) */}
        {data.capability === 'weekly_key_holder' && (
        <div className="p-5 rounded-2xl border border-purple-500/30 bg-purple-950/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-purple-400" />
              <span className="font-semibold">
                {data.state?.chastity_locked ? 'LOCKED' : 'UNLOCKED'}
              </span>
            </div>
            {data.state?.chastity_streak_days !== undefined && (
              <span className="text-xs text-purple-300">
                Day {data.state.chastity_streak_days}
              </span>
            )}
          </div>
          {data.state?.chastity_locked && unlockAt && (
            <div className="text-sm text-gray-300">
              Scheduled unlock: {unlockAt.toLocaleString()}
              <div className="text-xs text-gray-500 mt-0.5">
                {hoursLeft > 24 ? `in ${Math.round(hoursLeft / 24)} days` : `in ${hoursLeft} hours`}
              </div>
            </div>
          )}
          {(data.state?.chastity_total_break_glass_count || 0) > 0 && (
            <div className="mt-2 text-xs text-red-400">
              Lifetime break-glass: {data.state!.chastity_total_break_glass_count}
            </div>
          )}
        </div>
        )}

        {/* Pending windows */}
        {data.capability === 'weekly_key_holder' && pending.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-gray-300">Pending decisions</div>
            {pending.map(w => {
              const start = new Date(w.window_start);
              const end = new Date(w.window_end);
              return (
                <div key={w.id} className="p-4 rounded-xl border border-amber-500/40 bg-amber-950/20 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>
                      {start.toLocaleString()} → {end.toLocaleString()}
                    </span>
                  </div>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Optional note to her..."
                    rows={2}
                    className="w-full bg-black/50 border border-gray-700 rounded p-2 text-sm text-white"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => act(w.id, 'approve')}
                      disabled={Boolean(actionBusy)}
                      className="py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-semibold flex items-center justify-center gap-1"
                    >
                      <Check className="w-4 h-4" /> Release
                    </button>
                    <button
                      onClick={() => act(w.id, 'deny')}
                      disabled={Boolean(actionBusy)}
                      className="py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-1"
                    >
                      <X className="w-4 h-4" /> Deny
                    </button>
                    <button
                      onClick={() => act(w.id, 'extend')}
                      disabled={Boolean(actionBusy)}
                      className="py-2 rounded bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold"
                    >
                      Extend
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {data.capability === 'weekly_key_holder' && pending.length === 0 && (
          <div className="p-4 rounded-xl border border-gray-800 bg-gray-950/50 text-center text-sm text-gray-500">
            No pending decisions right now.
          </div>
        )}

        {/* Past decisions */}
        {data.capability === 'weekly_key_holder' && past.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold text-gray-500">History</div>
            {past.slice(0, 5).map(w => (
              <div key={w.id} className="p-2 rounded border border-gray-800 text-xs text-gray-400">
                <div className="flex items-center justify-between">
                  <span>{new Date(w.window_start).toLocaleString()}</span>
                  <span className={
                    w.gina_decision === 'release_approved' ? 'text-green-400'
                    : w.gina_decision === 'release_denied' ? 'text-red-400'
                    : 'text-gray-500'
                  }>
                    {w.gina_decision.replace('release_', '').replace('_', ' ')}
                  </span>
                </div>
                {w.gina_note && <div className="text-gray-500 mt-1 italic">"{w.gina_note}"</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
