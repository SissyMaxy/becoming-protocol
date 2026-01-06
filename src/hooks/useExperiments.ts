// useExperiments Hook
// Manages A/B testing for handler strategies

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { calculateSignificance, shouldConcludeExperiment } from '../lib/experiments';

export interface HandlerExperiment {
  id: string;
  userId: string;
  experimentName: string;
  hypothesis?: string;
  variantA: Record<string, unknown>;
  variantB: Record<string, unknown>;
  currentVariant?: 'a' | 'b';
  metricName: string;
  variantAResults: number[];
  variantBResults: number[];
  status: 'running' | 'paused' | 'completed' | 'abandoned';
  startDate: string;
  endDate?: string;
  winner?: 'a' | 'b' | 'inconclusive';
  statisticalSignificance?: number;
  conclusion?: string;
}

interface UseExperimentsReturn {
  experiments: HandlerExperiment[];
  runningExperiments: HandlerExperiment[];
  completedExperiments: HandlerExperiment[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadExperiments: () => Promise<void>;
  createExperiment: (
    name: string,
    hypothesis: string,
    variantA: Record<string, unknown>,
    variantB: Record<string, unknown>,
    metricName: string
  ) => Promise<string | null>;
  recordResult: (experimentId: string, variant: 'a' | 'b', result: number) => Promise<void>;
  concludeExperiment: (experimentId: string, conclusion?: string) => Promise<void>;
  abandonExperiment: (experimentId: string, reason?: string) => Promise<void>;
  pauseExperiment: (experimentId: string) => Promise<void>;
  resumeExperiment: (experimentId: string) => Promise<void>;
  getVariantAssignment: (experimentId: string) => 'a' | 'b';
  checkAutoConclusion: (experimentId: string) => Promise<boolean>;
}

export function useExperiments(): UseExperimentsReturn {
  const { user } = useAuth();
  const [experiments, setExperiments] = useState<HandlerExperiment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all experiments
  const loadExperiments = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('handler_experiments')
        .select('*')
        .eq('user_id', user.id)
        .order('start_date', { ascending: false });

      if (error) throw error;

      const mapped: HandlerExperiment[] = (data || []).map(e => ({
        id: e.id,
        userId: e.user_id,
        experimentName: e.experiment_name,
        hypothesis: e.hypothesis || undefined,
        variantA: e.variant_a || {},
        variantB: e.variant_b || {},
        currentVariant: e.current_variant || undefined,
        metricName: e.metric_name,
        variantAResults: e.variant_a_results || [],
        variantBResults: e.variant_b_results || [],
        status: e.status,
        startDate: e.start_date,
        endDate: e.end_date || undefined,
        winner: e.winner || undefined,
        statisticalSignificance: e.statistical_significance || undefined,
        conclusion: e.conclusion || undefined,
      }));

      setExperiments(mapped);
    } catch (err) {
      console.error('Failed to load experiments:', err);
      setError('Failed to load experiments');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Create a new experiment
  const createExperiment = useCallback(async (
    name: string,
    hypothesis: string,
    variantA: Record<string, unknown>,
    variantB: Record<string, unknown>,
    metricName: string
  ): Promise<string | null> => {
    if (!user) return null;

    try {
      // Randomly assign initial variant
      const initialVariant = Math.random() < 0.5 ? 'a' : 'b';

      const { data, error } = await supabase
        .from('handler_experiments')
        .insert({
          user_id: user.id,
          experiment_name: name,
          hypothesis,
          variant_a: variantA,
          variant_b: variantB,
          current_variant: initialVariant,
          metric_name: metricName,
          variant_a_results: [],
          variant_b_results: [],
          status: 'running',
          start_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      await loadExperiments();
      return data?.id || null;
    } catch (err) {
      console.error('Failed to create experiment:', err);
      setError('Failed to create experiment');
      return null;
    }
  }, [user, loadExperiments]);

  // Record a result for an experiment
  const recordResult = useCallback(async (
    experimentId: string,
    variant: 'a' | 'b',
    result: number
  ): Promise<void> => {
    if (!user) return;

    try {
      // Get current experiment
      const { data: exp, error: fetchError } = await supabase
        .from('handler_experiments')
        .select('variant_a_results, variant_b_results')
        .eq('id', experimentId)
        .eq('user_id', user.id)
        .single();

      if (fetchError) throw fetchError;
      if (!exp) return;

      // Add result to appropriate variant
      const resultsA = exp.variant_a_results || [];
      const resultsB = exp.variant_b_results || [];

      if (variant === 'a') {
        resultsA.push(result);
      } else {
        resultsB.push(result);
      }

      // Switch variant for next trial (balanced assignment)
      const nextVariant = resultsA.length <= resultsB.length ? 'a' : 'b';

      const { error: updateError } = await supabase
        .from('handler_experiments')
        .update({
          variant_a_results: resultsA,
          variant_b_results: resultsB,
          current_variant: nextVariant,
        })
        .eq('id', experimentId)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
      await loadExperiments();
    } catch (err) {
      console.error('Failed to record result:', err);
      setError('Failed to record result');
    }
  }, [user, loadExperiments]);

  // Conclude an experiment
  const concludeExperiment = useCallback(async (
    experimentId: string,
    conclusionText?: string
  ): Promise<void> => {
    if (!user) return;

    try {
      // Get experiment data
      const exp = experiments.find(e => e.id === experimentId);
      if (!exp) return;

      // Calculate significance
      const result = calculateSignificance(exp.variantAResults, exp.variantBResults);

      const { error } = await supabase
        .from('handler_experiments')
        .update({
          status: 'completed',
          end_date: new Date().toISOString(),
          winner: result.winner,
          statistical_significance: result.significanceLevel,
          conclusion: conclusionText || result.recommendation,
        })
        .eq('id', experimentId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadExperiments();
    } catch (err) {
      console.error('Failed to conclude experiment:', err);
      setError('Failed to conclude experiment');
    }
  }, [user, experiments, loadExperiments]);

  // Abandon an experiment
  const abandonExperiment = useCallback(async (
    experimentId: string,
    reason?: string
  ): Promise<void> => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('handler_experiments')
        .update({
          status: 'abandoned',
          end_date: new Date().toISOString(),
          conclusion: reason || 'Experiment abandoned',
        })
        .eq('id', experimentId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadExperiments();
    } catch (err) {
      console.error('Failed to abandon experiment:', err);
      setError('Failed to abandon experiment');
    }
  }, [user, loadExperiments]);

  // Pause an experiment
  const pauseExperiment = useCallback(async (experimentId: string): Promise<void> => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('handler_experiments')
        .update({ status: 'paused' })
        .eq('id', experimentId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadExperiments();
    } catch (err) {
      console.error('Failed to pause experiment:', err);
      setError('Failed to pause experiment');
    }
  }, [user, loadExperiments]);

  // Resume a paused experiment
  const resumeExperiment = useCallback(async (experimentId: string): Promise<void> => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('handler_experiments')
        .update({ status: 'running' })
        .eq('id', experimentId)
        .eq('user_id', user.id);

      if (error) throw error;
      await loadExperiments();
    } catch (err) {
      console.error('Failed to resume experiment:', err);
      setError('Failed to resume experiment');
    }
  }, [user, loadExperiments]);

