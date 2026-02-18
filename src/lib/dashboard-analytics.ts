/**
 * Dashboard Analytics
 *
 * Aggregation queries for the unified dashboard.
 * Pulls from multiple tables to build the dashboard summary.
 */

import { supabase } from './supabase';

// ============================================
// IDENTITY ODOMETER
// ============================================

export type OdometerState = 'survival' | 'caution' | 'coasting' | 'progress' | 'momentum' | 'breakthrough';

export async function getOdometerState(userId: string): Promise<OdometerState> {
  const { data } = await supabase
    .from('user_state')
    .select('odometer')
    .eq('user_id', userId)
    .single();

  return (data?.odometer as OdometerState) || 'coasting';
}

// ============================================
// STREAK DATA
// ============================================

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  domainStreaks: Record<string, number>;
}

export async function getStreakData(userId: string): Promise<StreakData> {
  const { data } = await supabase
    .from('user_state')
    .select('streak_days, longest_streak, domain_streaks')
    .eq('user_id', userId)
    .single();

  return {
    currentStreak: data?.streak_days || 0,
    longestStreak: data?.longest_streak || 0,
    domainStreaks: (data?.domain_streaks as Record<string, number>) || {},
  };
}

// ============================================
// STREAK CALENDAR (heatmap data)
// ============================================

export interface CalendarDay {
  date: string;
  tasksCompleted: number;
  pointsEarned: number;
  hasEntry: boolean;
}

export async function getStreakCalendarData(
  userId: string,
  days = 90
): Promise<CalendarDay[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data } = await supabase
    .from('daily_entries')
    .select('date, tasks_completed, points_earned, completed')
    .eq('user_id', userId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: true });

  return (data || []).map(row => ({
    date: row.date,
    tasksCompleted: row.tasks_completed || 0,
    pointsEarned: row.points_earned || 0,
    hasEntry: true,
  }));
}

// ============================================
// DOMAIN PROGRESS
// ============================================

export interface DomainLevel {
  domain: string;
  currentLevel: number;
  description: string | null;
  nextLevelDescription: string | null;
  escalationCount: number;
}

export async function getDomainLevels(userId: string): Promise<DomainLevel[]> {
  const { data } = await supabase
    .from('escalation_state')
    .select('domain, current_level, current_description, next_level_description, escalation_count')
    .eq('user_id', userId)
    .order('domain');

  return (data || []).map(row => ({
    domain: row.domain,
    currentLevel: row.current_level || 0,
    description: row.current_description,
    nextLevelDescription: row.next_level_description,
    escalationCount: row.escalation_count || 0,
  }));
}

// ============================================
// INVESTMENT SUMMARY
// ============================================

export interface InvestmentSummary {
  totalAmount: number;
  categoryBreakdown: Record<string, number>;
  totalItems: number;
}

export async function getInvestmentSummary(userId: string): Promise<InvestmentSummary> {
  const { data } = await supabase
    .from('investments')
    .select('category, amount')
    .eq('user_id', userId);

  const items = data || [];
  const totalAmount = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const categoryBreakdown: Record<string, number> = {};

  for (const item of items) {
    const cat = item.category || 'other';
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (Number(item.amount) || 0);
  }

  return { totalAmount, categoryBreakdown, totalItems: items.length };
}

// ============================================
// COMMITMENT STATUS
// ============================================

export interface CommitmentStatus {
  total: number;
  honored: number;
  pending: number;
  broken: number;
  honorRate: number;
}

export async function getCommitmentStatus(userId: string): Promise<CommitmentStatus> {
  const { data } = await supabase
    .from('commitments')
    .select('honored, created_at, honored_at')
    .eq('user_id', userId);

  const items = data || [];
  const honored = items.filter(c => c.honored === true).length;
  const broken = items.filter(c => {
    if (c.honored === true) return false;
    if (c.honored === false) return true;
    // Consider pending if less than 7 days old
    const age = Date.now() - new Date(c.created_at).getTime();
    return age > 7 * 24 * 60 * 60 * 1000;
  }).length;
  const pending = items.length - honored - broken;
  const total = items.length;

  return {
    total,
    honored,
    pending,
    broken,
    honorRate: total > 0 ? Math.round((honored / total) * 100) : 0,
  };
}

// ============================================
// MILESTONE DATA
// ============================================

export interface MilestoneEntry {
  id: string;
  milestoneType: string;
  description: string | null;
  achievedAt: Date;
  evidenceId: string | null;
}

