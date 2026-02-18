/**
 * Gina Measurement Engine
 *
 * The 8 measurement form data structures and composite scoring.
 * Periodic assessments that feed into ladder advancement decisions.
 */

import { supabase } from '../supabase';
import type { GinaChannel } from './ladder-engine';

// ============================================
// MEASUREMENT TYPES
// ============================================

export type MeasurementType =
  | 'bedroom_weekly'
  | 'pronoun_weekly'
  | 'financial_monthly'
  | 'touch_biweekly'
  | 'shopper_monthly'
  | 'social_map'
  | 'occasion_debrief'
  | 'master_composite';

// ============================================
// MEASUREMENT DATA SCHEMAS
// ============================================

export interface BedroomWeeklyData {
  sessionsThisWeek: number;
  sessions: {
    whoInitiated: 'gina' | 'user' | 'mutual';
    agencyScore: number; // 1-5
    unpromptedBehaviors: string[];
  }[];
  averageAgencyScore: number;
}

export interface PronounWeeklyData {
  totalReferences: number;
  correct: number;
  selfCorrected: number;
  uncorrected: number;
  correctPercent: number;
  selfCorrectPercent: number;
}

export interface FinancialMonthlyData {
  totalFeminizationSpending: number;
  invisibleAmount: number;
  visibleAmount: number;
  discussedAmount: number;
  ginaResponsePerVisiblePurchase: {
    item: string;
    amount: number;
    responseScore: number; // 1-5
  }[];
  averageResponseScore: number;
}

export interface TouchBiweeklyData {
  bodyZones: {
    zone: string; // 9 zones: head, face, neck, shoulders, arms, hands, torso, legs, feet
    casualScore: number; // 1-5 (avoids -> touches without thought)
    intimateScore: number; // 1-5
  }[];
  averageCasualScore: number;
  averageIntimateScore: number;
}

export interface ShopperMonthlyData {
  participationLevel: number; // 1-7
  jointShoppingTrips: number;
  itemsGinaPicked: number;
  itemsGinaVetoed: number;
  spontaneousSuggestions: number;
  notes: string;
}

export interface SocialMapData {
  people: {
    name: string;
    relationship: string;
    awarenessStatus: string;
    activeSupport: boolean;
  }[];
  totalAware: number;
  totalSupportive: number;
  totalHostile: number;
}

export interface OccasionDebriefData {
  occasionType: string;
  occasionDate: string;
  feminineElementsPresent: string[];
  ginaResponsePerElement: {
    element: string;
    responseScore: number; // 1-5
  }[];
  overallScore: number; // 1-5
  nextOccasionPlan: string;
}

export interface MasterCompositeData {
  channelScores: Record<GinaChannel, number>;
  average: number;
  leading: string;
  lagging: string;
  widestGap: number;
  healthAssessment: 'healthy' | 'uneven' | 'stalled' | 'regressing';
}

export type MeasurementData =
  | BedroomWeeklyData
  | PronounWeeklyData
  | FinancialMonthlyData
  | TouchBiweeklyData
  | ShopperMonthlyData
  | SocialMapData
  | OccasionDebriefData
  | MasterCompositeData;

// ============================================
// MEASUREMENT TYPE -> CHANNEL MAPPING
// ============================================

const MEASUREMENT_CHANNEL_MAP: Partial<Record<MeasurementType, GinaChannel>> = {
  bedroom_weekly: 'bedroom',
  pronoun_weekly: 'pronoun',
  financial_monthly: 'financial',
  touch_biweekly: 'touch',
  shopper_monthly: 'visual',
  // social_map, occasion_debrief, master_composite don't map to single channels
};

// ============================================
// SAVE MEASUREMENT
// ============================================

