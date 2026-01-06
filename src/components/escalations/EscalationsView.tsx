/**
 * Escalations View
 * Main component showing the escalation calendar and timeline
 */

import { useState } from 'react';
import { Calendar, AlertTriangle, Clock, ChevronDown, ChevronUp, RefreshCw, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useEscalations } from '../../hooks/useEscalations';
import { EscalationCard } from './EscalationCard';
import { EscalationTimeline } from './EscalationTimeline';
import { EscalationTriggerModal } from './EscalationTriggerModal';
import { EscalationDelayModal } from './EscalationDelayModal';
import type { EscalationCalendarItem } from '../../types/escalations';

export function EscalationsView() {
  const { isBambiMode } = useBambiMode();
  const {
    calendar,
    warnings,
    imminent,
    isLoading,
    error,
    recentlyTriggered,
    triggerMessage,
    refresh,
    delay,
    dismissTrigger,
    formatCountdown,
    getEffect: _getEffect,
    currentDay,
  } = useEscalations();

  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [delayingItem, setDelayingItem] = useState<EscalationCalendarItem | null>(null);

  // Separate triggered and upcoming
  const triggered = calendar.filter(i => i.status === 'triggered');
  const upcoming = calendar.filter(i => i.status === 'upcoming');
  const delayed = calendar.filter(i => i.status === 'delayed');

  // Handle delay
  const handleDelay = (id: string) => {
    const item = calendar.find(i => i.escalation.id === id);
    if (item) setDelayingItem(item);
  };

  const confirmDelay = async () => {
    if (!delayingItem) return;
    await delay(delayingItem.escalation.id);
    setDelayingItem(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className={`w-8 h-8 animate-spin ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
        }`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-protocol-danger mb-4">{error}</p>
        <button
          onClick={refresh}
          className={`px-4 py-2 rounded-lg font-medium ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600'
              : 'bg-protocol-surface text-protocol-text'
          }`}
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with current day */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}>
            <Calendar className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`} />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Escalation Calendar
            </h2>
            <p className="text-xs text-protocol-text-muted">
              Day {currentDay} of your journey
            </p>
          </div>
        </div>

        <button
          onClick={refresh}
          className="p-2 rounded-lg hover:bg-protocol-surface transition-colors"
        >
          <RefreshCw className="w-4 h-4 text-protocol-text-muted" />
        </button>
      </div>

      {/* Timeline visualization */}
      <div className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}>
        <EscalationTimeline items={calendar} currentDay={currentDay} />
      </div>

      {/* Imminent warnings */}
      {imminent.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-orange-500">
              Imminent ({imminent.length})
            </h3>
          </div>
          {imminent.map((item) => (
            <EscalationCard
              key={item.escalation.id}
              item={item}
              currentDay={currentDay}
              onDelay={handleDelay}
              formatCountdown={formatCountdown}
            />
          ))}
        </div>
      )}

      {/* Active warnings */}
      {warnings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-amber-500">
              Warnings ({warnings.filter(w => w.status === 'warning').length})
            </h3>
          </div>
          {warnings
            .filter(w => w.status === 'warning')
            .map((item) => (
              <EscalationCard
                key={item.escalation.id}
                item={item}
                currentDay={currentDay}
                onDelay={handleDelay}
                formatCountdown={formatCountdown}
              />
            ))}
        </div>
      )}

      {/* Delayed */}
      {delayed.length > 0 && (
        <div className="space-y-3">
          <h3 className={`text-sm font-semibold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            Delayed ({delayed.length})
          </h3>
          {delayed.map((item) => (
            <EscalationCard
              key={item.escalation.id}
              item={item}
              currentDay={currentDay}
              formatCountdown={formatCountdown}
            />
          ))}
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setShowAllUpcoming(!showAllUpcoming)}
            className="flex items-center gap-2 w-full"
          >
            <h3 className={`text-sm font-semibold ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              Upcoming ({upcoming.length})
            </h3>
            {showAllUpcoming ? (
              <ChevronUp className="w-4 h-4 text-protocol-text-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-protocol-text-muted" />
            )}
          </button>

          <div className={`space-y-2 transition-all ${
            showAllUpcoming ? 'max-h-none' : 'max-h-48 overflow-hidden'
          }`}>
            {(showAllUpcoming ? upcoming : upcoming.slice(0, 2)).map((item) => (
              <EscalationCard
                key={item.escalation.id}
                item={item}
                currentDay={currentDay}
                onDelay={handleDelay}
                formatCountdown={formatCountdown}
              />
            ))}
          </div>

          {!showAllUpcoming && upcoming.length > 2 && (
            <button
              onClick={() => setShowAllUpcoming(true)}
              className={`w-full py-2 text-sm text-center ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}
            >
              Show {upcoming.length - 2} more...
            </button>
          )}
        </div>
      )}

      {/* Triggered (history) */}
      {triggered.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-protocol-text-muted">
            Already Triggered ({triggered.length})
          </h3>
          <div className="space-y-2 opacity-60">
            {triggered.slice(0, 3).map((item) => (
              <EscalationCard
                key={item.escalation.id}
                item={item}
                currentDay={currentDay}
                formatCountdown={formatCountdown}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {calendar.length === 0 && (
        <div className={`p-8 text-center rounded-xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}>
          <Calendar className={`w-12 h-12 mx-auto mb-4 ${
            isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
          }`} />
          <p className={`font-medium ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            No escalations scheduled
          </p>
          <p className="text-sm text-protocol-text-muted mt-1">
            Your timeline is clear for now
          </p>
        </div>
      )}

      {/* Trigger Modal */}
      {recentlyTriggered.length > 0 && triggerMessage && (
        <EscalationTriggerModal
          escalation={recentlyTriggered[0]}
          effectMessage={triggerMessage}
          onDismiss={dismissTrigger}
        />
      )}

      {/* Delay Modal */}
      {delayingItem && (
        <EscalationDelayModal
          item={delayingItem}
          onConfirm={confirmDelay}
          onCancel={() => setDelayingItem(null)}
        />
      )}
    </div>
  );
}

/**
 * Compact version for dashboard preview
 */
export function EscalationsPreview() {
  const { isBambiMode } = useBambiMode();
  const { imminent, warnings, formatCountdown } = useEscalations();

  const activeAlerts = [...imminent, ...warnings.filter(w => w.status === 'warning')];

  if (activeAlerts.length === 0) {
    return null;
  }

  return (
    <div className={`p-4 rounded-xl ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className={`w-4 h-4 ${
          imminent.length > 0 ? 'text-orange-500' : 'text-amber-500'
        }`} />
        <span className={`text-sm font-semibold ${
          imminent.length > 0 ? 'text-orange-500' : 'text-amber-500'
        }`}>
          {activeAlerts.length} Escalation{activeAlerts.length !== 1 ? 's' : ''} Approaching
        </span>
      </div>

      <div className="space-y-2">
        {activeAlerts.slice(0, 2).map((item) => (
          <div
            key={item.escalation.id}
            className={`p-3 rounded-lg ${
              isBambiMode ? 'bg-white' : 'bg-protocol-bg'
            }`}
          >
            <p className={`text-sm font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              {item.escalation.description}
            </p>
            <p className={`text-xs mt-1 ${
              item.status === 'imminent' ? 'text-orange-500' : 'text-amber-500'
            }`}>
              {formatCountdown(item.daysUntil)} (Day {item.escalation.dayTrigger})
            </p>
          </div>
        ))}
      </div>

      {activeAlerts.length > 2 && (
        <p className="text-xs text-protocol-text-muted text-center mt-2">
          +{activeAlerts.length - 2} more
        </p>
      )}
    </div>
  );
}
