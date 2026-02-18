/**
 * BaselineTracker
 *
 * Implements v2 Part 6: Baseline Tracking and Escalation
 * Tracks metrics per domain and automatically ratchets floors upward
 * The floor only rises - regression becomes increasingly difficult
 */

import { useState, useMemo } from 'react';
import {
  TrendingUp,
  Lock,
  ChevronUp,
  ArrowUp,
  Activity,
  Mic,
  Heart,
  Sparkles,
  Eye,
} from 'lucide-react';
import { useBaselines, type Baseline } from '../../hooks/useRatchetSystem';

interface BaselineTrackerProps {
  domain?: string;
  showRatchetHistory?: boolean;
  compact?: boolean;
  className?: string;
}

// Domain configuration
const DOMAIN_CONFIG: Record<string, {
  label: string;
  icon: typeof Activity;
  color: string;
  metrics: { key: string; label: string; unit: string }[];
}> = {
  voice: {
    label: 'Voice',
    icon: Mic,
    color: 'text-blue-400',
    metrics: [
      { key: 'practice_minutes_daily', label: 'Daily Practice', unit: 'min' },
      { key: 'pitch_hz', label: 'Target Pitch', unit: 'Hz' },
      { key: 'streak_days', label: 'Streak', unit: 'days' },
    ],
  },
  skincare: {
    label: 'Skincare',
    icon: Sparkles,
    color: 'text-pink-400',
    metrics: [
      { key: 'routine_steps', label: 'Routine Steps', unit: 'steps' },
      { key: 'streak_days', label: 'Streak', unit: 'days' },
    ],
  },
  movement: {
    label: 'Movement',
    icon: Activity,
    color: 'text-purple-400',
    metrics: [
      { key: 'practice_minutes_daily', label: 'Daily Practice', unit: 'min' },
      { key: 'posture_checks', label: 'Posture Checks', unit: '/day' },
    ],
  },
  intimate: {
    label: 'Intimate',
    icon: Heart,
    color: 'text-red-400',
    metrics: [
      { key: 'edge_count_session', label: 'Edges per Session', unit: 'edges' },
      { key: 'denial_days_minimum', label: 'Min Denial', unit: 'days' },
      { key: 'session_duration', label: 'Session Length', unit: 'min' },
    ],
  },
  social: {
    label: 'Social',
    icon: Eye,
    color: 'text-green-400',
    metrics: [
      { key: 'public_outings', label: 'Public Outings', unit: '/month' },
      { key: 'people_told', label: 'People Told', unit: 'people' },
    ],
  },
};

export function BaselineTracker({
  domain,
  showRatchetHistory = false,
  compact = false,
  className = '',
}: BaselineTrackerProps) {
  const { baselines, isLoading, ratchetBaseline, getBaselinesByDomain } = useBaselines();
  const [selectedDomain, setSelectedDomain] = useState<string>(domain || 'voice');

  // Get baselines for selected domain
  const domainBaselines = useMemo(() => {
    return getBaselinesByDomain(selectedDomain);
  }, [selectedDomain, getBaselinesByDomain]);

  // Calculate overall ratchet score
  const ratchetScore = useMemo(() => {
    if (baselines.length === 0) return 0;
    const totalRatchets = baselines.reduce((sum, b) => {
      const increase = b.previousBaseline ? b.baselineValue - b.previousBaseline : 0;
      return sum + (increase > 0 ? 1 : 0);
    }, 0);
    return Math.round((totalRatchets / baselines.length) * 100);
  }, [baselines]);

  const domainConfig = DOMAIN_CONFIG[selectedDomain] || DOMAIN_CONFIG.voice;
  const Icon = domainConfig.icon;

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-32 bg-protocol-surface rounded-xl" />
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`bg-protocol-surface border border-protocol-border rounded-xl p-4 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-protocol-accent/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-protocol-accent" />
            </div>
            <div>
              <p className="text-protocol-text font-semibold">Baselines</p>
              <p className="text-protocol-text-muted text-xs">
                {baselines.length} floors established
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-protocol-accent text-xl font-bold">{ratchetScore}%</p>
            <p className="text-protocol-text-muted text-xs">ratcheted</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-protocol-text font-semibold">Baseline Tracker</h3>
          <p className="text-protocol-text-muted text-sm">
            The floor only rises. {baselines.length} baselines established.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-protocol-accent/20 rounded-lg">
          <Lock className="w-4 h-4 text-protocol-accent" />
          <span className="text-protocol-accent font-semibold">{ratchetScore}%</span>
        </div>
      </div>

      {/* Domain selector */}
      {!domain && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {Object.entries(DOMAIN_CONFIG).map(([key, config]) => (
            <button
              key={key}
              onClick={() => setSelectedDomain(key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-colors ${
                selectedDomain === key
                  ? 'bg-protocol-accent text-white'
                  : 'bg-protocol-surface text-protocol-text-muted hover:text-protocol-text'
              }`}
            >
              <config.icon className={`w-4 h-4 ${selectedDomain === key ? 'text-white' : config.color}`} />
              {config.label}
            </button>
          ))}
        </div>
      )}

      {/* Domain baselines */}
      <div className="bg-protocol-surface border border-protocol-border rounded-xl p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className={`p-2 rounded-lg bg-protocol-bg ${domainConfig.color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-protocol-text font-medium">{domainConfig.label} Baselines</h4>
            <p className="text-protocol-text-muted text-xs">
              Minimum acceptable metrics
            </p>
          </div>
        </div>

        {/* Metrics */}
        <div className="space-y-3">
          {domainConfig.metrics.map((metric) => {
            const baseline = domainBaselines.find(b => b.metric === metric.key);
            return (
              <BaselineMetricCard
                key={metric.key}
                metric={metric}
                baseline={baseline}
                onRatchet={(value) => ratchetBaseline(selectedDomain, metric.key, value)}
                showHistory={showRatchetHistory}
              />
            );
          })}
        </div>
      </div>

      {/* Ratchet explanation */}
      <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 text-sm font-medium">How Ratcheting Works</p>
            <p className="text-amber-300/70 text-xs mt-1">
              When you consistently exceed a baseline, the system automatically raises the floor.
              The new minimum becomes your previous achievement. You can never go back below
              an established baseline without breaking a fundamental commitment.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Metric card component
