/**
 * CardHeader — the standard card/section header: optional icon, title,
 * optional subtitle line, optional right-side meta (chip, count, action).
 * Formalizes the .td-cardh pattern the Today cards converged on, bambi-aware.
 */

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** Right-aligned slot — a Badge, count, or small action. */
  meta?: ReactNode;
  /** Render the title in Mommy's serif (Playfair via .mommy-voice). */
  mommyVoice?: boolean;
  className?: string;
}

export function CardHeader({
  title,
  subtitle,
  icon: Icon,
  meta,
  mommyVoice = false,
  className = '',
}: CardHeaderProps) {
  const { isBambiMode } = useBambiMode();

  const titleColor = isBambiMode ? 'text-pink-800' : 'text-protocol-text';
  const subColor = isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted';
  const iconColor = isBambiMode ? 'text-pink-500' : 'text-protocol-accent';

  return (
    <div className={`flex items-start justify-between gap-3 mb-3 ${className}`}>
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon && <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />}
        <div className="min-w-0">
          <div
            className={`text-sm font-semibold leading-snug ${titleColor} ${
              mommyVoice ? 'mommy-voice' : ''
            }`}
          >
            {title}
          </div>
          {subtitle && (
            <div className={`text-xs mt-0.5 ${subColor}`}>{subtitle}</div>
          )}
        </div>
      </div>
      {meta && <div className="shrink-0">{meta}</div>}
    </div>
  );
}