  // Get the current variant assignment for an experiment
  const getVariantAssignment = useCallback((experimentId: string): 'a' | 'b' => {
    const exp = experiments.find(e => e.id === experimentId);
    return exp?.currentVariant || 'a';
  }, [experiments]);

  // Check if experiment should auto-conclude
  const checkAutoConclusion = useCallback(async (experimentId: string): Promise<boolean> => {
    const exp = experiments.find(e => e.id === experimentId);
    if (!exp || exp.status !== 'running') return false;

    const decision = shouldConcludeExperiment(
      exp.variantAResults,
      exp.variantBResults
    );

    if (decision.shouldConclude) {
      await concludeExperiment(experimentId, decision.reason);
      return true;
    }

    return false;
  }, [experiments, concludeExperiment]);

  // Computed properties
  const runningExperiments = experiments.filter(e => e.status === 'running');
  const completedExperiments = experiments.filter(e => e.status === 'completed');

  // Load on mount
  useEffect(() => {
    loadExperiments();
  }, [loadExperiments]);

  return {
    experiments,
    runningExperiments,
    completedExperiments,
    isLoading,
    error,
    loadExperiments,
    createExperiment,
    recordResult,
    concludeExperiment,
    abandonExperiment,
    pauseExperiment,
    resumeExperiment,
    getVariantAssignment,
    checkAutoConclusion,
  };
}
