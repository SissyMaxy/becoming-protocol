/**
 * useBodyOrderToday — today's mommy-led body order (or null if the program
 * isn't started). Shared by BodyProgramCard (home) and FocusMode's
 * workout_session surface so both render the exact same prescribed session.
 *
 * On a train day with strap recovery in the red (MVW_RECOVERY_FLOOR) the
 * order is silently downshifted to the minimum-viable session — the copy
 * never explains the calibration, the day still counts.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  bodyProgramDay, minimumViableOrder, MVW_RECOVERY_FLOOR, type BodyOrder,
} from '../lib/body-program';
import { loadBodyProgramTarget, loadTodayRecovery, todayLocalISO } from '../lib/workout/client';

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
      let today = bodyProgramDay(target.config.program_start, todayLocalISO());
      if (today.kind === 'train') {
        const recovery = await loadTodayRecovery(user.id);
        if (recovery !== null && recovery < MVW_RECOVERY_FLOOR) {
          today = minimumViableOrder(today);
        }
      }
      setOrder(today);
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
