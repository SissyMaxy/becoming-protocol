import { supabase } from './supabase';

export type EvidenceType = 'photo' | 'voice' | 'video';

export interface Evidence {
  id: string;
  userId: string;
  date: string; // ISO date
  type: EvidenceType;
  domain?: string;
  taskId?: string;
  fileName: string;
  fileUrl: string;
  thumbnailUrl?: string;
  duration?: number; // For audio/video, in seconds
  notes?: string;
  createdAt: string;
}

// Upload evidence file to Supabase storage
export async function uploadEvidence(
  userId: string,
  file: File,
  type: EvidenceType,
  metadata: {
    date: string;
    domain?: string;
    taskId?: string;
    notes?: string;
  }
): Promise<Evidence | null> {
  try {
    // Generate unique file path
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${metadata.date}/${Date.now()}.${fileExt}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('evidence')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('evidence')
      .getPublicUrl(fileName);

    const fileUrl = urlData.publicUrl;

    // Create evidence record in database
    const evidence: Omit<Evidence, 'id'> = {
      userId,
      date: metadata.date,
      type,
      domain: metadata.domain,
      taskId: metadata.taskId,
      fileName,
      fileUrl,
      notes: metadata.notes,
      createdAt: new Date().toISOString()
    };

    const { data: insertData, error: insertError } = await supabase
      .from('evidence')
      .insert({
        user_id: userId,
        date: evidence.date,
        type: evidence.type,
        domain: evidence.domain,
        task_id: evidence.taskId,
        file_name: evidence.fileName,
        file_url: evidence.fileUrl,
        notes: evidence.notes
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      // Clean up uploaded file
      await supabase.storage.from('evidence').remove([fileName]);
      return null;
    }

    return {
      id: insertData.id,
      ...evidence
    };
  } catch (error) {
    console.error('Evidence upload failed:', error);
    return null;
  }
}

// Get evidence for a specific date
export async function getEvidenceByDate(userId: string, date: string): Promise<Evidence[]> {
  const { data, error } = await supabase
    .from('evidence')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching evidence:', error);
    return [];
  }

  return (data || []).map(mapDbToEvidence);
}

// Get all evidence for a user
export async function getAllEvidence(userId: string): Promise<Evidence[]> {
  const { data, error } = await supabase
    .from('evidence')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching evidence:', error);
    return [];
  }

  return (data || []).map(mapDbToEvidence);
}

// Get evidence by domain
export async function getEvidenceByDomain(userId: string, domain: string): Promise<Evidence[]> {
  const { data, error } = await supabase
    .from('evidence')
    .select('*')
    .eq('user_id', userId)
    .eq('domain', domain)
    .order('date', { ascending: false });

  if (error) {
    console.error('Error fetching evidence:', error);
    return [];
  }

  return (data || []).map(mapDbToEvidence);
}

// Delete evidence
export async function deleteEvidence(userId: string, evidenceId: string): Promise<boolean> {
  // Get the evidence record first
  const { data: evidence, error: fetchError } = await supabase
    .from('evidence')
    .select('*')
    .eq('id', evidenceId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !evidence) {
    console.error('Evidence not found:', fetchError);
    return false;
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('evidence')
    .remove([evidence.file_name]);

  if (storageError) {
    console.error('Storage delete error:', storageError);
  }

  // Delete from database
  const { error: deleteError } = await supabase
    .from('evidence')
    .delete()
    .eq('id', evidenceId)
    .eq('user_id', userId);

  if (deleteError) {
    console.error('Database delete error:', deleteError);
    return false;
  }

  return true;
}

// Map database record to Evidence type
function mapDbToEvidence(data: Record<string, unknown>): Evidence {
  return {
    id: data.id as string,
    userId: data.user_id as string,
    date: data.date as string,
    type: data.type as EvidenceType,
    domain: data.domain as string | undefined,
    taskId: data.task_id as string | undefined,
    fileName: data.file_name as string,
    fileUrl: data.file_url as string,
    thumbnailUrl: data.thumbnail_url as string | undefined,
    duration: data.duration as number | undefined,
    notes: data.notes as string | undefined,
    createdAt: data.created_at as string
  };
}

// Helper to get file type from MIME
export function getEvidenceTypeFromMime(mimeType: string): EvidenceType {
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('audio/')) return 'voice';
  if (mimeType.startsWith('video/')) return 'video';
  return 'photo'; // default
}

// Calculate storage used by user
export async function getStorageUsed(userId: string): Promise<number> {
  const { data, error } = await supabase.storage
    .from('evidence')
    .list(userId);

  if (error) {
    console.error('Error getting storage:', error);
    return 0;
  }

  // This is a simplified version - actual file sizes would need additional API calls
  return data?.length || 0;
}
