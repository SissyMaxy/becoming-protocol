// GatedFeature - Blurred/Locked Feature Overlay (Feature 36)
// Shows blocked features as blurred-but-visible with a lock overlay
// The blurred-but-visible content is deliberate - she can SEE what she's missing.

import { useState, useEffect, type ReactNode } from 'react';
import { Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  type ComplianceGate,
  type GateableFeature,
  checkFeatureAccess,
  getActionInfo,
} from '../lib/compliance-gates';

interface GatedFeatureProps {
  feature: GateableFeature;
  children: ReactNode;
  fallback?: ReactNode;
  onNavigateToAction?: (route: string) => void;
}

export function GatedFeature({
  feature,
  children,
  fallback,
  onNavigateToAction,
}: GatedFeatureProps) {
  const { user } = useAuth();
  const [gate, setGate] = useState<ComplianceGate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      if (!user?.id) return;

      setIsLoading(true);
      try {
        const result = await checkFeatureAccess(user.id, feature);
        setIsAllowed(result.allowed);
        setGate(result.gate);
      } finally {
        setIsLoading(false);
      }
    }

    checkAccess();
  }, [user?.id, feature]);

  // Loading state
  if (isLoading) {
    return (
      <div className="relative">
        <div className="opacity-50 pointer-events-none blur-sm">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50">
          <Loader2 className="w-6 h-6 text-pink-500 animate-spin" />
        </div>
      </div>
    );
  }

  // Feature is allowed
  if (isAllowed || !gate) {
    return <>{children}</>;
  }

  // Feature is gated - show blurred content with overlay
  const actionInfo = getActionInfo(gate.requiredAction);

  const handleNavigate = () => {
    if (actionInfo.route && onNavigateToAction) {
      onNavigateToAction(actionInfo.route);
    }
  };

  return (
    <div className="relative">
      {/* Blurred content - she can SEE what she's missing */}
      <div className="opacity-60 pointer-events-none blur-sm select-none">
        {children}
      </div>

      {/* Gate overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-gray-900/80 to-gray-950/90 rounded-xl">
        <div className="max-w-sm mx-4 text-center">
          {/* Lock icon */}
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-600/20 flex items-center justify-center mx-auto mb-4 border border-amber-500/30">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>

          {/* Gate message */}
          <p className="text-gray-100 text-lg font-medium mb-2">
            Locked
          </p>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">
            {gate.reason}
          </p>

          {/* Action button */}
          <button
            onClick={handleNavigate}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/20"
          >
            {actionInfo.label}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional: Show fallback instead of blurred content */}
      {fallback && (
        <div className="hidden">
          {fallback}
        </div>
      )}
    </div>
  );
}

// ===========================================
// SIMPLE GATE CHECK HOOK
// ===========================================

export function useFeatureGate(feature: GateableFeature): {
  isAllowed: boolean;
  isLoading: boolean;
  gate: ComplianceGate | null;
  refresh: () => void;
} {
  const { user } = useAuth();
  const [gate, setGate] = useState<ComplianceGate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function checkAccess() {
      if (!user?.id) return;

      setIsLoading(true);
      try {
        const result = await checkFeatureAccess(user.id, feature);
        setIsAllowed(result.allowed);
        setGate(result.gate);
      } finally {
        setIsLoading(false);
      }
    }

    checkAccess();
  }, [user?.id, feature, refreshKey]);

  return {
    isAllowed,
    isLoading,
    gate,
    refresh: () => setRefreshKey(k => k + 1),
  };
}

// ===========================================
// GATE INDICATOR (for inline use)
// ===========================================

interface GateIndicatorProps {
  gate: ComplianceGate;
  compact?: boolean;
  onNavigate?: (route: string) => void;
}

export function GateIndicator({
  gate,
  compact = false,
  onNavigate,
}: GateIndicatorProps) {
  const actionInfo = getActionInfo(gate.requiredAction);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-amber-400 text-sm">
        <Lock className="w-4 h-4" />
        <span>Locked: {actionInfo.label} required</span>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/30">
      <div className="flex items-start gap-3">
        <Lock className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-amber-300 font-medium text-sm mb-1">Feature Locked</p>
          <p className="text-gray-400 text-sm mb-3">{gate.reason}</p>
          {onNavigate && actionInfo.route && (
            <button
              onClick={() => onNavigate(actionInfo.route!)}
              className="text-amber-400 hover:text-amber-300 text-sm font-medium flex items-center gap-1"
            >
              {actionInfo.label}
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default GatedFeature;
