import { useState } from 'react';
import {
  Rocket,
  Shield,
  Heart,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

type AIMode = 'build' | 'protect' | 'recover';

interface ModeIndicatorProps {
  mode: AIMode;
  reasoning: string;
  compact?: boolean;
}

const modeConfig: Record<AIMode, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  description: string;
}> = {
  build: {
    label: 'Build',
    icon: Rocket,
    color: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    description: 'Ready to grow. Pushing edges, leveling up.'
  },
  protect: {
    label: 'Protect',
    icon: Shield,
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    description: 'Defending your progress. Focus on essentials.'
  },
  recover: {
    label: 'Recover',
    icon: Heart,
    color: '#ec4899',
    bgColor: 'rgba(236, 72, 153, 0.1)',
    description: 'Gentle re-entry. One good day at a time.'
  }
};

export function ModeIndicator({ mode, reasoning, compact = false }: ModeIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const config = modeConfig[mode];
  const Icon = config.icon;

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium"
        style={{ backgroundColor: config.bgColor, color: config.color }}
        title={config.description}
      >
        <Icon className="w-3 h-3" />
        {config.label}
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-protocol-surface-light/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: config.bgColor }}
          >
            <Icon className="w-5 h-5" style={{ color: config.color }} />
          </div>
          <div className="text-left">
            <p className="text-xs text-protocol-text-muted uppercase tracking-wider">
              Today's Mode
            </p>
            <p className="font-medium text-protocol-text" style={{ color: config.color }}>
              {config.label}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-protocol-text-muted" />
        ) : (
          <ChevronDown className="w-5 h-5 text-protocol-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-protocol-border">
          <div className="pt-3">
            <p className="text-sm text-protocol-text-muted">
              {config.description}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-protocol-surface-light">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-protocol-text-muted mt-0.5 flex-shrink-0" />
              <p className="text-sm text-protocol-text">
                {reasoning}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Small inline mode badge for headers
export function ModeBadge({ mode }: { mode: AIMode }) {
  const config = modeConfig[mode];
  const Icon = config.icon;

  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
      style={{ backgroundColor: config.bgColor, color: config.color }}
    >
      <Icon className="w-3 h-3" />
      <span className="font-medium">{config.label}</span>
    </div>
  );
}
