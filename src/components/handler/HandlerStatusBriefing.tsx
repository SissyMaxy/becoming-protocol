/**
 * HandlerStatusBriefing
 *
 * Status-report format morning briefing.
 * Sections: OVERNIGHT → TODAY → PROGRESS → AUDIENCE → AFFIRMATION
 * Replaces instruction-list format. The Handler is reporting on a life she manages.
 */

import { useState, useEffect } from 'react';
import {
  Moon,
  Calendar,
  TrendingUp,
  MessageCircle,
  Heart,
  Bot,
  Lock,
  Mic,
  DollarSign,
  Anchor,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { composeHandlerBriefing, type HandlerBriefing, type BriefingItem } from '../../lib/handler-briefing';

interface HandlerStatusBriefingProps {
  className?: string;
}

export function HandlerStatusBriefing({ className = '' }: HandlerStatusBriefingProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [briefing, setBriefing] = useState<HandlerBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const data = await composeHandlerBriefing(user!.id);
        if (!cancelled) setBriefing(data);
      } catch (err) {
        console.error('[Briefing] Failed to compose:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <Loader2 className={`w-6 h-6 animate-spin ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`} />
      </div>
    );
  }

  if (!briefing) return null;

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* OVERNIGHT */}
      <BriefingSection
        label="OVERNIGHT"
        icon={<Moon className="w-4 h-4" />}
        summary={briefing.overnight.summary}
        items={briefing.overnight.items}
        expanded={expandedSection === 'overnight'}
        onToggle={() => toggleSection('overnight')}
        isBambiMode={isBambiMode}
        accentColor={isBambiMode ? 'text-purple-500' : 'text-indigo-400'}
        bgColor={isBambiMode ? 'bg-purple-50' : 'bg-indigo-900/20'}
      />

      {/* TODAY */}
      <BriefingSection
        label="TODAY"
        icon={<Calendar className="w-4 h-4" />}
        summary={briefing.today.summary}
        items={briefing.today.items}
        expanded={expandedSection === 'today'}
        onToggle={() => toggleSection('today')}
        isBambiMode={isBambiMode}
        accentColor={isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}
        bgColor={isBambiMode ? 'bg-pink-50' : 'bg-protocol-accent/10'}
      />

      {/* PROGRESS */}
      <div className={`rounded-xl p-4 ${
        isBambiMode ? 'bg-green-50 border-2 border-green-200' : 'bg-green-900/20 border border-green-500/30'
      }`}>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className={`w-4 h-4 ${isBambiMode ? 'text-green-500' : 'text-green-400'}`} />
          <span className={`text-xs font-medium uppercase tracking-wider ${
            isBambiMode ? 'text-green-600' : 'text-green-400'
          }`}>
            PROGRESS
          </span>
        </div>
        <p className={`text-sm handler-voice ${isBambiMode ? 'text-green-700' : 'text-protocol-text'}`}>
          {briefing.progress.highlight}
        </p>
        {briefing.progress.hrtReframe && (
          <p className={`text-xs mt-2 italic ${
            isBambiMode ? 'text-pink-500' : 'text-pink-400/80'
          }`}>
            {briefing.progress.hrtReframe}
          </p>
        )}
      </div>

      {/* AUDIENCE */}
      {briefing.audience.comments.length > 0 && (
        <div className={`rounded-xl p-4 ${
          isBambiMode ? 'bg-amber-50 border-2 border-amber-200' : 'bg-amber-900/20 border border-amber-500/30'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle className={`w-4 h-4 ${isBambiMode ? 'text-amber-500' : 'text-amber-400'}`} />
            <span className={`text-xs font-medium uppercase tracking-wider ${
              isBambiMode ? 'text-amber-600' : 'text-amber-400'
            }`}>
              AUDIENCE
            </span>
          </div>
          <div className="space-y-2">
            {briefing.audience.comments.map((comment, idx) => (
              <div key={idx} className={`rounded-lg p-3 ${
                isBambiMode ? 'bg-white' : 'bg-black/20'
              }`}>
                <p className={`text-xs ${isBambiMode ? 'text-amber-500' : 'text-amber-400/70'}`}>
                  @{comment.username} on {comment.platform}
                </p>
                <p className={`text-sm mt-1 handler-voice ${isBambiMode ? 'text-amber-700' : 'text-protocol-text'}`}>
                  "{comment.text}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AFFIRMATION */}
      <div className={`rounded-xl p-4 text-center ${
        isBambiMode
          ? 'bg-gradient-to-r from-pink-50 to-purple-50 border-2 border-pink-200'
          : 'bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/30'
      }`}>
        <Heart className={`w-5 h-5 mx-auto mb-2 ${
          isBambiMode ? 'text-pink-400' : 'text-pink-400/80'
        }`} />
        <p className={`text-sm italic handler-voice ${
          isBambiMode ? 'text-pink-600' : 'text-white/80'
        }`}>
          {briefing.affirmation}
        </p>
      </div>
    </div>
  );
}

// ============================================
// COLLAPSIBLE SECTION
// ============================================

function BriefingSection({
  label,
  icon,
  summary,
  items,
  expanded,
  onToggle,
  isBambiMode,
  accentColor,
  bgColor,
}: {
  label: string;
  icon: React.ReactNode;
  summary: string;
  items: BriefingItem[];
  expanded: boolean;
  onToggle: () => void;
  isBambiMode: boolean;
  accentColor: string;
  bgColor: string;
}) {
  return (
    <div className={`rounded-xl overflow-hidden ${
      isBambiMode ? 'border-2 border-gray-200' : 'border border-protocol-border'
    } ${bgColor}`}>
      {/* Header (always visible, tappable) */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span className={accentColor}>{icon}</span>
          <span className={`text-xs font-medium uppercase tracking-wider ${accentColor}`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs ${isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}`}>
            {summary}
          </span>
          {expanded
            ? <ChevronUp className={`w-4 h-4 ${isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'}`} />
            : <ChevronDown className={`w-4 h-4 ${isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'}`} />
          }
        </div>
      </button>

      {/* Expanded items */}
      {expanded && items.length > 0 && (
        <div className={`px-4 pb-3 space-y-2 border-t ${
          isBambiMode ? 'border-gray-200' : 'border-protocol-border/50'
        }`}>
          {items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-2 pt-2">
              <ItemIcon name={item.icon} isBambiMode={isBambiMode} />
              <p className={`text-sm handler-voice ${isBambiMode ? 'text-gray-700' : 'text-protocol-text'}`}>
                {item.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemIcon({ name, isBambiMode }: { name: string; isBambiMode: boolean }) {
  const cls = `w-4 h-4 mt-0.5 flex-shrink-0 ${isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'}`;

  switch (name) {
    case 'bot': return <Bot className={cls} />;
    case 'lock': return <Lock className={cls} />;
    case 'mic': return <Mic className={cls} />;
    case 'dollar': return <DollarSign className={cls} />;
    case 'anchor': return <Anchor className={cls} />;
    case 'wave': return <Heart className={cls} />;
    case 'shirt': return <Calendar className={cls} />;
    case 'moon':
    default: return <Moon className={cls} />;
  }
}
