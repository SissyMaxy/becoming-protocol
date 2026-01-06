import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, AlertCircle, PartyPopper } from 'lucide-react';

interface PrescriptionNoteProps {
  note: string;
  warnings?: string[];
  celebrations?: string[];
}

export function PrescriptionNote({ note, warnings = [], celebrations = [] }: PrescriptionNoteProps) {
  const [expanded, setExpanded] = useState(false);
  const hasExtra = warnings.length > 0 || celebrations.length > 0;

  return (
    <div className="card overflow-hidden">
      {/* Main note */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-protocol-accent/20 flex-shrink-0">
            <Sparkles className="w-4 h-4 text-protocol-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-protocol-text-muted uppercase tracking-wider mb-1">
              Today's Focus
            </p>
            <p className="text-sm text-protocol-text leading-relaxed">
              {note}
            </p>
          </div>
        </div>
      </div>

      {/* Warnings and celebrations */}
      {hasExtra && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2 flex items-center justify-between border-t border-protocol-border hover:bg-protocol-surface-light/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {warnings.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-amber-500">
                  <AlertCircle className="w-3 h-3" />
                  {warnings.length} notice{warnings.length > 1 ? 's' : ''}
                </span>
              )}
              {celebrations.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-protocol-success">
                  <PartyPopper className="w-3 h-3" />
                  {celebrations.length} win{celebrations.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-protocol-text-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-protocol-text-muted" />
            )}
          </button>

          {expanded && (
            <div className="px-4 pb-4 space-y-3 border-t border-protocol-border">
              {warnings.length > 0 && (
                <div className="pt-3 space-y-2">
                  {warnings.map((warning, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-amber-500">{warning}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {celebrations.length > 0 && (
                <div className="pt-3 space-y-2">
                  {celebrations.map((celebration, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-protocol-success/10 border border-protocol-success/20"
                    >
                      <div className="flex items-start gap-2">
                        <PartyPopper className="w-4 h-4 text-protocol-success mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-protocol-success">{celebration}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Domain decay alert inline component
interface DecayAlertProps {
  domain: string;
  daysSince: number;
  urgency: 'alert' | 'urgent';
}

export function DecayAlert({ domain: _domain, daysSince, urgency }: DecayAlertProps) {
  const isUrgent = urgency === 'urgent';

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
        isUrgent
          ? 'bg-protocol-danger/10 text-protocol-danger'
          : 'bg-amber-500/10 text-amber-500'
      }`}
    >
      <AlertCircle className="w-3 h-3" />
      <span>{daysSince}d</span>
    </div>
  );
}
