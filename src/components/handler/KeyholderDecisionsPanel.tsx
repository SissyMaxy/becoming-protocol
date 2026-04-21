/**
 * KeyholderDecisionsPanel — shows pending keyholder requests (chastity
 * unlock, denial-day reset, privilege grants). Maxy files a request; the
 * designated witness (Gina or Handler-assigned keyholder) approves or
 * denies. No Maxy self-approval — that defeats the lock.
 */

import { useEffect, useState } from 'react';
import { Key, Loader2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface DecisionRow {
  id: string;
  decision_type: string;
  request_text: string;
  status: string;
  requested_at: string;
  keyholder_response: string | null;
  responded_at: string | null;
  expires_at: string | null;
}

const DECISION_TYPES = [
  { value: 'chastity_unlock', label: 'chastity unlock' },
  { value: 'denial_reset', label: 'denial reset' },
  { value: 'privilege_grant', label: 'privilege grant' },
  { value: 'safeword_invoke', label: 'safeword invoke' },
  { value: 'protocol_pause', label: 'protocol pause' },
];

export function KeyholderDecisionsPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DecisionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [type, setType] = useState('chastity_unlock');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('keyholder_decisions')
      .select('id, decision_type, request_text, status, requested_at, keyholder_response, responded_at, expires_at')
      .eq('user_id', user.id)
      .order('requested_at', { ascending: false })
      .limit(10);
    setRows((data || []) as DecisionRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const submit = async () => {
    if (!user?.id || !text.trim()) return;
    setSaving(true);
    try {
      await supabase.from('keyholder_decisions').insert({
        user_id: user.id,
        decision_type: type,
        request_text: text.trim(),
        status: 'pending',
        requested_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 48 * 3600000).toISOString(),
      });
      setText('');
      setComposing(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const statusColor = (s: string) =>
    s === 'approved' ? 'text-green-400'
    : s === 'denied' ? 'text-red-400'
    : s === 'expired' ? 'text-gray-500'
    : 'text-amber-400';

  return (
    <div className="bg-gray-900/60 border border-amber-500/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Key className="w-3 h-3 text-amber-400" />
        <span className="uppercase tracking-wider text-[10px] text-gray-500">Keyholder Requests</span>
        <button
          onClick={() => setComposing(c => !c)}
          className="ml-auto text-[10px] text-amber-400 hover:text-amber-300"
        >
          {composing ? 'cancel' : '+ request'}
        </button>
      </div>

      {composing && (
        <div className="space-y-2 mb-3">
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-[11px] text-gray-300"
          >
            {DECISION_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder="why you're asking. keyholder reads this."
            className="w-full bg-gray-950 border border-gray-800 rounded px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 resize-none"
          />
          <button
            onClick={submit}
            disabled={saving || !text.trim()}
            className="w-full py-1.5 rounded bg-amber-500/25 hover:bg-amber-500/40 text-amber-300 text-[11px] font-medium disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
            submit request
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-[11px] text-gray-500"><Loader2 className="w-3 h-3 animate-spin inline mr-1" /> loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-[10px] text-gray-500">No requests yet. Keyholder decisions are logged + held to.</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => (
            <div key={r.id} className="border border-gray-800 rounded p-2 text-[11px]">
              <div className="flex items-center gap-2 mb-1">
                <span className="uppercase text-[9px] text-gray-500">{r.decision_type.replace(/_/g, ' ')}</span>
                <span className={`ml-auto text-[10px] ${statusColor(r.status)} uppercase`}>{r.status}</span>
              </div>
              <div className="text-gray-400">{r.request_text.slice(0, 160)}{r.request_text.length > 160 && '...'}</div>
              {r.keyholder_response && (
                <div className="mt-1 pl-2 border-l border-amber-500/40 text-gray-300 italic">{r.keyholder_response.slice(0, 160)}</div>
              )}
              {r.status === 'pending' && r.expires_at && (
                <div className="flex items-center gap-1 mt-1 text-[9px] text-gray-500">
                  <Clock className="w-2.5 h-2.5" />
                  expires {new Date(r.expires_at).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
