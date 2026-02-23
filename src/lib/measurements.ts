/**
 * Measurement library — photo CRUD and convenience re-exports
 * from the exercise engine measurement functions.
 */

import { supabase } from './supabase';
import type { MeasurementPhoto } from '../types/measurement';

// Re-export existing measurement functions from exercise engine
export {
  getLatestMeasurement,
  saveMeasurement,
  getMeasurementCount,
  getMeasurementHistory,
} from './exercise';

// ============================================
// PHOTO ROW MAPPER
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPhotoRow(row: any): MeasurementPhoto {
  return {
    id: row.id,
    userId: row.user_id,
    measurementId: row.measurement_id,
    photoUrl: row.photo_url,
    photoType: row.photo_type,
    notes: row.notes,
    takenAt: row.taken_at,
  };
}

// ============================================
// PHOTO CRUD
// ============================================

export async function saveMeasurementPhoto(
  userId: string,
  measurementId: string,
  photoUrl: string,
  photoType: 'front' | 'side' | 'back',
): Promise<MeasurementPhoto | null> {
  const { data, error } = await supabase
    .from('measurement_photos')
    .insert({
      user_id: userId,
      measurement_id: measurementId,
      photo_url: photoUrl,
      photo_type: photoType,
    })
    .select('*')
    .single();

  if (error) {
    console.error('[Measurements] Failed to save photo:', error.message);
    return null;
  }

  return mapPhotoRow(data);
}

export async function getPhotosForMeasurement(
  measurementId: string,
): Promise<MeasurementPhoto[]> {
  const { data, error } = await supabase
    .from('measurement_photos')
    .select('*')
    .eq('measurement_id', measurementId)
    .order('taken_at', { ascending: true });

  if (error || !data) return [];
  return data.map(mapPhotoRow);
}

export async function getLatestPhotos(
  userId: string,
  limit: number = 6,
): Promise<MeasurementPhoto[]> {
  const { data, error } = await supabase
    .from('measurement_photos')
    .select('*')
    .eq('user_id', userId)
    .order('taken_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map(mapPhotoRow);
}
