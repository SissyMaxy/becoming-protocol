// ============================================
// Cam Session View
// Live session UI with Handler directives, tips, device control
// ============================================

import { useState, useEffect, useRef } from 'react';
import {
  Video,
  Radio,
  Clock,
  DollarSign,
  Users,
  Zap,
  MessageSquare,
  Play,
  Square,
} from 'lucide-react';
import type { CamSession, HandlerCamDirective, TipLevel } from '../../types/cam';
import {
  getCamSession,
  startSession,
  endSession,
  getHandlerDirective,
  DEFAULT_TIP_LEVELS,
} from '../../lib/content/cam-engine';

interface CamSessionViewProps {
  sessionId: string;
  onEnd?: () => void;
}

export function CamSessionView({ sessionId, onEnd }: CamSessionViewProps) {

  const [session, setSession] = useState<CamSession | null>(null);
  const [directives, setDirectives] = useState<HandlerCamDirective[]>([]);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const directiveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load session
  useEffect(() => {
    async function load() {
      const s = await getCamSession(sessionId);
      setSession(s);
      setIsLoading(false);
    }
    load();
  }, [sessionId]);

  // Timer when live
  useEffect(() => {
    if (session?.status !== 'live') return;

    timerRef.current = setInterval(() => {
      if (session.startedAt) {
        const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000);
        setElapsedMinutes(elapsed);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [session?.status, session?.startedAt]);

  // Handler directives polling when live
  useEffect(() => {
    if (session?.status !== 'live') return;

    directiveRef.current = setInterval(async () => {
      const directive = await getHandlerDirective(sessionId, {
        minutesElapsed: elapsedMinutes,
        currentViewers: 0, // Would come from platform
        totalTips: session.totalTipsCents,
        tipGoal: session.targetTipGoalCents || 0,
        denialDay: 0, // Would come from user state
      });
      if (directive) {
        setDirectives(prev => [directive, ...prev].slice(0, 10));
      }
    }, 60000); // Check every minute

    return () => {
      if (directiveRef.current) clearInterval(directiveRef.current);
    };
  }, [session?.status, sessionId, elapsedMinutes, session?.totalTipsCents, session?.targetTipGoalCents]);

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center py-8">
        <Radio className="w-5 h-5 animate-pulse text-protocol-text-muted" />
      </div>
    );
  }

  const tipProgress = session.targetTipGoalCents
    ? Math.min((session.totalTipsCents / session.targetTipGoalCents) * 100, 100)
    : 0;

  const handleStart = async () => {
    const updated = await startSession(sessionId);
    if (updated) setSession(updated);
  };

  const handleEnd = async () => {
    const updated = await endSession(sessionId, {
      actualDurationMinutes: elapsedMinutes,
      peakViewers: 0,
    });
    if (updated) setSession(updated);
    if (timerRef.current) clearInterval(timerRef.current);
    if (directiveRef.current) clearInterval(directiveRef.current);
    onEnd?.();
  };

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className={`p-4 rounded-xl border ${
        session.status === 'live'
          ? 'bg-red-500/10 border-red-500/30'
          : session.status === 'ended'
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-protocol-surface border-protocol-border'
      }`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {session.status === 'live' ? (
              <Radio className="w-4 h-4 text-red-400 animate-pulse" />
            ) : (
              <Video className="w-4 h-4 text-protocol-text-muted" />
            )}
            <span className={`text-sm font-semibold ${
              session.status === 'live' ? 'text-red-400' : 'text-protocol-text'
            }`}>
              {session.status === 'live' ? 'LIVE' : session.status === 'ended' ? 'Session Ended' : 'Preparing'}
            </span>
          </div>
          <span className="text-xs text-protocol-text-muted">
            {session.platform}
          </span>
        </div>

        {/* Session Metrics */}
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="text-center">
            <Clock className="w-3.5 h-3.5 mx-auto text-protocol-text-muted mb-1" />
            <span className="text-lg font-mono text-protocol-text">
              {Math.floor(elapsedMinutes / 60)}:{String(elapsedMinutes % 60).padStart(2, '0')}
            </span>
            <p className="text-[10px] text-protocol-text-muted">
              min {session.minimumDurationMinutes}m
            </p>
          </div>
          <div className="text-center">
            <DollarSign className="w-3.5 h-3.5 mx-auto text-protocol-text-muted mb-1" />
            <span className="text-lg font-mono text-protocol-text">
              ${(session.totalTipsCents / 100).toFixed(0)}
            </span>
            <p className="text-[10px] text-protocol-text-muted">
              tips
            </p>
          </div>
          <div className="text-center">
            <Users className="w-3.5 h-3.5 mx-auto text-protocol-text-muted mb-1" />
            <span className="text-lg font-mono text-protocol-text">
              {session.peakViewers || 0}
            </span>
            <p className="text-[10px] text-protocol-text-muted">
              peak
            </p>
          </div>
        </div>

        {/* Tip Goal Progress */}
        {session.targetTipGoalCents && session.targetTipGoalCents > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-protocol-text-muted">Tip Goal</span>
              <span className="text-xs text-protocol-text-muted">
                ${(session.totalTipsCents / 100).toFixed(0)} / ${(session.targetTipGoalCents / 100).toFixed(0)}
              </span>
            </div>
            <div className="h-2 bg-protocol-surface-light rounded-full overflow-hidden">
              <div
                className="h-full bg-green-400 rounded-full transition-all"
                style={{ width: `${tipProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Session Controls */}
      {session.status === 'scheduled' && (
        <button
          onClick={handleStart}
          className="w-full py-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 font-medium flex items-center justify-center gap-2 hover:bg-red-500/30 transition-colors"
        >
          <Play className="w-4 h-4" />
          Go Live
        </button>
      )}

      {session.status === 'live' && (
        <button
          onClick={handleEnd}
          className={`w-full py-3 rounded-xl border font-medium flex items-center justify-center gap-2 transition-colors ${
            elapsedMinutes >= session.minimumDurationMinutes
              ? 'bg-protocol-surface border-protocol-border text-protocol-text hover:bg-protocol-surface-light'
              : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
          }`}
        >
          <Square className="w-4 h-4" />
          {elapsedMinutes < session.minimumDurationMinutes
            ? `End Early (${session.minimumDurationMinutes - elapsedMinutes}m remaining)`
            : 'End Session'
          }
        </button>
      )}

      {/* Handler Directives */}
      {directives.length > 0 && session.status === 'live' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-medium text-purple-400">Handler Directives (private)</span>
          </div>
          {directives.map((d, i) => (
            <div
              key={i}
              className={`p-3 rounded-lg border ${
                d.priority === 'urgent'
                  ? 'bg-red-500/10 border-red-500/20'
                  : 'bg-purple-500/10 border-purple-500/20'
              }`}
            >
              <p className={`text-sm ${
                d.priority === 'urgent' ? 'text-red-400' : 'text-purple-300'
              }`}>
                {d.message}
              </p>
              {d.complianceTimeoutSeconds && (
                <p className="text-[10px] text-protocol-text-muted mt-1">
                  Respond within {d.complianceTimeoutSeconds}s
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Session Rules */}
      <div className="p-3 rounded-xl border border-protocol-border bg-protocol-surface">
        <span className="text-xs font-medium text-protocol-text-muted block mb-2">Session Rules</span>
        <div className="flex flex-wrap gap-1.5">
          {session.feminineVoiceRequired && (
            <RuleBadge label="Fem Voice" active />
          )}
          {session.denialEnforced && (
            <RuleBadge label="Denial" active />
          )}
          {session.edgingRequired && (
            <RuleBadge label="Edging" active />
          )}
          {session.tipToDeviceEnabled && (
            <RuleBadge label="Tip→Device" active />
          )}
          {session.handlerDeviceControl && (
            <RuleBadge label="Handler Control" active />
          )}
          {session.fanDirectiveSuggestions && (
            <RuleBadge label="Fan Directives" active />
          )}
        </div>

        {/* Outfit directive */}
        {session.outfitDirective && (
          <div className="mt-2 p-2 rounded-lg bg-pink-500/10">
            <p className="text-xs text-pink-300">
              Outfit: {session.outfitDirective}
            </p>
          </div>
        )}
      </div>

      {/* Tip-to-Device Levels */}
      {session.tipToDeviceEnabled && session.status === 'live' && (
        <div className="p-3 rounded-xl border border-protocol-border bg-protocol-surface">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span className="text-xs font-medium text-protocol-text-muted">Tip → Device Levels</span>
          </div>
          <div className="space-y-1">
            {(session.tipLevels || DEFAULT_TIP_LEVELS).map((level, i) => (
              <TipLevelRow key={i} level={level} />
            ))}
          </div>
        </div>
      )}

      {/* Narrative framing (if arc-linked) */}
      {session.narrativeFraming && (
        <div className="p-3 rounded-xl border border-protocol-border bg-protocol-surface">
          <span className="text-xs font-medium text-protocol-text-muted block mb-1">Narrative Context</span>
          <p className="text-sm text-protocol-text">{session.narrativeFraming}</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

function RuleBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
      active
        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
        : 'bg-protocol-surface-light text-protocol-text-muted'
    }`}>
      {label}
    </span>
  );
}

function TipLevelRow({ level }: { level: TipLevel }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-protocol-text-muted">
          ${level.min}{level.max ? `-$${level.max}` : '+'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-protocol-text">{level.label}</span>
        <span className="text-[10px] text-protocol-text-muted">{level.seconds}s</span>
      </div>
    </div>
  );
}
