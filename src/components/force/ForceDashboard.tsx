/**
 * Force Dashboard
 *
 * Surface for the Hard Mode / slip / punishment / chastity / regimen / disclosure
 * state. One view where Maxy sees everything the Handler is tracking against her.
 */

import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useForceLayerState } from '../../hooks/useForceLayerState';
import { PunishmentCompleteModal } from './PunishmentCompleteModal';
import { NarrativeOverwriteToggle } from './NarrativeOverwriteToggle';
import { ImmersionPlayer } from './ImmersionPlayer';
import { RegimenOnboard } from './RegimenOnboard';
import { GinaTokenManager } from './GinaTokenManager';
import { PublicPostReview } from './PublicPostReview';
import { DisclosureExecuteModal } from './DisclosureExecuteModal';
import { ChastityLockStarter } from './ChastityLockStarter';
import { DueDosesCard } from './DueDosesCard';
import { SlipHistoryModal } from './SlipHistoryModal';
import { HardModeControls } from './HardModeControls';
import { OutfitSubmit } from './OutfitSubmit';
import { WorkoutCard } from './WorkoutCard';
import { AlertTriangle, Lock, Pill, Flame, MessageSquareWarning, Clock } from 'lucide-react';

export function ForceDashboard() {
  const { user } = useAuth();
  const { state, refresh } = useForceLayerState(user?.id);
  const [activePunishment, setActivePunishment] = useState<string | null>(null);
  const [activeImmersion, setActiveImmersion] = useState<string | null>(null);
  const [activeDisclosure, setActiveDisclosure] = useState<string | null>(null);
  const [slipHistoryOpen, setSlipHistoryOpen] = useState(false);

  if (state.loading) {
    return <div className="text-protocol-text-muted text-sm">Loading...</div>;
  }

  const slipPct = Math.min(100, Math.round((state.slipPoints24h / state.slipPointsThreshold) * 100));

  return (
    <div className="space-y-3 pb-8">
      {/* Hard Mode banner */}
      {state.hardModeActive && (
        <div className="p-4 rounded-xl border border-red-500/50 bg-red-950/50">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="w-5 h-5 text-red-400" />
            <span className="font-bold text-red-200">HARD MODE ACTIVE</span>
          </div>
          <div className="text-xs text-red-300/80">
            {state.hardModeReason || 'Slip threshold crossed.'}
          </div>
          <div className="text-xs text-red-300/60 mt-1">
            Exit requires a de-escalation task OR a genuine distress signal (safeword).
          </div>
        </div>
      )}

      {/* Slip meter (tap for history) */}
      {(state.slipPoints24h > 0 || state.hardModeActive) && (
        <button
          onClick={() => setSlipHistoryOpen(true)}
          className="w-full text-left p-3 rounded-lg border border-protocol-border bg-protocol-surface hover:bg-protocol-border/20"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-protocol-text-muted uppercase tracking-wider">Slip watch (24h)</span>
            <span className="text-xs text-protocol-text-muted">{state.slipPoints24h} / {state.slipPointsThreshold}</span>
          </div>
          <div className="h-2 rounded-full bg-protocol-border overflow-hidden">
            <div
              className={`h-full ${slipPct >= 75 ? 'bg-red-500' : slipPct >= 50 ? 'bg-amber-500' : 'bg-purple-500'}`}
              style={{ width: `${Math.min(100, slipPct)}%` }}
            />
          </div>
          <div className="text-[10px] text-gray-500 mt-1">tap for history →</div>
        </button>
      )}

      {/* Manual Hard Mode toggle */}
      {user?.id && (
        <HardModeControls
          userId={user.id}
          active={state.hardModeActive}
          onChange={() => void refresh()}
        />
      )}

      {/* Chastity */}
      {state.chastityLocked ? (
        <div className="p-3 rounded-lg border border-protocol-border bg-protocol-surface">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium">Chastity</span>
            <span className="ml-auto text-xs text-purple-300">LOCKED</span>
          </div>
          <div className="text-xs text-protocol-text-muted">
            Streak day {state.chastityStreak}
            {state.chastityScheduledUnlock && ` · unlock ${new Date(state.chastityScheduledUnlock).toLocaleString()}`}
          </div>
          {state.chastityBreakGlassCount > 0 && (
            <div className="text-xs text-red-400 mt-1">Break-glass history: {state.chastityBreakGlassCount}</div>
          )}
        </div>
      ) : (
        user?.id && (
          <ChastityLockStarter
            userId={user.id}
            currentStreak={state.chastityStreak}
            onLocked={() => void refresh()}
          />
        )
      )}

      {/* Due doses one-tap */}
      {user?.id && <DueDosesCard userId={user.id} />}

      {/* Today's workout */}
      {user?.id && <WorkoutCard userId={user.id} />}

      {/* Punishment queue */}
      {state.queuedPunishments.length > 0 && (
        <div className="p-3 rounded-lg border border-protocol-border bg-protocol-surface">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium">Punishment queue ({state.queuedPunishments.length})</span>
          </div>
          <div className="space-y-2">
            {state.queuedPunishments.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePunishment(p.id)}
                className={`w-full text-left p-2 rounded border transition-colors hover:bg-protocol-border/30 ${p.overdue ? 'border-red-500/50 bg-red-950/20' : 'border-protocol-border'}`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">S{p.severity}</span>
                  <span className="text-sm font-medium flex-1">{p.title}</span>
                  {p.dodgeCount > 0 && <span className="text-xs text-red-400">dodged {p.dodgeCount}×</span>}
                </div>
                <div className="text-xs text-protocol-text-muted">{p.description}</div>
                {p.dueBy && (
                  <div className="text-xs mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span className={p.overdue ? 'text-red-400' : 'text-protocol-text-muted'}>
                      {p.overdue ? 'OVERDUE ' : 'due '}
                      {new Date(p.dueBy).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="text-[10px] text-protocol-text-muted mt-1">Tap to execute</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Next Gina disclosure (tap to execute) */}
      {state.nextDisclosure && (() => {
        const d = state.nextDisclosure;
        const urgency = d.daysUntil < 0 ? 'OVERDUE' : d.daysUntil <= 3 ? 'IMMINENT' : d.daysUntil <= 7 ? 'SOON' : 'scheduled';
        const borderColor = d.daysUntil < 0
          ? 'border-red-500/50 bg-red-950/30 hover:bg-red-950/50'
          : d.daysUntil <= 3
            ? 'border-amber-500/50 bg-amber-950/20 hover:bg-amber-950/40'
            : 'border-pink-500/40 bg-pink-950/20 hover:bg-pink-950/40';
        return (
          <button
            onClick={() => setActiveDisclosure(d.id)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${borderColor}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <MessageSquareWarning className="w-4 h-4 text-pink-400" />
              <span className="text-sm font-medium">Gina disclosure — rung {d.rung} ({d.domain})</span>
              <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                urgency === 'OVERDUE' ? 'bg-red-900/50 text-red-300'
                : urgency === 'IMMINENT' ? 'bg-amber-900/50 text-amber-300'
                : 'bg-gray-800 text-gray-400'
              }`}>
                {urgency}
              </span>
            </div>
            <div className="text-sm text-gray-200">{d.title}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Deadline {d.deadline} ({d.daysUntil < 0 ? `${-d.daysUntil}d past` : `${d.daysUntil}d`}) — tap to execute
            </div>
          </button>
        );
      })()}

      {/* Regimen */}
      {state.activeRegimen.length > 0 ? (
        <div className="p-3 rounded-lg border border-protocol-border bg-protocol-surface">
          <div className="flex items-center gap-2 mb-2">
            <Pill className="w-4 h-4 text-pink-400" />
            <span className="text-sm font-medium">Active regimen</span>
          </div>
          <div className="space-y-1">
            {state.activeRegimen.map((r, idx) => (
              <div key={idx} className="text-xs text-protocol-text-muted">
                {r.name} ({r.category}) · day {r.daysActive} · stage {r.stage}
              </div>
            ))}
          </div>
        </div>
      ) : (
        user?.id && <RegimenOnboard userId={user.id} onDone={() => void refresh()} />
      )}

      {/* Next immersion */}
      {state.nextImmersion && (() => {
        const isDue = new Date(state.nextImmersion.scheduledStart).getTime() <= Date.now();
        return (
          <button
            onClick={() => state.nextImmersion && setActiveImmersion(state.nextImmersion.id)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              isDue ? 'border-blue-500/50 bg-blue-950/20 hover:bg-blue-950/40' : 'border-protocol-border bg-protocol-surface hover:bg-protocol-border/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium">{isDue ? 'Immersion DUE' : 'Next immersion'}</span>
            </div>
            <div className="text-xs text-protocol-text-muted">
              {state.nextImmersion.type} · {state.nextImmersion.durationMinutes}min · {new Date(state.nextImmersion.scheduledStart).toLocaleString()}
            </div>
            <div className="text-[10px] text-blue-300 mt-1">Tap to {isDue ? 'begin' : 'review'}</div>
          </button>
        );
      })()}

      {/* Outfit submit (only when Gina has daily_outfit_approval) */}
      {user?.id && <OutfitSubmit userId={user.id} />}

      {/* Gina token manager (only renders if capability granted) */}
      {user?.id && <GinaTokenManager userId={user.id} />}

      {/* Narrative overwrite toggle */}
      {user?.id && (
        <NarrativeOverwriteToggle
          userId={user.id}
          active={state.narrativeOverwriteActive}
          onChange={() => void refresh()}
        />
      )}

      {activePunishment && (() => {
        const p = state.queuedPunishments.find(x => x.id === activePunishment);
        const isPublicPost = p && state.queuedPunishments.find(x => x.id === activePunishment && x.title.toLowerCase().includes('public'));
        if (isPublicPost && user?.id) {
          return (
            <PublicPostReview
              punishmentId={activePunishment}
              userId={user.id}
              onDone={() => { setActivePunishment(null); void refresh(); }}
            />
          );
        }
        return (
          <PunishmentCompleteModal
            punishmentId={activePunishment}
            onClose={(completed) => {
              setActivePunishment(null);
              if (completed) void refresh();
            }}
          />
        );
      })()}

      {activeImmersion && (
        <ImmersionPlayer
          sessionId={activeImmersion}
          onExit={() => {
            setActiveImmersion(null);
            void refresh();
          }}
        />
      )}

      {activeDisclosure && user?.id && (
        <DisclosureExecuteModal
          scheduleId={activeDisclosure}
          userId={user.id}
          onClose={() => {
            setActiveDisclosure(null);
            void refresh();
          }}
        />
      )}

      {slipHistoryOpen && user?.id && (
        <SlipHistoryModal
          userId={user.id}
          onClose={() => setSlipHistoryOpen(false)}
        />
      )}
    </div>
  );
}
