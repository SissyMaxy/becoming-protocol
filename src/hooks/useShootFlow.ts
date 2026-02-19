/**
 * useShootFlow — Orchestrates the full shoot lifecycle
 * Loads prescribed shoots, manages state transitions,
 * handles reference images, and bridges to content queue.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import type {
  ShootPrescription, ShootReferenceImage, AudiencePoll,
  DbShootPrescription, DbShootReferenceImage, DbAudiencePoll,
  ShootStatus,
} from '../types/industry';
import { generateMultiplicationPlan } from '../lib/industry/content-multiplier';

export type ShootFlowPhase = 'card' | 'shooting' | 'upload' | 'posting' | 'done';

interface ShootFlowState {
  // Data
  prescriptions: ShootPrescription[];
  activeShoot: ShootPrescription | null;
  references: Map<string, ShootReferenceImage>;
  activePoll: AudiencePoll | null;

  // UI phase
  phase: ShootFlowPhase;

  // Loading
  isLoading: boolean;

  // Actions
  loadPrescriptions: () => Promise<void>;
  startShoot: (shootId: string) => Promise<void>;
  completeShoting: () => void;
  uploadMedia: (mediaPaths: string[]) => Promise<void>;
  markPosted: (platform: string) => Promise<void>;
  markAllPosted: () => Promise<void>;
  skipShoot: (shootId: string) => Promise<void>;
  closeFlow: () => void;
}

export function useShootFlow(): ShootFlowState {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState<ShootPrescription[]>([]);
  const [activeShoot, setActiveShoot] = useState<ShootPrescription | null>(null);
  const [references, setReferences] = useState<Map<string, ShootReferenceImage>>(new Map());
  const [activePoll, setActivePoll] = useState<AudiencePoll | null>(null);
  const [phase, setPhase] = useState<ShootFlowPhase>('card');
  const [isLoading, setIsLoading] = useState(false);

  // Load today's prescriptions
  const loadPrescriptions = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { data, error } = await supabase
        .from('shoot_prescriptions')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['prescribed', 'in_progress', 'captured', 'ready_to_post'])
        .order('scheduled_for', { ascending: true });

      if (error) throw error;
      if (data) {
        const mapped = (data as DbShootPrescription[]).map(row => ({
          id: row.id,
          userId: row.user_id,
          title: row.title,
          denialDay: row.denial_day,
          shootType: row.shoot_type as ShootPrescription['shootType'],
          outfit: row.outfit,
          setup: row.setup,
          mood: row.mood,
          shotList: row.shot_list ?? [],
          handlerNote: row.handler_note,
          estimatedMinutes: row.estimated_minutes,
          denialBadgeColor: row.denial_badge_color,
          contentLevel: row.content_level,
          pollId: row.poll_id,
          scheduledFor: row.scheduled_for,
          mediaPaths: row.media_paths ?? [],
          selectedMedia: row.selected_media ?? [],
          primaryPlatform: row.primary_platform,
          secondaryPlatforms: row.secondary_platforms ?? [],
          captionDraft: row.caption_draft,
          hashtags: row.hashtags,
          status: row.status as ShootPrescription['status'],
          skippedAt: row.skipped_at,
          skipConsequence: row.skip_consequence,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
        setPrescriptions(mapped);
      }
    } catch (err) {
      console.error('Failed to load prescriptions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Load reference images (once)
  useEffect(() => {
    async function loadRefs() {
      const { data } = await supabase
        .from('shoot_reference_images')
        .select('*');
      if (data) {
        const map = new Map<string, ShootReferenceImage>();
        for (const row of data as DbShootReferenceImage[]) {
          map.set(row.pose_name, {
            id: row.id,
            poseName: row.pose_name,
            angle: row.angle,
            bodyPosition: row.body_position,
            lighting: row.lighting,
            cameraPosition: row.camera_position,
            svgData: row.svg_data,
            description: row.description,
            tags: row.tags ?? [],
            difficulty: row.difficulty,
            createdAt: row.created_at,
          });
        }
        setReferences(map);
      }
    }
    loadRefs();
  }, []);

  // Load prescriptions on mount
  useEffect(() => {
    loadPrescriptions();
  }, [loadPrescriptions]);

  // Start a shoot
  const startShoot = useCallback(async (shootId: string) => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('shoot_prescriptions')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', shootId)
        .eq('user_id', user.id);

      if (error) throw error;

      const shoot = prescriptions.find(p => p.id === shootId);
      if (shoot) {
        const updated = { ...shoot, status: 'in_progress' as ShootStatus };
        setActiveShoot(updated);
        setPhase('shooting');

        // Load active poll if linked
        if (shoot.pollId) {
          const { data: pollData } = await supabase
            .from('audience_polls')
            .select('*')
            .eq('id', shoot.pollId)
            .single();
          if (pollData) {
            const p = pollData as DbAudiencePoll;
            setActivePoll({
              id: p.id,
              userId: p.user_id,
              question: p.question,
              pollType: p.poll_type as AudiencePoll['pollType'],
              options: p.options ?? [],
              platformsPosted: p.platforms_posted ?? [],
              platformPollIds: p.platform_poll_ids ?? {},
              handlerIntent: p.handler_intent,
              winningOptionId: p.winning_option_id,
              resultHonored: p.result_honored,
              resultPostId: p.result_post_id,
              status: p.status as AudiencePoll['status'],
              expiresAt: p.expires_at,
              postedAt: p.posted_at,
              createdAt: p.created_at,
            });
          }
        }
      }
    } catch (err) {
      console.error('Failed to start shoot:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, prescriptions]);

  // Transition from shooting to upload
  const completeShoting = useCallback(() => {
    setPhase('upload');
  }, []);

  // Upload media and transition to posting
  const uploadMedia = useCallback(async (mediaPaths: string[]) => {
    if (!user?.id || !activeShoot) return;
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('shoot_prescriptions')
        .update({
          status: 'captured',
          media_paths: mediaPaths,
          selected_media: mediaPaths, // For now, all uploaded = selected
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeShoot.id)
        .eq('user_id', user.id);

      if (error) throw error;

      setActiveShoot(prev => prev ? {
        ...prev,
        status: 'captured',
        mediaPaths,
        selectedMedia: mediaPaths,
      } : null);

      // Generate multiplication plan
      if (activeShoot) {
        await generateMultiplicationPlan(user.id, {
          ...activeShoot,
          mediaPaths,
          selectedMedia: mediaPaths,
        }, mediaPaths);
      }

      setPhase('posting');
    } catch (err) {
      console.error('Failed to upload media:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, activeShoot]);

  // Mark a platform as posted
  const markPosted = useCallback(async (_platform: string) => {
    // This updates content_queue status per-platform
    // For now, just track locally
  }, []);

  // Mark entire shoot as posted
  const markAllPosted = useCallback(async () => {
    if (!user?.id || !activeShoot) return;
    try {
      await supabase
        .from('shoot_prescriptions')
        .update({
          status: 'posted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeShoot.id)
        .eq('user_id', user.id);

      setActiveShoot(prev => prev ? { ...prev, status: 'posted' } : null);
      setPhase('done');
      await loadPrescriptions();
    } catch (err) {
      console.error('Failed to mark posted:', err);
    }
  }, [user?.id, activeShoot, loadPrescriptions]);

  // Skip a shoot
  const skipShoot = useCallback(async (shootId: string) => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('shoot_prescriptions')
        .update({
          status: 'skipped',
          skipped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', shootId)
        .eq('user_id', user.id);

      if (error) throw error;

      // Record skip consequence
      const shoot = prescriptions.find(p => p.id === shootId);
      if (shoot) {
        // Count consecutive skips
        const { data: recentSkips } = await supabase
          .from('skip_consequences')
          .select('consecutive_skips')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const prevSkips = recentSkips?.[0]?.consecutive_skips ?? 0;
        const consecutiveSkips = prevSkips + 1;

        const consequenceType = consecutiveSkips <= 2
          ? 'easier_tomorrow'
          : consecutiveSkips <= 3
            ? 'audience_poll'
            : consecutiveSkips <= 4
              ? 'handler_public_post'
              : 'full_accountability';

        await supabase.from('skip_consequences').insert({
          user_id: user.id,
          shoot_prescription_id: shootId,
          consecutive_skips: consecutiveSkips,
          consequence_type: consequenceType,
        });
      }

      await loadPrescriptions();
    } catch (err) {
      console.error('Failed to skip shoot:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, prescriptions, loadPrescriptions]);

  // Close flow and return to card view
  const closeFlow = useCallback(() => {
    setActiveShoot(null);
    setActivePoll(null);
    setPhase('card');
  }, []);

  return {
    prescriptions,
    activeShoot,
    references,
    activePoll,
    phase,
    isLoading,
    loadPrescriptions,
    startShoot,
    completeShoting,
    uploadMedia,
    markPosted,
    markAllPosted,
    skipShoot,
    closeFlow,
  };
}
