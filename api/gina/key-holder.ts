/**
 * Gina Key-Holder endpoint
 *
 * Token-authenticated surface for Gina to decide on pending release windows.
 * GET ?token=xxx  → returns user state + active lock + pending windows
 * POST { token, action: 'approve'|'deny'|'extend', window_id, note }
 *
 * No imports from src/lib (Vite-only). Uses process.env Supabase creds.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = (req.query.token as string) || (req.body?.token as string);
    if (!token) return res.status(400).json({ error: 'token required' });

    const { data: tokenRow } = await supabase
      .from('gina_access_tokens')
      .select('id, user_id, capability, expires_at, revoked_at')
      .eq('token', token)
      .maybeSingle();

    if (!tokenRow) return res.status(401).json({ error: 'invalid token' });
    if ((tokenRow as { revoked_at: string | null }).revoked_at) return res.status(401).json({ error: 'revoked' });
    const expiresAt = (tokenRow as { expires_at: string | null }).expires_at;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      return res.status(401).json({ error: 'expired' });
    }
    const capability = (tokenRow as { capability: string }).capability;
    if (capability !== 'weekly_key_holder' && capability !== 'daily_outfit_approval') {
      return res.status(403).json({ error: 'capability mismatch' });
    }

    const userId = (tokenRow as { user_id: string }).user_id;

    // Update last-used
    await supabase
      .from('gina_access_tokens')
      .update({ last_used_at: new Date().toISOString(), use_count: 1 })
      .eq('id', (tokenRow as { id: string }).id);

    if (req.method === 'GET') {
      // Return state + pending windows + outfit submissions (when applicable)
      const [stateRes, sessionRes, windowsRes, outfitsRes] = await Promise.all([
        supabase
          .from('user_state')
          .select('chastity_locked, chastity_streak_days, chastity_scheduled_unlock_at, chastity_total_break_glass_count')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('chastity_sessions')
          .select('id, locked_at, scheduled_unlock_at, duration_hours, status')
          .eq('user_id', userId)
          .eq('status', 'locked')
          .order('locked_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('gina_release_windows')
          .select('id, window_start, window_end, gina_decision, gina_decided_at, gina_note')
          .eq('user_id', userId)
          .order('window_start', { ascending: false })
          .limit(10),
        capability === 'daily_outfit_approval'
          ? supabase
              .from('outfit_submissions')
              .select('id, photo_url, description, submitted_at, gina_decision, gina_decided_at, gina_note')
              .eq('user_id', userId)
              .order('submitted_at', { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] }),
      ]);

      return res.status(200).json({
        userId,
        capability,
        state: stateRes.data,
        activeLock: sessionRes.data,
        windows: windowsRes.data || [],
        outfits: outfitsRes.data || [],
      });
    }

    if (req.method === 'POST') {
      const body = req.body as {
        action: 'approve' | 'deny' | 'extend' | 'create_window' | 'outfit_approve' | 'outfit_reject' | 'outfit_change';
        window_id?: string;
        outfit_id?: string;
        note?: string;
        window_start?: string;
        window_end?: string;
      };

      // Outfit decisions
      if (body.action === 'outfit_approve' || body.action === 'outfit_reject' || body.action === 'outfit_change') {
        if (capability !== 'daily_outfit_approval') return res.status(403).json({ error: 'capability mismatch' });
        if (!body.outfit_id) return res.status(400).json({ error: 'outfit_id required' });
        const decisionMap = {
          outfit_approve: 'approved',
          outfit_reject: 'rejected',
          outfit_change: 'change_required',
        } as const;
        await supabase
          .from('outfit_submissions')
          .update({
            gina_decision: decisionMap[body.action],
            gina_decided_at: new Date().toISOString(),
            gina_note: body.note || null,
          })
          .eq('id', body.outfit_id);
        return res.status(200).json({ ok: true });
      }

      if (body.action === 'create_window') {
        if (!body.window_start || !body.window_end) {
          return res.status(400).json({ error: 'window_start and window_end required' });
        }
        const { data: session } = await supabase
          .from('chastity_sessions')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'locked')
          .order('locked_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: created } = await supabase
          .from('gina_release_windows')
          .insert({
            user_id: userId,
            chastity_session_id: session ? (session as { id: string }).id : null,
            window_start: body.window_start,
            window_end: body.window_end,
            gina_decision: 'pending',
          })
          .select('id')
          .single();
        return res.status(200).json({ ok: true, window_id: (created as { id: string })?.id });
      }

      if (!body.window_id) return res.status(400).json({ error: 'window_id required' });

      if (body.action === 'approve') {
        // Approve → release the lock now, record decision
        await supabase
          .from('gina_release_windows')
          .update({
            gina_decision: 'release_approved',
            gina_decided_at: new Date().toISOString(),
            gina_note: body.note || null,
          })
          .eq('id', body.window_id);

        // Release current lock
        const { data: session } = await supabase
          .from('chastity_sessions')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'locked')
          .order('locked_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (session) {
          await supabase
            .from('chastity_sessions')
            .update({
              status: 'released',
              actual_unlock_at: new Date().toISOString(),
              unlock_authority: 'gina_release',
            })
            .eq('id', (session as { id: string }).id);
          await supabase
            .from('user_state')
            .update({
              chastity_locked: false,
              chastity_current_session_id: null,
              chastity_scheduled_unlock_at: null,
            })
            .eq('user_id', userId);
        }

        return res.status(200).json({ ok: true, released: true });
      }

      if (body.action === 'deny' || body.action === 'extend') {
        await supabase
          .from('gina_release_windows')
          .update({
            gina_decision: body.action === 'deny' ? 'release_denied' : 'extended',
            gina_decided_at: new Date().toISOString(),
            gina_note: body.note || null,
          })
          .eq('id', body.window_id);
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'unknown action' });
    }

    return res.status(405).json({ error: 'method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
