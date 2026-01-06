// Hook for Time Ratchets - psychological anchors using sunk time

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { profileStorage } from '../lib/storage';
import type { TimeRatchets, ServiceLogEntry, ServiceLogInput } from '../types/time-ratchets';
import { daysSince } from '../types/time-ratchets';

interface UseTimeRatchetsReturn {
  ratchets: TimeRatchets | null;
  recentServices: ServiceLogEntry[];
  isLoading: boolean;
  error: string | null;

  // Actions
  logService: (input?: ServiceLogInput) => Promise<void>;
  updateRatchetDates: (updates: {
    goddessName?: string;
    servingSince?: string;
    eggCrackedDate?: string;
  }) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTimeRatchets(): UseTimeRatchetsReturn {
  const [ratchets, setRatchets] = useState<TimeRatchets | null>(null);
  const [recentServices, setRecentServices] = useState<ServiceLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRatchets = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Load profile data
      const profile = await profileStorage.getProfile();

      // Load service count
      const { data: serviceCountData } = await supabase
        .rpc('get_service_count', { p_user_id: user.id });

      // Load recent services
      const { data: servicesData } = await supabase
        .from('service_log')
        .select('*')
        .eq('user_id', user.id)
        .order('served_at', { ascending: false })
        .limit(10);

      const ratchetData: TimeRatchets = {
        userName: profile?.preferredName || null,
        goddessName: profile?.goddessName || null,
        servingSince: profile?.servingSince || null,
        eggCrackedDate: profile?.eggCrackedDate || null,
        protocolStartDate: profile?.protocolStartDate || null,
        daysServing: daysSince(profile?.servingSince || null),
        daysSinceEggCrack: daysSince(profile?.eggCrackedDate || null),
        daysInProtocol: daysSince(profile?.protocolStartDate || null),
        serviceCount: serviceCountData || 0,
      };

      setRatchets(ratchetData);
      setRecentServices((servicesData || []).map(mapDbToServiceLog));
    } catch (err) {
      console.error('Failed to load time ratchets:', err);
      setError(err instanceof Error ? err.message : 'Failed to load ratchets');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRatchets();
  }, [loadRatchets]);

  const logService = useCallback(async (input?: ServiceLogInput) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await supabase.rpc('log_service', {
        p_user_id: user.id,
        p_service_type: input?.serviceType || 'general',
        p_description: input?.description || null,
        p_duration_minutes: input?.durationMinutes || null,
        p_task_id: input?.taskId || null,
      });

      // Refresh to get updated count
      await loadRatchets();
    } catch (err) {
      console.error('Failed to log service:', err);
      throw err;
    }
  }, [loadRatchets]);

  const updateRatchetDates = useCallback(async (updates: {
    goddessName?: string;
    servingSince?: string;
    eggCrackedDate?: string;
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const dbUpdates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.goddessName !== undefined) {
        dbUpdates.goddess_name = updates.goddessName || null;
      }
      if (updates.servingSince !== undefined) {
        dbUpdates.serving_since = updates.servingSince || null;
      }
      if (updates.eggCrackedDate !== undefined) {
        dbUpdates.egg_cracked_date = updates.eggCrackedDate || null;
      }

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update(dbUpdates)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Refresh
      await loadRatchets();
    } catch (err) {
      console.error('Failed to update ratchet dates:', err);
      throw err;
    }
  }, [loadRatchets]);

  return {
    ratchets,
    recentServices,
    isLoading,
    error,
    logService,
    updateRatchetDates,
    refresh: loadRatchets,
  };
}

function mapDbToServiceLog(db: Record<string, unknown>): ServiceLogEntry {
  return {
    id: db.id as string,
    userId: db.user_id as string,
    serviceType: db.service_type as string,
    description: db.description as string | undefined,
    servedAt: db.served_at as string,
    durationMinutes: db.duration_minutes as number | undefined,
    taskId: db.task_id as string | undefined,
    createdAt: db.created_at as string,
  };
}
