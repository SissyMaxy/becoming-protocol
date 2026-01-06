// AuctionModal.tsx
// Auction bid modal for edge sessions - displays commitments and handles accept/reject

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock,
  Gift,
  Sparkles,
  Check,
  ChevronRight,
  Target,
  Lock,
  Eye,
  Brain,
  Activity,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type {
  AuctionBid,
  AuctionBidCategory,
  AuctionBidLevel,
} from '../../types/edge-session';

interface AuctionModalProps {
  bid: AuctionBid;
  edgeNumber: number;
  timeRemaining: number; // seconds
  onAccept: (bidId: string) => void;
  onReject: (bidId: string) => void;
  onExpire: (bidId: string) => void;
  className?: string;
}

const CATEGORY_ICONS: Record<AuctionBidCategory, React.ReactNode> = {
  appearance: <Sparkles className="w-5 h-5" />,
  behavior: <Activity className="w-5 h-5" />,
  mindset: <Brain className="w-5 h-5" />,
  practice: <Target className="w-5 h-5" />,
  denial: <Lock className="w-5 h-5" />,
  exposure: <Eye className="w-5 h-5" />,
};

const LEVEL_COLORS: Record<AuctionBidLevel, { bg: string; text: string; border: string }> = {
  easy: { bg: 'bg-green-500', text: 'text-green-500', border: 'border-green-500' },
  moderate: { bg: 'bg-blue-500', text: 'text-blue-500', border: 'border-blue-500' },
  challenging: { bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500' },
  intense: { bg: 'bg-pink-500', text: 'text-pink-500', border: 'border-pink-500' },
};

export function AuctionModal({
  bid,
  edgeNumber,
  timeRemaining: initialTimeRemaining,
  onAccept,
  onReject,
  onExpire,
  className = '',
}: AuctionModalProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [timeRemaining, setTimeRemaining] = useState(initialTimeRemaining);
  const [isAccepting, setIsAccepting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Countdown timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeRemaining(t => {
        if (t <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onExpire(bid.id);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [bid.id, onExpire]);

  const handleAccept = useCallback(() => {
    setIsAccepting(true);
    if (isBambiMode) {
      triggerHearts();
    }

    // Short delay for animation
    setTimeout(() => {
      setShowConfirmation(true);
      setTimeout(() => {
        onAccept(bid.id);
      }, 1500);
    }, 300);
  }, [bid.id, onAccept, isBambiMode, triggerHearts]);

  const handleReject = useCallback(() => {
    onReject(bid.id);
  }, [bid.id, onReject]);

  const levelColors = LEVEL_COLORS[bid.level];
  const timePercent = (timeRemaining / initialTimeRemaining) * 100;
  const isUrgent = timeRemaining <= 10;

  // Confirmation screen
  if (showConfirmation) {
    return (
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4">
        <div
          className={`w-full max-w-md rounded-2xl p-8 text-center animate-pulse ${
            isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
          }`}
        >
          <Check className="w-20 h-20 text-white mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-white mb-2">
            Commitment Accepted!
          </h3>
          <p className="text-white/80">
            +{bid.rewardSeconds} seconds of pleasure earned
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 ${className}`}>
      <div
        className={`w-full max-w-md rounded-2xl overflow-hidden ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Timer Bar */}
        <div className="h-2 bg-gray-200">
          <div
            className={`h-full transition-all duration-1000 ${
              isUrgent ? 'bg-red-500 animate-pulse' : levelColors.bg
            }`}
            style={{ width: `${timePercent}%` }}
          />
        </div>

        {/* Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${levelColors.bg} text-white`}
            >
              {CATEGORY_ICONS[bid.category]}
            </div>
            <div>
              <p
                className={`font-semibold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Edge {edgeNumber} Commitment
              </p>
              <p
                className={`text-xs ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                {bid.level.charAt(0).toUpperCase() + bid.level.slice(1)} challenge
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Clock
              className={`w-4 h-4 ${
                isUrgent ? 'text-red-500 animate-pulse' : isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
            <span
              className={`font-mono text-sm ${
                isUrgent ? 'text-red-500 font-bold' : isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              {timeRemaining}s
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <h3
            className={`text-lg font-medium mb-2 ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {bid.shortLabel}
          </h3>
          <p
            className={`text-sm mb-6 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {bid.description}
          </p>

          {/* Reward Display */}
          <div
            className={`p-4 rounded-xl mb-6 flex items-center justify-between ${
              isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
            }`}
          >
            <div className="flex items-center gap-3">
              <Gift
                className={`w-6 h-6 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                }`}
              />
              <span
                className={`font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Reward
              </span>
            </div>
            <div className="text-right">
              <p
                className={`text-xl font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                }`}
              >
                +{bid.rewardSeconds}s
              </p>
              <p
                className={`text-xs ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                pleasure time
              </p>
            </div>
          </div>

          {/* Level Badge */}
          <div className="flex justify-center mb-6">
            <span
              className={`px-4 py-1 rounded-full text-sm font-medium border-2 ${levelColors.border} ${levelColors.text}`}
            >
              {bid.level.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 flex gap-3 border-t border-gray-100">
          <button
            onClick={handleReject}
            disabled={isAccepting}
            className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
              isBambiMode
                ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
            }`}
          >
            Skip
          </button>

          <button
            onClick={handleAccept}
            disabled={isAccepting}
            className={`flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
              isAccepting
                ? 'bg-green-500 text-white scale-105'
                : isBambiMode
                  ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600'
                  : 'bg-gradient-to-r from-protocol-accent to-purple-600 text-white'
            }`}
          >
            {isAccepting ? (
              <Check className="w-5 h-5" />
            ) : (
              <>
                <span>Accept</span>
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Auction Bid Templates
export const AUCTION_BID_TEMPLATES: Omit<AuctionBid, 'id' | 'offeredAt' | 'expiresAt' | 'edgeNumber' | 'status'>[] = [
  // Easy - Appearance
  {
    category: 'appearance',
    level: 'easy',
    description: 'Wear feminine underwear tomorrow (can be hidden under regular clothes)',
    shortLabel: 'Secret Panties',
    rewardSeconds: 10,
  },
  {
    category: 'appearance',
    level: 'easy',
    description: 'Apply a subtle feminine touch - clear lip gloss, light scent, or body lotion',
    shortLabel: 'Subtle Touch',
    rewardSeconds: 10,
  },

  // Easy - Behavior
  {
    category: 'behavior',
    level: 'easy',
    description: 'Practice sitting with your legs crossed for the rest of the day',
    shortLabel: 'Ladylike Posture',
    rewardSeconds: 10,
  },
  {
    category: 'behavior',
    level: 'easy',
    description: 'Use a more feminine cadence when speaking for the next hour',
    shortLabel: 'Soft Voice',
    rewardSeconds: 10,
  },

  // Easy - Mindset
  {
    category: 'mindset',
    level: 'easy',
    description: 'Say "I am becoming more feminine" 10 times out loud',
    shortLabel: 'Affirmation',
    rewardSeconds: 10,
  },

  // Moderate - Appearance
  {
    category: 'appearance',
    level: 'moderate',
    description: 'Paint your toenails a color you love (hidden in shoes is fine)',
    shortLabel: 'Pretty Toes',
    rewardSeconds: 20,
  },
  {
    category: 'appearance',
    level: 'moderate',
    description: 'Shave your legs completely smooth',
    shortLabel: 'Smooth Legs',
    rewardSeconds: 20,
  },

  // Moderate - Practice
  {
    category: 'practice',
    level: 'moderate',
    description: 'Practice feminine voice for 15 minutes today',
    shortLabel: 'Voice Practice',
    rewardSeconds: 20,
  },
  {
    category: 'practice',
    level: 'moderate',
    description: 'Watch a makeup tutorial and practice one technique',
    shortLabel: 'Makeup Study',
    rewardSeconds: 20,
  },

  // Moderate - Denial
  {
    category: 'denial',
    level: 'moderate',
    description: 'Extend your denial by 1 day',
    shortLabel: '+1 Day Denial',
    rewardSeconds: 25,
  },

  // Challenging - Appearance
  {
    category: 'appearance',
    level: 'challenging',
    description: 'Wear a piece of feminine jewelry visible to others tomorrow',
    shortLabel: 'Visible Jewelry',
    rewardSeconds: 40,
  },
  {
    category: 'appearance',
    level: 'challenging',
    description: 'Paint one fingernail a subtle color (pinky or ring finger)',
    shortLabel: 'Accent Nail',
    rewardSeconds: 40,
  },

  // Challenging - Behavior
  {
    category: 'behavior',
    level: 'challenging',
    description: 'Use feminine gestures in your next video call',
    shortLabel: 'Feminine Presence',
    rewardSeconds: 40,
  },

  // Challenging - Denial
  {
    category: 'denial',
    level: 'challenging',
    description: 'Extend your denial by 3 days',
    shortLabel: '+3 Days Denial',
    rewardSeconds: 50,
  },

  // Intense - Exposure
  {
    category: 'exposure',
    level: 'intense',
    description: 'Wear feminine underwear to work/school and consciously feel it throughout the day',
    shortLabel: 'All Day Femme',
    rewardSeconds: 60,
  },
  {
    category: 'exposure',
    level: 'intense',
    description: 'Take a selfie in your most feminine state and save it',
    shortLabel: 'Femme Selfie',
    rewardSeconds: 60,
  },

  // Intense - Practice
  {
    category: 'practice',
    level: 'intense',
    description: 'Complete a full feminization routine (skincare, light makeup, feminine outfit)',
    shortLabel: 'Full Routine',
    rewardSeconds: 60,
  },

  // Intense - Denial
  {
    category: 'denial',
    level: 'intense',
    description: 'Extend your denial by one full week',
    shortLabel: '+1 Week Denial',
    rewardSeconds: 90,
  },
];

// Helper function to generate a random bid based on edge count
export function generateAuctionBid(edgeNumber: number): AuctionBid {
  // Determine level based on edge count
  let minLevel: AuctionBidLevel = 'easy';
  if (edgeNumber >= 10) {
    minLevel = 'moderate';
  } else if (edgeNumber >= 15) {
    minLevel = 'challenging';
  } else if (edgeNumber >= 20) {
    minLevel = 'intense';
  }

  const levelOrder: AuctionBidLevel[] = ['easy', 'moderate', 'challenging', 'intense'];
  const minLevelIndex = levelOrder.indexOf(minLevel);
  const eligibleLevels = levelOrder.slice(minLevelIndex);

  // Filter templates by eligible levels
  const eligibleTemplates = AUCTION_BID_TEMPLATES.filter(t =>
    eligibleLevels.includes(t.level)
  );

  // Randomly select a template
  const template = eligibleTemplates[Math.floor(Math.random() * eligibleTemplates.length)];

  // Calculate reward multiplier based on edge count
  const edgeMultiplier = 1 + (edgeNumber * 0.1);
  const adjustedReward = Math.round(template.rewardSeconds * edgeMultiplier);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30000); // 30 seconds to decide

  return {
    id: `bid-${Date.now()}`,
    category: template.category,
    level: template.level,
    description: template.description,
    shortLabel: template.shortLabel,
    rewardSeconds: adjustedReward,
    edgeNumber,
    offeredAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: 'pending',
  };
}

// Compact Bid Card for session summary
export function BidCard({
  bid,
  compact = false,
}: {
  bid: AuctionBid;
  compact?: boolean;
}) {
  const { isBambiMode } = useBambiMode();
  const levelColors = LEVEL_COLORS[bid.level];

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}
      >
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${levelColors.bg} text-white text-xs`}>
          {CATEGORY_ICONS[bid.category]}
        </div>
        <span
          className={`text-sm flex-1 ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          {bid.shortLabel}
        </span>
        <span
          className={`text-xs ${
            bid.status === 'accepted'
              ? 'text-green-500'
              : bid.status === 'rejected'
                ? 'text-red-400'
                : 'text-gray-400'
          }`}
        >
          {bid.status === 'accepted' ? '+' + bid.rewardSeconds + 's' :
           bid.status === 'rejected' ? 'Skipped' : 'Pending'}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`p-4 rounded-xl border ${
        isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-surface border-protocol-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${levelColors.bg} text-white`}
        >
          {CATEGORY_ICONS[bid.category]}
        </div>
        <div className="flex-1">
          <p
            className={`font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {bid.shortLabel}
          </p>
          <p
            className={`text-sm mt-1 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            {bid.description}
          </p>
          <div className="flex items-center gap-4 mt-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${levelColors.bg} text-white`}
            >
              {bid.level}
            </span>
            {bid.status === 'accepted' && (
              <span className="text-xs text-green-500 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Accepted (+{bid.rewardSeconds}s)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
