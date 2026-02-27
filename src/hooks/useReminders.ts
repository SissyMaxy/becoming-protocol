/**
 * useReminders Hook
 *
 * Manages feminization reminders throughout the day.
 * Handles scheduling, notifications, and response tracking.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type {
  Reminder,
  ReminderSettings,
  ReminderStats,
  DbReminderSettings,
} from '../types/reminders';
import {
  getRandomReminder,
  DEFAULT_REMINDER_SETTINGS,
  dbSettingsToSettings,
} from '../types/reminders';

export interface UseRemindersReturn {
  // State
  settings: ReminderSettings;
  currentReminder: Reminder | null;
  stats: ReminderStats | null;
  loading: boolean;
  error: string | null;

  // Actions
  triggerReminder: () => void;
  respondToReminder: (rating?: number, note?: string) => Promise<void>;
  skipReminder: () => Promise<void>;
  dismissReminder: () => void;
  updateSettings: (settings: Partial<ReminderSettings>) => Promise<void>;
  refresh: () => Promise<void>;

  // Notification permission
  notificationPermission: NotificationPermission | 'unsupported';
  requestNotificationPermission: () => Promise<boolean>;
}

export function useReminders(): UseRemindersReturn {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS);
  const [currentReminder, setCurrentReminder] = useState<Reminder | null>(null);
  const [stats, setStats] = useState<ReminderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');

  const reminderTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scheduledTimesRef = useRef<Date[]>([]);

  // Get user ID
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    }
    getUser();
  }, []);

  // Check notification support
  useEffect(() => {
    if (!('Notification' in window)) {
      setNotificationPermission('unsupported');
    } else {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Load settings and stats
  const loadData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    try {
      // Load settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('reminder_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (settingsError && settingsError.code !== 'PGRST116') {
        throw settingsError;
      }

      if (settingsData) {
        setSettings(dbSettingsToSettings(settingsData as DbReminderSettings));
      } else {
        // Create default settings (use snake_case for DB)
        const { data: newSettings, error: insertError } = await supabase
          .from('reminder_settings')
          .insert({
            user_id: userId,
            enabled: DEFAULT_REMINDER_SETTINGS.enabled,
            active_hours_start: DEFAULT_REMINDER_SETTINGS.activeHoursStart,
            active_hours_end: DEFAULT_REMINDER_SETTINGS.activeHoursEnd,
            frequency_per_day: DEFAULT_REMINDER_SETTINGS.frequencyPerDay,
            enabled_types: DEFAULT_REMINDER_SETTINGS.enabledTypes,
            use_notifications: DEFAULT_REMINDER_SETTINGS.useNotifications,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        if (newSettings) {
          setSettings(dbSettingsToSettings(newSettings as DbReminderSettings));
        }
      }

      // Load stats - these RPCs may not exist yet, silently skip if missing
      try {
        const { data: statsData, error: statsError } = await supabase
          .rpc('get_reminder_stats', { p_user_id: userId });

        if (!statsError && statsData) {
          // Get streak separately
          const { data: streakData } = await supabase
            .rpc('get_reminder_streak', { p_user_id: userId });

          setStats({
            ...statsData,
            streakDays: streakData || 0,
          });
        }
      } catch {
        // RPC functions may not exist - silently ignore
      }
    } catch (err) {
      console.error('Failed to load reminder data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load reminders');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadData();
    }
  }, [userId, loadData]);

  // Schedule reminders for the day
  const scheduleReminders = useCallback(() => {
    if (!settings.enabled || settings.enabledTypes.length === 0) {
      return;
    }

    const now = new Date();
    const currentHour = now.getHours();

    // Only schedule if within active hours
    if (currentHour < settings.activeHoursStart || currentHour >= settings.activeHoursEnd) {
      return;
    }

    // Calculate time slots for remaining reminders today
    const endTime = new Date(now);
    endTime.setHours(settings.activeHoursEnd, 0, 0, 0);

    const remainingMs = endTime.getTime() - now.getTime();
    if (remainingMs <= 0) return;

    // Generate random times for reminders
    const times: Date[] = [];
    const minInterval = remainingMs / (settings.frequencyPerDay + 1);

    for (let i = 0; i < settings.frequencyPerDay; i++) {
      const randomOffset = Math.random() * minInterval;
      const time = new Date(now.getTime() + (minInterval * (i + 1)) + randomOffset - (minInterval / 2));

      // Only add if in the future
      if (time > now) {
        times.push(time);
      }
    }

    scheduledTimesRef.current = times;

    // Set up the next reminder
    scheduleNextReminder();
  }, [settings]);

  // Trigger a reminder (defined before scheduleNextReminder to avoid hoisting issues)
  const triggerReminderInternal = useCallback(() => {
    const reminder = getRandomReminder(settings.enabledTypes);
    if (!reminder) return;

    setCurrentReminder(reminder);

    // Send notification if enabled
    if (settings.useNotifications && notificationPermission === 'granted') {
      sendNotification(reminder);
    }
  }, [settings, notificationPermission]);

  // Schedule the next reminder with proper cleanup
  const scheduleNextReminder = useCallback(() => {
    // Always clear existing timer before setting a new one
    if (reminderTimerRef.current) {
      clearTimeout(reminderTimerRef.current);
      reminderTimerRef.current = null;
    }

    const now = new Date();
    const nextTime = scheduledTimesRef.current.find(t => t > now);

    if (nextTime) {
      const delay = nextTime.getTime() - now.getTime();

      reminderTimerRef.current = setTimeout(() => {
        // Clear ref after execution
        reminderTimerRef.current = null;
        triggerReminderInternal();
        // Schedule next only after current completes
        scheduleNextReminder();
      }, delay);
    }
  }, [triggerReminderInternal]);

  // Public trigger (for manual testing)
  const triggerReminder = useCallback(() => {
    triggerReminderInternal();
  }, [triggerReminderInternal]);

  // Send browser notification
  const sendNotification = (_reminder: Reminder) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const notification = new Notification('BP', {
      body: 'You have a task waiting.',
      icon: '/icon-192.png',
      tag: 'bp-reminder',
      requireInteraction: true,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  };

  // Request notification permission
  const requestNotificationPermission = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      return false;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission === 'granted';
  };

  // Respond to reminder
  const respondToReminder = async (rating?: number, note?: string) => {
    if (!currentReminder || !userId) return;

    try {
      await supabase
        .from('reminder_responses')
        .insert({
          user_id: userId,
          reminder_id: currentReminder.id,
          reminder_type: currentReminder.type,
          prompt: currentReminder.prompt,
          rating: rating || null,
          skipped: false,
          note: note || null,
        });

      setCurrentReminder(null);
      await loadData(); // Refresh stats
    } catch (err) {
      console.error('Failed to record reminder response:', err);
    }
  };

  // Skip reminder
  const skipReminder = async () => {
    if (!currentReminder || !userId) return;

    try {
      await supabase
        .from('reminder_responses')
        .insert({
          user_id: userId,
          reminder_id: currentReminder.id,
          reminder_type: currentReminder.type,
          prompt: currentReminder.prompt,
          skipped: true,
        });

      setCurrentReminder(null);
      await loadData();
    } catch (err) {
      console.error('Failed to record skipped reminder:', err);
    }
  };

  // Dismiss without recording
  const dismissReminder = () => {
    setCurrentReminder(null);
  };

  // Update settings
  const updateSettings = async (newSettings: Partial<ReminderSettings>) => {
    if (!userId) return;

    const updated = { ...settings, ...newSettings };

    try {
      const { error: updateError } = await supabase
        .from('reminder_settings')
        .update({
          enabled: updated.enabled,
          active_hours_start: updated.activeHoursStart,
          active_hours_end: updated.activeHoursEnd,
          frequency_per_day: updated.frequencyPerDay,
          enabled_types: updated.enabledTypes,
          use_notifications: updated.useNotifications,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      setSettings(updated);

      // Reschedule if needed
      if (updated.enabled) {
        scheduleReminders();
      } else if (reminderTimerRef.current) {
        clearTimeout(reminderTimerRef.current);
      }
    } catch (err) {
      console.error('Failed to update reminder settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  // Initial schedule
  useEffect(() => {
    if (!loading && settings.enabled) {
      scheduleReminders();
    }

    return () => {
      if (reminderTimerRef.current) {
        clearTimeout(reminderTimerRef.current);
      }
    };
  }, [loading, settings.enabled, scheduleReminders]);

  return {
    settings,
    currentReminder,
    stats,
    loading,
    error,
    triggerReminder,
    respondToReminder,
    skipReminder,
    dismissReminder,
    updateSettings,
    refresh: loadData,
    notificationPermission,
    requestNotificationPermission,
  };
}

// Simple hook to just get current reminder
export function useCurrentReminder() {
  const { currentReminder, respondToReminder, skipReminder, dismissReminder } = useReminders();
  return { currentReminder, respondToReminder, skipReminder, dismissReminder };
}
