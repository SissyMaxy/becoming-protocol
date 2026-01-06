// Intimate Seeds Management Hook

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  IntimateSeed,
  SeedAction,
  SeedInput,
  SeedActionInput,
  SeedPhase,
  DbIntimateSeed,
  DbSeedAction,
  PhaseHistoryEntry,
} from '../types/arousal';

interface UseIntimateSeedsReturn {
  // State
  seeds: IntimateSeed[];
  activeSeeds: IntimateSeed[];
  establishedSeeds: IntimateSeed[];
  isLoading: boolean;
  error: string | null;

  // Actions
  addSeed: (seed: SeedInput) => Promise<IntimateSeed>;
  updateSeed: (seedId: string, updates: Partial<SeedInput>) => Promise<void>;
  advanceSeed: (seedId: string, newPhase: SeedPhase, notes?: string) => Promise<void>;
  deleteSeed: (seedId: string) => Promise<void>;
  logSeedAction: (seedId: string, action: SeedActionInput) => Promise<SeedAction>;
  getSeedActions: (seedId: string) => Promise<SeedAction[]>;
  refresh: () => Promise<void>;
}

// ============================================
// MAPPERS
// ============================================

function mapDbToSeed(db: DbIntimateSeed): IntimateSeed {
  return {
    id: db.id,
    userId: db.user_id,
    title: db.title,
    description: db.description || undefined,
    category: db.category as IntimateSeed['category'],
    intensityLevel: db.intensity_level,
    currentPhase: db.current_phase as SeedPhase,
    phaseHistory: db.phase_history || [],
    lastReception: db.last_reception as IntimateSeed['lastReception'],
    receptionNotes: db.reception_notes || undefined,
    bestTimingContext: db.best_timing_context || undefined,
    avoidContexts: db.avoid_contexts || undefined,
    prerequisites: db.prerequisites || [],
    enables: db.enables || [],
    relatedBreakthroughs: db.related_breakthroughs || [],
    seedScripts: db.seed_scripts || {},
    source: db.source as IntimateSeed['source'],
    priority: db.priority,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

function mapDbToSeedAction(db: DbSeedAction): SeedAction {
  return {
    id: db.id,
    userId: db.user_id,
    seedId: db.seed_id,
    actionType: db.action_type as SeedAction['actionType'],
    occurredAt: db.occurred_at,
    arousalState: db.arousal_state as SeedAction['arousalState'],
    partnerMood: db.partner_mood || undefined,
    context: db.context || undefined,
    whatHappened: db.what_happened || undefined,
    herReaction: db.her_reaction || undefined,
    yourFeeling: db.your_feeling || undefined,
    whatWorked: db.what_worked || undefined,
    whatDidnt: db.what_didnt || undefined,
    nextStep: db.next_step || undefined,
    phaseChangeTo: db.phase_change_to as SeedPhase | undefined,
    createdAt: db.created_at,
  };
}

// ============================================
// HOOK
// ============================================

export function useIntimateSeeds(): UseIntimateSeedsReturn {
  const [seeds, setSeeds] = useState<IntimateSeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtered views
  const activeSeeds = seeds.filter(
    s => !['established', 'abandoned', 'paused'].includes(s.currentPhase)
  );
  const establishedSeeds = seeds.filter(s => s.currentPhase === 'established');

  // Load seeds on mount
  useEffect(() => {
    loadSeeds();
  }, []);

  const loadSeeds = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('intimate_seeds')
        .select('*')
        .eq('user_id', user.id)
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });

      if (fetchError) throw fetchError;

      setSeeds((data as DbIntimateSeed[]).map(mapDbToSeed));
    } catch (err) {
      console.error('Failed to load seeds:', err);
      setError(err instanceof Error ? err.message : 'Failed to load seeds');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Add a new seed
   */
  const addSeed = useCallback(async (input: SeedInput): Promise<IntimateSeed> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const phaseHistory: PhaseHistoryEntry[] = [
      { phase: 'identified', date: new Date().toISOString() },
    ];

    const { data, error: insertError } = await supabase
      .from('intimate_seeds')
      .insert({
        user_id: user.id,
        title: input.title,
        description: input.description || null,
        category: input.category,
        intensity_level: input.intensityLevel,
        current_phase: 'identified',
        phase_history: phaseHistory,
        best_timing_context: input.bestTimingContext || null,
        avoid_contexts: input.avoidContexts || null,
        prerequisites: input.prerequisites || [],
        enables: input.enables || [],
        source: 'user',
        priority: 5,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    const newSeed = mapDbToSeed(data as DbIntimateSeed);
    setSeeds(prev => [newSeed, ...prev]);
    return newSeed;
  }, []);

  /**
   * Update a seed
   */
  const updateSeed = useCallback(async (
    seedId: string,
    updates: Partial<SeedInput>
  ): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.intensityLevel !== undefined) updateData.intensity_level = updates.intensityLevel;
    if (updates.bestTimingContext !== undefined) updateData.best_timing_context = updates.bestTimingContext;
    if (updates.avoidContexts !== undefined) updateData.avoid_contexts = updates.avoidContexts;
    if (updates.prerequisites !== undefined) updateData.prerequisites = updates.prerequisites;
    if (updates.enables !== undefined) updateData.enables = updates.enables;

    const { error: updateError } = await supabase
      .from('intimate_seeds')
      .update(updateData)
      .eq('id', seedId)
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    setSeeds(prev =>
      prev.map(s =>
        s.id === seedId
          ? { ...s, ...updates, updatedAt: new Date().toISOString() }
          : s
      )
    );
  }, []);

  /**
   * Advance a seed to a new phase
   */
  const advanceSeed = useCallback(async (
    seedId: string,
    newPhase: SeedPhase,
    notes?: string
  ): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const seed = seeds.find(s => s.id === seedId);
    if (!seed) throw new Error('Seed not found');

    const phaseHistoryEntry: PhaseHistoryEntry = {
      phase: newPhase,
      date: new Date().toISOString(),
      notes,
    };

    const newPhaseHistory = [...seed.phaseHistory, phaseHistoryEntry];

    const { error: updateError } = await supabase
      .from('intimate_seeds')
      .update({
        current_phase: newPhase,
        phase_history: newPhaseHistory,
        updated_at: new Date().toISOString(),
      })
      .eq('id', seedId)
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    setSeeds(prev =>
      prev.map(s =>
        s.id === seedId
          ? {
              ...s,
              currentPhase: newPhase,
              phaseHistory: newPhaseHistory,
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );
  }, [seeds]);

  /**
   * Delete a seed
   */
  const deleteSeed = useCallback(async (seedId: string): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error: deleteError } = await supabase
      .from('intimate_seeds')
      .delete()
      .eq('id', seedId)
      .eq('user_id', user.id);

    if (deleteError) throw deleteError;

    setSeeds(prev => prev.filter(s => s.id !== seedId));
  }, []);

  /**
   * Log an action on a seed
   */
  const logSeedAction = useCallback(async (
    seedId: string,
    action: SeedActionInput
  ): Promise<SeedAction> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error: insertError } = await supabase
      .from('intimate_seed_actions')
      .insert({
        user_id: user.id,
        seed_id: seedId,
        action_type: action.actionType,
        occurred_at: new Date().toISOString(),
        arousal_state: action.arousalState || null,
        partner_mood: action.partnerMood || null,
        context: action.context || null,
        what_happened: action.whatHappened || null,
        her_reaction: action.herReaction || null,
        your_feeling: action.yourFeeling || null,
        what_worked: action.whatWorked || null,
        what_didnt: action.whatDidnt || null,
        next_step: action.nextStep || null,
        phase_change_to: action.phaseChangeTo || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // If action includes a phase change, update the seed
    if (action.phaseChangeTo) {
      await advanceSeed(seedId, action.phaseChangeTo, action.whatHappened);
    }

    // Update last reception if action indicates reception
    const receptionActions = ['succeeded', 'partial', 'rejected', 'she_initiated', 'she_expanded'];
    if (receptionActions.includes(action.actionType)) {
      let reception: IntimateSeed['lastReception'] = 'unknown';
      if (['succeeded', 'she_initiated', 'she_expanded'].includes(action.actionType)) {
        reception = 'positive';
      } else if (action.actionType === 'partial') {
        reception = 'hesitant';
      } else if (action.actionType === 'rejected') {
        reception = 'negative';
      }

      await supabase
        .from('intimate_seeds')
        .update({
          last_reception: reception,
          reception_notes: action.herReaction || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', seedId)
        .eq('user_id', user.id);

      setSeeds(prev =>
        prev.map(s =>
          s.id === seedId
            ? { ...s, lastReception: reception, receptionNotes: action.herReaction }
            : s
        )
      );
    }

    return mapDbToSeedAction(data as DbSeedAction);
  }, [advanceSeed]);

  /**
   * Get actions for a specific seed
   */
  const getSeedActions = useCallback(async (seedId: string): Promise<SeedAction[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error: fetchError } = await supabase
      .from('intimate_seed_actions')
      .select('*')
      .eq('seed_id', seedId)
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false });

    if (fetchError) throw fetchError;

    return (data as DbSeedAction[]).map(mapDbToSeedAction);
  }, []);

  return {
    seeds,
    activeSeeds,
    establishedSeeds,
    isLoading,
    error,
    addSeed,
    updateSeed,
    advanceSeed,
    deleteSeed,
    logSeedAction,
    getSeedActions,
    refresh: loadSeeds,
  };
}
