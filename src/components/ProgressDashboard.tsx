import { useState } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import { getDomainInfo, PHASES } from '../data/constants';
import { Domain } from '../types';
import { PhaseAdvancement } from './PhaseAdvancement';
import { InvestmentDashboard } from './investments';
import { EscalationsView, EscalationsPreview } from './escalations';
import { CeremoniesView, CeremoniesPreview } from './ceremonies';
import { CommitmentsView, CommitmentsPreview } from './commitments';
import { TaskBankView, TaskBankPreview } from './tasks';
import { GuyModeView, GuyModePreview } from './guy-mode';
import { DailyPrescriptionView, VectorGridView } from './adaptive-feminization';
import {
  Flame,
  Trophy,
  Calendar,
  TrendingUp,
  Mic,
  Activity,
  Sparkles,
  Shirt,
  Users,
  Brain,
  Heart,
  ChevronRight,
  BarChart3,
  Wallet,
  AlertTriangle,
  Crown,
  Link,
  BookOpen,
  User
} from 'lucide-react';

const domainIcons: Record<string, React.ElementType> = {
  voice: Mic,
  movement: Activity,
  skincare: Sparkles,
  style: Shirt,
  social: Users,
  mindset: Brain,
  body: Heart
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}

function StatCard({ icon, label, value, subtext, color = '#a855f7' }: StatCardProps) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-2 text-protocol-text-muted">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-bold text-protocol-text">{value}</p>
      {subtext && (
        <p className="text-xs text-protocol-text-muted">{subtext}</p>
      )}
    </div>
  );
}

interface DomainLevelCardProps {
  domain: Domain;
  level: number;
  streak: number;
  totalDays: number;
}

