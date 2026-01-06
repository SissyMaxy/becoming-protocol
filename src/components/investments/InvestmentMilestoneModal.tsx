import { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, DollarSign, Unlock } from 'lucide-react';
import { INVESTMENT_CATEGORIES, formatCurrency } from '../../data/investment-categories';
import type { InvestmentMilestoneEvent } from '../../types/investments';

interface InvestmentMilestoneModalProps {
  milestone: InvestmentMilestoneEvent;
  onDismiss: () => void;
}

export function InvestmentMilestoneModal({
  milestone,
  onDismiss,
}: InvestmentMilestoneModalProps) {
  const [animationPhase, setAnimationPhase] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Stagger animation phases
    setTimeout(() => setIsVisible(true), 50);
    setTimeout(() => setAnimationPhase(1), 300);
    setTimeout(() => setAnimationPhase(2), 800);
    setTimeout(() => setAnimationPhase(3), 1200);
  }, []);

  const getIcon = () => {
    if (milestone.type === 'new_category') {
      return <Unlock className="w-8 h-8" />;
    }
    if (milestone.type.startsWith('amount_')) {
      return <DollarSign className="w-8 h-8" />;
    }
    if (milestone.type.startsWith('category_')) {
      return <TrendingUp className="w-8 h-8" />;
    }
    return <Sparkles className="w-8 h-8" />;
  };

  const getTitle = () => {
    if (milestone.type === 'first_purchase') {
      return 'First Investment';
    }
    if (milestone.type === 'new_category' && milestone.category) {
      return `${INVESTMENT_CATEGORIES[milestone.category].emoji} New Category`;
    }
    if (milestone.type.startsWith('amount_') && milestone.amount) {
      return formatCurrency(milestone.amount);
    }
    if (milestone.type.startsWith('category_') && milestone.category) {
      return `${INVESTMENT_CATEGORIES[milestone.category].emoji} Milestone`;
    }
    return 'Milestone';
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-protocol-bg/95 flex items-center justify-center p-4
                  transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-protocol-accent/30 animate-float"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      <div
        className={`w-full max-w-sm transition-all duration-500 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        <div className="card p-8 text-center relative overflow-hidden">
          {/* Glowing ring */}
          <div
            className={`absolute inset-0 bg-gradient-to-b from-protocol-accent/10 to-transparent
                        transition-opacity duration-500 ${
                          animationPhase >= 1 ? 'opacity-100' : 'opacity-0'
                        }`}
          />

          {/* Icon with ring */}
          <div
            className={`relative mx-auto w-24 h-24 mb-6 transition-all duration-500 ${
              animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
            }`}
          >
            {/* Outer ring */}
            <div
              className={`absolute inset-0 rounded-full border-2 border-protocol-accent/30
                          transition-all duration-500 ${
                            animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                          }`}
            />
            {/* Inner glow */}
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-protocol-accent/20 to-protocol-accent/5" />
            {/* Icon */}
            <div className="absolute inset-0 flex items-center justify-center text-protocol-accent">
              {getIcon()}
            </div>
          </div>

          {/* Title */}
          <h2
            className={`text-2xl font-bold text-protocol-text mb-4 transition-all duration-500 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {getTitle()}
          </h2>

          {/* Message */}
          <p
            className={`text-protocol-text-muted mb-8 transition-all duration-500 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {milestone.message}
          </p>

          {/* Continue button */}
          <button
            onClick={onDismiss}
            disabled={animationPhase < 3}
            className={`w-full py-3 rounded-lg font-medium transition-all duration-300 ${
              animationPhase >= 3
                ? 'bg-protocol-accent text-white hover:bg-protocol-accent-soft opacity-100'
                : 'bg-protocol-surface text-protocol-text-muted opacity-50'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
