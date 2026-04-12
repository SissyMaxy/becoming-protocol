import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useFeminizationScore() {
  const { user } = useAuth();
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    async function calculate() {
      const today = new Date().toISOString().split('T')[0];

      const [voice, confession, outfit, tasks, sessions, device] = await Promise.allSettled([
        supabase.from('voice_practice_log').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).gte('created_at', `${today}T00:00:00`),
        supabase.from('shame_journal').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).gte('created_at', `${today}T00:00:00`),
        supabase.from('verification_photos').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).gte('created_at', `${today}T00:00:00`),
        supabase.from('daily_tasks').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'completed').gte('created_at', `${today}T00:00:00`),
        supabase.from('conditioning_sessions_v2').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).gte('started_at', new Date(Date.now() - 86400000).toISOString()),
        supabase.from('handler_directives').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).eq('action', 'send_device_command').eq('status', 'completed').gte('created_at', `${today}T00:00:00`),
      ]);

      let total = 0;
      if (voice.status === 'fulfilled' && (voice.value.count || 0) > 0) total += 20;
      if (confession.status === 'fulfilled' && (confession.value.count || 0) > 0) total += 15;
      if (outfit.status === 'fulfilled' && (outfit.value.count || 0) > 0) total += 15;
      if (tasks.status === 'fulfilled' && (tasks.value.count || 0) > 0) total += 20;
      if (sessions.status === 'fulfilled' && (sessions.value.count || 0) > 0) total += 15;
      if (device.status === 'fulfilled' && (device.value.count || 0) > 0) total += 15;

      setScore(total);
    }

    calculate();
    const interval = setInterval(calculate, 120000);
    return () => clearInterval(interval);
  }, [user?.id]);

  return score;
}
