// ReleaseRequestButton Component (Feature 39)
// The user can REQUEST release. The Handler DECIDES.

import { useState, useCallback } from 'react';
import { Lock, Unlock, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  evaluateReleaseEligibility,
  generateReleaseConditions,
  getEngagementMetrics,
  getComplianceHistory,
  completeDenialCycle,
  type ReleaseConditions,
} from '../lib/denial-engine';

interface ReleaseRequestButtonProps {
  denialDay: number;
  daysOnProtocol: number;
  voicePracticeHours?: number;
  selfReferenceRatio?: number;
  submissionDepth?: string;
  onReleaseGranted?: (conditions: ReleaseConditions) => void;
  onReleaseDenied?: (reasons: string[]) => void;
  className?: string;
}

export function ReleaseRequestButton({
  denialDay,
  daysOnProtocol,
  voicePracticeHours = 0,
  selfReferenceRatio = 0.5,
  submissionDepth = 'willing',
  onReleaseGranted,
  onReleaseDenied,
  className = '',
}: ReleaseRequestButtonProps) {
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<{
    type: 'granted' | 'denied' | 'not_yet' | null;
    message: string;
    conditions?: ReleaseConditions;
    reasons?: string[];
  } | null>(null);

  const requestRelease = useCallback(async () => {
    if (!user?.id || isProcessing) return;

    setIsProcessing(true);
    setResponse(null);

    try {
      // Get engagement and compliance data
      const [engagement, compliance] = await Promise.all([
        getEngagementMetrics(user.id),
        getComplianceHistory(user.id),
      ]);

      // Evaluate release eligibility
      const authority = await evaluateReleaseEligibility(
        user.id,
        denialDay,
        engagement,
        compliance
      );

      if (authority.earnedRelease) {
        // Generate release conditions
        const conditions = generateReleaseConditions(
          denialDay,
          daysOnProtocol,
          voicePracticeHours,
          selfReferenceRatio,
          submissionDepth
        );

        // Complete the denial cycle
        await completeDenialCycle(
          user.id,
          denialDay,
          true,
          engagement.averageDepth
        );

        setResponse({
          type: 'granted',
          message: `Day ${denialDay}. You've earned this. But there are conditions.`,
          conditions,
        });

        onReleaseGranted?.(conditions);
      } else if (authority.releaseEligible) {
        // Eligible but didn't win the roll
        setResponse({
          type: 'not_yet',
          message: `Day ${denialDay}. Not tonight. You're close. But not tonight. Come back tomorrow.`,
        });
      } else {
        // Not eligible - show reasons
        setResponse({
          type: 'denied',
          message: `No. Fix these first:`,
          reasons: authority.releaseBlockedReasons,
        });

        onReleaseDenied?.(authority.releaseBlockedReasons);
      }
    } catch (error) {
      console.error('Error requesting release:', error);
      setResponse({
        type: 'denied',
        message: 'Something went wrong. Try again later.',
        reasons: ['System error'],
      });
    } finally {
      setIsProcessing(false);
    }
  }, [
    user?.id,
    isProcessing,
    denialDay,
    daysOnProtocol,
    voicePracticeHours,
    selfReferenceRatio,
    submissionDepth,
    onReleaseGranted,
    onReleaseDenied,
  ]);

  const isDisabled = denialDay < 2 || isProcessing;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Request Button */}
      <button
        onClick={requestRelease}
        disabled={isDisabled}
        className={`
          w-full py-4 px-6 rounded-xl font-semibold text-lg
          flex items-center justify-center gap-3
          transition-all duration-300
          ${isDisabled
            ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-pink-500 to-purple-500 text-white hover:from-pink-600 hover:to-purple-600 shadow-lg shadow-pink-500/20'
          }
        `}
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Handler is deciding...
          </>
        ) : (
          <>
            <Lock className="w-5 h-5" />
            Request Release
          </>
        )}
      </button>

      {denialDay < 2 && (
        <p className="text-center text-gray-500 text-sm">
          Day {denialDay}. Too early. The minimum is at least 2 days.
        </p>
      )}

      {/* Response Display */}
      {response && (
        <div className={`
          p-4 rounded-xl border animate-fadeIn
          ${response.type === 'granted'
            ? 'bg-green-900/20 border-green-500/30'
            : response.type === 'not_yet'
            ? 'bg-amber-900/20 border-amber-500/30'
            : 'bg-red-900/20 border-red-500/30'
          }
        `}>
          <div className="flex items-start gap-3">
            {response.type === 'granted' ? (
              <Unlock className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            ) : response.type === 'not_yet' ? (
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            ) : (
              <Lock className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            )}

            <div className="flex-1 space-y-3">
              <p className={`font-medium ${
                response.type === 'granted'
                  ? 'text-green-300'
                  : response.type === 'not_yet'
                  ? 'text-amber-300'
                  : 'text-red-300'
              }`}>
                {response.message}
              </p>

              {/* Blocked Reasons */}
              {response.reasons && response.reasons.length > 0 && (
                <ul className="space-y-1">
                  {response.reasons.map((reason, i) => (
                    <li key={i} className="text-sm text-red-400/80 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                      {reason}
                    </li>
                  ))}
                </ul>
              )}

              {/* Release Conditions */}
              {response.conditions && (
                <div className="space-y-2 pt-2 border-t border-green-500/20">
                  <p className="text-green-300 text-sm font-medium">Conditions:</p>
                  <ul className="space-y-1.5">
                    {response.conditions.mustCompleteReflection && (
                      <li className="text-sm text-gray-300 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        Complete reflection within {response.conditions.reflectionWindowSeconds} seconds
                      </li>
                    )}
                    {response.conditions.mustSayName && (
                      <li className="text-sm text-gray-300 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        Say "I am Maxy" when you finish
                      </li>
                    )}
                    {response.conditions.mustBeDressed && (
                      <li className="text-sm text-gray-300 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        Must be wearing feminine clothing
                      </li>
                    )}
                    {response.conditions.mustUseVoice && (
                      <li className="text-sm text-gray-300 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        Use your feminized voice
                      </li>
                    )}
                    {response.conditions.positionRequirement && (
                      <li className="text-sm text-gray-300 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        Position: {response.conditions.positionRequirement}
                      </li>
                    )}
                    {response.conditions.recordingRequired && (
                      <li className="text-sm text-gray-300 flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        Recording required
                      </li>
                    )}
                    <li className="text-sm text-amber-300 flex items-center gap-2 pt-1">
                      <AlertCircle className="w-4 h-4 text-amber-400" />
                      Next cycle minimum: {response.conditions.nextCycleMinimum} days
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReleaseRequestButton;
