import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Expose for console debugging
if (typeof window !== 'undefined') {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}

// Database types
export interface DbDailyEntry {
  id: string;
  user_id: string;
  date: string;
  intensity: string;
  tasks: object;
  journal: object | null;
  created_at: string;
  updated_at: string;
}

export interface DbUserProgress {
  id: string;
  user_id: string;
  overall_streak: number;
  longest_streak: number;
  total_days: number;
  domain_progress: object;
  phase: object;
  last_active_date: string | null;
  updated_at: string;
}
