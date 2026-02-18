/**
 * Gina Mission Card
 *
 * Displays Handler-assigned missions for advancing Gina.
 * You are the instrument. This is your directive.
 */

import { useState } from 'react';
import {
  Heart,
  MessageCircle,
  Crown,
  Target,
  Gift,
  Lock,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { GinaMission } from '../../lib/gina-pipeline';

interface GinaMissionCardProps {
  mission: GinaMission;
  onComplete: (outcome: 'success' | 'partial' | 'rejected' | 'deferred', response?: string) => void;
  onDismiss?: () => void;
}

const MISSION_TYPE_CONFIG: Record<GinaMission['type'], {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  label: string;
}> = {
  seed_plant: {
    icon: Sparkles,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
    label: 'Seed Plant',
  },
  reinforcement: {
    icon: Heart,
    color: 'text-pink-400',
    bgColor: 'bg-pink-500/10',
    label: 'Reinforce',
  },
  request: {
    icon: MessageCircle,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    label: 'Request',
  },
  confession: {
    icon: Gift,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    label: 'Confession',
  },
  transfer_control: {
    icon: Crown,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    label: 'Transfer Control',
  },
  create_dependency: {
    icon: Lock,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
    label: 'Create Dependency',
  },
  escalation_test: {
    icon: Target,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
    label: 'Escalation Test',
  },
  milestone_lock: {
    icon: Lock,
    color: 'text-rose-400',
    bgColor: 'bg-rose-500/10',
    label: 'Milestone Lock',
  },
};

export function GinaMissionCard({ mission, onComplete, onDismiss }: GinaMissionCardProps) {
  const { isBambiMode } = useBambiMode();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [response, setResponse] = useState('');

  const config = MISSION_TYPE_CONFIG[mission.type];
  const Icon = config.icon;

  const handleOutcome = (outcome: 'success' | 'partial' | 'rejected' | 'deferred') => {
    onComplete(outcome, response || undefined);
    setShowOutcomeModal(false);
    setResponse('');
  };

  return (
    <>
      <div
        className={`rounded-xl border overflow-hidden ${
          mission.priority >= 4
            ? 'border-amber-500/50'
            : isBambiMode
              ? 'border-pink-200'
              : 'border-protocol-border'
        } ${config.bgColor}`}
      >
        {/* Header */}
        <div
          className="p-4 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${config.bgColor}`}>
              <Icon className={`w-5 h-5 ${config.color}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium ${config.color}`}>
                  {config.label}
                </span>
                {mission.priority >= 4 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                    Priority
                  </span>
                )}
              </div>

              <h3 className={`font-semibold ${
                isBambiMode ? 'text-pink-900' : 'text-protocol-text'
              }`}>
                {mission.title}
              </h3>

              {!isExpanded && (
                <p className={`text-sm mt-1 line-clamp-2 ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text-muted'
                }`}>
                  {mission.description}
                </p>
              )}
            </div>

            <button className={`p-1 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className={`px-4 pb-4 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-white/10'
          }`}>
            <div className="pt-4 space-y-4">
              {/* Description */}
              <p className={`text-sm ${
                isBambiMode ? 'text-pink-800' : 'text-protocol-text'
              }`}>
                {mission.description}
              </p>

              {/* Script - what to say */}
              {mission.script && (
                <div className={`p-3 rounded-lg ${
                  isBambiMode ? 'bg-pink-100' : 'bg-white/5'
                }`}>
                  <p className={`text-xs uppercase tracking-wider font-semibold mb-2 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                  }`}>
                    Script
                  </p>
                  <p className={`text-sm italic ${
                    isBambiMode ? 'text-pink-900' : 'text-white'
                  }`}>
                    "{mission.script}"
                  </p>
                </div>
              )}

              {/* Action - what to do */}
              {mission.action && (
                <div className={`p-3 rounded-lg ${
                  isBambiMode ? 'bg-pink-100' : 'bg-white/5'
                }`}>
                  <p className={`text-xs uppercase tracking-wider font-semibold mb-2 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                  }`}>
                    Action
                  </p>
                  <p className={`text-sm ${
                    isBambiMode ? 'text-pink-900' : 'text-white'
                  }`}>
                    {mission.action}
                  </p>
                </div>
              )}

              {/* Timing */}
              {mission.timing && (
                <div className="flex items-center gap-2">
                  <Clock className={`w-4 h-4 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`} />
                  <span className={`text-sm ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text-muted'
                  }`}>
                    {mission.timing}
                  </span>
                </div>
              )}

              {/* Target info */}
              <div className="flex flex-wrap gap-2">
                {mission.targetDomain && (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    isBambiMode ? 'bg-pink-200 text-pink-700' : 'bg-white/10 text-protocol-text-muted'
                  }`}>
                    Domain: {mission.targetDomain}
                  </span>
                )}
                {mission.exploitsMotivator && (
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    isBambiMode ? 'bg-purple-200 text-purple-700' : 'bg-purple-500/20 text-purple-400'
                  }`}>
                    Exploits: {mission.exploitsMotivator}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowOutcomeModal(true)}
                  className={`flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
                    isBambiMode
                      ? 'bg-pink-500 text-white hover:bg-pink-600'
                      : 'bg-protocol-accent text-white hover:bg-protocol-accent-bright'
                  }`}
                >
                  <CheckCircle className="w-5 h-5" />
                  Report Outcome
                </button>

                {onDismiss && (
                  <button
                    onClick={onDismiss}
                    className={`px-4 py-3 rounded-xl font-medium ${
                      isBambiMode
                        ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                        : 'bg-white/5 text-protocol-text-muted hover:bg-white/10'
                    }`}
                  >
                    Later
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Outcome Modal */}
      {showOutcomeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className={`w-full max-w-md rounded-2xl p-6 ${
            isBambiMode ? 'bg-white' : 'bg-protocol-surface'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold ${
                isBambiMode ? 'text-pink-900' : 'text-protocol-text'
              }`}>
                Mission Outcome
              </h3>
              <button
                onClick={() => setShowOutcomeModal(false)}
                className="p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className={`mb-4 ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text-muted'
            }`}>
              How did Gina respond?
            </p>

            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="What did she say or do?"
              className={`w-full p-3 rounded-xl mb-4 resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border border-pink-200 text-pink-900 placeholder:text-pink-400'
                  : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted'
              }`}
              rows={3}
            />

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleOutcome('success')}
                className="py-3 rounded-xl font-medium bg-green-500 text-white hover:bg-green-600"
              >
                Success
              </button>
              <button
                onClick={() => handleOutcome('partial')}
                className="py-3 rounded-xl font-medium bg-yellow-500 text-white hover:bg-yellow-600"
              >
                Partial
              </button>
              <button
                onClick={() => handleOutcome('rejected')}
                className="py-3 rounded-xl font-medium bg-red-500 text-white hover:bg-red-600"
              >
                Rejected
              </button>
              <button
                onClick={() => handleOutcome('deferred')}
                className="py-3 rounded-xl font-medium bg-gray-500 text-white hover:bg-gray-600"
              >
                Deferred
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Behavioral Directive Display
 */
interface BehavioralDirectiveCardProps {
  directive: {
    category: string;
    directive: string;
    rationale: string;
    ginaEffect: string;
    context?: string;
  };
}

export function BehavioralDirectiveCard({ directive }: BehavioralDirectiveCardProps) {
  const { isBambiMode } = useBambiMode();

  const categoryColors: Record<string, string> = {
    speech: 'text-blue-400 bg-blue-500/10',
    posture: 'text-purple-400 bg-purple-500/10',
    deference: 'text-amber-400 bg-amber-500/10',
    service: 'text-pink-400 bg-pink-500/10',
    intimacy: 'text-red-400 bg-red-500/10',
    appearance: 'text-green-400 bg-green-500/10',
  };

  const colors = categoryColors[directive.category] || 'text-gray-400 bg-gray-500/10';

  return (
    <div className={`p-3 rounded-xl ${
      isBambiMode ? 'bg-pink-50 border border-pink-100' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-start gap-3">
        <span className={`text-xs px-2 py-1 rounded-full capitalize ${colors}`}>
          {directive.category}
        </span>
        <div className="flex-1">
          <p className={`text-sm font-medium ${
            isBambiMode ? 'text-pink-900' : 'text-protocol-text'
          }`}>
            {directive.directive}
          </p>
          {directive.context && directive.context !== 'always' && (
            <p className={`text-xs mt-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              When: {directive.context}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
