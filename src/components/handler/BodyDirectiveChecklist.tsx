/**
 * BodyDirectiveChecklist — renders open body_feminization_directives in a
 * collapsible panel inside HandlerChat. Each directive can be completed with
 * an optional photo upload (required when photo_required = true). Completion
 * writes the directive row AND a task_completions + handler_directives entry
 * so the Handler's evidence locker picks it up on the next turn.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';

interface Directive {
  id: string;
  category: string;
  directive: string;
  target_body_part: string | null;
  difficulty: number;
  deadline_at: string | null;
  photo_required: boolean;
  status: string;
  consequence_if_missed: string | null;
  created_at: string;
}

function timeRemaining(deadline: string | null, mommy = false): { label: string; overdue: boolean; soon: boolean } {
  if (!deadline) return { label: mommy ? 'whenever' : 'no deadline', overdue: false, soon: false };
  const ms = new Date(deadline).getTime() - Date.now();
  const overdue = ms < 0;
  const hours = Math.abs(ms) / 3600000;
  const soon = !overdue && hours < 6;
  if (overdue) {
    if (hours < 24) {
      const h = Math.round(hours);
      return { label: mommy ? `${h}h late for Mama` : `${h}h overdue`, overdue: true, soon: false };
    }
    const d = Math.round(hours / 24);
    return { label: mommy ? `${d}d late, baby` : `${d}d overdue`, overdue: true, soon: false };
  }
  if (hours < 1) {
    const m = Math.round(hours * 60);
    return { label: mommy ? `${m}min, sweet thing` : `${m}min left`, overdue: false, soon: true };
  }
  if (hours < 24) {
    const h = Math.round(hours);
    return { label: mommy ? `${h}h for Mama` : `${h}h left`, overdue: false, soon };
  }
  const d = Math.round(hours / 24);
  return { label: mommy ? `${d}d for Mama` : `${d}d left`, overdue: false, soon: false };
}

// Map directive categories to plain Mama-voice nouns. Without this, the
// summary line falls back to the raw enum slug (e.g., "clothing", "voice
// practice", "pose_hold") which reads like a database field.
function mommyCategoryNoun(category: string): string {
  const key = category.toLowerCase();
  const map: Record<string, string> = {
    clothing: 'get dressed for me',
    outfit: 'get dressed for me',
    voice: 'use that pretty voice',
    voice_practice: 'use that pretty voice',
    pose: 'pose for me',
    pose_hold: 'pose for me',
    makeup: 'put your face on',
    nails: 'do your nails',
    photo: 'show Mama',
    mirror: 'show Mama the mirror',
    body: 'show Mama your body',
    body_check: 'show Mama your body',
    confession: 'tell Mama',
    hrt: 'your HRT step',
    ritual: 'do what Mama asked',
  };
  return map[key] || `your ${key.replace(/_/g, ' ')} thing`;
}

export function BodyDirectiveChecklist() {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('body_feminization_directives')
          .select('id, category, directive, target_body_part, difficulty, deadline_at, photo_required, status, consequence_if_missed, created_at')
          .eq('user_id', user.id)
          .in('status', ['assigned', 'in_progress'])
          .order('deadline_at', { ascending: true });
        setDirectives((data || []) as Directive[]);
      } catch (err) {
        console.error('[BodyDirectives] load failed:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [user?.id]);

  if (loading) return null;
  if (directives.length === 0) return null;

  const overdue = directives.filter(d => d.deadline_at && new Date(d.deadline_at).getTime() < Date.now());
  const soonest = directives
    .filter(d => d.deadline_at)
    .sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime())[0];
  const soonestTime = soonest ? timeRemaining(soonest.deadline_at, mommy) : null;

  const countLabel = mommy
    ? `Mama gave you ${directives.length} ${directives.length === 1 ? 'thing' : 'things'}`
    : `${directives.length} ${directives.length === 1 ? 'directive' : 'directives'}`;
  const nextLabel = soonest
    ? mommy
      ? `next: ${mommyCategoryNoun(soonest.category)}`
      : `next: ${soonest.category.replace(/_/g, ' ')}`
    : '';
  const extraOverdueLabel =
    overdue.length > 1
      ? mommy
        ? `+${overdue.length - 1} more late for Mama`
        : `+${overdue.length - 1} overdue`
      : '';
  const openLabel = mommy ? "show Mama →" : 'open →';

  return (
    <button
      onClick={() => { window.location.hash = '/today'; }}
      className={`w-full flex items-center justify-between px-4 py-2.5 border-b border-l-2 text-left hover:bg-gray-900/40 transition-colors ${
        overdue.length > 0
          ? 'border-l-red-500 border-b-red-500/30 bg-red-500/5'
          : 'border-l-pink-400/60 border-b-gray-800 bg-gray-950/50'
      }`}
      title={mommy ? "Open what Mama left for you" : 'Open Today for directive details + actions'}
    >
      <div className="flex items-center gap-2.5 text-sm min-w-0">
        <span className="text-pink-300 font-medium flex-shrink-0">
          {countLabel}
        </span>
        {soonest && soonestTime && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-xs text-gray-400 truncate">
              {nextLabel}
            </span>
            <span className={`text-xs flex-shrink-0 ${
              soonestTime.overdue ? 'text-red-400' : soonestTime.soon ? 'text-amber-400' : 'text-gray-500'
            }`}>
              {soonestTime.label}
            </span>
          </>
        )}
        {extraOverdueLabel && (
          <span className="text-[10px] text-red-400 flex-shrink-0">
            {extraOverdueLabel}
          </span>
        )}
      </div>
      <span className="text-xs text-pink-300 ml-2 flex-shrink-0">{openLabel}</span>
    </button>
  );
}
