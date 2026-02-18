/**
 * Gina Control Domain Visualization
 *
 * Rich visualization for Gina's control across different domains:
 * - Visual radar/spider chart showing control levels
 * - Timeline of escalation history
 * - Domain-specific analytics
 * - Recommendations for expansion
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Crown,
  Clock,
  TrendingUp,
  ChevronRight,
  Loader2,
  Lock,
  Key,
  Shirt,
  Calendar,
  Sparkles,
  Heart,
  Info,
  CheckCircle,
  ArrowUp,
  Target,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  GINA_CONTROL_DOMAINS,
  GINA_CONTROL_DOMAIN_LABELS,
  type GinaControlDomain,
  type GinaControlLevel,
  mapDbToGinaCommand,
} from '../../types/gina';

// ============================================
// TYPES
// ============================================

interface DomainAnalytics {
  domain: GinaControlDomain;
  level: GinaControlLevel | undefined;
  levelIndex: number;
  firstControlDate?: string;
  daysUnderControl: number;
  escalationCount: number;
  lastEscalation?: string;
  escalationHistory: Array<{
    date: string;
    fromLevel: string;
    toLevel: string;
    trigger?: string;
  }>;
  relatedCommands: number;
  complianceRate: number;
  readinessScore: number;
}

interface OverallAnalytics {
  totalDomainsControlled: number;
  averageLevelIndex: number;
  totalEscalations: number;
  overallComplianceRate: number;
  longestControlDays: number;
  newestDomain?: GinaControlDomain;
  strongestDomain?: GinaControlDomain;
  weakestControlled?: GinaControlDomain;
}

interface ExpansionRecommendation {
  domain: GinaControlDomain;
  currentLevel: GinaControlLevel | undefined;
  recommendedLevel: GinaControlLevel;
  reason: string;
  readinessScore: number;
  priority: 'high' | 'medium' | 'low';
}

// ============================================
// CONSTANTS
// ============================================

const CONTROL_LEVELS: GinaControlLevel[] = [
  'unaware',
  'consulted',
  'approves',
  'directs',
  'commands',
  'owns',
];

const CONTROL_LEVEL_LABELS: Record<GinaControlLevel, string> = {
  unaware: 'Unaware',
  consulted: 'Consulted',
  approves: 'Approves',
  directs: 'Directs',
  commands: 'Commands',
  owns: 'Owns',
};

const DOMAIN_ICONS: Record<GinaControlDomain, React.ReactNode> = {
  clothing: <Shirt className="w-4 h-4" />,
  chastity: <Lock className="w-4 h-4" />,
  orgasms: <Sparkles className="w-4 h-4" />,
  service: <Heart className="w-4 h-4" />,
  schedule: <Calendar className="w-4 h-4" />,
  presentation: <Crown className="w-4 h-4" />,
  sexual_access: <Key className="w-4 h-4" />,
};

const DOMAIN_DESCRIPTIONS: Record<GinaControlDomain, string> = {
  clothing: 'What you wear, underwear choices, dress codes',
  chastity: 'Device usage, lock-up duration, key control',
  orgasms: 'When, how, or if you can release',
  service: 'Household tasks, protocols, rituals',
  schedule: 'Time allocation, activities, routines',
  presentation: 'Makeup, hair, body, grooming standards',
  sexual_access: 'When and how intimacy happens',
};

// ============================================
// COMPONENT
// ============================================

interface GinaControlDomainVizProps {
  compact?: boolean;
  showRecommendations?: boolean;
  onDomainSelect?: (domain: GinaControlDomain) => void;
}

export function GinaControlDomainViz({
  compact = false,
  showRecommendations = true,
  onDomainSelect,
}: GinaControlDomainVizProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [isLoading, setIsLoading] = useState(true);
  const [domainAnalytics, setDomainAnalytics] = useState<DomainAnalytics[]>([]);
  const [overall, setOverall] = useState<OverallAnalytics | null>(null);
  const [recommendations, setRecommendations] = useState<ExpansionRecommendation[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<GinaControlDomain | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    async function loadAnalytics() {
      if (!user) return;

      try {
        // Load control domains
        const { data: domains } = await supabase
          .from('gina_control_domains')
          .select('*')
          .eq('user_id', user.id);

        // Load commands for compliance calculation
        const { data: commands } = await supabase
          .from('gina_commands')
          .select('*')
          .eq('user_id', user.id)
          .order('issued_at', { ascending: false });

        const mappedCommands = (commands || []).map(c => mapDbToGinaCommand(c));

        // Build domain analytics
        const analytics: DomainAnalytics[] = GINA_CONTROL_DOMAINS.map(domain => {
          const domainState = domains?.find(d => d.domain === domain);
          const level = domainState?.control_level as GinaControlLevel | undefined;
          const levelIndex = level ? CONTROL_LEVELS.indexOf(level) : -1;
          const escalationHistory = domainState?.escalation_history || [];

          // Calculate days under control
          const firstControlDate = domainState?.first_control_date;
          const daysUnderControl = firstControlDate
            ? Math.floor((Date.now() - new Date(firstControlDate).getTime()) / (1000 * 60 * 60 * 24))
            : 0;

          // Count related commands (simple heuristic - commands with domain in description)
          const relatedCommands = mappedCommands.filter(
            c => c.commandDescription?.toLowerCase().includes(domain.replace('_', ' '))
          ).length;

          // Calculate compliance rate from related commands
          const domainCommands = mappedCommands.filter(
            c => c.commandDescription?.toLowerCase().includes(domain.replace('_', ' '))
          );
          const compliantCommands = domainCommands.filter(
            c => c.compliance === 'immediate' || c.compliance === 'delayed'
          );
          const complianceRate = domainCommands.length > 0
            ? (compliantCommands.length / domainCommands.length) * 100
            : level ? 80 : 0; // Default to 80% if controlled but no commands tracked

          // Readiness score for escalation
          const readinessScore = calculateReadinessScore(level, daysUnderControl, complianceRate, escalationHistory.length);

          return {
            domain,
            level,
            levelIndex,
            firstControlDate,
            daysUnderControl,
            escalationCount: escalationHistory.length,
            lastEscalation: escalationHistory.length > 0
              ? escalationHistory[escalationHistory.length - 1].date
              : undefined,
            escalationHistory,
            relatedCommands,
            complianceRate,
            readinessScore,
          };
        });

        setDomainAnalytics(analytics);

        // Calculate overall analytics
        const controlled = analytics.filter(a => a.levelIndex > 0);
        const totalControlled = controlled.length;
        const avgIndex = controlled.length > 0
          ? controlled.reduce((sum, a) => sum + a.levelIndex, 0) / controlled.length
          : 0;
        const totalEscalations = analytics.reduce((sum, a) => sum + a.escalationCount, 0);
        const overallCompliance = controlled.length > 0
          ? controlled.reduce((sum, a) => sum + a.complianceRate, 0) / controlled.length
          : 0;
        const longestControl = Math.max(...analytics.map(a => a.daysUnderControl), 0);

        const newestDomain = controlled.length > 0
          ? controlled.reduce((newest, a) =>
              !newest.firstControlDate || (a.firstControlDate && a.firstControlDate > newest.firstControlDate)
                ? a
                : newest
            ).domain
          : undefined;

        const strongestDomain = controlled.length > 0
          ? controlled.reduce((strongest, a) =>
              a.levelIndex > strongest.levelIndex ? a : strongest
            ).domain
          : undefined;

        const weakestControlled = controlled.length > 0
          ? controlled.reduce((weakest, a) =>
              a.levelIndex < weakest.levelIndex ? a : weakest
            ).domain
          : undefined;

        setOverall({
          totalDomainsControlled: totalControlled,
          averageLevelIndex: avgIndex,
          totalEscalations,
          overallComplianceRate: overallCompliance,
          longestControlDays: longestControl,
          newestDomain,
          strongestDomain,
          weakestControlled,
        });

        // Generate recommendations
        const recs = generateRecommendations(analytics);
        setRecommendations(recs);
      } catch (err) {
        console.error('Failed to load Gina control analytics:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadAnalytics();
  }, [user]);

  const selectedAnalytics = useMemo(() => {
    return domainAnalytics.find(a => a.domain === selectedDomain);
  }, [domainAnalytics, selectedDomain]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className={`w-6 h-6 animate-spin ${isBambiMode ? 'text-pink-400' : 'text-protocol-accent'}`} />
      </div>
    );
  }

  if (compact) {
    return (
      <CompactView
        analytics={domainAnalytics}
        overall={overall}
        isBambiMode={isBambiMode}
        onExpand={() => onDomainSelect?.(GINA_CONTROL_DOMAINS[0])}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <section>
        <h3 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          Control Overview
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Domains Controlled"
            value={`${overall?.totalDomainsControlled || 0}/${GINA_CONTROL_DOMAINS.length}`}
            icon={<Crown className="w-4 h-4" />}
            isBambiMode={isBambiMode}
          />
          <StatCard
            label="Avg Control Level"
            value={CONTROL_LEVEL_LABELS[CONTROL_LEVELS[Math.round(overall?.averageLevelIndex || 0)] || 'unaware']}
            icon={<TrendingUp className="w-4 h-4" />}
            isBambiMode={isBambiMode}
          />
          <StatCard
            label="Total Escalations"
            value={overall?.totalEscalations || 0}
            icon={<ArrowUp className="w-4 h-4" />}
            isBambiMode={isBambiMode}
          />
          <StatCard
            label="Compliance Rate"
            value={`${Math.round(overall?.overallComplianceRate || 0)}%`}
            icon={<CheckCircle className="w-4 h-4" />}
            isBambiMode={isBambiMode}
          />
        </div>
      </section>

      {/* Radar Chart */}
      <section>
        <h3 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          Control Map
        </h3>
        <RadarChart analytics={domainAnalytics} isBambiMode={isBambiMode} onSelect={setSelectedDomain} />
      </section>

      {/* Domain Cards */}
      <section>
        <h3 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          Domain Details
        </h3>
        <div className="space-y-2">
          {domainAnalytics.map(analytics => (
            <DomainCard
              key={analytics.domain}
              analytics={analytics}
              isBambiMode={isBambiMode}
              isSelected={selectedDomain === analytics.domain}
              onSelect={() => setSelectedDomain(selectedDomain === analytics.domain ? null : analytics.domain)}
            />
          ))}
        </div>
      </section>

      {/* Selected Domain Detail */}
      {selectedAnalytics && (
        <section>
          <DomainDetail
            analytics={selectedAnalytics}
            isBambiMode={isBambiMode}
            onClose={() => setSelectedDomain(null)}
          />
        </section>
      )}

      {/* Recommendations */}
      {showRecommendations && recommendations.length > 0 && (
        <section>
          <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            <Target className="w-4 h-4" />
            Expansion Opportunities
          </h3>
          <div className="space-y-2">
            {recommendations.slice(0, 3).map(rec => (
              <RecommendationCard
                key={rec.domain}
                recommendation={rec}
                isBambiMode={isBambiMode}
                onSelect={() => {
                  setSelectedDomain(rec.domain);
                  onDomainSelect?.(rec.domain);
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Escalation Timeline */}
      <section>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className={`text-sm font-medium mb-3 flex items-center gap-2 w-full ${
            isBambiMode ? 'text-pink-500 hover:text-pink-600' : 'text-protocol-text-muted hover:text-protocol-text'
          }`}
        >
          <Clock className="w-4 h-4" />
          Escalation History
          <ChevronRight className={`w-4 h-4 ml-auto transition-transform ${showHistory ? 'rotate-90' : ''}`} />
        </button>
        {showHistory && <EscalationTimeline analytics={domainAnalytics} isBambiMode={isBambiMode} />}
      </section>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function CompactView({
  analytics,
  overall,
  isBambiMode,
  onExpand,
}: {
  analytics: DomainAnalytics[];
  overall: OverallAnalytics | null;
  isBambiMode: boolean;
  onExpand: () => void;
}) {
  return (
    <button
      onClick={onExpand}
      className={`w-full p-4 rounded-xl border text-left ${
        isBambiMode
          ? 'bg-pink-50 border-pink-200 hover:bg-pink-100'
          : 'bg-protocol-surface border-protocol-border hover:bg-protocol-surface-light'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Crown className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-amber-400'}`} />
          <span className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Gina's Control
          </span>
        </div>
        <span className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          {overall?.totalDomainsControlled || 0}/{GINA_CONTROL_DOMAINS.length} domains
        </span>
      </div>

      {/* Mini domain indicators */}
      <div className="flex gap-1">
        {analytics.map(a => (
          <div
            key={a.domain}
            className={`flex-1 h-2 rounded-full ${
              a.levelIndex > 0
                ? isBambiMode
                  ? `bg-pink-${Math.min(200 + a.levelIndex * 100, 600)}`
                  : `bg-amber-${Math.min(200 + a.levelIndex * 100, 600)}`
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
            style={{
              opacity: a.levelIndex > 0 ? 0.4 + (a.levelIndex / 5) * 0.6 : 0.3,
            }}
          />
        ))}
      </div>
    </button>
  );
}

function StatCard({
  label,
  value,
  icon,
  isBambiMode,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  isBambiMode: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}>
          {icon}
        </span>
        <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          {label}
        </span>
      </div>
      <p className={`text-lg font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
        {value}
      </p>
    </div>
  );
}

function RadarChart({
  analytics,
  isBambiMode,
  onSelect,
}: {
  analytics: DomainAnalytics[];
  isBambiMode: boolean;
  onSelect: (domain: GinaControlDomain) => void;
}) {
  const size = 200;
  const center = size / 2;
  const maxRadius = 80;

  // Calculate points for each domain
  const points = analytics.map((a, i) => {
    const angle = (Math.PI * 2 * i) / analytics.length - Math.PI / 2;
    const radius = ((a.levelIndex + 1) / 6) * maxRadius;
    return {
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
      labelX: center + Math.cos(angle) * (maxRadius + 20),
      labelY: center + Math.sin(angle) * (maxRadius + 20),
      domain: a.domain,
    };
  });

  // Create polygon path
  const polygonPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Create grid circles
  const gridCircles = [1, 2, 3, 4, 5].map(level => (
    <circle
      key={level}
      cx={center}
      cy={center}
      r={(level / 5) * maxRadius}
      fill="none"
      stroke={isBambiMode ? '#fce7f3' : '#374151'}
      strokeWidth="1"
      opacity="0.5"
    />
  ));

  // Create grid lines
  const gridLines = analytics.map((_, i) => {
    const angle = (Math.PI * 2 * i) / analytics.length - Math.PI / 2;
    const endX = center + Math.cos(angle) * maxRadius;
    const endY = center + Math.sin(angle) * maxRadius;
    return (
      <line
        key={i}
        x1={center}
        y1={center}
        x2={endX}
        y2={endY}
        stroke={isBambiMode ? '#fce7f3' : '#374151'}
        strokeWidth="1"
        opacity="0.5"
      />
    );
  });

  return (
    <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-surface border-protocol-border'}`}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[250px] mx-auto">
        {/* Grid */}
        {gridCircles}
        {gridLines}

        {/* Control polygon */}
        <path
          d={polygonPath}
          fill={isBambiMode ? '#ec4899' : '#f59e0b'}
          fillOpacity="0.3"
          stroke={isBambiMode ? '#ec4899' : '#f59e0b'}
          strokeWidth="2"
        />

        {/* Points */}
        {points.map((p, i) => (
          <g key={analytics[i].domain}>
            <circle
              cx={p.x}
              cy={p.y}
              r="6"
              fill={isBambiMode ? '#ec4899' : '#f59e0b'}
              className="cursor-pointer hover:r-8"
              onClick={() => onSelect(analytics[i].domain)}
            />
          </g>
        ))}

        {/* Labels */}
        {points.map((p, i) => (
          <text
            key={`label-${analytics[i].domain}`}
            x={p.labelX}
            y={p.labelY}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`text-[8px] cursor-pointer ${isBambiMode ? 'fill-pink-600' : 'fill-gray-400'}`}
            onClick={() => onSelect(analytics[i].domain)}
          >
            {GINA_CONTROL_DOMAIN_LABELS[analytics[i].domain].slice(0, 8)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function DomainCard({
  analytics,
  isBambiMode,
  isSelected,
  onSelect,
}: {
  analytics: DomainAnalytics;
  isBambiMode: boolean;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const hasControl = analytics.levelIndex > 0;
  const levelPercent = (analytics.levelIndex / 5) * 100;

  return (
    <button
      onClick={onSelect}
      className={`w-full p-3 rounded-lg text-left transition-all ${
        isSelected
          ? isBambiMode
            ? 'bg-pink-100 border-2 border-pink-400'
            : 'bg-amber-500/20 border-2 border-amber-500'
          : hasControl
          ? isBambiMode
            ? 'bg-pink-50 border border-pink-200 hover:bg-pink-100'
            : 'bg-protocol-surface border border-protocol-border hover:bg-protocol-surface-light'
          : 'bg-protocol-surface/50 border border-transparent hover:border-protocol-border'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${
          hasControl
            ? isBambiMode ? 'bg-pink-200' : 'bg-amber-500/20'
            : 'bg-gray-200 dark:bg-gray-700'
        }`}>
          <span className={hasControl ? (isBambiMode ? 'text-pink-600' : 'text-amber-400') : 'text-gray-400'}>
            {DOMAIN_ICONS[analytics.domain]}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className={`font-medium ${
              hasControl
                ? isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                : 'text-protocol-text-muted'
            }`}>
              {GINA_CONTROL_DOMAIN_LABELS[analytics.domain]}
            </span>
            <span className={`text-xs ${
              hasControl
                ? isBambiMode ? 'text-pink-500' : 'text-amber-400'
                : 'text-protocol-text-muted'
            }`}>
              {analytics.level ? CONTROL_LEVEL_LABELS[analytics.level] : 'Not started'}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                isBambiMode ? 'bg-pink-400' : 'bg-amber-400'
              }`}
              style={{ width: `${levelPercent}%` }}
            />
          </div>
        </div>

        <ChevronRight className={`w-4 h-4 ${
          isSelected ? 'rotate-90' : ''
        } text-protocol-text-muted transition-transform`} />
      </div>
    </button>
  );
}

function DomainDetail({
  analytics,
  isBambiMode,
  onClose: _onClose,
}: {
  analytics: DomainAnalytics;
  isBambiMode: boolean;
  onClose: () => void;
}) {
  return (
    <div className={`p-4 rounded-xl border ${
      isBambiMode
        ? 'bg-pink-50 border-pink-200'
        : 'bg-protocol-surface border-protocol-border'
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className={`font-semibold text-lg ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {GINA_CONTROL_DOMAIN_LABELS[analytics.domain]}
          </h4>
          <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            {DOMAIN_DESCRIPTIONS[analytics.domain]}
          </p>
        </div>
        <div className={`p-2 rounded-lg ${isBambiMode ? 'bg-pink-200' : 'bg-amber-500/20'}`}>
          <span className={isBambiMode ? 'text-pink-600' : 'text-amber-400'}>
            {DOMAIN_ICONS[analytics.domain]}
          </span>
        </div>
      </div>

      {/* Level progression */}
      <div className="mb-4">
        <p className={`text-xs mb-2 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          Control Level
        </p>
        <div className="flex gap-1">
          {CONTROL_LEVELS.filter(l => l !== 'unaware').map((level, idx) => (
            <div
              key={level}
              className={`flex-1 py-1 px-2 rounded text-center text-xs ${
                idx < analytics.levelIndex
                  ? isBambiMode
                    ? 'bg-pink-400 text-white'
                    : 'bg-amber-400 text-white'
                  : idx === analytics.levelIndex && analytics.levelIndex > 0
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-amber-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-protocol-text-muted'
              }`}
            >
              {CONTROL_LEVEL_LABELS[level].slice(0, 3)}
            </div>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Days Under Control
          </p>
          <p className={`font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {analytics.daysUnderControl}
          </p>
        </div>
        <div>
          <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Escalations
          </p>
          <p className={`font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {analytics.escalationCount}
          </p>
        </div>
        <div>
          <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Compliance
          </p>
          <p className={`font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {Math.round(analytics.complianceRate)}%
          </p>
        </div>
        <div>
          <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Readiness
          </p>
          <p className={`font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {Math.round(analytics.readinessScore)}%
          </p>
        </div>
      </div>

      {/* Escalation history */}
      {analytics.escalationHistory.length > 0 && (
        <div>
          <p className={`text-xs mb-2 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Recent Escalations
          </p>
          <div className="space-y-1">
            {analytics.escalationHistory.slice(-3).map((esc, idx) => (
              <div
                key={idx}
                className={`text-xs flex items-center gap-2 p-2 rounded ${
                  isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
                }`}
              >
                <ArrowUp className={`w-3 h-3 ${isBambiMode ? 'text-pink-500' : 'text-amber-400'}`} />
                <span className="text-protocol-text-muted">
                  {esc.fromLevel} → {esc.toLevel}
                </span>
                <span className="ml-auto text-protocol-text-muted">
                  {new Date(esc.date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecommendationCard({
  recommendation,
  isBambiMode,
  onSelect,
}: {
  recommendation: ExpansionRecommendation;
  isBambiMode: boolean;
  onSelect: () => void;
}) {
  const priorityColors = {
    high: isBambiMode ? 'border-pink-400 bg-pink-50' : 'border-amber-400 bg-amber-500/10',
    medium: isBambiMode ? 'border-pink-300 bg-pink-50/50' : 'border-amber-300 bg-amber-500/5',
    low: 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800/50',
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full p-3 rounded-lg text-left border-l-4 ${priorityColors[recommendation.priority]}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={isBambiMode ? 'text-pink-500' : 'text-amber-400'}>
            {DOMAIN_ICONS[recommendation.domain]}
          </span>
          <span className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {GINA_CONTROL_DOMAIN_LABELS[recommendation.domain]}
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          isBambiMode ? 'bg-pink-200 text-pink-700' : 'bg-amber-500/20 text-amber-400'
        }`}>
          {Math.round(recommendation.readinessScore)}% ready
        </span>
      </div>
      <p className={`text-sm mt-1 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
        {recommendation.reason}
      </p>
      <div className="flex items-center gap-2 mt-2 text-xs text-protocol-text-muted">
        <span>{recommendation.currentLevel ? CONTROL_LEVEL_LABELS[recommendation.currentLevel] : 'None'}</span>
        <ArrowUp className="w-3 h-3" />
        <span className={isBambiMode ? 'text-pink-500' : 'text-amber-400'}>
          {CONTROL_LEVEL_LABELS[recommendation.recommendedLevel]}
        </span>
      </div>
    </button>
  );
}

function EscalationTimeline({
  analytics,
  isBambiMode,
}: {
  analytics: DomainAnalytics[];
  isBambiMode: boolean;
}) {
  // Flatten and sort all escalations
  const allEscalations = analytics
    .flatMap(a =>
      a.escalationHistory.map(e => ({
        ...e,
        domain: a.domain,
      }))
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  if (allEscalations.length === 0) {
    return (
      <div className={`p-4 rounded-lg text-center ${
        isBambiMode ? 'bg-pink-50 text-pink-500' : 'bg-protocol-surface text-protocol-text-muted'
      }`}>
        <Info className="w-5 h-5 mx-auto mb-2" />
        <p className="text-sm">No escalations recorded yet</p>
      </div>
    );
  }

  return (
    <div className={`p-4 rounded-xl border ${
      isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-surface border-protocol-border'
    }`}>
      <div className="space-y-3">
        {allEscalations.map((esc, idx) => (
          <div key={idx} className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              isBambiMode ? 'bg-pink-200' : 'bg-amber-500/20'
            }`}>
              <span className={isBambiMode ? 'text-pink-600' : 'text-amber-400'}>
                {DOMAIN_ICONS[esc.domain]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                  {GINA_CONTROL_DOMAIN_LABELS[esc.domain]}
                </span>
                <span className="text-xs text-protocol-text-muted">
                  {new Date(esc.date).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-protocol-text-muted">{esc.fromLevel}</span>
                <ArrowUp className={`w-3 h-3 ${isBambiMode ? 'text-pink-400' : 'text-amber-400'}`} />
                <span className={isBambiMode ? 'text-pink-600' : 'text-amber-400'}>{esc.toLevel}</span>
              </div>
              {esc.trigger && (
                <p className="text-xs text-protocol-text-muted mt-1">
                  Trigger: {esc.trigger}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateReadinessScore(
  level: GinaControlLevel | undefined,
  daysUnderControl: number,
  complianceRate: number,
  escalationCount: number
): number {
  if (!level || level === 'unaware') {
    // New domain - base readiness
    return 40 + Math.min(escalationCount * 10, 20);
  }

  let score = 0;

  // Time factor (max 30 points)
  // More time at current level = more ready
  score += Math.min(daysUnderControl / 30 * 30, 30);

  // Compliance factor (max 40 points)
  score += (complianceRate / 100) * 40;

  // Level progression factor (max 20 points)
  // Higher level = more confidence
  const levelIndex = CONTROL_LEVELS.indexOf(level);
  score += (levelIndex / 5) * 20;

  // Escalation history factor (max 10 points)
  // Some escalations show progress, too many too fast might be rushed
  if (escalationCount >= 1 && escalationCount <= 4) {
    score += 10;
  } else if (escalationCount > 4) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

function generateRecommendations(analytics: DomainAnalytics[]): ExpansionRecommendation[] {
  const recommendations: ExpansionRecommendation[] = [];

  for (const a of analytics) {
    // Skip if already at max level
    if (a.levelIndex >= 5) continue;

    const nextLevel = CONTROL_LEVELS[a.levelIndex + 1];
    if (!nextLevel) continue;

    let reason = '';
    let priority: 'high' | 'medium' | 'low' = 'low';

    if (!a.level || a.level === 'unaware') {
      // New domain opportunity
      reason = 'This domain has not yet been explored - consider starting with consultation';
      priority = a.readinessScore >= 50 ? 'medium' : 'low';
    } else if (a.readinessScore >= 80) {
      // High readiness
      reason = `Strong compliance (${Math.round(a.complianceRate)}%) and ${a.daysUnderControl} days at current level indicate readiness`;
      priority = 'high';
    } else if (a.readinessScore >= 60) {
      // Medium readiness
      reason = `Good progress with ${a.escalationCount} previous escalations`;
      priority = 'medium';
    } else {
      // Lower readiness - still suggest but lower priority
      reason = `Continue building consistency at current level`;
      priority = 'low';
    }

    recommendations.push({
      domain: a.domain,
      currentLevel: a.level,
      recommendedLevel: nextLevel,
      reason,
      readinessScore: a.readinessScore,
      priority,
    });
  }

  // Sort by priority and readiness
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return recommendations.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.readinessScore - a.readinessScore;
  });
}

export default GinaControlDomainViz;