export async function getMilestones(userId: string, limit = 20): Promise<MilestoneEntry[]> {
  const { data } = await supabase
    .from('milestones')
    .select('id, milestone_type, description, achieved_at, evidence_id')
    .eq('user_id', userId)
    .order('achieved_at', { ascending: false })
    .limit(limit);

  return (data || []).map(row => ({
    id: row.id,
    milestoneType: row.milestone_type,
    description: row.description,
    achievedAt: new Date(row.achieved_at),
    evidenceId: row.evidence_id,
  }));
}

// ============================================
// EVIDENCE DATA
// ============================================

export interface EvidenceEntry {
  id: string;
  type: string;
  domain: string | null;
  description: string | null;
  contentUrl: string | null;
  createdAt: Date;
}

export async function getRecentEvidence(userId: string, limit = 12): Promise<EvidenceEntry[]> {
  const { data } = await supabase
    .from('evidence')
    .select('id, evidence_type, domain, description, content_url, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).map(row => ({
    id: row.id,
    type: row.evidence_type,
    domain: row.domain,
    description: row.description,
    contentUrl: row.content_url,
    createdAt: new Date(row.created_at),
  }));
}

// ============================================
// SESSION STATS
// ============================================

export interface SessionStats {
  totalSessions: number;
  totalMinutes: number;
  totalEdges: number;
  averageDuration: number;
}

export async function getSessionStats(userId: string): Promise<SessionStats> {
  const { data } = await supabase
    .from('arousal_sessions')
    .select('duration_minutes, edge_count')
    .eq('user_id', userId);

  const sessions = data || [];
  const totalMinutes = sessions.reduce((s, r) => s + (r.duration_minutes || 0), 0);
  const totalEdges = sessions.reduce((s, r) => s + (r.edge_count || 0), 0);

  return {
    totalSessions: sessions.length,
    totalMinutes,
    totalEdges,
    averageDuration: sessions.length > 0 ? Math.round(totalMinutes / sessions.length) : 0,
  };
}

// ============================================
// JOURNAL DATA
// ============================================

export interface JournalEntryData {
  id: string;
  date: string;
  alignmentScore: number | null;
  euphoriaNote: string | null;
  dysphoriaNote: string | null;
  freeText: string | null;
  tasksCompleted: number;
  pointsEarned: number;
  createdAt: Date;
}

export async function getJournalEntries(
  userId: string,
  limit = 30
): Promise<JournalEntryData[]> {
  const { data } = await supabase
    .from('daily_entries')
    .select('id, date, alignment_score, euphoria_notes, dysphoria_notes, handler_notes, tasks_completed, points_earned, created_at')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);

  return (data || []).map(row => ({
    id: row.id,
    date: row.date,
    alignmentScore: row.alignment_score,
    euphoriaNote: row.euphoria_notes,
    dysphoriaNote: row.dysphoria_notes,
    freeText: row.handler_notes,
    tasksCompleted: row.tasks_completed || 0,
    pointsEarned: row.points_earned || 0,
    createdAt: new Date(row.created_at),
  }));
}

export async function saveJournalEntry(
  userId: string,
  date: string,
  data: {
    alignmentScore?: number;
    euphoriaNote?: string;
    dysphoriaNote?: string;
    freeText?: string;
  }
): Promise<boolean> {
  const { error } = await supabase
    .from('daily_entries')
    .upsert({
      user_id: userId,
      date,
      alignment_score: data.alignmentScore,
      euphoria_notes: data.euphoriaNote,
      dysphoria_notes: data.dysphoriaNote,
      handler_notes: data.freeText,
    }, { onConflict: 'user_id,date' });

  if (error) {
    console.error('Failed to save journal entry:', error);
    return false;
  }
  return true;
}

// ============================================
// AGGREGATE DASHBOARD DATA
// ============================================

export interface DashboardData {
  odometer: OdometerState;
  streak: StreakData;
  domains: DomainLevel[];
  investments: InvestmentSummary;
  commitments: CommitmentStatus;
  milestones: MilestoneEntry[];
  evidence: EvidenceEntry[];
  sessions: SessionStats;
}

export async function loadDashboardData(userId: string): Promise<DashboardData> {
  const [odometer, streak, domains, investments, commitments, milestones, evidence, sessions] =
    await Promise.all([
      getOdometerState(userId),
      getStreakData(userId),
      getDomainLevels(userId),
      getInvestmentSummary(userId),
      getCommitmentStatus(userId),
      getMilestones(userId),
      getRecentEvidence(userId),
      getSessionStats(userId),
    ]);

  return { odometer, streak, domains, investments, commitments, milestones, evidence, sessions };
}