function BaselineMetricCard({
  metric,
  baseline,
  onRatchet,
  showHistory,
}: {
  metric: { key: string; label: string; unit: string };
  baseline: Baseline | undefined;
  onRatchet: (value: number) => Promise<boolean>;
  showHistory: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRatchet = async () => {
    if (!newValue) return;
    const value = parseFloat(newValue);
    if (isNaN(value)) return;

    // Only allow ratcheting UP
    if (baseline && value <= baseline.baselineValue) {
      alert('Baselines can only be ratcheted upward. The floor never lowers.');
      return;
    }

    setIsSubmitting(true);
    const success = await onRatchet(value);
    setIsSubmitting(false);

    if (success) {
      setIsEditing(false);
      setNewValue('');
    }
  };

  const ratchetPercent = baseline?.previousBaseline
    ? Math.round(((baseline.baselineValue - baseline.previousBaseline) / baseline.previousBaseline) * 100)
    : 0;

  return (
    <div className="p-3 bg-protocol-bg rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-protocol-text-muted text-sm">{metric.label}</span>
        {baseline && baseline.previousBaseline && (
          <span className="text-green-400 text-xs flex items-center gap-1">
            <ArrowUp className="w-3 h-3" />
            {ratchetPercent}%
          </span>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          {baseline ? (
            <>
              <span className="text-protocol-text text-2xl font-bold">
                {baseline.baselineValue}
              </span>
              <span className="text-protocol-text-muted text-sm">{metric.unit}</span>
            </>
          ) : (
            <span className="text-protocol-text-muted text-lg">Not set</span>
          )}
        </div>

        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={baseline?.baselineValue.toString() || '0'}
              className="w-20 px-2 py-1 bg-protocol-surface border border-protocol-border rounded
                       text-protocol-text text-sm"
              autoFocus
            />
            <button
              onClick={handleRatchet}
              disabled={isSubmitting}
              className="p-1 bg-green-500 text-white rounded"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="p-1 bg-protocol-surface text-protocol-text-muted rounded"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="px-2 py-1 bg-protocol-surface text-protocol-text-muted text-xs rounded
                     hover:text-protocol-text transition-colors flex items-center gap-1"
          >
            <TrendingUp className="w-3 h-3" />
            Ratchet
          </button>
        )}
      </div>

      {/* History */}
      {showHistory && baseline?.previousBaseline && (
        <div className="mt-2 pt-2 border-t border-protocol-border text-xs text-protocol-text-muted">
          Previous: {baseline.previousBaseline} {metric.unit}
        </div>
      )}
    </div>
  );
}

export default BaselineTracker;
