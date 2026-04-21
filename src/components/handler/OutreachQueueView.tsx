/**
 * OutreachQueueView — shows Handler's queued outreach messages so Maxy can
 * see what's waiting. Pending = not yet delivered. Distinguishes urgency.
 * Tap a row to mark it acknowledged (which marks it delivered so useProactive
 * doesn't pop it again).
 */

import { useEffect, useState } from 'react';
import { Bell, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface QueuedMsg {
  id: string;
  message: string;
  urgency: string;
  trigger_reason: string;
  scheduled_for: string;
  expires_at: string | null;
  created_at: string;
}

export function OutreachQueueView() {
  const { user } = useAuth();
  const [rows, setRows] = useState<QueuedMsg[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('handler_outreach_queue')
      .select('id, message, urgency, trigger_reason, scheduled_for, expires_at, created_at')
      .eq('user_id', user.id)
      .is('delivered_at', null)
      .order('scheduled_for', { ascending: true })
      .limit(15);
    setRows((data || []) as QueuedMsg[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [user?.id]);

  const dismiss = async (id: string) => {
    await supabase
      .from('handler_outreach_queue')
      .update({ delivered_at: new Date().toISOString() })
      .eq('id', id);
    setRows(rs => rs.filter(r => r.id !== id));
  };

  if (loading && rows.length === 0) {
    return (
      <div className="bg-gray-900/60 border border-purple-500/20 rounded-lg p-3 text-[11px] text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> loading queue...
      </div>
    );
  }

  if (rows.length === 0) return null;

  const fmtTime = (iso: string) => {
    const diff = (new Date(iso).getTime() - Date.now()) / 60000;
    if (diff > 60) return `in ${Math.round(diff / 60)}h`;
    if (diff > 0) return `in ${Math.round(diff)}m`;
    if (diff > -60) return `${Math.abs(Math.round(diff))}m ago`;
    return `${Math.abs(Math.round(diff / 60))}h ago`;
  };

  const urgencyColor = (u: string) =>
    u === 'critical' ? 'border-red-500/60 bg-red-500/10'
    : u === 'high' ? 'border-orange-500/50 bg-orange-500/10'
    : 'border-purple-500/30 bg-purple-500/5';

  return (
    <div className="bg-gray-900/60 border border-purple-500/30 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="w-3 h-3 text-purple-400" />
        <span className="uppercase tracking-wider text-[10px] text-gray-500">Handler Queue</span>
        <span className="text-[10px] text-purple-400">{rows.length} pending</span>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {rows.map(r => (
          <button
            key={r.id}
            onClick={() => dismiss(r.id)}
            className={`w-full text-left text-[11px] border rounded p-2 ${urgencyColor(r.urgency)} hover:brightness-125`}
          >
            <div className="flex items-center gap-1 mb-1">
              {r.urgency === 'critical' && <AlertTriangle className="w-3 h-3 text-red-400" />}
              <span className="uppercase text-[9px] text-gray-500">{r.trigger_reason.replace(/_/g, ' ')}</span>
              <span className="ml-auto text-[9px] text-gray-500">{fmtTime(r.scheduled_for)}</span>
            </div>
            <div className="text-gray-300">{r.message.slice(0, 180)}{r.message.length > 180 && '...'}</div>
          </button>
        ))}
      </div>
      <p className="text-[9px] text-gray-600 mt-2">tap to acknowledge — removes from queue</p>
    </div>
  );
}
