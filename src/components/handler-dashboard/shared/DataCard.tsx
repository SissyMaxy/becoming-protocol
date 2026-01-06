// Data Card Component
// Reusable card for displaying handler data items

import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

interface DataCardProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  iconColor?: string;
  badge?: ReactNode;
  children: ReactNode;
  expandable?: boolean;
  defaultExpanded?: boolean;
  actions?: ReactNode;
  className?: string;
}

export function DataCard({
  title,
  subtitle,
  icon: Icon,
  iconColor = '#6366f1',
  badge,
  children,
  expandable = false,
  defaultExpanded = true,
  actions,
  className = '',
}: DataCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpand = () => {
    if (expandable) {
      setExpanded(!expanded);
    }
  };

  return (
    <div
      className={`bg-protocol-surface border border-protocol-border rounded-xl overflow-hidden ${className}`}
    >
      {/* Header */}
      <div
        className={`p-4 flex items-center gap-3 ${
          expandable ? 'cursor-pointer hover:bg-protocol-surface-light/50' : ''
        }`}
        onClick={toggleExpand}
      >
        {Icon && (
          <div
            className="p-2 rounded-lg"
            style={{ backgroundColor: `${iconColor}20` }}
          >
            <Icon className="w-4 h-4" style={{ color: iconColor }} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-protocol-text truncate">{title}</h3>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs text-protocol-text-muted truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        {actions && !expandable && (
          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}

        {expandable && (
          <div className="flex items-center gap-2">
            {actions && (
              <div onClick={e => e.stopPropagation()}>{actions}</div>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-protocol-text-muted" />
            ) : (
              <ChevronDown className="w-4 h-4 text-protocol-text-muted" />
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {(!expandable || expanded) && (
        <div className="px-4 pb-4 pt-0">{children}</div>
      )}
    </div>
  );
}

// Simple stat display for cards
interface StatProps {
  label: string;
  value: string | number;
  subtext?: string;
}

export function Stat({ label, value, subtext }: StatProps) {
  return (
    <div className="text-center">
      <p className="text-xs text-protocol-text-muted">{label}</p>
      <p className="text-lg font-semibold text-protocol-text">{value}</p>
      {subtext && (
        <p className="text-[10px] text-protocol-text-muted">{subtext}</p>
      )}
    </div>
  );
}
