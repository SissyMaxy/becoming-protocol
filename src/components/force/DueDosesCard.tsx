/**
 * Due Doses Card
 *
 * Shows next ~12 hours of scheduled doses. One-tap confirm (photo optional).
 */

import { useCallback, useEffect, useState } from 'react';
import { Pill, Check, Camera, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface DoseRow {
  id: string;
  regimen_id: string;
  scheduled_at: string;
  medication_name: string;
  dose_amount: string;
  late_minutes: number;
}

interface Props {
  userId: string;
}

export function DueDosesCard({ userId }: Props) {
  const [doses, setDoses] = useState<DoseRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const twelveHoursLater = new Date(Date.now() + 12 * 3600000).toISOString();

    const { data } = await supabase
      .from('dose_log')
      .select('id, regimen_id, scheduled_at, medication_regimen:regimen_id(medication_name, dose_amount)')
      .eq('user_id', userId)
      .is('taken_at', null)
      .eq('skipped', false)
      .lt('scheduled_at', twelveHoursLater)
      .order('scheduled_at', { ascending: true })
      .limit(6);

    const rows = (data as Array<Record<string, unknown>> | null) || [];
    const out: DoseRow[] = rows.map(r => {
      const regimen = (r.medication_regimen as Record<string, unknown> | null) || {};
      const scheduledAt = r.scheduled_at as string;
      const lateMin = Math.round((Date.now() - new Date(scheduledAt).getTime()) / 60000);
      return {
        id: r.id as string,
        regimen_id: r.regimen_id as string,
        scheduled_at: scheduledAt,
        medication_name: (regimen.medication_name as string) || 'dose',
        dose_amount: (regimen.dose_amount as string) || '',
        late_minutes: lateMin,
      };
    });
    setDoses(out);
  }, [userId]);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const markTaken = async (doseId: string, withPhoto: boolean) => {
    setBusyId(doseId);
    try {
      await supabase
        .from('dose_log')
        .update({
          taken_at: new Date().toISOString(),
          confirmation_type: withPhoto ? 'photo' : 'timestamp',
        })
        .eq('id', doseId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (doses.length === 0) return null;

  return (
    <div className="p-3 rounded-lg border border-pink-500/30 bg-pink-950/10">
      <div className="flex items-center gap-2 mb-2">
        <Pill className="w-4 h-4 text-pink-400" />
        <span className="text-sm font-medium">Doses due</span>
      </div>
      <div className="space-y-2">
        {doses.map(d => {
          const scheduled = new Date(d.scheduled_at);
          const overdue = d.late_minutes > 0;
          const graceExpired = d.late_minutes > 120;
          return (
            <div
              key={d.id}
              className={`p-2 rounded border ${graceExpired ? 'border-red-500/50 bg-red-950/20' : overdue ? 'border-amber-500/40 bg-amber-950/10' : 'border-gray-800 bg-gray-900/50'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div>
                  <div className="text-sm text-white font-medium">{d.medication_name}</div>
                  <div className="text-xs text-gray-400">
                    {d.dose_amount} · scheduled {scheduled.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {overdue && (graceExpired
                      ? <span className="text-red-400 ml-1">({Math.round(d.late_minutes / 60)}h past grace)</span>
                      : <span className="text-amber-400 ml-1">({d.late_minutes}min late)</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  onClick={() => markTaken(d.id, false)}
                  disabled={busyId === d.id}
                  className="py-1.5 rounded bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold flex items-center justify-center gap-1 disabled:bg-gray-700"
                >
                  {busyId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Check className="w-3 h-3" /> Taken</>}
                </button>
                <button
                  onClick={() => markTaken(d.id, true)}
                  disabled={busyId === d.id}
                  className="py-1.5 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <Camera className="w-3 h-3" /> With photo
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
