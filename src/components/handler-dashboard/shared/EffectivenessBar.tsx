// Effectiveness Bar Component
// Visual progress bar for effectiveness scores

interface EffectivenessBarProps {
  score: number; // 0-1 or 0-100
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  colorScheme?: 'default' | 'success' | 'warning' | 'danger';
}

export function EffectivenessBar({
  score,
  label,
  showPercentage = true,
  size = 'md',
  colorScheme = 'default',
}: EffectivenessBarProps) {
  // Normalize score to 0-100
  const normalizedScore = score > 1 ? score : score * 100;
  const percentage = Math.min(100, Math.max(0, normalizedScore));

  // Height based on size
  const heights = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  // Color based on scheme or score
  const getColor = () => {
    if (colorScheme !== 'default') {
      const colors = {
        success: 'bg-green-500',
        warning: 'bg-amber-500',
        danger: 'bg-red-500',
      };
      return colors[colorScheme];
    }

    // Score-based coloring
    if (percentage >= 70) return 'bg-green-500';
    if (percentage >= 40) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between items-center mb-1">
          {label && (
            <span className="text-xs text-protocol-text-muted">{label}</span>
          )}
          {showPercentage && (
            <span className="text-xs font-medium text-protocol-text">
              {percentage.toFixed(0)}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full ${heights[size]} bg-protocol-surface-light rounded-full overflow-hidden`}>
        <div
          className={`${heights[size]} ${getColor()} rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
