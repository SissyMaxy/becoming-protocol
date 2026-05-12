/**
 * VoiceLessonCard — Today surface for pending voice_lesson outreach.
 *
 * Reads handler_outreach_queue rows where source='voice_lesson' that
 * are still undelivered, picks the most-recent-pending lesson, and
 * renders the LessonPlayer inline. The OutreachQueueCard excludes
 * source='voice_lesson' so the user doesn't see the same row twice.
 *
 * On graded attempt completion, marks the source outreach row delivered
 * (closes the loop) and triggers a Today refresh event.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useOnboardingComplete } from '../../hooks/useOnboardingComplete';
import { LessonPlayer } from './LessonPlayer';

interface VoiceLessonOutreach {
  id: string;
  message: string;
  scheduled_for: string;
  voice_lesson_module_id: string | null;
}

export function VoiceLessonCard() {
  const { user } = useAuth();
  const { complete: onboardingComplete } = useOnboardingComplete();
  const [pending, setPending] = useState<VoiceLessonOutreach[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('handler_outreach_queue')
      .select('id, message, scheduled_for, voice_lesson_module_id')
      .eq('user_id', user.id)
      .eq('source', 'voice_lesson')
      .is('delivered_at', null)
      .order('scheduled_for', { ascending: true })
      .limit(3);
    setPending((data || []) as VoiceLessonOutreach[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener('td-task-changed', onChange);
    return () => window.removeEventListener('td-task-changed', onChange);
  }, [load]);

  // Onboarding gate — first-run wizards already speak in Mommy voice
  // per memory; until that's done we don't drop full-fantasy lesson
  // cards on the user.
  if (!onboardingComplete) return null;
  if (pending.length === 0) return null;

  const top = pending[0];

  const onGraded = async () => {
    // Mark the source outreach delivered so it stops surfacing.
    await supabase
      .from('handler_outreach_queue')
      .update({ delivered_at: new Date().toISOString(), status: 'delivered' })
      .eq('id', top.id);
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'voice_lesson_graded', id: top.id } }));
    load();
  };

  return (
    <LessonPlayer
      lessonId={top.voice_lesson_module_id ?? undefined}
      onGraded={onGraded}
    />
  );
}
