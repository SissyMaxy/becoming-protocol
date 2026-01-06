// Status Badge Component
// Displays status indicators with colored badges

interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'md';
}

type StatusConfig = {
  bg: string;
  text: string;
  border?: string;
};

const statusConfigs: Record<string, StatusConfig> = {
  // Trigger statuses
  planting: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  reinforcing: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  established: { bg: 'bg-green-500/20', text: 'text-green-400' },
  dormant: { bg: 'bg-gray-500/20', text: 'text-gray-400' },

  // Strategy statuses
  active: { bg: 'bg-green-500/20', text: 'text-green-400' },
  inactive: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  paused: { bg: 'bg-amber-500/20', text: 'text-amber-400' },

  // Experiment statuses
  running: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  completed: { bg: 'bg-green-500/20', text: 'text-green-400' },
  abandoned: { bg: 'bg-red-500/20', text: 'text-red-400' },

  // Success/Failure
  success: { bg: 'bg-green-500/20', text: 'text-green-400' },
  failure: { bg: 'bg-red-500/20', text: 'text-red-400' },
  pending: { bg: 'bg-amber-500/20', text: 'text-amber-400' },

  // Priority levels
  high: { bg: 'bg-red-500/20', text: 'text-red-400' },
  medium: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  low: { bg: 'bg-blue-500/20', text: 'text-blue-400' },

  // Default
  default: { bg: 'bg-protocol-surface-light', text: 'text-protocol-text-muted' },
};

export function StatusBadge({ status, variant = 'default', size = 'sm' }: StatusBadgeProps) {
  const config = statusConfigs[status.toLowerCase()] || statusConfigs.default;

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
  };

  return (
    <span
      className={`
        inline-flex items-center font-medium rounded-full uppercase tracking-wide
        ${sizeClasses[size]}
        ${variant === 'outline' ? 'bg-transparent border' : config.bg}
        ${config.text}
        ${variant === 'outline' ? `border-current` : ''}
      `}
    >
      {status}
    </span>
  );
}
