// Lovense Indicator Component
// Persistent status indicator for the UI

import { Vibrate, Wifi, WifiOff } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useLovense } from '../../hooks/useLovense';

interface LovenseIndicatorProps {
  onClick?: () => void;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LovenseIndicator({
  onClick,
  showLabel = false,
  size = 'md',
  className = '',
}: LovenseIndicatorProps) {
  const { isBambiMode } = useBambiMode();
  const lovense = useLovense();

  const isConnected = lovense.status === 'connected';
  const isConnecting = lovense.status === 'connecting';
  const hasActivity = lovense.currentIntensity > 0;

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-3',
  };

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 rounded-full transition-all
        ${sizeClasses[size]}
        ${
          isConnected
            ? hasActivity
              ? isBambiMode
                ? 'bg-pink-500 text-white'
                : 'bg-protocol-accent text-white'
              : isBambiMode
                ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                : 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
            : isConnecting
              ? isBambiMode
                ? 'bg-pink-100 text-pink-400'
                : 'bg-protocol-surface-light text-protocol-text-muted'
              : isBambiMode
                ? 'bg-pink-50 text-pink-300 hover:bg-pink-100 hover:text-pink-400'
                : 'bg-protocol-surface text-protocol-text-muted hover:bg-protocol-surface-light'
        }
        ${className}
      `}
    >
      {isConnected ? (
        <Vibrate
          className={`${iconSizes[size]} ${hasActivity ? 'animate-pulse' : ''}`}
        />
      ) : isConnecting ? (
        <Wifi className={`${iconSizes[size]} animate-pulse`} />
      ) : (
        <WifiOff className={iconSizes[size]} />
      )}

      {showLabel && (
        <span className="text-xs font-medium">
          {isConnected
            ? hasActivity
              ? `${lovense.currentIntensity}`
              : lovense.activeToy?.name || 'Connected'
            : isConnecting
              ? 'Connecting...'
              : 'Lovense'}
        </span>
      )}
    </button>
  );
}

// Compact version for header/navbar
export function LovenseStatusDot({ className = '' }: { className?: string }) {
  const lovense = useLovense();
  const isConnected = lovense.status === 'connected';
  const hasActivity = lovense.currentIntensity > 0;

  if (!isConnected) return null;

  return (
    <span
      className={`
        w-2 h-2 rounded-full
        ${hasActivity ? 'bg-green-500 animate-pulse' : 'bg-green-500'}
        ${className}
      `}
    />
  );
}

// Mini control for quick intensity adjustment
export function LovenseQuickControl({ className = '' }: { className?: string }) {
  const { isBambiMode } = useBambiMode();
  const lovense = useLovense();

  const isConnected = lovense.status === 'connected';

  if (!isConnected) return null;

  const handleQuickIntensity = async (level: 'off' | 'low' | 'med' | 'high') => {
    const intensities = { off: 0, low: 5, med: 10, high: 16 };
    await lovense.setIntensity(intensities[level]);
  };

  return (
    <div
      className={`
        flex items-center gap-1 p-1 rounded-lg
        ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'}
        ${className}
      `}
    >
      <Vibrate
        className={`w-4 h-4 mr-1 ${
          lovense.currentIntensity > 0
            ? isBambiMode
              ? 'text-pink-500 animate-pulse'
              : 'text-protocol-accent animate-pulse'
            : isBambiMode
              ? 'text-pink-300'
              : 'text-protocol-text-muted'
        }`}
      />
      {(['off', 'low', 'med', 'high'] as const).map((level) => {
        const isActive =
          (level === 'off' && lovense.currentIntensity === 0) ||
          (level === 'low' && lovense.currentIntensity > 0 && lovense.currentIntensity <= 6) ||
          (level === 'med' && lovense.currentIntensity > 6 && lovense.currentIntensity <= 12) ||
          (level === 'high' && lovense.currentIntensity > 12);

        return (
          <button
            key={level}
            onClick={() => handleQuickIntensity(level)}
            className={`
              px-2 py-1 rounded text-xs font-medium transition-all
              ${
                isActive
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                  : isBambiMode
                    ? 'text-pink-500 hover:bg-pink-100'
                    : 'text-protocol-text-muted hover:bg-protocol-surface-light'
              }
            `}
          >
            {level === 'off' ? 'Off' : level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        );
      })}
    </div>
  );
}
