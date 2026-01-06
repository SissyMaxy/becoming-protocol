import { useState, useEffect, useRef } from 'react';
import { Zap, TrendingUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface PointsDisplayProps {
  points: number;
  multiplier: number;
  className?: string;
  showMultiplier?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PointsDisplay({
  points,
  multiplier,
  className = '',
  showMultiplier = true,
  size = 'md',
}: PointsDisplayProps) {
  const { isBambiMode } = useBambiMode();
  const [displayPoints, setDisplayPoints] = useState(points);
  const [isAnimating, setIsAnimating] = useState(false);
  const prevPoints = useRef(points);

  // Animate point changes
  useEffect(() => {
    if (points !== prevPoints.current) {
      const diff = points - prevPoints.current;
      const startValue = prevPoints.current;
      const duration = 500; // ms
      const startTime = Date.now();

      setIsAnimating(true);

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out quad
        const eased = 1 - (1 - progress) * (1 - progress);
        const current = Math.round(startValue + diff * eased);

        setDisplayPoints(current);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setIsAnimating(false);
          prevPoints.current = points;
        }
      };

      requestAnimationFrame(animate);
    }
  }, [points]);

  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  const iconSize = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };

  const multiplierBadgeSize = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-0.5',
    lg: 'text-base px-2.5 py-1',
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Points icon */}
      <div
        className={`flex items-center justify-center rounded-full ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-400 to-pink-600'
            : 'bg-gradient-to-r from-protocol-accent to-purple-600'
        } p-1.5`}
      >
        <Zap className={`${iconSize[size]} text-white fill-white`} />
      </div>

      {/* Points value */}
      <span
        className={`${sizeClasses[size]} font-bold tabular-nums ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        } ${isAnimating ? 'animate-pulse' : ''}`}
      >
        {displayPoints.toLocaleString()}
      </span>

      {/* Multiplier badge */}
      {showMultiplier && multiplier > 1 && (
        <div
          className={`flex items-center gap-0.5 rounded-full font-medium ${
            multiplierBadgeSize[size]
          } ${
            isBambiMode
              ? 'bg-pink-100 text-pink-600'
              : 'bg-protocol-accent/20 text-protocol-accent'
          }`}
        >
          <TrendingUp className="w-3 h-3" />
          <span>{multiplier.toFixed(2)}x</span>
        </div>
      )}
    </div>
  );
}

// Compact version for use in stats bars
export function PointsBadge({
  points,
  className = '',
}: {
  points: number;
  className?: string;
}) {
  const { isBambiMode } = useBambiMode();

  return (
    <div
      className={`flex items-center gap-1 ${
        isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
      } ${className}`}
    >
      <Zap className="w-4 h-4" />
      <span className="font-medium tabular-nums">{points.toLocaleString()}</span>
    </div>
  );
}
