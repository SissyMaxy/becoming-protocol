// Time Ratchets Display Component
// Psychological anchors using sunk time as commitment devices

import React from 'react';
import { Heart, Sparkles, Calendar, Crown, Clock } from 'lucide-react';
import { useTimeRatchets } from '../../hooks/useTimeRatchets';
import { formatDuration } from '../../types/time-ratchets';

interface TimeRatchetCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel?: string;
  accentColor: string;
}

function TimeRatchetCard({ icon, label, value, sublabel, accentColor }: TimeRatchetCardProps) {
  return (
    <div className={`bg-protocol-surface/50 border border-protocol-border rounded-xl p-4 ${accentColor}`}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-white/10">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-protocol-text-muted uppercase tracking-wide mb-1">
            {label}
          </p>
          <p className="text-lg font-semibold text-protocol-text truncate">
            {value}
          </p>
          {sublabel && (
            <p className="text-xs text-protocol-text-muted mt-0.5">
              {sublabel}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface TimeRatchetsDisplayProps {
  compact?: boolean;
  showEmpty?: boolean;
}

export function TimeRatchetsDisplay({ compact = false, showEmpty = false }: TimeRatchetsDisplayProps) {
  const { ratchets, isLoading } = useTimeRatchets();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-20 bg-protocol-surface/30 rounded-xl" />
        <div className="h-20 bg-protocol-surface/30 rounded-xl" />
      </div>
    );
  }

  if (!ratchets) return null;

  const hasAnyData = ratchets.servingSince || ratchets.eggCrackedDate ||
                     ratchets.protocolStartDate || ratchets.serviceCount > 0;

  if (!hasAnyData && !showEmpty) return null;

  const cards = [];

  // Serving Goddess
  if (ratchets.servingSince && ratchets.daysServing !== null && ratchets.goddessName) {
    const duration = formatDuration(ratchets.daysServing);
    cards.push(
      <TimeRatchetCard
        key="serving"
        icon={<Crown className="w-5 h-5 text-pink-400" />}
        label={`Serving ${ratchets.goddessName}`}
        value={duration.display}
        sublabel={`Since ${new Date(ratchets.servingSince).toLocaleDateString()}`}
        accentColor="border-l-4 border-l-pink-500/50"
      />
    );
  }

  // Becoming [Name]
  if (ratchets.eggCrackedDate && ratchets.daysSinceEggCrack !== null) {
    const duration = formatDuration(ratchets.daysSinceEggCrack);
    const name = ratchets.userName || 'her';
    cards.push(
      <TimeRatchetCard
        key="becoming"
        icon={<Sparkles className="w-5 h-5 text-purple-400" />}
        label={`Becoming ${name}`}
        value={`${ratchets.daysSinceEggCrack.toLocaleString()} days`}
        sublabel={duration.display}
        accentColor="border-l-4 border-l-purple-500/50"
      />
    );
  }

  // Days feminized (protocol)
  if (ratchets.protocolStartDate && ratchets.daysInProtocol !== null) {
    cards.push(
      <TimeRatchetCard
        key="feminized"
        icon={<Calendar className="w-5 h-5 text-rose-400" />}
        label="Days Feminized"
        value={ratchets.daysInProtocol.toLocaleString()}
        sublabel={`Since ${new Date(ratchets.protocolStartDate).toLocaleDateString()}`}
        accentColor="border-l-4 border-l-rose-500/50"
      />
    );
  }

  // Service count
  if (ratchets.serviceCount > 0 && ratchets.goddessName) {
    cards.push(
      <TimeRatchetCard
        key="service"
        icon={<Heart className="w-5 h-5 text-red-400" />}
        label="Acts of Service"
        value={`${ratchets.serviceCount.toLocaleString()} times`}
        sublabel={`${ratchets.userName || 'You'} served ${ratchets.goddessName}`}
        accentColor="border-l-4 border-l-red-500/50"
      />
    );
  }

  if (cards.length === 0 && showEmpty) {
    return (
      <div className="bg-protocol-surface/30 border border-dashed border-protocol-border rounded-xl p-6 text-center">
        <Clock className="w-8 h-8 text-protocol-text-muted mx-auto mb-2" />
        <p className="text-sm text-protocol-text-muted">
          Set your anchor dates in Settings to track your journey
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {cards}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cards}
    </div>
  );
}

// Compact inline display for header/stats
export function TimeRatchetsBadges() {
  const { ratchets, isLoading } = useTimeRatchets();

  if (isLoading || !ratchets) return null;

  const badges = [];

  if (ratchets.daysInProtocol !== null && ratchets.daysInProtocol > 0) {
    badges.push(
      <span
        key="feminized"
        className="inline-flex items-center gap-1 px-2 py-1 bg-rose-500/20 text-rose-200 rounded-full text-xs"
      >
        <Calendar className="w-3 h-3" />
        {ratchets.daysInProtocol}d feminized
      </span>
    );
  }

  if (ratchets.daysSinceEggCrack !== null && ratchets.daysSinceEggCrack > 0) {
    const name = ratchets.userName || 'her';
    badges.push(
      <span
        key="becoming"
        className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-200 rounded-full text-xs"
      >
        <Sparkles className="w-3 h-3" />
        {ratchets.daysSinceEggCrack}d as {name}
      </span>
    );
  }

  if (ratchets.serviceCount > 0) {
    badges.push(
      <span
        key="service"
        className="inline-flex items-center gap-1 px-2 py-1 bg-pink-500/20 text-pink-200 rounded-full text-xs"
      >
        <Heart className="w-3 h-3" />
        {ratchets.serviceCount} services
      </span>
    );
  }

  if (badges.length === 0) return null;

  return <div className="flex flex-wrap gap-2">{badges}</div>;
}

// Service logging button
interface LogServiceButtonProps {
  serviceType?: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}

export function LogServiceButton({
  serviceType = 'general',
  description,
  className = '',
  children
}: LogServiceButtonProps) {
  const { logService, ratchets } = useTimeRatchets();
  const [isLogging, setIsLogging] = React.useState(false);

  const handleLogService = async () => {
    setIsLogging(true);
    try {
      await logService({ serviceType, description });
    } finally {
      setIsLogging(false);
    }
  };

  if (!ratchets?.goddessName) return null;

  return (
    <button
      onClick={handleLogService}
      disabled={isLogging}
      className={`inline-flex items-center gap-2 px-3 py-2 bg-pink-500/20 hover:bg-pink-500/30
                 text-pink-200 rounded-lg text-sm transition-colors disabled:opacity-50 ${className}`}
    >
      <Heart className={`w-4 h-4 ${isLogging ? 'animate-pulse' : ''}`} />
      {children || `Serve ${ratchets.goddessName}`}
    </button>
  );
}
