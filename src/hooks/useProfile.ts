// useProfile.ts
// Hook for managing user profile data across all 5 intake layers

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type {
  ProfileFoundation,
  ProfileHistory,
  ProfileArousal,
  ProfilePsychology,
  ProfileDepth,
  IntakeProgress,
  FullProfile,
  DbProfileFoundation,
  DbIntakeProgress,
} from '../types/profile';
import {
  mapDbToProfileFoundation,
  mapDbToIntakeProgress,
} from '../types/profile';

interface UseProfileReturn {
  profile: FullProfile | null;
  intakeProgress: IntakeProgress | null;
  isLoading: boolean;
  error: string | null;
  // Actions
  loadProfile: () => Promise<void>;
  updateFoundation: (data: Partial<ProfileFoundation>) => Promise<void>;
  updateHistory: (data: Partial<ProfileHistory>) => Promise<void>;
  updateArousal: (data: Partial<ProfileArousal>) => Promise<void>;
  updatePsychology: (data: Partial<ProfilePsychology>) => Promise<void>;
  updateDepth: (data: Partial<ProfileDepth>) => Promise<void>;
  completeLayer: (layer: number, disclosureScore: number) => Promise<void>;
  initializeProfile: () => Promise<void>;
}

export function useProfile(): UseProfileReturn {
  const { user } = useAuth();
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [intakeProgress, setIntakeProgress] = useState<IntakeProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load full profile
  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setIntakeProgress(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [
        foundationRes,
        historyRes,
        arousalRes,
        psychologyRes,
        depthRes,
        progressRes,
      ] = await Promise.all([
        supabase.from('profile_foundation').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('profile_history').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('profile_arousal').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('profile_psychology').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('profile_depth').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('intake_progress').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      const fullProfile: FullProfile = {};

      if (foundationRes.data) {
        fullProfile.foundation = mapDbToProfileFoundation(foundationRes.data as DbProfileFoundation);
      }
      if (historyRes.data) {
        fullProfile.history = mapDbToHistory(historyRes.data);
      }
      if (arousalRes.data) {
        fullProfile.arousal = mapDbToArousal(arousalRes.data);
      }
      if (psychologyRes.data) {
        fullProfile.psychology = mapDbToPsychology(psychologyRes.data);
      }
      if (depthRes.data) {
        fullProfile.depth = mapDbToDepth(depthRes.data);
      }
      if (progressRes.data) {
        fullProfile.intakeProgress = mapDbToIntakeProgress(progressRes.data as DbIntakeProgress);
        setIntakeProgress(fullProfile.intakeProgress);
      }

      setProfile(fullProfile);
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError('Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Initialize profile for new user
  const initializeProfile = useCallback(async () => {
    if (!user) return;

    try {
      // Create foundation record
      await supabase.from('profile_foundation').upsert({
        user_id: user.id,
        chosen_name: '',
        pronouns: 'she/her',
        partner_awareness_level: 0,
      });

      // Create intake progress record
      await supabase.from('intake_progress').upsert({
        user_id: user.id,
        layer_completed: 0,
        questions_answered: 0,
        disclosure_score: 0,
      });

      await loadProfile();
    } catch (err) {
      console.error('Failed to initialize profile:', err);
      setError('Failed to initialize profile');
    }
  }, [user, loadProfile]);

  // Update foundation (Layer 1)
  const updateFoundation = useCallback(async (data: Partial<ProfileFoundation>) => {
    if (!user) return;

    try {
      const dbData: Partial<DbProfileFoundation> = {
        chosen_name: data.chosenName,
        pronouns: data.pronouns,
        age: data.age,
        location: data.location,
        living_situation: data.livingSituation,
        work_situation: data.workSituation,
        private_hours_daily: data.privateHoursDaily,
        monthly_budget: data.monthlyBudget,
        partner_status: data.partnerStatus,
        partner_awareness_level: data.partnerAwarenessLevel,
        partner_reaction: data.partnerReaction,
      };

      // Remove undefined values
      Object.keys(dbData).forEach(key => {
        if (dbData[key as keyof typeof dbData] === undefined) {
          delete dbData[key as keyof typeof dbData];
        }
      });

      const { error } = await supabase
        .from('profile_foundation')
        .update(dbData)
        .eq('user_id', user.id);

      if (error) throw error;

      // Refresh profile
      await loadProfile();
    } catch (err) {
      console.error('Failed to update foundation:', err);
      setError('Failed to update profile');
    }
  }, [user, loadProfile]);

  // Update history (Layer 2)
  const updateHistory = useCallback(async (data: Partial<ProfileHistory>) => {
    if (!user) return;

    try {
      const dbData = {
        first_awareness_age: data.firstAwarenessAge,
        first_awareness_trigger: data.firstAwarenessTrigger,
        childhood_signals: data.childhoodSignals,
        interpretation_at_time: data.interpretationAtTime,
        first_crossdressing_age: data.firstCrossdressingAge,
        first_crossdressing_experience: data.firstCrossdressingExperience,
        clothing_evolution: data.clothingEvolution,
        items_owned: data.itemsOwned,
        previous_attempts: data.previousAttempts,
        previous_attempt_details: data.previousAttemptDetails,
        what_stopped_before: data.whatStoppedBefore,
        what_needs_to_change: data.whatNeedsToChange,
        dysphoria_frequency: data.dysphoriaFrequency,
        dysphoria_triggers: data.dysphoriaTriggers,
        euphoria_triggers: data.euphoriaTriggers,
        peak_euphoria_moment: data.peakEuphoriaMoment,
      };

      // Filter out undefined
      const filtered = Object.fromEntries(
        Object.entries(dbData).filter(([, v]) => v !== undefined)
      );

      // Upsert in case record doesn't exist yet
      const { error } = await supabase
        .from('profile_history')
        .upsert({ user_id: user.id, ...filtered });

      if (error) throw error;
      await loadProfile();
    } catch (err) {
      console.error('Failed to update history:', err);
      setError('Failed to update profile');
    }
  }, [user, loadProfile]);

  // Update arousal (Layer 3)
  const updateArousal = useCallback(async (data: Partial<ProfileArousal>) => {
    if (!user) return;

    try {
      const dbData = {
        feminization_arousal_level: data.feminizationArousalLevel,
        arousal_aspects_ranked: data.arousalAspectsRanked,
        erotic_core_or_side_effect: data.eroticCoreOrSideEffect,
        arousal_pattern_evolution: data.arousalPatternEvolution,
        fantasy_themes: data.fantasyThemes,
        hypno_usage_level: data.hypnoUsageLevel,
        hypno_content_preferences: data.hypnoContentPreferences,
        trance_depth: data.tranceDepth,
        conditioned_responses: data.conditionedResponses,
        hardest_hitting_content: data.hardestHittingContent,
        chastity_history: data.chastityHistory,
        longest_denial_days: data.longestDenialDays,
        denial_effect_on_motivation: data.denialEffectOnMotivation,
        edge_frequency: data.edgeFrequency,
        post_orgasm_response: data.postOrgasmResponse,
        shame_intensifies_arousal: data.shameIntensifiesArousal,
        shameful_but_arousing: data.shamefulButArousing,
        shame_function: data.shameFunction,
        eroticized_transformation: data.eroticizedTransformation,
      };

      const filtered = Object.fromEntries(
        Object.entries(dbData).filter(([, v]) => v !== undefined)
      );

      const { error } = await supabase
        .from('profile_arousal')
        .upsert({ user_id: user.id, ...filtered });

      if (error) throw error;
      await loadProfile();
    } catch (err) {
      console.error('Failed to update arousal:', err);
      setError('Failed to update profile');
    }
  }, [user, loadProfile]);

  // Update psychology (Layer 4)
  const updatePsychology = useCallback(async (data: Partial<ProfilePsychology>) => {
    if (!user) return;

    try {
      const dbData = {
        shame_aspects: data.shameAspects,
        shame_sources: data.shameSources,
        shame_function_preference: data.shameFunctionPreference,
        without_shame_hypothesis: data.withoutShameHypothesis,
        resistance_triggers: data.resistanceTriggers,
        resistance_sensation: data.resistanceSensation,
        stop_voice_triggers: data.stopVoiceTriggers,
        resistance_overcome_methods: data.resistanceOvercomeMethods,
        resistance_timing_patterns: data.resistanceTimingPatterns,
        authority_response: data.authorityResponse,
        compliance_motivators: data.complianceMotivators,
        preferred_voice_framing: data.preferredVoiceFraming,
        asked_vs_told_preference: data.askedVsToldPreference,
        pushed_past_comfort_response: data.pushedPastComfortResponse,
        vulnerability_moments: data.vulnerabilityMoments,
        guard_drop_triggers: data.guardDropTriggers,
        surrender_moment_description: data.surrenderMomentDescription,
        power_words_phrases: data.powerWordsPhrases,
        resistance_impossible_conditions: data.resistanceImpossibleConditions,
        validation_importance: data.validationImportance,
        validation_type_preference: data.validationTypePreference,
        praise_response: data.praiseResponse,
        criticism_response: data.criticismResponse,
      };

      const filtered = Object.fromEntries(
        Object.entries(dbData).filter(([, v]) => v !== undefined)
      );

      const { error } = await supabase
        .from('profile_psychology')
        .upsert({ user_id: user.id, ...filtered });

      if (error) throw error;
      await loadProfile();
    } catch (err) {
      console.error('Failed to update psychology:', err);
      setError('Failed to update profile');
    }
  }, [user, loadProfile]);

  // Update depth (Layer 5)
  const updateDepth = useCallback(async (data: Partial<ProfileDepth>) => {
    if (!user) return;

    try {
      const dbData = {
        darkest_fantasy: data.darkestFantasy,
        why_never_told: data.whyNeverTold,
        writing_it_feels: data.writingItFeels,
        want_but_fear_wanting: data.wantButFearWanting,
        full_admission_consequence: data.fullAdmissionConsequence,
        fear_of_getting_wanted: data.fearOfGettingWanted,
        complete_transformation_vision: data.completeTransformationVision,
        daily_life_vision: data.dailyLifeVision,
        others_perception_vision: data.othersPerceptionVision,
        internal_feeling_vision: data.internalFeelingVision,
        complete_surrender_vision: data.completeSurrenderVision,
        what_to_let_go: data.whatToLetGo,
        surrender_gains: data.surrenderGains,
        takeover_desire: data.takeoverDesire,
        transformation_fears: data.transformationFears,
        worst_case_scenario: data.worstCaseScenario,
        cant_stop_meaning: data.cantStopMeaning,
        fear_as_barrier_or_appeal: data.fearAsBarrierOrAppeal,
        secret_self_description: data.secretSelfDescription,
        secret_self_visible_consequence: data.secretSelfVisibleConsequence,
        hiding_pleasure_or_necessity: data.hidingPleasureOrNecessity,
      };

      const filtered = Object.fromEntries(
        Object.entries(dbData).filter(([, v]) => v !== undefined)
      );

      const { error } = await supabase
        .from('profile_depth')
        .upsert({ user_id: user.id, ...filtered });

      if (error) throw error;
      await loadProfile();
    } catch (err) {
      console.error('Failed to update depth:', err);
      setError('Failed to update profile');
    }
  }, [user, loadProfile]);

  // Complete a layer
  const completeLayer = useCallback(async (layer: number, disclosureScore: number) => {
    if (!user) return;

    try {
      const currentProgress = intakeProgress;
      const newDisclosureScore = (currentProgress?.disclosureScore || 0) + disclosureScore;

      const { error } = await supabase
        .from('intake_progress')
        .upsert({
          user_id: user.id,
          layer_completed: layer,
          disclosure_score: newDisclosureScore,
          last_updated: new Date().toISOString(),
        });

      if (error) throw error;
      await loadProfile();
    } catch (err) {
      console.error('Failed to complete layer:', err);
      setError('Failed to update progress');
    }
  }, [user, intakeProgress, loadProfile]);

  // Load on mount and when user changes
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return {
    profile,
    intakeProgress,
    isLoading,
    error,
    loadProfile,
    updateFoundation,
    updateHistory,
    updateArousal,
    updatePsychology,
    updateDepth,
    completeLayer,
    initializeProfile,
  };
}

// ============================================
// INTERNAL MAPPERS
// ============================================

function mapDbToHistory(db: Record<string, unknown>): ProfileHistory {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    firstAwarenessAge: db.first_awareness_age as string | undefined,
    firstAwarenessTrigger: db.first_awareness_trigger as string | undefined,
    childhoodSignals: db.childhood_signals as string | undefined,
    interpretationAtTime: db.interpretation_at_time as string | undefined,
    firstCrossdressingAge: db.first_crossdressing_age as string | undefined,
    firstCrossdressingExperience: db.first_crossdressing_experience as string | undefined,
    clothingEvolution: db.clothing_evolution as string | undefined,
    itemsOwned: (db.items_owned as string[]) || [],
    previousAttempts: db.previous_attempts as boolean,
    previousAttemptDetails: db.previous_attempt_details as string | undefined,
    whatStoppedBefore: db.what_stopped_before as string | undefined,
    whatNeedsToChange: db.what_needs_to_change as string | undefined,
    dysphoriaFrequency: db.dysphoria_frequency as string | undefined,
    dysphoriaTriggers: (db.dysphoria_triggers as string[]) || [],
    euphoriaTriggers: db.euphoria_triggers as string | undefined,
    peakEuphoriaMoment: db.peak_euphoria_moment as string | undefined,
    createdAt: db.created_at as string,
  };
}

function mapDbToArousal(db: Record<string, unknown>): ProfileArousal {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    feminizationArousalLevel: db.feminization_arousal_level as number | undefined,
    arousalAspectsRanked: (db.arousal_aspects_ranked as string[]) || [],
    eroticCoreOrSideEffect: db.erotic_core_or_side_effect as string | undefined,
    arousalPatternEvolution: db.arousal_pattern_evolution as string | undefined,
    fantasyThemes: (db.fantasy_themes as Record<string, number>) || {},
    hypnoUsageLevel: db.hypno_usage_level as string | undefined,
    hypnoContentPreferences: db.hypno_content_preferences as string | undefined,
    tranceDepth: db.trance_depth as string | undefined,
    conditionedResponses: db.conditioned_responses as string | undefined,
    hardestHittingContent: db.hardest_hitting_content as string | undefined,
    chastityHistory: db.chastity_history as string | undefined,
    longestDenialDays: db.longest_denial_days as number | undefined,
    denialEffectOnMotivation: db.denial_effect_on_motivation as string | undefined,
    edgeFrequency: db.edge_frequency as string | undefined,
    postOrgasmResponse: db.post_orgasm_response as string | undefined,
    shameIntensifiesArousal: db.shame_intensifies_arousal as string | undefined,
    shamefulButArousing: db.shameful_but_arousing as string | undefined,
    shameFunction: db.shame_function as string | undefined,
    eroticizedTransformation: db.eroticized_transformation as string | undefined,
    createdAt: db.created_at as string,
  };
}

function mapDbToPsychology(db: Record<string, unknown>): ProfilePsychology {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    shameAspects: db.shame_aspects as string | undefined,
    shameSources: (db.shame_sources as string[]) || [],
    shameFunctionPreference: db.shame_function_preference as string | undefined,
    withoutShameHypothesis: db.without_shame_hypothesis as string | undefined,
    resistanceTriggers: db.resistance_triggers as string | undefined,
    resistanceSensation: db.resistance_sensation as string | undefined,
    stopVoiceTriggers: db.stop_voice_triggers as string | undefined,
    resistanceOvercomeMethods: db.resistance_overcome_methods as string | undefined,
    resistanceTimingPatterns: db.resistance_timing_patterns as string | undefined,
    authorityResponse: db.authority_response as string | undefined,
    complianceMotivators: db.compliance_motivators as string | undefined,
    preferredVoiceFraming: db.preferred_voice_framing as string | undefined,
    askedVsToldPreference: db.asked_vs_told_preference as number | undefined,
    pushedPastComfortResponse: db.pushed_past_comfort_response as string | undefined,
    vulnerabilityMoments: db.vulnerability_moments as string | undefined,
    guardDropTriggers: db.guard_drop_triggers as string | undefined,
    surrenderMomentDescription: db.surrender_moment_description as string | undefined,
    powerWordsPhrases: db.power_words_phrases as string | undefined,
    resistanceImpossibleConditions: db.resistance_impossible_conditions as string | undefined,
    validationImportance: db.validation_importance as number | undefined,
    validationTypePreference: db.validation_type_preference as string | undefined,
    praiseResponse: db.praise_response as string | undefined,
    criticismResponse: db.criticism_response as string | undefined,
    createdAt: db.created_at as string,
  };
}

function mapDbToDepth(db: Record<string, unknown>): ProfileDepth {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    darkestFantasy: db.darkest_fantasy as string | undefined,
    whyNeverTold: db.why_never_told as string | undefined,
    writingItFeels: db.writing_it_feels as string | undefined,
    wantButFearWanting: db.want_but_fear_wanting as string | undefined,
    fullAdmissionConsequence: db.full_admission_consequence as string | undefined,
    fearOfGettingWanted: db.fear_of_getting_wanted as string | undefined,
    completeTransformationVision: db.complete_transformation_vision as string | undefined,
    dailyLifeVision: db.daily_life_vision as string | undefined,
    othersPerceptionVision: db.others_perception_vision as string | undefined,
    internalFeelingVision: db.internal_feeling_vision as string | undefined,
    completeSurrenderVision: db.complete_surrender_vision as string | undefined,
    whatToLetGo: db.what_to_let_go as string | undefined,
    surrenderGains: db.surrender_gains as string | undefined,
    takeoverDesire: db.takeover_desire as string | undefined,
    transformationFears: db.transformation_fears as string | undefined,
    worstCaseScenario: db.worst_case_scenario as string | undefined,
    cantStopMeaning: db.cant_stop_meaning as string | undefined,
    fearAsBarrierOrAppeal: db.fear_as_barrier_or_appeal as string | undefined,
    secretSelfDescription: db.secret_self_description as string | undefined,
    secretSelfVisibleConsequence: db.secret_self_visible_consequence as string | undefined,
    hidingPleasureOrNecessity: db.hiding_pleasure_or_necessity as string | undefined,
    createdAt: db.created_at as string,
  };
}
