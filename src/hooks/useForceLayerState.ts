/**
 * useForceLayerState
 *
 * Consolidated state for the force-feminization layer: Hard Mode, slip points,
 * punishment queue, chastity lock, regimen adherence, disclosure ladder.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface ForceLayerState {
  loading: boolean;
  hardModeActive: boolean;
  hardModeSince: string | null;
  hardModeReason: string | null;
  slipPoints24h: number;
  slipPointsThreshold: number;

  chastityLocked: boolean;
  chastityStreak: number;
  chastityScheduledUnlock: string | null;
  chastityBreakGlassCount: number;

  queuedPunishments: Array<{
    id: string;
    title: string;
    description: string;
    severity: number;
    dueBy: string | null;
    dodgeCount: number;
    overdue: boolean;
  }>;

  overdueDisclosure: {
    rung: number;
    title: string;
    deadline: string;
  } | null;

  nextDisclosure: {
    id: string;
    rung: number;
    title: string;
    domain: string;
    deadline: string;
    daysUntil: number;
  } | null;

  activeRegimen: Array<{
    name: string;
    category: string;
    stage: string;
    daysActive: number;
  }>;

  nextImmersion: {
    id: string;
    scheduledStart: string;
    durationMinutes: number;
    type: string;
  } | null;

  narrativeOverwriteActive: boolean;
}

const HARD_MODE_THRESHOLD = 15;

const empty: ForceLayerState = {
  loading: true,
  hardModeActive: false,
  hardModeSince: null,
  hardModeReason: null,
  slipPoints24h: 0,
  slipPointsThreshold: HARD_MODE_THRESHOLD,
  chastityLocked: false,
  chastityStreak: 0,
  chastityScheduledUnlock: null,
  chastityBreakGlassCount: 0,
  queuedPunishments: [],
  overdueDisclosure: null,
  nextDisclosure: null,
  activeRegimen: [],
  nextImmersion: null,
  narrativeOverwriteActive: false,
};

export function useForceLayerState(userId: string | undefined): { state: ForceLayerState; refresh: () => Promise<void> } {
  const [state, setState] = useState<ForceLayerState>(empty);

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(empty);
      return;
    }

    // First-run: seed the Gina disclosure ladder if this user has nothing yet.
    // Fire-and-forget — if it fails, the dashboard still renders.
    void (async () => {
      const { count } = await supabase
        .from('gina_disclosure_schedule')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if ((count || 0) === 0) {
        try {
          const { seedLadder } = await import('../lib/force/gina-disclosure');
          await seedLadder(userId, 7);
        } catch (err) {
          console.error('[Force] ladder seed failed:', err);
        }
      }
    })();

    const [
      userStateResult,
      punishmentsResult,
      disclosureResult,
      regimenResult,
      immersionResult,
    ] = await Promise.allSettled([
      supabase
        .from('user_state')
        .select('hard_mode_active, hard_mode_entered_at, hard_mode_reason, slip_points_rolling_24h, chastity_locked, chastity_streak_days, chastity_scheduled_unlock_at, chastity_total_break_glass_count, narrative_overwrite_active')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('punishment_queue')
        .select('id, title, description, severity, due_by, dodge_count')
        .eq('user_id', userId)
        .in('status', ['queued', 'active', 'escalated'])
        .order('severity', { ascending: false })
        .limit(10),
      supabase
        .from('gina_disclosure_schedule')
        .select('id, rung, title, disclosure_domain, hard_deadline')
        .eq('user_id', userId)
        .eq('status', 'scheduled')
        .order('rung', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('medication_regimen')
        .select('medication_name, medication_category, ratchet_stage, started_at')
        .eq('user_id', userId)
        .eq('active', true),
      supabase
        .from('immersion_sessions')
        .select('id, scheduled_start, committed_duration_minutes, session_type')
        .eq('user_id', userId)
        .in('status', ['scheduled', 'active'])
        .order('scheduled_start', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const us = userStateResult.status === 'fulfilled' ? userStateResult.value.data : null;
    const punishments = (punishmentsResult.status === 'fulfilled' ? punishmentsResult.value.data : []) ?? [];
    const disclosure = disclosureResult.status === 'fulfilled' ? disclosureResult.value.data : null;
    const regimens = (regimenResult.status === 'fulfilled' ? regimenResult.value.data : []) ?? [];
    const immersion = immersionResult.status === 'fulfilled' ? immersionResult.value.data : null;

    const now = Date.now();

    setState({
      loading: false,
      hardModeActive: Boolean(us?.hard_mode_active),
      hardModeSince: (us?.hard_mode_entered_at as string) || null,
      hardModeReason: (us?.hard_mode_reason as string) || null,
      slipPoints24h: (us?.slip_points_rolling_24h as number) || 0,
      slipPointsThreshold: HARD_MODE_THRESHOLD,
      chastityLocked: Boolean(us?.chastity_locked),
      chastityStreak: (us?.chastity_streak_days as number) || 0,
      chastityScheduledUnlock: (us?.chastity_scheduled_unlock_at as string) || null,
      chastityBreakGlassCount: (us?.chastity_total_break_glass_count as number) || 0,
      queuedPunishments: (punishments as Array<Record<string, unknown>>).map(p => ({
        id: p.id as string,
        title: p.title as string,
        description: p.description as string,
        severity: (p.severity as number) || 1,
        dueBy: (p.due_by as string) || null,
        dodgeCount: (p.dodge_count as number) || 0,
        overdue: p.due_by ? new Date(p.due_by as string).getTime() < now : false,
      })),
      overdueDisclosure:
        disclosure && new Date(disclosure.hard_deadline as string).getTime() < now
          ? {
              rung: disclosure.rung as number,
              title: disclosure.title as string,
              deadline: disclosure.hard_deadline as string,
            }
          : null,
      nextDisclosure: disclosure
        ? {
            id: disclosure.id as string,
            rung: disclosure.rung as number,
            title: disclosure.title as string,
            domain: disclosure.disclosure_domain as string,
            deadline: disclosure.hard_deadline as string,
            daysUntil: Math.ceil(
              (new Date(disclosure.hard_deadline as string).getTime() - now) / 86400000,
            ),
          }
        : null,
      activeRegimen: (regimens as Array<Record<string, unknown>>).map(r => ({
        name: r.medication_name as string,
        category: r.medication_category as string,
        stage: r.ratchet_stage as string,
        daysActive: Math.floor((now - new Date(r.started_at as string).getTime()) / 86400000),
      })),
      nextImmersion: immersion
        ? {
            id: immersion.id as string,
            scheduledStart: immersion.scheduled_start as string,
            durationMinutes: immersion.committed_duration_minutes as number,
            type: immersion.session_type as string,
          }
        : null,
      narrativeOverwriteActive: Boolean(us?.narrative_overwrite_active),
    });
  }, [userId]);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => clearInterval(iv);
  }, [refresh]);

  return { state, refresh };
}
