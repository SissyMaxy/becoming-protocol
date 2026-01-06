/**
 * useAdaptiveFeminization Hook
 * Provides state management for the Adaptive Feminization Intelligence System
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getUserVectorStates,
  getActivePrescription,
  saveDailyPrescription,
  scoreAllVectors,
  generatePrescriptions,
  updateVectorProgress,
  recordEngagement,
  getIrreversibilityMarkers,
  acknowledgeIrreversibilityMarker,
  getLockInStatuses,
  createDefaultContext,
} from '../lib/adaptive-feminization';
import { ALL_VECTORS } from '../data/vector-definitions';
import type {
  VectorId,
  UserVectorState,
  UserContext,
  VectorScore,
  VectorPrescription,
  DailyPrescription,
  IrreversibilityMarker,
  LockInStatus,
  VectorProgressUpdate,
  VectorDisplayInfo,
} from '../types/adaptive-feminization';

interface UseAdaptiveFeminizationReturn {
  // State
  vectorStates: UserVectorState[];
  prescription: DailyPrescription | null;
  scores: VectorScore[];
  irreversibilityMarkers: IrreversibilityMarker[];
  lockInStatuses: LockInStatus[];
  isLoading: boolean;
  error: string | null;

  // Derived data
  vectorDisplayInfos: VectorDisplayInfo[];
  primaryVector: VectorPrescription | null;
  totalProgress: number;
  lockedInCount: number;

  // Actions
  refreshData: () => Promise<void>;
  generateNewPrescription: (context?: UserContext) => Promise<DailyPrescription | null>;
  logVectorProgress: (
    vectorId: VectorId,
    progressDelta: number,
    engagementMinutes: number,
    subComponentId?: string,
    subComponentDelta?: number
  ) => Promise<VectorProgressUpdate | null>;
  completeEngagement: (
    vectorId: VectorId,
    quality: 'excellent' | 'good' | 'mediocre' | 'poor',
    durationMinutes: number,
    notes?: string
  ) => Promise<void>;
  acknowledgeMarker: (markerId: string) => Promise<void>;
  getVectorState: (vectorId: VectorId) => UserVectorState | undefined;
  getVectorScore: (vectorId: VectorId) => VectorScore | undefined;
}

export function useAdaptiveFeminization(): UseAdaptiveFeminizationReturn {
  const { user } = useAuth();
  const [vectorStates, setVectorStates] = useState<UserVectorState[]>([]);
  const [prescription, setPrescription] = useState<DailyPrescription | null>(null);
  const [scores, setScores] = useState<VectorScore[]>([]);
  const [irreversibilityMarkers, setIrreversibilityMarkers] = useState<IrreversibilityMarker[]>([]);
  const [lockInStatuses, setLockInStatuses] = useState<LockInStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all data
  const refreshData = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const [states, activePrescription, markers, lockIns] = await Promise.all([
        getUserVectorStates(user.id),
        getActivePrescription(user.id),
        getIrreversibilityMarkers(user.id),
        getLockInStatuses(user.id),
      ]);

      setVectorStates(states);
      setPrescription(activePrescription);
      setIrreversibilityMarkers(markers);
      setLockInStatuses(lockIns);

      // Calculate scores with default context
      const context = createDefaultContext();
      const calculatedScores = scoreAllVectors(states, context);
      setScores(calculatedScores);
    } catch (err) {
      console.error('Failed to load adaptive feminization data:', err);
      setError('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Initial load
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Generate new prescription
  const generateNewPrescription = useCallback(async (
    context?: UserContext
  ): Promise<DailyPrescription | null> => {
    if (!user?.id) return null;

    try {
      const ctx = context || createDefaultContext();
      const calculatedScores = scoreAllVectors(vectorStates, ctx);
      const prescriptions = generatePrescriptions(calculatedScores, vectorStates, ctx);

      if (prescriptions.length === 0) return null;

      const saved = await saveDailyPrescription(user.id, ctx, prescriptions);
      setPrescription(saved);
      setScores(calculatedScores);

      return saved;
    } catch (err) {
      console.error('Failed to generate prescription:', err);
      setError('Failed to generate prescription');
      return null;
    }
  }, [user?.id, vectorStates]);

  // Log vector progress
  const logVectorProgress = useCallback(async (
    vectorId: VectorId,
    progressDelta: number,
    engagementMinutes: number,
    subComponentId?: string,
    subComponentDelta?: number
  ): Promise<VectorProgressUpdate | null> => {
    if (!user?.id) return null;

    try {
      const update = await updateVectorProgress(
        user.id,
        vectorId,
        progressDelta,
        engagementMinutes,
        subComponentId,
        subComponentDelta
      );

      // Refresh data to get updated states
      await refreshData();

      return update;
    } catch (err) {
      console.error('Failed to log progress:', err);
      setError('Failed to log progress');
      return null;
    }
  }, [user?.id, refreshData]);

  // Complete engagement
  const completeEngagement = useCallback(async (
    vectorId: VectorId,
    quality: 'excellent' | 'good' | 'mediocre' | 'poor',
    durationMinutes: number,
    notes?: string
  ): Promise<void> => {
    if (!user?.id) return;

    try {
      const context = createDefaultContext();
      const prescribedPriority = prescription?.prescriptions.find(
        p => p.vectorId === vectorId
      )?.priority;

      await recordEngagement(user.id, vectorId, context, {
        prescribedPriority,
        wasFollowed: !!prescribedPriority,
        engagementQuality: quality,
        durationMinutes,
        outcomeNotes: notes,
      });

      // Calculate progress based on quality
      const progressDelta = quality === 'excellent' ? 0.3
        : quality === 'good' ? 0.2
        : quality === 'mediocre' ? 0.1
        : 0.05;

      await logVectorProgress(vectorId, progressDelta, durationMinutes);
    } catch (err) {
      console.error('Failed to complete engagement:', err);
      setError('Failed to complete engagement');
    }
  }, [user?.id, prescription, logVectorProgress]);

  // Acknowledge irreversibility marker
  const acknowledgeMarker = useCallback(async (markerId: string): Promise<void> => {
    if (!user?.id) return;

    try {
      await acknowledgeIrreversibilityMarker(user.id, markerId);
      setIrreversibilityMarkers(prev =>
        prev.map(m => m.id === markerId ? { ...m, acknowledged: true } : m)
      );
    } catch (err) {
      console.error('Failed to acknowledge marker:', err);
    }
  }, [user?.id]);

  // Get vector state by ID
  const getVectorState = useCallback((vectorId: VectorId): UserVectorState | undefined => {
    return vectorStates.find(s => s.vectorId === vectorId);
  }, [vectorStates]);

  // Get vector score by ID
  const getVectorScore = useCallback((vectorId: VectorId): VectorScore | undefined => {
    return scores.find(s => s.vectorId === vectorId);
  }, [scores]);

  // Derived: vector display infos
  const vectorDisplayInfos: VectorDisplayInfo[] = ALL_VECTORS.map(vector => {
    const state = vectorStates.find(s => s.vectorId === vector.id);
    const level = state?.currentLevel || 0;
    const lockIn = lockInStatuses.find(l => l.vectorId === vector.id);

    // Calculate progress to next level
    const currentWhole = Math.floor(level);
    const progress = (level - currentWhole) * 100;

    // Vector colors
    const colors: Record<string, string> = {
      // Feminization - pink spectrum
      voice_training: '#ec4899',
      movement_posture: '#f472b6',
      skincare_beauty: '#f9a8d4',
      hair_styling: '#db2777',
      fitness_body: '#be185d',
      wardrobe_building: '#9d174d',
      public_presentation: '#831843',
      social_relationships: '#ec4899',
      professional_navigation: '#f472b6',
      family_dynamics: '#f9a8d4',
      dating_intimacy: '#db2777',
      community_integration: '#be185d',
      identity_integration: '#9d174d',
      emotional_processing: '#831843',
      self_perception: '#ec4899',
      memory_narrative: '#f472b6',
      future_visioning: '#f9a8d4',
      authenticity_expression: '#db2777',
      hormone_therapy: '#be185d',
      laser_electrolysis: '#9d174d',
      surgical_planning: '#831843',
      legal_documentation: '#ec4899',
      name_change: '#f472b6',
      wardrobe_purge: '#f9a8d4',
      // Sissification - purple spectrum
      denial_training: '#a855f7',
      edge_conditioning: '#c084fc',
      arousal_feminization_link: '#d8b4fe',
      orgasm_transformation: '#9333ea',
      chastity_integration: '#7c3aed',
      service_orientation: '#6d28d9',
      protocol_adherence: '#5b21b6',
      authority_response: '#a855f7',
      task_completion: '#c084fc',
      punishment_acceptance: '#d8b4fe',
      masculine_capability_atrophy: '#9333ea',
      guy_mode_discomfort: '#7c3aed',
      deadname_disconnection: '#6d28d9',
      old_self_alienation: '#5b21b6',
      feminine_default_state: '#a855f7',
      automatic_responses: '#c084fc',
      speech_patterns: '#d8b4fe',
      consumption_preferences: '#9333ea',
      social_role_adoption: '#7c3aed',
      sexual_role_fixation: '#6d28d9',
      lifestyle_restructuring: '#5b21b6',
    };

    return {
      id: vector.id,
      name: vector.name,
      category: vector.category,
      level: Math.floor(level),
      progress,
      isLockedIn: lockIn?.isLockedIn || false,
      color: colors[vector.id] || '#a855f7',
      icon: vector.id,
    };
  });

  // Derived: primary vector from prescription
  const primaryVector = prescription?.prescriptions.find(p => p.priority === 'primary') || null;

  // Derived: total progress (average level across all vectors)
  const totalProgress = vectorStates.length > 0
    ? vectorStates.reduce((sum, s) => sum + s.currentLevel, 0) / ALL_VECTORS.length
    : 0;

  // Derived: locked in count
  const lockedInCount = lockInStatuses.filter(l => l.isLockedIn).length;

  return {
    // State
    vectorStates,
    prescription,
    scores,
    irreversibilityMarkers,
    lockInStatuses,
    isLoading,
    error,

    // Derived data
    vectorDisplayInfos,
    primaryVector,
    totalProgress,
    lockedInCount,

    // Actions
    refreshData,
    generateNewPrescription,
    logVectorProgress,
    completeEngagement,
    acknowledgeMarker,
    getVectorState,
    getVectorScore,
  };
}
