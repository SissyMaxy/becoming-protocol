/**
 * TodayView — responsive switch between desktop and mobile Direction A.
 * Breakpoint: 768px. Mobile gets bottom tab bar + stacked layout;
 * desktop gets fixed left rail + card grid.
 */

import { useEffect, useState } from 'react';
import { TodayDesktop } from './TodayDesktop';
import { TodayMobile } from './TodayMobile';

interface TodayViewProps {
  onExit?: () => void;
}

export function TodayView({ onExit }: TodayViewProps) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return isMobile ? <TodayMobile onExit={onExit} /> : <TodayDesktop onExit={onExit} />;
}
