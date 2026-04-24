/**
 * LovenseHealthBanner — surfaces actual Lovense command health on Today.
 *
 * Reads the last 10 lovense_commands for the user, classifies the pattern,
 * and shows a specific diagnosis when the phone app tunnel is broken.
 * Hidden when everything is healthy.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Row {
  command_type: string;
  success: boolean;
  error_message: string | null;
  executed_at: string;
}

type Health = 'healthy' | 'app_offline' | 'never_paired' | 'no_recent_commands';

export function LovenseHealthBanner() {
  const { user } = useAuth();
  const [state, setState] = useState<{ health: Health; lastFailedAt: string | null; failedCount: number } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const load = async () => {
      const { data: devices } = await supabase
        .from('lovense_devices')
        .select('is_connected, last_seen_at')
        .eq('user_id', user.id);
      const anyPaired = (devices || []).length > 0;
      if (!anyPaired) {
        if (alive) setState({ health: 'never_paired', lastFailedAt: null, failedCount: 0 });
        return;
      }

      const { data: cmds } = await supabase
        .from('lovense_commands')
        .select('command_type, success, error_message, executed_at')
        .eq('user_id', user.id)
        .order('executed_at', { ascending: false })
        .limit(10);
      const rows = (cmds || []) as Row[];
      if (rows.length === 0) {
        if (alive) setState({ health: 'no_recent_commands', lastFailedAt: null, failedCount: 0 });
        return;
      }

      // Consider only vibrate/stop/function — ignore connect/disconnect housekeeping
      const actionable = rows.filter(r => ['Function', 'Stop', 'Pattern'].includes(r.command_type));
      if (actionable.length === 0) {
        if (alive) setState({ health: 'no_recent_commands', lastFailedAt: null, failedCount: 0 });
        return;
      }
      const failed = actionable.filter(r => !r.success);
      const failedAppOffline = failed.filter(r => (r.error_message || '').toLowerCase().includes('app is offline'));
      const failRate = failed.length / actionable.length;

      if (failRate >= 0.6 && failedAppOffline.length >= 2) {
        if (alive) setState({ health: 'app_offline', lastFailedAt: failed[0]?.executed_at || null, failedCount: failedAppOffline.length });
      } else {
        if (alive) setState({ health: 'healthy', lastFailedAt: null, failedCount: 0 });
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [user?.id]);

  if (!state) return null;
  if (state.health === 'healthy') return null;

  const colors = state.health === 'app_offline'
    ? { border: '#7a1f22', bg: 'linear-gradient(92deg, #2a0a0c, #1a0608)', text: '#f47272' }
    : state.health === 'never_paired'
    ? { border: '#7a5a1f', bg: 'linear-gradient(92deg, #2a1f0a, #1f1608)', text: '#f4c272' }
    : { border: '#2d1a4d', bg: 'linear-gradient(92deg, #1a0f2e, #150a24)', text: '#c4b5fd' };

  let title = '';
  let detail = '';
  if (state.health === 'app_offline') {
    title = `Lovense phone app offline · ${state.failedCount} commands dropped`;
    detail = 'Your phone\'s Lovense Remote app lost its tunnel to their cloud. Server thinks you\'re connected but commands are dying before they leave their servers. Fix: force-quit Lovense Remote, reopen it, stay on Long Distance Control in the foreground. iOS/Android kills backgrounded WebSockets in ~30s.';
  } else if (state.health === 'never_paired') {
    title = 'No Lovense paired';
    detail = 'Connect a toy via the Lovense Remote app → Long Distance Control → scan the pairing QR from Settings.';
  } else {
    title = 'No recent device activity';
    detail = 'No commands fired in this session yet.';
  }

  return (
    <div style={{
      background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 10,
      padding: '12px 16px', margin: '0 0 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth="1.8" style={{ flexShrink: 0, marginTop: 1 }}>
        <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
      </svg>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.text, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: colors.text, opacity: 0.85, lineHeight: 1.5 }}>{detail}</div>
      </div>
    </div>
  );
}
