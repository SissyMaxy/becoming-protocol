/**
 * Handler Autonomous Dashboard View
 *
 * Main dashboard for the Handler Autonomous system. Displays compliance status,
 * fund overview, active content briefs, platform accounts, and strategy phase.
 * Uses collapsible sections with mobile-first layout.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Shield,
  DollarSign,
  FileText,
  Globe,
  TrendingUp,
  Loader2,
  AlertTriangle,
  Clock,
  Droplets,
  CheckCircle,
  Star,
  Upload,
  Zap,
  RefreshCw,
  Circle,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { getComplianceState, type ComplianceState } from '../../lib/handler-v2/enforcement-engine';
import { getFund, type MaxyFund } from '../../lib/handler-v2/financial-engine';
import { getActiveBriefs, generateQuickTask, type ContentBrief } from '../../lib/handler-v2/content-engine';
import { getAccounts, type PlatformAccount } from '../../lib/handler-v2/platform-manager';
import { getStrategy, type StrategyState, type Phase } from '../../lib/handler-v2/strategy-engine';

// ============================================
// PROPS
// ============================================

interface HandlerAutonomousViewProps {
  onBack: () => void;
}

// ============================================
// HELPERS
// ============================================

function getTierColor(tier: number): string {
  if (tier === 0) return 'text-green-400';
  if (tier <= 2) return 'text-yellow-400';
  if (tier <= 4) return 'text-orange-400';
  if (tier <= 6) return 'text-red-400';
  return 'text-red-600';
}

function getTierBgColor(tier: number): string {
  if (tier === 0) return 'bg-green-500/20 border-green-500/30';
  if (tier <= 2) return 'bg-yellow-500/20 border-yellow-500/30';
  if (tier <= 4) return 'bg-orange-500/20 border-orange-500/30';
  if (tier <= 6) return 'bg-red-500/20 border-red-500/30';
  return 'bg-red-700/20 border-red-700/30';
}

function getTierLabel(tier: number): string {
  if (tier === 0) return 'Compliant';
  if (tier <= 2) return 'Warning';
  if (tier <= 4) return 'Elevated';
  if (tier <= 6) return 'Critical';
  return 'Maximum';
}

function formatTimeRemaining(deadline: string): string {
  const now = Date.now();
  const target = new Date(deadline).getTime();
  const diff = target - now;

  if (diff <= 0) return 'Overdue';

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

function renderDifficultyStars(difficulty: number): React.ReactNode {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`w-3 h-3 ${
            i < difficulty ? 'text-yellow-400 fill-yellow-400' : 'text-gray-600'
          }`}
        />
      ))}
    </span>
  );
}

const PHASE_ORDER: Phase[] = ['foundation', 'growth', 'monetization', 'scale'];

function getPhaseIndex(phase: Phase): number {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

function getPhaseLabel(phase: Phase): string {
  const labels: Record<Phase, string> = {
    foundation: 'Foundation',
    growth: 'Growth',
    monetization: 'Monetization',
    scale: 'Scale',
    sex_work: 'Full Autonomy',
  };
  return labels[phase] || phase;
}

// ============================================
// COLLAPSIBLE SECTION COMPONENT
// ============================================

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: React.ReactNode;
  isBambiMode: boolean;
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
  badge,
  isBambiMode,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={`rounded-xl border overflow-hidden ${
        isBambiMode
          ? 'bg-pink-50/80 border-pink-200'
          : 'bg-protocol-surface border-protocol-border'
      }`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-3 p-4 transition-colors ${
          isBambiMode
            ? 'hover:bg-pink-100/60'
            : 'hover:bg-protocol-surface/80'
        }`}
      >
        <span className={isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}>
          {icon}
        </span>
        <span
          className={`flex-1 text-left font-semibold text-sm ${
            isBambiMode ? 'text-pink-900' : 'text-protocol-text'
          }`}
        >
          {title}
        </span>
        {badge && <span className="mr-2">{badge}</span>}
        {isOpen ? (
          <ChevronUp className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
        ) : (
          <ChevronDown className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
        )}
      </button>
      {isOpen && (
        <div className={`px-4 pb-4 ${isBambiMode ? 'border-t border-pink-200/60' : 'border-t border-protocol-border/50'}`}>
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================
// LOADING SPINNER
// ============================================

function SectionLoader({ isBambiMode }: { isBambiMode: boolean }) {
  return (
    <div className="flex items-center justify-center py-6">
      <Loader2
        className={`w-5 h-5 animate-spin ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
        }`}
      />
    </div>
  );
}

// ============================================
// ERROR MESSAGE
// ============================================

function SectionError({ message, isBambiMode }: { message: string; isBambiMode: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 p-3 rounded-lg mt-3 text-xs ${
        isBambiMode
          ? 'bg-pink-100 text-pink-700 border border-pink-200'
          : 'bg-red-500/10 text-red-400 border border-red-500/20'
      }`}
    >
      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function HandlerAutonomousView({ onBack }: HandlerAutonomousViewProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const userId = user?.id ?? '';

  // Data state
  const [compliance, setCompliance] = useState<ComplianceState | null>(null);
  const [fund, setFund] = useState<MaxyFund | null>(null);
  const [briefs, setBriefs] = useState<ContentBrief[]>([]);
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [strategy, setStrategy] = useState<StrategyState | null>(null);

  // Loading/error state per section
  const [loadingCompliance, setLoadingCompliance] = useState(true);
  const [loadingFund, setLoadingFund] = useState(true);
  const [loadingBriefs, setLoadingBriefs] = useState(true);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingStrategy, setLoadingStrategy] = useState(true);

  const [errorCompliance, setErrorCompliance] = useState<string | null>(null);
  const [errorFund, setErrorFund] = useState<string | null>(null);
  const [errorBriefs, setErrorBriefs] = useState<string | null>(null);
  const [errorAccounts, setErrorAccounts] = useState<string | null>(null);
  const [errorStrategy, setErrorStrategy] = useState<string | null>(null);

  // Quick task loading
  const [quickTaskLoading, setQuickTaskLoading] = useState(false);

  // File upload state per brief
  const [uploadingBriefId, setUploadingBriefId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeBriefIdForUpload = useRef<string | null>(null);

  // Refreshing
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ============================================
  // DATA LOADING
  // ============================================

  const loadAllData = useCallback(async () => {
    if (!userId) return;

    // Load compliance state
    setLoadingCompliance(true);
    setErrorCompliance(null);
    try {
      const state = await getComplianceState(userId);
      setCompliance(state);
    } catch (err) {
      console.error('[HandlerAutonomousView] Error loading compliance:', err);
      setErrorCompliance('Failed to load compliance status');
    } finally {
      setLoadingCompliance(false);
    }

    // Load fund
    setLoadingFund(true);
    setErrorFund(null);
    try {
      const fundData = await getFund(userId);
      setFund(fundData);
    } catch (err) {
      console.error('[HandlerAutonomousView] Error loading fund:', err);
      setErrorFund('Failed to load fund data');
    } finally {
      setLoadingFund(false);
    }

    // Load briefs
    setLoadingBriefs(true);
    setErrorBriefs(null);
    try {
      const briefsData = await getActiveBriefs(userId);
      setBriefs(briefsData);
    } catch (err) {
      console.error('[HandlerAutonomousView] Error loading briefs:', err);
      setErrorBriefs('Failed to load content briefs');
    } finally {
      setLoadingBriefs(false);
    }

    // Load accounts
    setLoadingAccounts(true);
    setErrorAccounts(null);
    try {
      const accountsData = await getAccounts(userId);
      setAccounts(accountsData);
    } catch (err) {
      console.error('[HandlerAutonomousView] Error loading accounts:', err);
      setErrorAccounts('Failed to load platform accounts');
    } finally {
      setLoadingAccounts(false);
    }

    // Load strategy
    setLoadingStrategy(true);
    setErrorStrategy(null);
    try {
      const strategyData = await getStrategy(userId);
      setStrategy(strategyData);
    } catch (err) {
      console.error('[HandlerAutonomousView] Error loading strategy:', err);
      setErrorStrategy('Failed to load strategy data');
    } finally {
      setLoadingStrategy(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAllData();
    setIsRefreshing(false);
  }, [loadAllData]);

  // ============================================
  // QUICK TASK HANDLER
  // ============================================

  const handleQuickTask = useCallback(async () => {
    if (!userId || quickTaskLoading) return;
    setQuickTaskLoading(true);
    try {
      const newBrief = await generateQuickTask(userId);
      setBriefs((prev) => [...prev, newBrief]);
    } catch (err) {
      console.error('[HandlerAutonomousView] Error generating quick task:', err);
    } finally {
      setQuickTaskLoading(false);
    }
  }, [userId, quickTaskLoading]);

  // ============================================
  // FILE UPLOAD HANDLER
  // ============================================

  const handleSubmitContent = useCallback((briefId: string) => {
    activeBriefIdForUpload.current = briefId;
    setUploadingBriefId(briefId);
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const briefId = activeBriefIdForUpload.current;

    if (!files || files.length === 0 || !briefId || !userId) {
      setUploadingBriefId(null);
      return;
    }

    try {
      const { submitContent } = await import('../../lib/handler-v2/content-engine');
      const fileEntries = Array.from(files).map((file) => ({
        path: URL.createObjectURL(file),
        type: file.type,
        size: file.size,
      }));

      await submitContent(userId, briefId, fileEntries);

      // Refresh briefs after submission
      const updatedBriefs = await getActiveBriefs(userId);
      setBriefs(updatedBriefs);
    } catch (err) {
      console.error('[HandlerAutonomousView] Error submitting content:', err);
    } finally {
      setUploadingBriefId(null);
      activeBriefIdForUpload.current = null;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [userId]);

  // ============================================
  // RENDER: HANDLER STATUS (ALWAYS VISIBLE)
  // ============================================

  const renderHandlerStatus = () => {
    if (loadingCompliance) {
      return <SectionLoader isBambiMode={isBambiMode} />;
    }

    if (errorCompliance) {
      return <SectionError message={errorCompliance} isBambiMode={isBambiMode} />;
    }

    if (!compliance) {
      return (
        <p className={`text-xs mt-3 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
          No compliance data available
        </p>
      );
    }

    const tierColor = getTierColor(compliance.escalationTier);
    const tierBg = getTierBgColor(compliance.escalationTier);
    const tierLabel = getTierLabel(compliance.escalationTier);

    return (
      <div className="space-y-3 mt-3">
        {/* Escalation Tier */}
        <div className={`flex items-center justify-between p-3 rounded-lg border ${tierBg}`}>
          <div className="flex items-center gap-2">
            <Shield className={`w-4 h-4 ${tierColor}`} />
            <span className={`text-sm font-semibold ${tierColor}`}>
              Tier {compliance.escalationTier}
            </span>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tierColor} ${tierBg}`}>
            {tierLabel}
          </span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Daily Tasks */}
          <div
            className={`p-3 rounded-lg ${
              isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-bg'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className={`w-3.5 h-3.5 ${
                compliance.dailyMinimumMet
                  ? 'text-green-400'
                  : isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`} />
              <span className={`text-[10px] uppercase tracking-wide ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}>
                Daily Tasks
              </span>
            </div>
            <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-900' : 'text-protocol-text'}`}>
              {compliance.dailyTasksComplete}{' '}
              <span className={`text-xs font-normal ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                / {compliance.dailyTasksRequired}
              </span>
            </p>
            <p className={`text-[10px] ${
              compliance.dailyMinimumMet ? 'text-green-400' : isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              {compliance.dailyMinimumMet ? 'Minimum met' : 'tasks today'}
            </p>
          </div>

          {/* Hours Since Engagement */}
          <div
            className={`p-3 rounded-lg ${
              isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-bg'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className={`w-3.5 h-3.5 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
              <span className={`text-[10px] uppercase tracking-wide ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}>
                Last Active
              </span>
            </div>
            <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-900' : 'text-protocol-text'}`}>
              {formatHours(compliance.hoursSinceEngagement)}
            </p>
            <p className={`text-[10px] ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              since engagement
            </p>
          </div>
        </div>

        {/* Bleeding Status */}
        {compliance.bleedingActive && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-red-400 animate-pulse" />
              <span className="text-sm font-medium text-red-400">Bleeding Active</span>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-red-400">
                ${compliance.bleedingTotalToday.toFixed(2)}
              </p>
              <p className="text-[10px] text-red-400/70">
                ${compliance.bleedingRatePerMinute.toFixed(2)}/min
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ============================================
  // RENDER: FUND OVERVIEW
  // ============================================

  const renderFundOverview = () => {
    if (loadingFund) {
      return <SectionLoader isBambiMode={isBambiMode} />;
    }

    if (errorFund) {
      return <SectionError message={errorFund} isBambiMode={isBambiMode} />;
    }

    if (!fund) {
      return (
        <p className={`text-xs mt-3 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
          No fund data available. Fund will be initialized when earnings are recorded.
        </p>
      );
    }

    const payoutProgress = fund.payoutThreshold > 0
      ? Math.min(100, (fund.balance / fund.payoutThreshold) * 100)
      : 0;

    return (
      <div className="space-y-3 mt-3">
        {/* Balance */}
        <div className="text-center py-2">
          <p className={`text-[10px] uppercase tracking-wide ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            Fund Balance
          </p>
          <p className={`text-3xl font-bold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            ${fund.balance.toFixed(2)}
          </p>
        </div>

        {/* Earnings vs Penalties */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className={`p-3 rounded-lg ${
              isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-bg'
            }`}
          >
            <p className={`text-[10px] uppercase tracking-wide ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              Total Earned
            </p>
            <p className="text-sm font-bold text-green-400">
              +${fund.totalEarned.toFixed(2)}
            </p>
          </div>
          <div
            className={`p-3 rounded-lg ${
              isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-bg'
            }`}
          >
            <p className={`text-[10px] uppercase tracking-wide ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              Total Penalties
            </p>
            <p className="text-sm font-bold text-red-400">
              -${fund.totalPenalties.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Feminization Spending */}
        {fund.totalSpentFeminization > 0 && (
          <div
            className={`p-3 rounded-lg ${
              isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-bg'
            }`}
          >
            <p className={`text-[10px] uppercase tracking-wide ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              Spent on Feminization
            </p>
            <p className={`text-sm font-bold ${isBambiMode ? 'text-pink-600' : 'text-purple-400'}`}>
              ${fund.totalSpentFeminization.toFixed(2)}
            </p>
          </div>
        )}

        {/* Payout Progress */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] uppercase tracking-wide ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              Payout Progress
            </span>
            <span className={`text-[10px] ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
              ${fund.balance.toFixed(2)} / ${fund.payoutThreshold.toFixed(2)}
            </span>
          </div>
          <div
            className={`w-full h-2 rounded-full overflow-hidden ${
              isBambiMode ? 'bg-pink-200' : 'bg-protocol-bg'
            }`}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isBambiMode
                  ? 'bg-gradient-to-r from-pink-400 to-pink-500'
                  : 'bg-gradient-to-r from-protocol-accent to-green-400'
              }`}
              style={{ width: `${payoutProgress}%` }}
            />
          </div>
          {fund.pendingPayout > 0 && (
            <p className={`text-[10px] mt-1 ${isBambiMode ? 'text-pink-600' : 'text-green-400'}`}>
              ${fund.pendingPayout.toFixed(2)} pending payout
            </p>
          )}
        </div>
      </div>
    );
  };

  // ============================================
  // RENDER: ACTIVE BRIEFS
  // ============================================

  const renderActiveBriefs = () => {
    if (loadingBriefs) {
      return <SectionLoader isBambiMode={isBambiMode} />;
    }

    if (errorBriefs) {
      return <SectionError message={errorBriefs} isBambiMode={isBambiMode} />;
    }

    return (
      <div className="space-y-3 mt-3">
        {briefs.length === 0 ? (
          <p className={`text-xs text-center py-4 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            No active content briefs. Generate a quick task to get started.
          </p>
        ) : (
          briefs.map((brief) => {
            const isOverdue = new Date(brief.deadline).getTime() < Date.now();
            const isUploading = uploadingBriefId === brief.id;

            return (
              <div
                key={brief.id}
                className={`p-3 rounded-lg border ${
                  isBambiMode
                    ? 'bg-pink-100/40 border-pink-200/60'
                    : 'bg-protocol-bg border-protocol-border/50'
                }`}
              >
                {/* Brief Header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        isBambiMode
                          ? 'bg-pink-200 text-pink-800'
                          : 'bg-protocol-surface text-protocol-text'
                      }`}>
                        #{brief.briefNumber}
                      </span>
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        isBambiMode
                          ? 'bg-pink-200/60 text-pink-700'
                          : 'bg-protocol-surface text-protocol-text-muted'
                      }`}>
                        {brief.contentType.replace('_', ' ')}
                      </span>
                    </div>
                    <p className={`text-sm font-medium mt-1 ${
                      isBambiMode ? 'text-pink-900' : 'text-protocol-text'
                    }`}>
                      {brief.purpose}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {renderDifficultyStars(brief.difficulty)}
                  </div>
                </div>

                {/* Brief Details */}
                <div className="space-y-1.5 mb-2">
                  <p className={`text-xs ${isBambiMode ? 'text-pink-700' : 'text-protocol-text-muted'}`}>
                    <span className="font-medium">Concept:</span> {brief.instructions.concept}
                  </p>
                  {brief.instructions.setting && (
                    <p className={`text-xs ${isBambiMode ? 'text-pink-700' : 'text-protocol-text-muted'}`}>
                      <span className="font-medium">Setting:</span> {brief.instructions.setting}
                    </p>
                  )}
                  {brief.instructions.outfit && (
                    <p className={`text-xs ${isBambiMode ? 'text-pink-700' : 'text-protocol-text-muted'}`}>
                      <span className="font-medium">Outfit:</span> {brief.instructions.outfit}
                    </p>
                  )}
                </div>

                {/* Deadline */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Clock className={`w-3 h-3 ${isOverdue ? 'text-red-400' : isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
                    <span className={`text-xs font-medium ${isOverdue ? 'text-red-400' : isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                      {formatTimeRemaining(brief.deadline)}
                    </span>
                    {isOverdue && (
                      <span className="text-[10px] text-red-400 font-medium">OVERDUE</span>
                    )}
                  </div>
                  <span className={`text-[10px] ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                    V{brief.vulnerabilityTier}
                  </span>
                </div>

                {/* Rewards */}
                <div className={`flex items-center gap-3 text-[10px] mb-3 p-2 rounded ${
                  isBambiMode ? 'bg-pink-200/40' : 'bg-protocol-surface/50'
                }`}>
                  <span className="text-green-400 font-medium">
                    ${brief.rewardMoney.toFixed(2)}
                  </span>
                  {brief.rewardEdgeCredits > 0 && (
                    <span className={isBambiMode ? 'text-pink-600' : 'text-purple-400'}>
                      +{brief.rewardEdgeCredits} edge credit{brief.rewardEdgeCredits > 1 ? 's' : ''}
                    </span>
                  )}
                  {brief.rewardArousal && (
                    <span className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
                      {brief.rewardArousal.length > 40
                        ? brief.rewardArousal.substring(0, 40) + '...'
                        : brief.rewardArousal}
                    </span>
                  )}
                </div>

                {/* Consequence Warning */}
                {brief.consequenceIfMissed && (
                  <div className="flex items-center gap-1.5 text-[10px] text-red-400/80 mb-3">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                    <span>{brief.consequenceIfMissed.description}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  onClick={() => handleSubmitContent(brief.id)}
                  disabled={isUploading}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    isBambiMode
                      ? 'bg-pink-500 text-white hover:bg-pink-600 disabled:bg-pink-300'
                      : 'bg-protocol-accent text-white hover:bg-protocol-accent/90 disabled:opacity-50'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Submit Content
                    </>
                  )}
                </button>
              </div>
            );
          })
        )}

        {/* Quick Task Button */}
        <button
          onClick={handleQuickTask}
          disabled={quickTaskLoading}
          className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium border transition-colors ${
            isBambiMode
              ? 'border-pink-300 text-pink-700 hover:bg-pink-100 disabled:opacity-50'
              : 'border-protocol-border text-protocol-text hover:bg-protocol-surface disabled:opacity-50'
          }`}
        >
          {quickTaskLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Quick Task
            </>
          )}
        </button>
      </div>
    );
  };

  // ============================================
  // RENDER: PLATFORM ACCOUNTS
  // ============================================

  const renderPlatformAccounts = () => {
    if (loadingAccounts) {
      return <SectionLoader isBambiMode={isBambiMode} />;
    }

    if (errorAccounts) {
      return <SectionError message={errorAccounts} isBambiMode={isBambiMode} />;
    }

    if (accounts.length === 0) {
      return (
        <p className={`text-xs text-center py-4 mt-3 ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          No platform accounts configured.
        </p>
      );
    }

    return (
      <div className="space-y-2 mt-3">
        {accounts.map((account) => {
          const lastPosted = account.lastPostedAt
            ? formatHours((Date.now() - new Date(account.lastPostedAt).getTime()) / (1000 * 60 * 60))
            : 'Never';

          return (
            <div
              key={account.id}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-bg'
              }`}
            >
              {/* Status Indicator */}
              <Circle
                className={`w-2.5 h-2.5 flex-shrink-0 ${
                  account.enabled
                    ? 'text-green-400 fill-green-400'
                    : 'text-gray-500 fill-gray-500'
                }`}
              />

              {/* Platform Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium capitalize ${
                    isBambiMode ? 'text-pink-900' : 'text-protocol-text'
                  }`}>
                    {account.platform}
                  </span>
                  {account.username && (
                    <span className={`text-[10px] truncate ${
                      isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                    }`}>
                      @{account.username}
                    </span>
                  )}
                </div>
                <div className={`flex items-center gap-3 text-[10px] ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                }`}>
                  <span>{account.subscriberCount} subscribers</span>
                  <span>${account.revenueTotal.toFixed(2)} total</span>
                </div>
              </div>

              {/* Last Posted */}
              <div className="text-right flex-shrink-0">
                <p className={`text-[10px] ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                  Last post
                </p>
                <p className={`text-xs font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                  {lastPosted === 'Never' ? lastPosted : `${lastPosted} ago`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ============================================
  // RENDER: STRATEGY PHASE
  // ============================================

  const renderStrategy = () => {
    if (loadingStrategy) {
      return <SectionLoader isBambiMode={isBambiMode} />;
    }

    if (errorStrategy) {
      return <SectionError message={errorStrategy} isBambiMode={isBambiMode} />;
    }

    if (!strategy) {
      return (
        <p className={`text-xs text-center py-4 mt-3 ${
          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
        }`}>
          No strategy data. Strategy will be generated on first weekly evaluation.
        </p>
      );
    }

    const currentPhaseIndex = getPhaseIndex(strategy.currentPhase);

    return (
      <div className="space-y-4 mt-3">
        {/* Phase Progress */}
        <div>
          <div className="flex items-center justify-between mb-2">
            {PHASE_ORDER.map((phase, index) => {
              const isActive = index === currentPhaseIndex;
              const isCompleted = index < currentPhaseIndex;

              return (
                <div key={phase} className="flex flex-col items-center flex-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mb-1 ${
                      isActive
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isCompleted
                          ? 'bg-green-500 text-white'
                          : isBambiMode
                            ? 'bg-pink-200 text-pink-500'
                            : 'bg-protocol-surface text-protocol-text-muted'
                    }`}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <span
                    className={`text-[9px] text-center leading-tight ${
                      isActive
                        ? isBambiMode
                          ? 'text-pink-700 font-bold'
                          : 'text-protocol-text font-bold'
                        : isBambiMode
                          ? 'text-pink-500'
                          : 'text-protocol-text-muted'
                    }`}
                  >
                    {getPhaseLabel(phase)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Phase Progress Bar */}
          <div className="relative mt-1">
            <div
              className={`w-full h-1 rounded-full ${
                isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface'
              }`}
            >
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isBambiMode
                    ? 'bg-gradient-to-r from-pink-400 to-pink-500'
                    : 'bg-gradient-to-r from-protocol-accent to-green-400'
                }`}
                style={{
                  width: `${((currentPhaseIndex + 1) / PHASE_ORDER.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Current Phase Details */}
        <div
          className={`p-3 rounded-lg ${
            isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-bg'
          }`}
        >
          <p className={`text-xs font-semibold mb-1 ${
            isBambiMode ? 'text-pink-800' : 'text-protocol-text'
          }`}>
            Current Phase: {getPhaseLabel(strategy.currentPhase)}
          </p>
          <div className={`space-y-1 text-[10px] ${isBambiMode ? 'text-pink-700' : 'text-protocol-text-muted'}`}>
            <p>
              <span className="font-medium">Focus:</span>{' '}
              {strategy.contentFocus.primaryTypes.join(', ') || 'Not set'}
            </p>
            <p>
              <span className="font-medium">Priority Platforms:</span>{' '}
              {strategy.platformPriority.join(' > ') || 'Not set'}
            </p>
            <p>
              <span className="font-medium">Frequency:</span>{' '}
              {strategy.contentFocus.frequencyDaily} post{strategy.contentFocus.frequencyDaily !== 1 ? 's' : ''}/day
            </p>
          </div>
        </div>

        {/* Performance Trends */}
        <div className="grid grid-cols-3 gap-2">
          {([
            { label: 'Engagement', trend: strategy.performanceTrends.engagementTrend },
            { label: 'Revenue', trend: strategy.performanceTrends.revenueTrend },
            { label: 'Subscribers', trend: strategy.performanceTrends.subscriberTrend },
          ] as const).map(({ label, trend }) => {
            const trendColor =
              trend === 'up'
                ? 'text-green-400'
                : trend === 'down'
                  ? 'text-red-400'
                  : isBambiMode
                    ? 'text-pink-500'
                    : 'text-protocol-text-muted';
            const trendIcon =
              trend === 'up'
                ? '\u2191'
                : trend === 'down'
                  ? '\u2193'
                  : '\u2192';

            return (
              <div
                key={label}
                className={`text-center p-2 rounded-lg ${
                  isBambiMode ? 'bg-pink-100/60' : 'bg-protocol-bg'
                }`}
              >
                <p className={`text-lg font-bold ${trendColor}`}>
                  {trendIcon}
                </p>
                <p className={`text-[10px] ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                  {label}
                </p>
                <p className={`text-[9px] capitalize ${trendColor}`}>
                  {trend}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div
      className={`min-h-screen pb-24 ${
        isBambiMode ? 'bg-gradient-to-b from-pink-50 to-pink-100' : 'bg-protocol-bg'
      }`}
    >
      {/* Hidden file input for content submissions */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        multiple
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Header */}
      <div
        className={`sticky top-0 z-10 border-b ${
          isBambiMode
            ? 'bg-pink-50/95 backdrop-blur-sm border-pink-200'
            : 'bg-protocol-bg/95 backdrop-blur-sm border-protocol-border'
        }`}
      >
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className={`p-2 rounded-full transition-colors ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-700'
                : 'hover:bg-protocol-surface text-protocol-text'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1
              className={`text-xl font-semibold ${
                isBambiMode ? 'text-pink-900' : 'text-protocol-text'
              }`}
            >
              Handler Autonomous
            </h1>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              System Status & Content Pipeline
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-500'
                : 'hover:bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {/* Section 1: Handler Status (always visible) */}
        <div
          className={`rounded-xl border overflow-hidden ${
            isBambiMode
              ? 'bg-pink-50/80 border-pink-200'
              : 'bg-protocol-surface border-protocol-border'
          }`}
        >
          <div className="flex items-center gap-3 p-4">
            <Shield className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
            <span className={`font-semibold text-sm ${isBambiMode ? 'text-pink-900' : 'text-protocol-text'}`}>
              Handler Status
            </span>
            {compliance && (
              <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full border ${getTierBgColor(compliance.escalationTier)} ${getTierColor(compliance.escalationTier)}`}>
                Tier {compliance.escalationTier}
              </span>
            )}
          </div>
          <div className={`px-4 pb-4 ${isBambiMode ? 'border-t border-pink-200/60' : 'border-t border-protocol-border/50'}`}>
            {renderHandlerStatus()}
          </div>
        </div>

        {/* Section 2: Fund Overview */}
        <CollapsibleSection
          title="Fund Overview"
          icon={<DollarSign className="w-5 h-5" />}
          isBambiMode={isBambiMode}
          badge={
            fund ? (
              <span className={`text-xs font-bold ${isBambiMode ? 'text-pink-700' : 'text-green-400'}`}>
                ${fund.balance.toFixed(2)}
              </span>
            ) : undefined
          }
        >
          {renderFundOverview()}
        </CollapsibleSection>

        {/* Section 3: Active Briefs */}
        <CollapsibleSection
          title="Active Briefs"
          icon={<FileText className="w-5 h-5" />}
          defaultOpen={true}
          isBambiMode={isBambiMode}
          badge={
            briefs.length > 0 ? (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                isBambiMode ? 'bg-pink-200 text-pink-700' : 'bg-protocol-surface text-protocol-text-muted'
              }`}>
                {briefs.length}
              </span>
            ) : undefined
          }
        >
          {renderActiveBriefs()}
        </CollapsibleSection>

        {/* Section 4: Platform Accounts */}
        <CollapsibleSection
          title="Platform Accounts"
          icon={<Globe className="w-5 h-5" />}
          isBambiMode={isBambiMode}
          badge={
            accounts.length > 0 ? (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                isBambiMode ? 'bg-pink-200 text-pink-700' : 'bg-protocol-surface text-protocol-text-muted'
              }`}>
                {accounts.filter(a => a.enabled).length} active
              </span>
            ) : undefined
          }
        >
          {renderPlatformAccounts()}
        </CollapsibleSection>

        {/* Section 5: Strategy Phase */}
        <CollapsibleSection
          title="Strategy Phase"
          icon={<TrendingUp className="w-5 h-5" />}
          isBambiMode={isBambiMode}
          badge={
            strategy ? (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${
                isBambiMode ? 'bg-pink-200 text-pink-700' : 'bg-protocol-surface text-protocol-text-muted'
              }`}>
                {getPhaseLabel(strategy.currentPhase)}
              </span>
            ) : undefined
          }
        >
          {renderStrategy()}
        </CollapsibleSection>
      </div>
    </div>
  );
}