export async function saveMeasurement(
  userId: string,
  measurementType: MeasurementType,
  data: MeasurementData,
  periodStart?: Date,
  periodEnd?: Date
): Promise<string | null> {
  const score = calculateScore(measurementType, data);
  const channel = MEASUREMENT_CHANNEL_MAP[measurementType];

  const { data: result, error } = await supabase
    .from('gina_measurements')
    .insert({
      user_id: userId,
      measurement_type: measurementType,
      channel: channel || null,
      data,
      score,
      period_start: periodStart?.toISOString().split('T')[0],
      period_end: periodEnd?.toISOString().split('T')[0],
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to save measurement:', error);
    return null;
  }

  return result?.id || null;
}

// ============================================
// SCORE CALCULATION
// ============================================

function calculateScore(type: MeasurementType, data: MeasurementData): number {
  switch (type) {
    case 'bedroom_weekly':
      return calculateBedroomScore(data as BedroomWeeklyData);
    case 'pronoun_weekly':
      return calculatePronounScore(data as PronounWeeklyData);
    case 'financial_monthly':
      return calculateFinancialScore(data as FinancialMonthlyData);
    case 'touch_biweekly':
      return calculateTouchScore(data as TouchBiweeklyData);
    case 'shopper_monthly':
      return calculateShopperScore(data as ShopperMonthlyData);
    case 'occasion_debrief':
      return (data as OccasionDebriefData).overallScore;
    case 'master_composite':
      return (data as MasterCompositeData).average;
    default:
      return 0;
  }
}

function calculateBedroomScore(data: BedroomWeeklyData): number {
  if (data.sessionsThisWeek === 0) return 0;

  // Weight: agency (50%) + gina-initiation (30%) + unprompted (20%)
  const agencyAvg = data.averageAgencyScore;
  const ginaInitiatedRate = data.sessions.filter(s => s.whoInitiated === 'gina').length / data.sessions.length;
  const unpromptedAvg = data.sessions.reduce((sum, s) => sum + s.unpromptedBehaviors.length, 0) / data.sessions.length;

  return Math.min(5, (agencyAvg * 0.5) + (ginaInitiatedRate * 5 * 0.3) + (Math.min(unpromptedAvg, 5) * 0.2));
}

function calculatePronounScore(data: PronounWeeklyData): number {
  if (data.totalReferences === 0) return 0;

  // Score based on correct% with bonus for self-correction
  const correctRate = data.correctPercent / 100;
  const selfCorrectRate = data.selfCorrectPercent / 100;

  // 80%+ correct = 4+, self-correction shows awareness
  return Math.min(5, (correctRate * 4) + (selfCorrectRate * 1));
}

function calculateFinancialScore(data: FinancialMonthlyData): number {
  if (data.totalFeminizationSpending === 0) return 0;

  // Score based on visibility ratio and response quality
  const visibilityRate = (data.visibleAmount + data.discussedAmount) / data.totalFeminizationSpending;
  const responseAvg = data.averageResponseScore;

  return Math.min(5, (visibilityRate * 2.5) + (responseAvg * 0.5));
}

function calculateTouchScore(data: TouchBiweeklyData): number {
  if (data.bodyZones.length === 0) return 0;

  // Average of casual and intimate scores, weighted toward casual (normalized behavior)
  return Math.min(5, (data.averageCasualScore * 0.6) + (data.averageIntimateScore * 0.4));
}

function calculateShopperScore(data: ShopperMonthlyData): number {
  // Direct participation level (1-7 mapped to 1-5)
  return Math.min(5, (data.participationLevel / 7) * 5);
}

// ============================================
// MEASUREMENT QUERIES
// ============================================

export async function getMeasurementHistory(
  userId: string,
  type: MeasurementType,
  limit = 12
): Promise<{ id: string; data: MeasurementData; score: number; createdAt: Date }[]> {
  const { data } = await supabase
    .from('gina_measurements')
    .select('id, data, score, created_at')
    .eq('user_id', userId)
    .eq('measurement_type', type)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map(row => ({
    id: row.id,
    data: row.data as MeasurementData,
    score: row.score || 0,
    createdAt: new Date(row.created_at),
  }));
}

export async function getLatestMeasurement(
  userId: string,
  type: MeasurementType
): Promise<{ id: string; data: MeasurementData; score: number; createdAt: Date } | null> {
  const history = await getMeasurementHistory(userId, type, 1);
  return history[0] || null;
}

export async function getChannelMeasurementScore(
  userId: string,
  channel: GinaChannel
): Promise<number | null> {
  const { data } = await supabase
    .from('gina_measurements')
    .select('score')
    .eq('user_id', userId)
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!data || data.length === 0) return null;
  return data[0].score;
}

// ============================================
// MASTER COMPOSITE GENERATION
// ============================================

export async function generateMasterComposite(
  userId: string
): Promise<MasterCompositeData> {
  const { getAllChannelStates, GINA_CHANNELS } = await import('./ladder-engine');
  const states = await getAllChannelStates(userId);

  const channelScores: Record<string, number> = {};
  for (const channel of GINA_CHANNELS) {
    const state = states.find(s => s.channel === channel);
    channelScores[channel] = state?.currentRung || 0;
  }

  const values = Object.values(channelScores);
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);

  const leading = Object.entries(channelScores).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const lagging = Object.entries(channelScores).sort((a, b) => a[1] - b[1])[0]?.[0] || '';
  const widestGap = max - min;

  let healthAssessment: MasterCompositeData['healthAssessment'] = 'healthy';
  if (average === 0) healthAssessment = 'stalled';
  else if (widestGap >= 3) healthAssessment = 'uneven';
  else if (average < 1) healthAssessment = 'stalled';

  const composite: MasterCompositeData = {
    channelScores: channelScores as Record<GinaChannel, number>,
    average: Math.round(average * 10) / 10,
    leading,
    lagging,
    widestGap,
    healthAssessment,
  };

  // Save the composite as a measurement
  await saveMeasurement(userId, 'master_composite', composite);

  return composite;
}

// ============================================
// MEASUREMENT SCHEDULING
// ============================================

export interface MeasurementDue {
  type: MeasurementType;
  channel?: GinaChannel;
  daysSinceLastMeasurement: number | null;
  isOverdue: boolean;
}

const MEASUREMENT_INTERVALS: Record<MeasurementType, number> = {
  bedroom_weekly: 7,
  pronoun_weekly: 7,
  financial_monthly: 30,
  touch_biweekly: 14,
  shopper_monthly: 30,
  social_map: 30,
  occasion_debrief: 0, // Manual only
  master_composite: 30,
};

export async function getDueMeasurements(userId: string): Promise<MeasurementDue[]> {
  const due: MeasurementDue[] = [];
  const now = new Date();

  for (const [type, intervalDays] of Object.entries(MEASUREMENT_INTERVALS)) {
    if (intervalDays === 0) continue; // Manual only

    const latest = await getLatestMeasurement(userId, type as MeasurementType);
    let daysSince: number | null = null;
    let isOverdue = false;

    if (latest) {
      daysSince = Math.floor((now.getTime() - latest.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      isOverdue = daysSince >= intervalDays;
    } else {
      isOverdue = true; // Never done
    }

    if (isOverdue) {
      due.push({
        type: type as MeasurementType,
        channel: MEASUREMENT_CHANNEL_MAP[type as MeasurementType],
        daysSinceLastMeasurement: daysSince,
        isOverdue: true,
      });
    }
  }

  return due;
}