function DomainLevelCard({ domain, level, streak, totalDays }: DomainLevelCardProps) {
  const domainInfo = getDomainInfo(domain);
  const Icon = domainIcons[domain] || Sparkles;
  const progress = (level / 10) * 100;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${domainInfo.color}20` }}
          >
            <Icon className="w-5 h-5" style={{ color: domainInfo.color }} />
          </div>
          <div>
            <p className="font-medium text-protocol-text">{domainInfo.label}</p>
            <p className="text-xs text-protocol-text-muted">
              {totalDays} days practiced
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold" style={{ color: domainInfo.color }}>
            Lv.{level}
          </p>
          {streak > 0 && (
            <p className="text-xs text-protocol-text-muted flex items-center gap-1 justify-end">
              <Flame className="w-3 h-3 text-orange-500" />
              {streak}d
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="h-2 bg-protocol-surface-light rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              backgroundColor: domainInfo.color
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-protocol-text-muted">
          <span>Level {level}</span>
          <span>Level {Math.min(level + 1, 10)}</span>
        </div>
      </div>
    </div>
  );
}

function PhaseProgress() {
  const { progress } = useProtocol();
  const currentPhase = PHASES.find(p => p.phase === progress.phase.currentPhase) || PHASES[0];
  const phaseProgress = currentPhase.durationDays > 0
    ? Math.min((progress.phase.daysInPhase / currentPhase.durationDays) * 100, 100)
    : 100;

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-protocol-text-muted uppercase tracking-wider mb-1">
            Current Phase
          </p>
          <p className="text-xl font-semibold text-gradient">
            {currentPhase.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-protocol-text">
            {progress.phase.currentPhase}
            <span className="text-protocol-text-muted text-lg">/{PHASES.length}</span>
          </p>
        </div>
      </div>

      <p className="text-sm text-protocol-text-muted">
        {currentPhase.description}
      </p>

      {/* Phase progress */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-protocol-text-muted">Phase Progress</span>
          <span className="text-protocol-text font-medium">
            Day {progress.phase.daysInPhase + 1}
            {currentPhase.durationDays > 0 && ` of ${currentPhase.durationDays}`}
          </span>
        </div>
        <div className="h-3 bg-protocol-surface-light rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-protocol-accent to-protocol-accent-soft rounded-full transition-all duration-500"
            style={{ width: `${phaseProgress}%` }}
          />
        </div>
      </div>

      {/* Focus domains */}
      <div className="pt-2">
        <p className="text-xs text-protocol-text-muted mb-2">Focus areas this phase:</p>
        <div className="flex flex-wrap gap-2">
          {currentPhase.focus.map(domain => {
            const domainInfo = getDomainInfo(domain);
            const Icon = domainIcons[domain] || Sparkles;
            return (
              <span
                key={domain}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                style={{
                  backgroundColor: `${domainInfo.color}20`,
                  color: domainInfo.color
                }}
              >
                <Icon className="w-3 h-3" />
                {domainInfo.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Phase timeline */}
      <div className="flex items-center gap-2 pt-2">
        {PHASES.map((phase, idx) => (
          <div key={phase.phase} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                phase.phase < progress.phase.currentPhase
                  ? 'bg-protocol-success text-white'
                  : phase.phase === progress.phase.currentPhase
                  ? 'bg-protocol-accent text-white'
                  : 'bg-protocol-surface-light text-protocol-text-muted'
              }`}
            >
              {phase.phase}
            </div>
            {idx < PHASES.length - 1 && (
              <ChevronRight className="w-4 h-4 text-protocol-text-muted mx-1" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AdaptiveView() {
  const [showAllVectors, setShowAllVectors] = useState(false);

  if (showAllVectors) {
    return (
      <div>
        <button
          onClick={() => setShowAllVectors(false)}
          className="mb-4 text-sm text-protocol-accent hover:underline"
        >
          ← Back to Prescription
        </button>
        <VectorGridView />
      </div>
    );
  }

  return (
    <DailyPrescriptionView onViewAllVectors={() => setShowAllVectors(true)} />
  );
}

type ProgressSubTab = 'overview' | 'investments' | 'escalations' | 'ceremonies' | 'commitments' | 'tasks' | 'guymode' | 'adaptive';

export function ProgressDashboard() {
  const { progress } = useProtocol();
  const [activeSubTab, setActiveSubTab] = useState<ProgressSubTab>('overview');

  const subTabs: { id: ProgressSubTab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'adaptive', label: 'Vectors', icon: Brain },
    { id: 'investments', label: 'Investments', icon: Wallet },
    { id: 'escalations', label: 'Escalations', icon: AlertTriangle },
    { id: 'ceremonies', label: 'Ceremonies', icon: Crown },
    { id: 'commitments', label: 'Commitments', icon: Link },
    { id: 'tasks', label: 'Task Bank', icon: BookOpen },
    { id: 'guymode', label: 'Guy Mode', icon: User },
  ];

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-protocol-text">Progress</h2>
        <p className="text-sm text-protocol-text-muted">
          Your journey at a glance
        </p>
      </div>

      {/* Sub-tab Navigation - Inline Cards */}
      <div className="flex flex-wrap gap-2">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2 py-2.5 px-3 rounded-xl transition-all border ${
                isActive
                  ? 'bg-protocol-accent text-white border-protocol-accent shadow-lg shadow-protocol-accent/20'
                  : 'bg-protocol-surface text-protocol-text-muted border-protocol-border hover:text-protocol-text hover:border-protocol-accent/50'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-protocol-accent'}`} />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-tab Content */}
      {activeSubTab === 'adaptive' ? (
        <AdaptiveView />
      ) : activeSubTab === 'investments' ? (
        <InvestmentDashboard />
      ) : activeSubTab === 'escalations' ? (
        <EscalationsView />
      ) : activeSubTab === 'ceremonies' ? (
        <CeremoniesView />
      ) : activeSubTab === 'commitments' ? (
        <CommitmentsView />
      ) : activeSubTab === 'tasks' ? (
        <TaskBankView />
      ) : activeSubTab === 'guymode' ? (
        <GuyModeView />
      ) : (
        <>
          {/* Escalation Alerts Preview */}
          <EscalationsPreview />

          {/* Ceremonies Preview */}
          <CeremoniesPreview />

          {/* Commitments Preview */}
          <CommitmentsPreview />

          {/* Task Bank Preview */}
          <TaskBankPreview />

          {/* Guy Mode Preview */}
          <GuyModePreview />

          {/* Main stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Flame className="w-4 h-4" />}
          label="Current Streak"
          value={progress.overallStreak}
          subtext={progress.overallStreak === 1 ? 'day' : 'days'}
          color="#f97316"
        />
        <StatCard
          icon={<Trophy className="w-4 h-4" />}
          label="Longest Streak"
          value={progress.longestStreak}
          subtext={progress.longestStreak === 1 ? 'day' : 'days'}
          color="#fbbf24"
        />
        <StatCard
          icon={<Calendar className="w-4 h-4" />}
          label="Total Days"
          value={progress.totalDays}
          subtext="practiced"
          color="#22c55e"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Avg Level"
          value={(
            progress.domainProgress.reduce((sum, d) => sum + d.level, 0) /
            progress.domainProgress.length
          ).toFixed(1)}
          subtext="across domains"
          color="#a855f7"
        />
      </div>

      {/* Phase progress */}
      <PhaseProgress />

      {/* Phase advancement requirements */}
      <PhaseAdvancement />

      {/* Domain levels */}
      <div className="space-y-3">
        <h3 className="text-lg font-medium text-protocol-text">Domain Levels</h3>
        {progress.domainProgress.map(dp => (
          <DomainLevelCard
            key={dp.domain}
            domain={dp.domain}
            level={dp.level}
            streak={dp.currentStreak}
            totalDays={dp.totalDays}
          />
        ))}
      </div>
        </>
      )}
    </div>
  );
}
