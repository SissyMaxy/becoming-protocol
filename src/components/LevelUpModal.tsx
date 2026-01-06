import { useState, useEffect } from 'react';
import { Domain } from '../types';
import { getDomainInfo } from '../data/constants';
import {
  Star,
  Lock,
  Sparkles,
  ArrowUp,
  ChevronRight,
  Mic,
  Activity,
  Heart,
  Shirt,
  Users,
  Brain
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

interface LevelUpModalProps {
  domain: Domain;
  fromLevel: number;
  toLevel: number;
  onDismiss: () => void;
}

export function LevelUpModal({ domain, fromLevel, toLevel, onDismiss }: LevelUpModalProps) {
  const [animationPhase, setAnimationPhase] = useState(0);
  const domainInfo = getDomainInfo(domain);
  const Icon = domainIcons[domain] || Sparkles;

  useEffect(() => {
    // Animate in phases
    const timers = [
      setTimeout(() => setAnimationPhase(1), 300),
      setTimeout(() => setAnimationPhase(2), 800),
      setTimeout(() => setAnimationPhase(3), 1200)
    ];

    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const levelTitles: Record<number, string> = {
    2: 'Beginner',
    3: 'Developing',
    4: 'Competent',
    5: 'Proficient',
    6: 'Advanced',
    7: 'Expert',
    8: 'Master',
    9: 'Virtuoso',
    10: 'Transcendent'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-protocol-bg/95">
      <div className="w-full max-w-sm">
        <div className="card p-6 text-center relative overflow-hidden">
          {/* Animated background particles */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full animate-float"
                style={{
                  backgroundColor: domainInfo.color,
                  opacity: 0.3,
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${3 + Math.random() * 2}s`
                }}
              />
            ))}
          </div>

          {/* Content */}
          <div className="relative z-10">
            {/* Level up animation */}
            <div className="relative w-24 h-24 mx-auto mb-6">
              {/* Outer ring */}
              <div
                className={`absolute inset-0 rounded-full border-4 transition-all duration-500 ${
                  animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                }`}
                style={{ borderColor: `${domainInfo.color}40` }}
              />

              {/* Inner circle */}
              <div
                className={`absolute inset-2 rounded-full flex items-center justify-center transition-all duration-500 ${
                  animationPhase >= 1 ? 'scale-100' : 'scale-0'
                }`}
                style={{ backgroundColor: `${domainInfo.color}20` }}
              >
                <Icon
                  className="w-10 h-10"
                  style={{ color: domainInfo.color }}
                />
              </div>

              {/* Level number burst */}
              <div
                className={`absolute -top-2 -right-2 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold transition-all duration-300 ${
                  animationPhase >= 2 ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                }`}
                style={{ backgroundColor: domainInfo.color }}
              >
                {toLevel}
              </div>
            </div>

            {/* Title */}
            <div
              className={`transition-all duration-500 ${
                animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
              }`}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <ArrowUp className="w-5 h-5" style={{ color: domainInfo.color }} />
                <span className="text-xs uppercase tracking-wider text-protocol-text-muted">
                  Level Up!
                </span>
              </div>

              <h3 className="text-2xl font-bold text-gradient mb-1">
                {domainInfo.label}
              </h3>

              <p className="text-lg font-medium" style={{ color: domainInfo.color }}>
                Level {toLevel}: {levelTitles[toLevel] || 'Rising'}
              </p>
            </div>

            {/* Level progression visual */}
            <div
              className={`my-6 transition-all duration-500 ${
                animationPhase >= 3 ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <div className="flex items-center gap-1 text-protocol-text-muted">
                  <span className="text-sm">Lv.{fromLevel}</span>
                </div>
                <ChevronRight className="w-5 h-5 text-protocol-text-muted" />
                <div
                  className="flex items-center gap-1 px-3 py-1 rounded-full"
                  style={{ backgroundColor: `${domainInfo.color}20`, color: domainInfo.color }}
                >
                  <Star className="w-4 h-4" />
                  <span className="font-medium">Lv.{toLevel}</span>
                </div>
              </div>
            </div>

            {/* Lock protection notice */}
            <div
              className={`p-3 rounded-lg bg-protocol-surface-light mb-6 transition-all duration-500 ${
                animationPhase >= 3 ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="flex items-center gap-2 justify-center text-sm text-protocol-text-muted">
                <Lock className="w-4 h-4" />
                <span>Level protected for 7 days</span>
              </div>
            </div>

            {/* Dismiss button */}
            <button
              onClick={onDismiss}
              className={`w-full py-4 rounded-lg font-medium text-white transition-all duration-300 ${
                animationPhase >= 3 ? 'opacity-100' : 'opacity-50 pointer-events-none'
              }`}
              style={{ backgroundColor: domainInfo.color }}
            >
              Continue Growing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Phase advancement modal
interface PhaseUpModalProps {
  fromPhase: number;
  toPhase: number;
  phaseName: string;
  onDismiss: () => void;
}

export function PhaseUpModal({ fromPhase: _fromPhase, toPhase, phaseName, onDismiss }: PhaseUpModalProps) {
  const [animationPhase, setAnimationPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setAnimationPhase(1), 500),
      setTimeout(() => setAnimationPhase(2), 1000),
      setTimeout(() => setAnimationPhase(3), 1500)
    ];

    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const phaseDescriptions: Record<number, string> = {
    2: 'You\'ve built the foundation. Now it\'s time to express who you\'re becoming.',
    3: 'Expression is taking root. Integration is about making this natural.',
    4: 'You\'ve reached Embodiment - the final phase. This is who you are now.'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-protocol-bg">
      <div className="w-full max-w-sm">
        <div className="text-center">
          {/* Large phase number animation */}
          <div
            className={`text-[120px] font-bold text-gradient transition-all duration-1000 ${
              animationPhase >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
            }`}
          >
            {toPhase}
          </div>

          {/* Phase name */}
          <div
            className={`transition-all duration-700 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <p className="text-xs uppercase tracking-widest text-protocol-text-muted mb-2">
              Phase Advancement
            </p>
            <h2 className="text-3xl font-bold text-protocol-text mb-4">
              {phaseName}
            </h2>
            <p className="text-protocol-text-muted mb-8">
              {phaseDescriptions[toPhase]}
            </p>
          </div>

          {/* Stars */}
          <div
            className={`flex justify-center gap-3 mb-8 transition-all duration-500 ${
              animationPhase >= 3 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {[...Array(toPhase)].map((_, i) => (
              <Star
                key={i}
                className="w-6 h-6 text-protocol-accent fill-protocol-accent"
                style={{ animationDelay: `${i * 100}ms` }}
              />
            ))}
          </div>

          {/* Continue button */}
          <button
            onClick={onDismiss}
            className={`w-full py-4 rounded-lg bg-protocol-accent text-white font-medium transition-all duration-500 ${
              animationPhase >= 3 ? 'opacity-100' : 'opacity-50 pointer-events-none'
            }`}
          >
            Begin {phaseName}
          </button>
        </div>
      </div>
    </div>
  );
}

// Baseline achievement modal
interface BaselineAchievedModalProps {
  domain: Domain;
  consecutiveDays: number;
  onDismiss: () => void;
}

export function BaselineAchievedModal({ domain, consecutiveDays, onDismiss }: BaselineAchievedModalProps) {
  const domainInfo = getDomainInfo(domain);
  const Icon = domainIcons[domain] || Sparkles;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-protocol-bg/95">
      <div className="w-full max-w-sm">
        <div className="card p-6 text-center">
          <div
            className="w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${domainInfo.color}20` }}
          >
            <Icon className="w-10 h-10" style={{ color: domainInfo.color }} />
          </div>

          <div className="flex items-center justify-center gap-2 mb-2">
            <Lock className="w-5 h-5 text-protocol-success" />
            <span className="text-xs uppercase tracking-wider text-protocol-success">
              Baseline Established
            </span>
          </div>

          <h3 className="text-xl font-bold text-protocol-text mb-2">
            {domainInfo.label} is Now Protected
          </h3>

          <p className="text-sm text-protocol-text-muted mb-6">
            {consecutiveDays} consecutive days of {domainInfo.label.toLowerCase()} practice.
            This habit is now part of your baseline - it will always be included in your protocol.
          </p>

          <button
            onClick={onDismiss}
            className="w-full py-3 rounded-lg font-medium text-white"
            style={{ backgroundColor: domainInfo.color }}
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
