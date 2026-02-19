/**
 * DenialBadge — Reusable denial day badge with color shifts
 * Color progression: blue (1-2) → amber (3-4) → pink (5) → purple (6-7+)
 * Sizes: sm (inline), md (card header), lg (feature)
 */

import { Lock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

type BadgeSize = 'sm' | 'md' | 'lg';

interface DenialBadgeProps {
  denialDay: number;
  size?: BadgeSize;
  showLock?: boolean;
  className?: string;
}

// Color config per denial day range
interface DayColors {
  bambi: string;
  dark: string;
}

function getDayColors(day: number): DayColors {
  if (day <= 0) return { bambi: 'bg-gray-100 text-gray-500', dark: 'bg-gray-800/30 text-gray-400' };
  if (day <= 2) return { bambi: 'bg-blue-100 text-blue-600', dark: 'bg-blue-900/30 text-blue-400' };
  if (day <= 4) return { bambi: 'bg-amber-100 text-amber-600', dark: 'bg-amber-900/30 text-amber-400' };
  if (day === 5) return { bambi: 'bg-pink-100 text-pink-600', dark: 'bg-pink-900/30 text-pink-400' };
  return { bambi: 'bg-purple-100 text-purple-600', dark: 'bg-purple-900/30 text-purple-400' };
}

// Size config
const SIZE_CONFIG: Record<BadgeSize, {
  text: string;
  icon: string;
  padding: string;
  rounded: string;
}> = {
  sm: { text: 'text-[10px]', icon: 'w-2.5 h-2.5', padding: 'px-1.5 py-0.5', rounded: 'rounded-full' },
  md: { text: 'text-xs', icon: 'w-3 h-3', padding: 'px-2 py-1', rounded: 'rounded-full' },
  lg: { text: 'text-sm', icon: 'w-3.5 h-3.5', padding: 'px-3 py-1.5', rounded: 'rounded-lg' },
};

export function DenialBadge({
  denialDay,
  size = 'sm',
  showLock = true,
  className = '',
}: DenialBadgeProps) {
  const { isBambiMode } = useBambiMode();

  if (denialDay <= 0) return null;

  const colors = getDayColors(denialDay);
  const sizeConfig = SIZE_CONFIG[size];
  const colorClass = isBambiMode ? colors.bambi : colors.dark;

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-bold ${sizeConfig.text} ${sizeConfig.padding} ${sizeConfig.rounded} ${colorClass} ${className}`}
    >
      {showLock && (
        <Lock className={sizeConfig.icon} style={{ marginTop: -1 }} />
      )}
      Day {denialDay}
    </span>
  );
}

/**
 * Utility: get Tailwind classes for denial badge without rendering.
 * Useful when components need the color logic but render differently.
 */
export function getDenialBadgeClasses(denialDay: number, isBambiMode: boolean): string {
  const colors = getDayColors(denialDay);
  return isBambiMode ? colors.bambi : colors.dark;
}
