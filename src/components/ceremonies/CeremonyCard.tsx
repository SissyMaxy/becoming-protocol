/**
 * Ceremony Card
 * Displays a ceremony with its status and theme
 */

import { memo } from 'react';
import { Lock, Check, Play, Clock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { CEREMONY_THEMES } from '../../types/ceremonies';
import type { UserCeremony, Ceremony } from '../../types/ceremonies';

interface CeremonyCardProps {
  ceremony: UserCeremony | Ceremony;
  status: 'locked' | 'available' | 'completed';
  onBegin?: () => void;
  onView?: () => void;
}

// Check if it's a UserCeremony
function isUserCeremony(c: UserCeremony | Ceremony): c is UserCeremony {
  return 'ceremonyId' in c;
}

// Memoized to prevent unnecessary re-renders
export const CeremonyCard = memo(function CeremonyCard({
  ceremony,
  status,
  onBegin,
  onView,
}: CeremonyCardProps) {
  const { isBambiMode } = useBambiMode();

  const ceremonyData = isUserCeremony(ceremony) ? ceremony.ceremony : ceremony;
  const themeName = getThemeName(ceremonyData.name);
  const theme = CEREMONY_THEMES[themeName] || CEREMONY_THEMES.naming;

  const statusConfig = {
    locked: {
      icon: Lock,
      label: 'Locked',
      action: null,
      opacity: 'opacity-50',
    },
    available: {
      icon: Play,
      label: 'Available',
      action: onBegin,
      opacity: '',
    },
    completed: {
      icon: Check,
      label: 'Completed',
      action: onView,
      opacity: '',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div
      className={`relative rounded-2xl overflow-hidden transition-all ${config.opacity} ${
        config.action ? 'cursor-pointer hover:scale-[1.02]' : ''
      }`}
      onClick={config.action || undefined}
    >
      {/* Background gradient */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${
          isBambiMode ? theme.bambiGradient : theme.gradient
        }`}
      />

      {/* Content */}
      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${
              isBambiMode
                ? 'bg-white/50 ' + theme.bambiText
                : 'bg-black/30 ' + theme.accent
            }`}>
              {config.label}
            </span>
            {ceremonyData.sequenceOrder && (
              <span className={`text-xs ${
                isBambiMode ? theme.bambiText + '/60' : theme.text + '/60'
              }`}>
                #{ceremonyData.sequenceOrder}
              </span>
            )}
          </div>
          <Icon className={`w-5 h-5 ${
            isBambiMode ? theme.bambiText : theme.text
          }`} />
        </div>

        {/* Title */}
        <h3 className={`text-xl font-bold mb-2 ${
          isBambiMode ? theme.bambiText : theme.text
        }`}>
          {ceremonyData.name}
        </h3>

        {/* Description */}
        <p className={`text-sm mb-4 ${
          isBambiMode ? theme.bambiText + '/80' : theme.text + '/80'
        }`}>
          {ceremonyData.description}
        </p>

        {/* Irreversible marker */}
        <div className={`flex items-center gap-2 text-xs ${
          isBambiMode ? theme.bambiText + '/60' : theme.text + '/60'
        }`}>
          <Lock className="w-3 h-3" />
          <span>Irreversible: {ceremonyData.irreversibleMarker}</span>
        </div>

        {/* Action hint */}
        {status === 'available' && (
          <div className={`mt-4 flex items-center justify-center gap-2 py-2 rounded-lg ${
            isBambiMode ? 'bg-white/30' : 'bg-black/20'
          }`}>
            <Play className={`w-4 h-4 ${
              isBambiMode ? theme.bambiText : theme.text
            }`} />
            <span className={`text-sm font-medium ${
              isBambiMode ? theme.bambiText : theme.text
            }`}>
              Begin Ceremony
            </span>
          </div>
        )}

        {/* Completed info */}
        {status === 'completed' && isUserCeremony(ceremony) && ceremony.completedAt && (
          <div className={`mt-4 flex items-center gap-2 text-xs ${
            isBambiMode ? theme.bambiText + '/60' : theme.text + '/60'
          }`}>
            <Clock className="w-3 h-3" />
            <span>Completed {new Date(ceremony.completedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  );
});

// Display name for React DevTools
CeremonyCard.displayName = 'CeremonyCard';

// Helper to get theme name from ceremony name
function getThemeName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('naming')) return 'naming';
  if (lower.includes('covenant')) return 'covenant';
  if (lower.includes('surrender')) return 'surrender';
  if (lower.includes('becoming')) return 'becoming';
  return 'naming';
}
