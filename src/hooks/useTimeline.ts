/**
 * useTimeline Hook
 *
 * Manages voice recordings and photo entries for tracking transformation.
 * Handles file uploads to Supabase Storage and database entries.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  VoiceEntry,
  PhotoEntry,
  TimelineEntry,
  TimelineStats,
  TimelineSettings,
  PhotoCategory,
  DbVoiceEntry,
  DbPhotoEntry,
  DbTimelineSettings,
} from '../types/timeline';
import {
  dbVoiceToVoice,
  dbPhotoToPhoto,
  dbSettingsToSettings,
  DEFAULT_PHRASE,
  getWeekNumber,
  getDayNumber,
} from '../types/timeline';

export interface UseTimelineReturn {
  // Entries
  voiceEntries: VoiceEntry[];
  photoEntries: PhotoEntry[];
  allEntries: TimelineEntry[];

  // Stats
  stats: TimelineStats | null;

  // Settings
  settings: TimelineSettings;

  // Comparisons
  voiceComparison: { first: VoiceEntry | null; latest: VoiceEntry | null } | null;
  photoComparison: (category: PhotoCategory) => { first: PhotoEntry | null; latest: PhotoEntry | null };

  // State
  loading: boolean;
  uploading: boolean;
  error: string | null;

  // Journey info
  currentWeek: number;
  currentDay: number;
  journeyStartDate: Date | null;

  // Actions
  addVoiceEntry: (audioBlob: Blob, phrase: string, rating?: number, notes?: string) => Promise<VoiceEntry | null>;
  addPhotoEntry: (imageBlob: Blob, category: PhotoCategory, rating?: number, notes?: string) => Promise<PhotoEntry | null>;
  deleteVoiceEntry: (id: string) => Promise<boolean>;
  deletePhotoEntry: (id: string) => Promise<boolean>;
  updateSettings: (settings: Partial<TimelineSettings>) => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULT_SETTINGS: TimelineSettings = {
  reminderDay: 0, // Sunday
  reminderEnabled: true,
  defaultPhrase: DEFAULT_PHRASE,
  photoCategories: ['face', 'full_body'],
};

export function useTimeline(): UseTimelineReturn {
  const [voiceEntries, setVoiceEntries] = useState<VoiceEntry[]>([]);
  const [photoEntries, setPhotoEntries] = useState<PhotoEntry[]>([]);
  const [stats, setStats] = useState<TimelineStats | null>(null);
  const [settings, setSettings] = useState<TimelineSettings>(DEFAULT_SETTINGS);
  const [voiceComparison, setVoiceComparison] = useState<{ first: VoiceEntry | null; latest: VoiceEntry | null } | null>(null);
  const [photoComparisons, setPhotoComparisons] = useState<Map<PhotoCategory, { first: PhotoEntry | null; latest: PhotoEntry | null }>>(new Map());

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [journeyStartDate, setJourneyStartDate] = useState<Date | null>(null);

  // Get user ID
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    }
    getUser();
  }, []);

  // Calculate current week/day
  const currentWeek = journeyStartDate ? getWeekNumber(journeyStartDate) : 1;
  const currentDay = journeyStartDate ? getDayNumber(journeyStartDate) : 1;

  // Combine all entries sorted by date
  const allEntries: TimelineEntry[] = [
    ...voiceEntries,
    ...photoEntries,
  ].sort((a, b) => {
    const dateA = 'recordedAt' in a ? a.recordedAt : a.capturedAt;
    const dateB = 'recordedAt' in b ? b.recordedAt : b.capturedAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  // Load all data
  const loadData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      // Load entries, settings, and stats in parallel
      const [voiceResult, photoResult, settingsResult, statsResult] = await Promise.all([
        supabase
          .from('voice_entries')
          .select('*')
          .eq('user_id', userId)
          .order('recorded_at', { ascending: false }),
        supabase
          .from('photo_entries')
          .select('*')
          .eq('user_id', userId)
          .order('captured_at', { ascending: false }),
        supabase
          .from('timeline_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase.rpc('get_timeline_stats', { p_user_id: userId }),
      ]);

      // Handle voice entries
      if (!voiceResult.error) {
        const entries = (voiceResult.data as DbVoiceEntry[] || []).map(dbVoiceToVoice);
        setVoiceEntries(entries);

        // Set voice comparison
        if (entries.length > 0) {
          setVoiceComparison({
            first: entries[entries.length - 1],
            latest: entries[0],
          });
        }
      }

      // Handle photo entries
      if (!photoResult.error) {
        const entries = (photoResult.data as DbPhotoEntry[] || []).map(dbPhotoToPhoto);
        setPhotoEntries(entries);

        // Build photo comparisons by category
        const comparisons = new Map<PhotoCategory, { first: PhotoEntry | null; latest: PhotoEntry | null }>();
        const categories: PhotoCategory[] = ['face', 'full_body', 'outfit', 'hair', 'other'];

        for (const category of categories) {
          const categoryEntries = entries.filter(e => e.category === category);
          if (categoryEntries.length > 0) {
            comparisons.set(category, {
              first: categoryEntries[categoryEntries.length - 1],
              latest: categoryEntries[0],
            });
          }
        }
        setPhotoComparisons(comparisons);
      }

      // Handle settings
      if (settingsResult.error && settingsResult.error.code !== 'PGRST116') {
        console.error('Settings error:', settingsResult.error);
      } else if (settingsResult.data) {
        setSettings(dbSettingsToSettings(settingsResult.data as DbTimelineSettings));
      } else {
        // Create default settings
        await supabase
          .from('timeline_settings')
          .insert({
            user_id: userId,
            ...DEFAULT_SETTINGS,
          });
      }

      // Handle stats
      if (!statsResult.error && statsResult.data) {
        setStats(statsResult.data as TimelineStats);

        // Set journey start date from first entry
        if (statsResult.data.first_entry_date) {
          setJourneyStartDate(new Date(statsResult.data.first_entry_date));
        }
      }

    } catch (err) {
      console.error('Failed to load timeline data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Load on mount
  useEffect(() => {
    if (userId) {
      loadData();
    }
  }, [userId, loadData]);

  // Add voice entry
  const addVoiceEntry = async (
    audioBlob: Blob,
    phrase: string,
    rating?: number,
    notes?: string
  ): Promise<VoiceEntry | null> => {
    if (!userId) return null;

    setUploading(true);
    setError(null);

    try {
      // Upload audio to storage
      const fileName = `${userId}/${Date.now()}.webm`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('voice-recordings')
        .upload(fileName, audioBlob, {
          contentType: 'audio/webm',
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('voice-recordings')
        .getPublicUrl(uploadData.path);

      // Get audio duration
      const duration = await getAudioDuration(audioBlob);

      // Calculate week/day
      const startDate = journeyStartDate || new Date();
      const weekNum = getWeekNumber(startDate);
      const dayNum = getDayNumber(startDate);

      // Insert entry
      const { data: entry, error: insertError } = await supabase
        .from('voice_entries')
        .insert({
          user_id: userId,
          audio_url: urlData.publicUrl,
          audio_duration: duration,
          phrase,
          week_number: weekNum,
          day_number: dayNum,
          rating: rating || null,
          notes: notes || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const voiceEntry = dbVoiceToVoice(entry as DbVoiceEntry);

      // Update state
      setVoiceEntries(prev => [voiceEntry, ...prev]);

      // Update comparison if this is first or latest
      setVoiceComparison(prev => {
        if (!prev?.first) {
          return { first: voiceEntry, latest: voiceEntry };
        }
        return { ...prev, latest: voiceEntry };
      });

      // Set journey start if first entry
      if (!journeyStartDate) {
        setJourneyStartDate(new Date(voiceEntry.recordedAt));
      }

      return voiceEntry;

    } catch (err) {
      console.error('Failed to add voice entry:', err);
      setError(err instanceof Error ? err.message : 'Failed to save voice recording');
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Add photo entry
  const addPhotoEntry = async (
    imageBlob: Blob,
    category: PhotoCategory,
    rating?: number,
    notes?: string
  ): Promise<PhotoEntry | null> => {
    if (!userId) return null;

    setUploading(true);
    setError(null);

    try {
      // Upload image to storage
      const ext = imageBlob.type.split('/')[1] || 'jpg';
      const fileName = `${userId}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('progress-photos')
        .upload(fileName, imageBlob, {
          contentType: imageBlob.type,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('progress-photos')
        .getPublicUrl(uploadData.path);

      // Calculate week/day
      const startDate = journeyStartDate || new Date();
      const weekNum = getWeekNumber(startDate);
      const dayNum = getDayNumber(startDate);

      // Insert entry
      const { data: entry, error: insertError } = await supabase
        .from('photo_entries')
        .insert({
          user_id: userId,
          image_url: urlData.publicUrl,
          category,
          week_number: weekNum,
          day_number: dayNum,
          rating: rating || null,
          notes: notes || null,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const photoEntry = dbPhotoToPhoto(entry as DbPhotoEntry);

      // Update state
      setPhotoEntries(prev => [photoEntry, ...prev]);

      // Update comparison
      setPhotoComparisons(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(category);
        if (!existing?.first) {
          newMap.set(category, { first: photoEntry, latest: photoEntry });
        } else {
          newMap.set(category, { ...existing, latest: photoEntry });
        }
        return newMap;
      });

      // Set journey start if first entry
      if (!journeyStartDate) {
        setJourneyStartDate(new Date(photoEntry.capturedAt));
      }

      return photoEntry;

    } catch (err) {
      console.error('Failed to add photo entry:', err);
      setError(err instanceof Error ? err.message : 'Failed to save photo');
      return null;
    } finally {
      setUploading(false);
    }
  };

  // Delete voice entry
  const deleteVoiceEntry = async (id: string): Promise<boolean> => {
    try {
      const entry = voiceEntries.find(e => e.id === id);
      if (!entry) return false;

      // Delete from database
      const { error } = await supabase
        .from('voice_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Delete from storage
      const path = entry.audioUrl.split('/').slice(-2).join('/');
      await supabase.storage.from('voice-recordings').remove([path]);

      // Update state
      setVoiceEntries(prev => prev.filter(e => e.id !== id));

      return true;
    } catch (err) {
      console.error('Failed to delete voice entry:', err);
      return false;
    }
  };

  // Delete photo entry
  const deletePhotoEntry = async (id: string): Promise<boolean> => {
    try {
      const entry = photoEntries.find(e => e.id === id);
      if (!entry) return false;

      // Delete from database
      const { error } = await supabase
        .from('photo_entries')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Delete from storage
      const path = entry.imageUrl.split('/').slice(-2).join('/');
      await supabase.storage.from('progress-photos').remove([path]);

      // Update state
      setPhotoEntries(prev => prev.filter(e => e.id !== id));

      return true;
    } catch (err) {
      console.error('Failed to delete photo entry:', err);
      return false;
    }
  };

  // Update settings
  const updateSettings = async (newSettings: Partial<TimelineSettings>): Promise<void> => {
    if (!userId) return;

    const updated = { ...settings, ...newSettings };

    try {
      const { error } = await supabase
        .from('timeline_settings')
        .update({
          reminder_day: updated.reminderDay,
          reminder_enabled: updated.reminderEnabled,
          default_phrase: updated.defaultPhrase,
          photo_categories: updated.photoCategories,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      setSettings(updated);
    } catch (err) {
      console.error('Failed to update settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  // Get photo comparison by category
  const getPhotoComparison = (category: PhotoCategory) => {
    return photoComparisons.get(category) || { first: null, latest: null };
  };

  return {
    voiceEntries,
    photoEntries,
    allEntries,
    stats,
    settings,
    voiceComparison,
    photoComparison: getPhotoComparison,
    loading,
    uploading,
    error,
    currentWeek,
    currentDay,
    journeyStartDate,
    addVoiceEntry,
    addPhotoEntry,
    deleteVoiceEntry,
    deletePhotoEntry,
    updateSettings,
    refresh: loadData,
  };
}

// Helper to get audio duration
async function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = URL.createObjectURL(blob);
    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    };
    audio.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(audio.src);
    };
  });
}
