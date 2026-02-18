// Handler Dashboard
// Debug-only view for monitoring Handler AI system

import { useState } from 'react';
import {
  ChevronLeft,
  Brain,
  Zap,
  Target,
  AlertTriangle,
  History,
  Calendar,
  Shield,
  User,
  FlaskConical,
  RefreshCw,
  Loader2,
  Settings2,
} from 'lucide-react';
import { useHandler } from '../../hooks/useHandler';
import { StrategiesTab } from './tabs/StrategiesTab';
import { TriggersTab } from './tabs/TriggersTab';
import { VulnerabilitiesTab } from './tabs/VulnerabilitiesTab';
import { InfluenceHistoryTab } from './tabs/InfluenceHistoryTab';
import { DailyPlansTab } from './tabs/DailyPlansTab';
import { ResistanceTab } from './tabs/ResistanceTab';
import { UserModelTab } from './tabs/UserModelTab';
import { ExperimentsTab } from './tabs/ExperimentsTab';
import { LiveControlsTab } from './tabs/LiveControlsTab';
import { StrategicPriorityTab } from './tabs/StrategicPriorityTab';

type DashboardTab =
  | 'controls'
  | 'priorities'
  | 'strategies'
  | 'triggers'
  | 'vulnerabilities'
  | 'influence'
  | 'plans'
  | 'resistance'
  | 'model'
  | 'experiments';

const tabs: { id: DashboardTab; icon: typeof Brain; label: string; color: string }[] = [
  { id: 'controls', icon: Settings2, label: 'Live', color: '#8b5cf6' },
  { id: 'priorities', icon: Target, label: 'Priority', color: '#ef4444' },
  { id: 'strategies', icon: Brain, label: 'Strategies', color: '#6366f1' },
  { id: 'triggers', icon: Zap, label: 'Triggers', color: '#f59e0b' },
  { id: 'vulnerabilities', icon: AlertTriangle, label: 'Vulns', color: '#ef4444' },
  { id: 'influence', icon: History, label: 'History', color: '#8b5cf6' },
  { id: 'plans', icon: Calendar, label: 'Plans', color: '#22c55e' },
  { id: 'resistance', icon: Shield, label: 'Resist', color: '#f97316' },
  { id: 'model', icon: User, label: 'Model', color: '#3b82f6' },
  { id: 'experiments', icon: FlaskConical, label: 'A/B', color: '#ec4899' },
];

interface HandlerDashboardProps {
  onBack: () => void;
}

export function HandlerDashboard({ onBack }: HandlerDashboardProps) {
  const { handlerState, isLoading, error, loadHandlerState } = useHandler();
  const [activeTab, setActiveTab] = useState<DashboardTab>('controls');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadHandlerState();
    setIsRefreshing(false);
  };

  // Summary stats
  const stats = handlerState ? {
    strategies: handlerState.activeStrategies.length,
    triggers: handlerState.activeTriggers.length,
    vulnerabilities: handlerState.knownVulnerabilities.length,
    attempts: handlerState.recentInfluenceAttempts.length,
    successRate: handlerState.recentInfluenceAttempts.length > 0
      ? Math.round(
          (handlerState.recentInfluenceAttempts.filter(a => a.success).length /
            handlerState.recentInfluenceAttempts.length) * 100
        )
      : 0,
  } : null;

  const renderTabContent = () => {
    // Live Controls tab works without handler state
    if (activeTab === 'controls') {
      return <LiveControlsTab />;
    }

    if (!handlerState) return null;

    switch (activeTab) {
      case 'priorities':
        return <StrategicPriorityTab handlerState={handlerState} />;
      case 'strategies':
        return <StrategiesTab strategies={handlerState.activeStrategies} />;
      case 'triggers':
        return <TriggersTab triggers={handlerState.activeTriggers} />;
      case 'vulnerabilities':
        return <VulnerabilitiesTab vulnerabilities={handlerState.knownVulnerabilities} />;
      case 'influence':
        return <InfluenceHistoryTab attempts={handlerState.recentInfluenceAttempts} />;
      case 'plans':
        return <DailyPlansTab plan={handlerState.todaysPlan} escalationPlans={handlerState.escalationPlans} />;
      case 'resistance':
        return <ResistanceTab />;
      case 'model':
        return <UserModelTab model={handlerState.userModel} />;
      case 'experiments':
        return <ExperimentsTab />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-protocol-bg pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-protocol-bg border-b border-protocol-border">
        <div className="p-4 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-protocol-surface text-protocol-text"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-protocol-text">
              Handler Dashboard
            </h1>
            <p className="text-xs text-protocol-text-muted">
              Debug Mode • AI Behavior Analysis
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-lg hover:bg-protocol-surface text-protocol-text-muted"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <p className="text-xs text-red-400">
              Debug view only. Handler operations are autonomous and hidden from users.
            </p>
          </div>
        </div>

        {/* Stats Summary */}
        {stats && (
          <div className="px-4 pb-3 grid grid-cols-5 gap-2">
            <div className="text-center p-2 rounded-lg bg-protocol-surface">
              <p className="text-lg font-bold text-protocol-text">{stats.strategies}</p>
              <p className="text-[10px] text-protocol-text-muted">Strategies</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-protocol-surface">
              <p className="text-lg font-bold text-protocol-text">{stats.triggers}</p>
              <p className="text-[10px] text-protocol-text-muted">Triggers</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-protocol-surface">
              <p className="text-lg font-bold text-protocol-text">{stats.vulnerabilities}</p>
              <p className="text-[10px] text-protocol-text-muted">Vulns</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-protocol-surface">
              <p className="text-lg font-bold text-protocol-text">{stats.attempts}</p>
              <p className="text-[10px] text-protocol-text-muted">Attempts</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-protocol-surface">
              <p className="text-lg font-bold text-green-400">{stats.successRate}%</p>
              <p className="text-[10px] text-protocol-text-muted">Success</p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="px-4 pb-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-protocol-surface text-protocol-text'
                      : 'text-protocol-text-muted hover:text-protocol-text hover:bg-protocol-surface/50'
                  }`}
                >
                  <Icon
                    className="w-3.5 h-3.5"
                    style={{ color: isActive ? tab.color : undefined }}
                  />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-protocol-accent animate-spin" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : !handlerState ? (
          <div className="text-center py-12">
            <p className="text-protocol-text-muted">No handler data available</p>
          </div>
        ) : (
          renderTabContent()
        )}
      </div>
    </div>
  );
}
