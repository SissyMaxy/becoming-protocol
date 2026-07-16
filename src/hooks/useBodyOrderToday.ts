/**
 * useBodyOrderToday — today's mommy-led body order (or null if the program
 * isn't started). Shared by BodyProgramCard (home) and FocusMode's
 * workout_session surface so both render the exact same prescribed session.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { bodyProgramDay, type BodyOrder } from '../lib/body-program';
import { loadBodyProgramTarget, todayLocalISO } from '../lib/workout/client';

interface Result {
  order: BodyOrder | null;
  started: boolean;      // program is active
  loading: boolean;
  reload: () => void;
}

export function useBodyOrderToday(): Result {
  const { user } = useAuth();
  const [order, setOrder] = useState<BodyOrder | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    const target = await loadBodyProgramTarget(user.id);
    if (target?.config.program_start) {
      setOrder(bodyProgramDay(target.config.program_start, todayLocalISO()));
      setStarted(true);
    } else {
      setOrder(null);
      setStarted(false);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  return { order, started, loading, reload: load };
}
