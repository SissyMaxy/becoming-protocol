/**
 * TaskCardVariants — Domain-aware enrichment strips rendered above task cards.
 * Detects voice, edge, and hypno tasks and shows contextual inline data.
 */

import { Mic, Lock, Flame, Headphones } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { DailyTask } from '../../types/task-bank';
import type { VoiceTrainingStats } from '../../types/voice-training';
import type { HypnoSessionRecord } from '../../types/hypno-bridge';

// ============================================
// VARIANT DETECTION
// ============================================

export type TaskVariant = 'voice' | 'edge' | 'hypno' | 'default';

export function getTaskVariant(task: DailyTask): TaskVariant {
  const { domain, category, playlistIds, contentIds } = task.task;
  if (domain === 'voice') return 'voice';
  if (category === 'edge' || domain === 'arousal') return 'edge';
  if (playlistIds?.length || contentIds?.length) return 'hypno';
  return 'default';
}

// ============================================
// VOICE ENRICHMENT
// ============================================

interface VoiceEnrichmentProps {
  stats: VoiceTrainingStats | null;
}

export function VoiceTaskEnrichment({ stats }: VoiceEnrichmentProps) {
  const { isBambiMode } = useBambiMode();

  const content = stats?.currentHz
    ? `Last: ${Math.round(stats.currentHz)} Hz avg — ${Math.abs(Math.round(stats.targetHz - stats.currentHz))} Hz from ${stats.targetHz}`
    : 'No sessions yet';

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-t-xl text-xs ${
      isBambiMode
        ? 'bg-pink-100/60 text-pink-600'
        : 'bg-purple-900/20 text-purple-300'
    }`}>
      <Mic className="w-3.5 h-3.5" />
      <span>{content}</span>
    </div>
  );
}

// ============================================
// EDGE ENRICHMENT
// ============================================

interface EdgeEnrichmentProps {
  denialDay: number;
  arousalLevel: number;
}

export function EdgeTaskEnrichment({ denialDay, arousalLevel }: EdgeEnrichmentProps) {
  const { isBambiMode } = useBambiMode();

  return (
    <div className={`flex items-center gap-3 px-3 py-1.5 rounded-t-xl text-xs ${
      isBambiMode
        ? 'bg-pink-100/60 text-pink-600'
        : 'bg-rose-900/20 text-rose-300'
    }`}>
      <span className="flex items-center gap-1">
        <Lock className="w-3.5 h-3.5" />
        Day {denialDay}
      </span>
      <span className="flex items-center gap-1">
        <Flame className="w-3.5 h-3.5" />
        {arousalLevel}
      </span>
    </div>
  );
}

// ============================================
// HYPNO ENRICHMENT
// ============================================

interface HypnoEnrichmentProps {
  session: HypnoSessionRecord | null;
  taskInstruction?: string;
}

export function HypnoTaskEnrichment({ session, taskInstruction }: HypnoEnrichmentProps) {
  const { isBambiMode } = useBambiMode();

  // Try to extract content name from instruction or session
  const contentName = session?.contentIds?.[0]
    ? 'Active session'
    : taskInstruction?.match(/[""](.+?)[""]|[''](.+?)['']|(?:listen to|watch|play)\s+(.+?)(?:\.|$)/i)?.[1]
    || 'Conditioning';

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-t-xl text-xs ${
      isBambiMode
        ? 'bg-pink-100/60 text-pink-600'
        : 'bg-indigo-900/20 text-indigo-300'
    }`}>
      <Headphones className="w-3.5 h-3.5" />
      <span className="truncate">{contentName}</span>
    </div>
  );
}
