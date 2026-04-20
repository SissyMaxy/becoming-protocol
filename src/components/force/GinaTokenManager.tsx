/**
 * Gina Token Manager — shown in the Force Dashboard once Gina has accepted the
 * weekly_key_holder capability. Issues a URL Maxy shares with Gina and lists
 * active tokens.
 */

import { useEffect, useState } from 'react';
import { Key, Copy, Check, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface TokenRow {
  id: string;
  token: string;
  issued_at: string;
  last_used_at: string | null;
  use_count: number;
  revoked_at: string | null;
}

interface Props {
  userId: string;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

interface TokenRowWithCap extends TokenRow {
  capability: string;
}

export function GinaTokenManager({ userId }: Props) {
  const [tokens, setTokens] = useState<TokenRowWithCap[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    const [capRes, tokRes] = await Promise.all([
      supabase
        .from('gina_capability_grants')
        .select('capability')
        .eq('user_id', userId)
        .eq('active', true)
        .in('capability', ['weekly_key_holder', 'daily_outfit_approval']),
      supabase
        .from('gina_access_tokens')
        .select('id, token, issued_at, last_used_at, use_count, revoked_at, capability')
        .eq('user_id', userId)
        .in('capability', ['weekly_key_holder', 'daily_outfit_approval'])
        .order('issued_at', { ascending: false }),
    ]);
    const caps = (capRes.data || []).map((r: Record<string, unknown>) => r.capability as string);
    setCapabilities(caps);
    setTokens((tokRes.data || []) as TokenRowWithCap[]);
  };

  useEffect(() => {
    void load();
  }, [userId]);

  const issueToken = async (capability: string) => {
    setBusy(true);
    try {
      const t = randomToken();
      await supabase.from('gina_access_tokens').insert({
        user_id: userId,
        capability,
        token: t,
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    await supabase
      .from('gina_access_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    await load();
  };

  const copyUrl = async (token: string, id: string) => {
    const url = `${window.location.origin}/gina-key?token=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback: prompt
      window.prompt('Copy this URL:', url);
    }
  };

  if (capabilities.length === 0) return null;

  const active = tokens.filter(t => !t.revoked_at);
  const capLabel = (c: string) =>
    c === 'weekly_key_holder' ? 'Key holder' : c === 'daily_outfit_approval' ? 'Outfit approval' : c;

  return (
    <div className="p-3 rounded-lg border border-protocol-border bg-protocol-surface space-y-3">
      <div className="flex items-center gap-2">
        <Key className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium">Gina's URLs</span>
      </div>

      {capabilities.map(cap => (
        <div key={cap} className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{capLabel(cap)}</span>
            <button
              onClick={() => issueToken(cap)}
              disabled={busy}
              className="text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Issue new
            </button>
          </div>
          {active.filter(t => t.capability === cap).length === 0 && (
            <div className="text-[11px] text-gray-500">No active token for this capability.</div>
          )}
          {active.filter(t => t.capability === cap).map(t => (
            <div key={t.id} className="p-2 rounded border border-gray-800 bg-gray-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-gray-400">
                  Issued {new Date(t.issued_at).toLocaleDateString()}
                  {t.last_used_at && ` · used ${new Date(t.last_used_at).toLocaleDateString()}`}
                </div>
                <button
                  onClick={() => revoke(t.id)}
                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> revoke
                </button>
              </div>
              <button
                onClick={() => copyUrl(t.token, t.id)}
                className="w-full py-1.5 rounded bg-purple-600/20 border border-purple-500/30 text-purple-200 text-xs flex items-center justify-center gap-2 hover:bg-purple-600/30"
              >
                {copiedId === t.id ? <><Check className="w-3 h-3" /> copied</> : <><Copy className="w-3 h-3" /> copy URL</>}
              </button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
