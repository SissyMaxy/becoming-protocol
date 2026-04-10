import { useState, useEffect } from 'react';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function SystemAuditView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed) return;

    async function load() {
      setLoading(true);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) throw new Error('No auth');

        const res = await fetch('/api/admin/system-state', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [revealed]);

  if (!revealed) {
    return (
      <div className="p-6 space-y-4">
        <h2 className="text-xl font-semibold text-protocol-text">Architect View</h2>
        <p className="text-sm text-protocol-text-muted">
          The chat UI obfuscates system state. This view shows the actual data — parameters,
          scores, calculations. Use this when you need to know what the system is actually doing.
          Use it sparingly. Knowing breaks the spell.
        </p>
        <button
          onClick={() => setRevealed(true)}
          className="px-4 py-2 rounded-lg bg-red-900/30 border border-red-500/50 text-red-300 text-sm font-medium flex items-center gap-2"
        >
          <Eye className="w-4 h-4" />
          Reveal system state
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-protocol-text">System State (raw)</h2>
        <button
          onClick={() => { setRevealed(false); setData(null); }}
          className="text-xs text-protocol-text-muted flex items-center gap-1"
        >
          <EyeOff className="w-3 h-3" />
          Hide
        </button>
      </div>

      {loading && <Loader2 className="w-6 h-6 animate-spin" />}
      {error && <div className="text-red-400 text-sm">{error}</div>}

      {data && (
        <pre className="text-xs text-protocol-text bg-black/50 rounded-lg p-4 overflow-auto max-h-[80vh] whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
