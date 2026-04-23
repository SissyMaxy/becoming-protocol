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

function timeRemaining(deadline: string | null): { label: string; overdue: boolean; soon: boolean } {
  if (!deadline) return { label: 'no deadline', overdue: false, soon: false };
  const ms = new Date(deadline).getTime() - Date.now();
  const overdue = ms < 0;
  const hours = Math.abs(ms) / 3600000;
  const soon = !overdue && hours < 6;
  if (overdue) {
    if (hours < 24) return { label: `${Math.round(hours)}h overdue`, overdue: true, soon: false };
    return { label: `${Math.round(hours / 24)}d overdue`, overdue: true, soon: false };
  }
  if (hours < 1) return { label: `${Math.round(hours * 60)}min left`, overdue: false, soon: true };
  if (hours < 24) return { label: `${Math.round(hours)}h left`, overdue: false, soon };
  return { label: `${Math.round(hours / 24)}d left`, overdue: false, soon: false };
}

export function BodyDirectiveChecklist() {
  const { user } = useAuth();
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
  const soonestTime = soonest ? timeRemaining(soonest.deadline_at) : null;

  return (
    <button
      onClick={() => { window.location.hash = '/today'; }}
      className={`w-full flex items-center justify-between px-4 py-2.5 border-b border-l-2 text-left hover:bg-gray-900/40 transition-colors ${
        overdue.length > 0
          ? 'border-l-red-500 border-b-red-500/30 bg-red-500/5'
          : 'border-l-pink-400/60 border-b-gray-800 bg-gray-950/50'
      }`}
      title="Open Today for directive details + actions"
    >
      <div className="flex items-center gap-2.5 text-sm min-w-0">
        <span className="text-pink-300 font-medium flex-shrink-0">
          {directives.length} {directives.length === 1 ? 'directive' : 'directives'}
        </span>
        {soonest && soonestTime && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-xs text-gray-400 truncate">
              next: {soonest.category.replace(/_/g, ' ')}
            </span>
            <span className={`text-xs flex-shrink-0 ${
              soonestTime.overdue ? 'text-red-400' : soonestTime.soon ? 'text-amber-400' : 'text-gray-500'
            }`}>
              {soonestTime.label}
            </span>
          </>
        )}
        {overdue.length > 1 && (
          <span className="text-[10px] text-red-400 flex-shrink-0">
            +{overdue.length - 1} overdue
          </span>
        )}
      </div>
      <span className="text-xs text-pink-300 ml-2 flex-shrink-0">open →</span>
    </button>
  );
}
