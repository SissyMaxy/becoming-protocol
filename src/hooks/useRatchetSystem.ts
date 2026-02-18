/**
 * useRatchetSystem - Hooks for the Ratchet System
 * Implements v2 Part 6: Evidence, Investments, Commitments, Baselines
 *
 * The Ratchet System ensures forward progress by:
 * - Accumulating undeniable evidence
 * - Tracking sunk costs (money, time, effort)
 * - Honoring arousal-extracted commitments
 * - Ratcheting baseline metrics upward
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// ===========================================
// TYPES
// ===========================================

export interface Evidence {
  id: string;
  userId: string;
  evidenceType: 'photo' | 'video' | 'audio' | 'screenshot' | 'document' | 'journal';
  fileUrl: string | null;
  thumbnailUrl: string | null;
  description: string | null;
  capturedAt: string;
  private: boolean;
  milestoneId: string | null;
  sessionId: string | null;
  tags: string[];
  domain?: string;
}

export interface Investment {
  id: string;
  userId: string;
  name: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  private: boolean;
  timesUsed: number;
  lastUsed: string | null;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
}

export interface Commitment {
  id: string;
  userId: string;
  commitmentText: string;
  extractedDuring: 'edge_session' | 'goon_session' | 'hypno' | 'post_arousal' | 'vulnerability_window';
  arousalLevel: number;
  denialDay: number;
  honored: boolean;
  honoredAt: string | null;
  broken: boolean;
  brokenReason: string | null;
  createdAt: string;
}

export interface Baseline {
  id: string;
  userId: string;
  domain: string;
  metric: string;
  baselineValue: number;
  previousBaseline: number | null;
  establishedAt: string;
}

export interface Milestone {
  id: string;
  userId: string;
  milestoneType: string;
  description: string | null;
  achievedAt: string | null;
  message: string | null;
  celebrated: boolean;
  evidenceId: string | null;
}

export interface SunkCostSummary {
  totalInvestment: number;
  totalHours: number;
  totalSessions: number;
  totalEdges: number;
  totalCommitments: number;
  evidenceCount: number;
  milestonesAchieved: number;
  daysSinceStart: number;
}

// ===========================================
// useEvidence Hook
// ===========================================

export function useEvidence() {
  const { user } = useAuth();
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvidence = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('evidence_captures')
        .select('*')
        .eq('user_id', user.id)
        .order('captured_at', { ascending: false });

      if (fetchError) throw fetchError;

      setEvidence((data || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        evidenceType: row.evidence_type,
        fileUrl: row.file_url,
        thumbnailUrl: row.thumbnail_url,
        description: row.description,
        capturedAt: row.captured_at,
        private: row.private,
        milestoneId: row.milestone_id,
        sessionId: row.session_id,
        tags: row.tags || [],
        domain: row.metadata?.domain,
      })));
    } catch (err) {
      console.error('Error loading evidence:', err);
      setError(err instanceof Error ? err.message : 'Failed to load evidence');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadEvidence();
  }, [loadEvidence]);

  const addEvidence = useCallback(async (
    evidenceType: Evidence['evidenceType'],
    fileUrl: string | null,
    description: string,
    options?: {
      thumbnailUrl?: string;
      tags?: string[];
      domain?: string;
      milestoneId?: string;
      sessionId?: string;
    }
  ): Promise<Evidence | null> => {
    if (!user?.id) return null;

    try {
      const { data, error } = await supabase
        .from('evidence_captures')
        .insert({
          user_id: user.id,
          evidence_type: evidenceType,
          file_url: fileUrl,
          thumbnail_url: options?.thumbnailUrl,
          description,
          tags: options?.tags || [],
          metadata: { domain: options?.domain },
          milestone_id: options?.milestoneId,
          session_id: options?.sessionId,
        })
        .select()
        .single();

      if (error) throw error;

      const newEvidence: Evidence = {
        id: data.id,
        userId: data.user_id,
        evidenceType: data.evidence_type,
        fileUrl: data.file_url,
        thumbnailUrl: data.thumbnail_url,
        description: data.description,
        capturedAt: data.captured_at,
        private: data.private,
        milestoneId: data.milestone_id,
        sessionId: data.session_id,
        tags: data.tags || [],
        domain: data.metadata?.domain,
      };

      setEvidence(prev => [newEvidence, ...prev]);
      return newEvidence;
    } catch (err) {
      console.error('Error adding evidence:', err);
      return null;
    }
  }, [user?.id]);

  const filterByType = useCallback((type: Evidence['evidenceType'] | 'all') => {
    if (type === 'all') return evidence;
    return evidence.filter(e => e.evidenceType === type);
  }, [evidence]);

  const filterByDomain = useCallback((domain: string | 'all') => {
    if (domain === 'all') return evidence;
    return evidence.filter(e => e.domain === domain);
  }, [evidence]);

  return {
    evidence,
    isLoading,
    error,
    addEvidence,
    filterByType,
    filterByDomain,
    refresh: loadEvidence,
  };
}

// ===========================================
// useInvestments Hook
// ===========================================

export function useInvestments() {
  const { user } = useAuth();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInvestments = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (fetchError) throw fetchError;

      setInvestments((data || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        name: row.name,
        category: row.category,
        amount: parseFloat(row.amount),
        currency: row.currency || 'USD',
        date: row.date,
        private: row.private,
        timesUsed: row.times_used || 0,
        lastUsed: row.last_used,
        photoUrl: row.photo_url,
        notes: row.notes,
        createdAt: row.created_at,
      })));
    } catch (err) {
      console.error('Error loading investments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load investments');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadInvestments();
  }, [loadInvestments]);

  const addInvestment = useCallback(async (
    name: string,
    category: string,
    amount: number,
    options?: {
      date?: string;
      notes?: string;
      photoUrl?: string;
      private?: boolean;
    }
  ): Promise<Investment | null> => {
    if (!user?.id) return null;

    try {
      const { data, error } = await supabase
        .from('investments')
        .insert({
          user_id: user.id,
          name,
          category,
          amount,
          date: options?.date || new Date().toISOString().split('T')[0],
          notes: options?.notes,
          photo_url: options?.photoUrl,
          private: options?.private ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      const newInvestment: Investment = {
        id: data.id,
        userId: data.user_id,
        name: data.name,
        category: data.category,
        amount: parseFloat(data.amount),
        currency: data.currency || 'USD',
        date: data.date,
        private: data.private,
        timesUsed: data.times_used || 0,
        lastUsed: data.last_used,
        photoUrl: data.photo_url,
        notes: data.notes,
        createdAt: data.created_at,
      };

      setInvestments(prev => [newInvestment, ...prev]);
      return newInvestment;
    } catch (err) {
      console.error('Error adding investment:', err);
      return null;
    }
  }, [user?.id]);

  const totalInvestment = useMemo(() => {
    return investments.reduce((sum, inv) => sum + inv.amount, 0);
  }, [investments]);

  const investmentsByCategory = useMemo(() => {
    const grouped: Record<string, number> = {};
    investments.forEach(inv => {
      grouped[inv.category] = (grouped[inv.category] || 0) + inv.amount;
    });
    return grouped;
  }, [investments]);

  return {
    investments,
    isLoading,
    error,
    addInvestment,
    totalInvestment,
    investmentsByCategory,
    refresh: loadInvestments,
  };
}

// ===========================================
// useCommitments Hook
// ===========================================

export function useCommitments() {
  const { user } = useAuth();
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCommitments = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('commitments_v2')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setCommitments((data || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        commitmentText: row.commitment_text,
        extractedDuring: row.extracted_during,
        arousalLevel: row.arousal_level,
        denialDay: row.denial_day,
        honored: row.honored,
        honoredAt: row.honored_at,
        broken: row.broken,
        brokenReason: row.broken_reason,
        createdAt: row.created_at,
      })));
    } catch (err) {
      console.error('Error loading commitments:', err);
      setError(err instanceof Error ? err.message : 'Failed to load commitments');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadCommitments();
  }, [loadCommitments]);

  const addCommitment = useCallback(async (
    commitmentText: string,
    extractedDuring: Commitment['extractedDuring'],
    arousalLevel: number,
    denialDay: number
  ): Promise<Commitment | null> => {
    if (!user?.id) return null;

    try {
      const { data, error } = await supabase
        .from('commitments_v2')
        .insert({
          user_id: user.id,
          commitment_text: commitmentText,
          extracted_during: extractedDuring,
          arousal_level: arousalLevel,
          denial_day: denialDay,
        })
        .select()
        .single();

      if (error) throw error;

      const newCommitment: Commitment = {
        id: data.id,
        userId: data.user_id,
        commitmentText: data.commitment_text,
        extractedDuring: data.extracted_during,
        arousalLevel: data.arousal_level,
        denialDay: data.denial_day,
        honored: data.honored,
        honoredAt: data.honored_at,
        broken: data.broken,
        brokenReason: data.broken_reason,
        createdAt: data.created_at,
      };

      setCommitments(prev => [newCommitment, ...prev]);
      return newCommitment;
    } catch (err) {
      console.error('Error adding commitment:', err);
      return null;
    }
  }, [user?.id]);

  const honorCommitment = useCallback(async (commitmentId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('commitments_v2')
        .update({
          honored: true,
          honored_at: new Date().toISOString(),
        })
        .eq('id', commitmentId);

      if (error) throw error;

      setCommitments(prev => prev.map(c =>
        c.id === commitmentId
          ? { ...c, honored: true, honoredAt: new Date().toISOString() }
          : c
      ));
      return true;
    } catch (err) {
      console.error('Error honoring commitment:', err);
      return false;
    }
  }, []);

  const breakCommitment = useCallback(async (
    commitmentId: string,
    reason: string
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('commitments_v2')
        .update({
          broken: true,
          broken_reason: reason,
        })
        .eq('id', commitmentId);

      if (error) throw error;

      setCommitments(prev => prev.map(c =>
        c.id === commitmentId
          ? { ...c, broken: true, brokenReason: reason }
          : c
      ));
      return true;
    } catch (err) {
      console.error('Error breaking commitment:', err);
      return false;
    }
  }, []);

  const pendingCommitments = useMemo(() => {
    return commitments.filter(c => !c.honored && !c.broken);
  }, [commitments]);

  const honoredCommitments = useMemo(() => {
    return commitments.filter(c => c.honored);
  }, [commitments]);

  const brokenCommitments = useMemo(() => {
    return commitments.filter(c => c.broken);
  }, [commitments]);

  return {
    commitments,
    pendingCommitments,
    honoredCommitments,
    brokenCommitments,
    isLoading,
    error,
    addCommitment,
    honorCommitment,
    breakCommitment,
    refresh: loadCommitments,
  };
}

// ===========================================
// useBaselines Hook
// ===========================================

export function useBaselines() {
  const { user } = useAuth();
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBaselines = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('baselines')
        .select('*')
        .eq('user_id', user.id)
        .order('established_at', { ascending: false });

      if (fetchError) throw fetchError;

      setBaselines((data || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        domain: row.domain,
        metric: row.metric,
        baselineValue: parseFloat(row.baseline_value),
        previousBaseline: row.previous_baseline ? parseFloat(row.previous_baseline) : null,
        establishedAt: row.established_at,
      })));
    } catch (err) {
      console.error('Error loading baselines:', err);
      setError(err instanceof Error ? err.message : 'Failed to load baselines');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadBaselines();
  }, [loadBaselines]);

  const ratchetBaseline = useCallback(async (
    domain: string,
    metric: string,
    newValue: number
  ): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      // Get current baseline
      const existing = baselines.find(b => b.domain === domain && b.metric === metric);

      // Only ratchet upward
      if (existing && newValue <= existing.baselineValue) {
        return false; // Can't lower the floor
      }

      if (existing) {
        // Update existing baseline
        const { error } = await supabase
          .from('baselines')
          .update({
            previous_baseline: existing.baselineValue,
            baseline_value: newValue,
            established_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new baseline
        const { error } = await supabase
          .from('baselines')
          .insert({
            user_id: user.id,
            domain,
            metric,
            baseline_value: newValue,
          });

        if (error) throw error;
      }

      await loadBaselines();
      return true;
    } catch (err) {
      console.error('Error ratcheting baseline:', err);
      return false;
    }
  }, [user?.id, baselines, loadBaselines]);

  const getBaseline = useCallback((domain: string, metric: string): number | null => {
    const baseline = baselines.find(b => b.domain === domain && b.metric === metric);
    return baseline?.baselineValue ?? null;
  }, [baselines]);

  const getBaselinesByDomain = useCallback((domain: string) => {
    return baselines.filter(b => b.domain === domain);
  }, [baselines]);

  return {
    baselines,
    isLoading,
    error,
    ratchetBaseline,
    getBaseline,
    getBaselinesByDomain,
    refresh: loadBaselines,
  };
}

// ===========================================
// useSunkCost Hook
// ===========================================

export function useSunkCost() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<SunkCostSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSunkCost = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);

      // Parallel fetch all data
      const [
        investmentsResult,
        sessionsResult,
        edgesResult,
        commitmentsResult,
        evidenceResult,
        milestonesResult,
        profileResult,
      ] = await Promise.all([
        supabase
          .from('investments')
          .select('amount')
          .eq('user_id', user.id),
        supabase
          .from('intimate_sessions')
          .select('id, total_duration_sec')
          .eq('user_id', user.id),
        supabase
          .from('edge_logs')
          .select('id')
          .eq('user_id', user.id),
        supabase
          .from('commitments_v2')
          .select('id')
          .eq('user_id', user.id),
        supabase
          .from('evidence_captures')
          .select('id')
          .eq('user_id', user.id),
        supabase
          .from('ponr_milestones')
          .select('id')
          .eq('user_id', user.id)
          .not('achieved_at', 'is', null),
        supabase
          .from('profile_foundation')
          .select('created_at')
          .eq('user_id', user.id)
          .single(),
      ]);

      // Calculate totals
      const totalInvestment = (investmentsResult.data || [])
        .reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);

      const totalSeconds = (sessionsResult.data || [])
        .reduce((sum, sess) => sum + (sess.total_duration_sec || 0), 0);
      const totalHours = Math.round(totalSeconds / 3600 * 10) / 10;

      const totalSessions = sessionsResult.data?.length || 0;
      const totalEdges = edgesResult.data?.length || 0;
      const totalCommitments = commitmentsResult.data?.length || 0;
      const evidenceCount = evidenceResult.data?.length || 0;
      const milestonesAchieved = milestonesResult.data?.length || 0;

      // Calculate days since start
      let daysSinceStart = 0;
      if (profileResult.data?.created_at) {
        const startDate = new Date(profileResult.data.created_at);
        const now = new Date();
        daysSinceStart = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      setSummary({
        totalInvestment,
        totalHours,
        totalSessions,
        totalEdges,
        totalCommitments,
        evidenceCount,
        milestonesAchieved,
        daysSinceStart,
      });
    } catch (err) {
      console.error('Error loading sunk cost:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadSunkCost();
  }, [loadSunkCost]);

  return {
    summary,
    isLoading,
    refresh: loadSunkCost,
  };
}

// ===========================================
// useMilestones Hook
// ===========================================

export function useMilestones() {
  const { user } = useAuth();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMilestones = useCallback(async () => {
    if (!user?.id) return;

    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('ponr_milestones')
        .select('*')
        .eq('user_id', user.id)
        .order('achieved_at', { ascending: false, nullsFirst: false });

      if (fetchError) throw fetchError;

      setMilestones((data || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        milestoneType: row.milestone_type,
        description: row.description,
        achievedAt: row.achieved_at,
        message: row.message,
        celebrated: row.celebrated,
        evidenceId: row.evidence_id,
      })));
    } catch (err) {
      console.error('Error loading milestones:', err);
      setError(err instanceof Error ? err.message : 'Failed to load milestones');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadMilestones();
  }, [loadMilestones]);

  const achieveMilestone = useCallback(async (
    milestoneType: string,
    description: string,
    message?: string,
    evidenceId?: string
  ): Promise<boolean> => {
    if (!user?.id) return false;

    try {
      const { error } = await supabase
        .from('ponr_milestones')
        .upsert({
          user_id: user.id,
          milestone_type: milestoneType,
          description,
          message,
          evidence_id: evidenceId,
          achieved_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,milestone_type',
        });

      if (error) throw error;

      await loadMilestones();
      return true;
    } catch (err) {
      console.error('Error achieving milestone:', err);
      return false;
    }
  }, [user?.id, loadMilestones]);

  const celebrateMilestone = useCallback(async (milestoneId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('ponr_milestones')
        .update({
          celebrated: true,
          celebrated_at: new Date().toISOString(),
        })
        .eq('id', milestoneId);

      if (error) throw error;

      setMilestones(prev => prev.map(m =>
        m.id === milestoneId ? { ...m, celebrated: true } : m
      ));
      return true;
    } catch (err) {
      console.error('Error celebrating milestone:', err);
      return false;
    }
  }, []);

  const achievedMilestones = useMemo(() => {
    return milestones.filter(m => m.achievedAt !== null);
  }, [milestones]);

  const pendingMilestones = useMemo(() => {
    return milestones.filter(m => m.achievedAt === null);
  }, [milestones]);

  return {
    milestones,
    achievedMilestones,
    pendingMilestones,
    isLoading,
    error,
    achieveMilestone,
    celebrateMilestone,
    refresh: loadMilestones,
  };
}
