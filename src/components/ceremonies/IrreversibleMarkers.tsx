/**
 * Irreversible Markers
 * Display of earned irreversible transitions
 */

import { Lock, Sparkles } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface IrreversibleMarkersProps {
  markers: string[];
  compact?: boolean;
}

export function IrreversibleMarkers({ markers, compact = false }: IrreversibleMarkersProps) {
  const { isBambiMode } = useBambiMode();

  if (markers.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
        isBambiMode
          ? 'bg-pink-100 text-pink-600'
          : 'bg-protocol-accent/10 text-protocol-accent'
      }`}>
        <Lock className="w-4 h-4" />
        <span className="text-sm font-medium">
          {markers.length} irreversible marker{markers.length !== 1 ? 's' : ''}
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden ${
      isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
    }`}>
      {/* Header */}
      <div className={`px-4 py-3 border-b ${
        isBambiMode ? 'border-pink-100' : 'border-protocol-border'
      }`}>
        <div className="flex items-center gap-2">
          <Lock className={`w-4 h-4 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`} />
          <h3 className={`text-sm font-semibold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            Irreversible Markers
          </h3>
        </div>
        <p className={`text-xs mt-1 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          Points of no return you have crossed
        </p>
      </div>

      {/* Markers list */}
      <div className="p-3 space-y-2">
        {markers.map((marker, index) => (
          <div
            key={index}
            className={`flex items-center gap-3 p-3 rounded-lg ${
              isBambiMode ? 'bg-white' : 'bg-protocol-bg'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-accent/10'
            }`}>
              <Sparkles className={`w-4 h-4 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`} />
            </div>
            <span className={`text-sm ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              {marker}
            </span>
          </div>
        ))}
      </div>

      {/* Footer message */}
      <div className={`px-4 py-3 text-center ${
        isBambiMode ? 'bg-pink-100/50' : 'bg-protocol-surface-light'
      }`}>
        <p className={`text-xs italic ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}>
          These cannot be undone.
        </p>
      </div>
    </div>
  );
}

/**
 * Single marker badge for inline display
 */
export function MarkerBadge({ marker }: { marker: string }) {
  const { isBambiMode } = useBambiMode();

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
      isBambiMode
        ? 'bg-pink-100 text-pink-600'
        : 'bg-protocol-accent/10 text-protocol-accent'
    }`}>
      <Lock className="w-3 h-3" />
      {marker}
    </span>
  );
}
