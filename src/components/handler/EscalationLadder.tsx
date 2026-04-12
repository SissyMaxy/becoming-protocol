import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const LADDER_RUNGS = [
  { level: 1, name: 'Awareness', description: 'Accepted the system exists', markers: ['first_login'] },
  { level: 2, name: 'Compliance', description: 'Completing basic tasks', markers: ['task_streak_3'] },
  { level: 3, name: 'Submission', description: 'Following Handler without resistance', markers: ['low_resistance_7d'] },
  { level: 4, name: 'Voice', description: 'Feminine voice becoming natural', markers: ['pitch_above_160'] },
  { level: 5, name: 'Presentation', description: 'Wearing feminine items regularly', markers: ['outfit_streak_7'] },
  { level: 6, name: 'Identity', description: 'Maxy > David in daily expression', markers: ['displacement_above_60'] },
  { level: 7, name: 'Social', description: 'Public feminine presence established', markers: ['social_posts_20'] },
  { level: 8, name: 'Embodiment', description: 'Physical feminization in progress', markers: ['appearance_changes'] },
  { level: 9, name: 'Integration', description: 'Feminine identity is default', markers: ['displacement_above_80'] },
  { level: 10, name: 'Irreversible', description: 'Point of no return passed', markers: ['commitment_floors_5'] },
];

export function EscalationLadder() {
  const { user } = useAuth();
  const [currentLevel, setCurrentLevel] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    async function calculate() {
      setLoading(true);
      try {
        const [displacement, pitchSamples, photos, posts, floors] = await Promise.allSettled([
          supabase.from('identity_displacement_log').select('displacement_score').eq('user_id', user!.id).order('log_date', { ascending: false }).limit(1),
          supabase.from('voice_pitch_samples').select('pitch_hz').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(10),
          supabase.from('verification_photos').select('id', { count: 'exact', head: true }).eq('user_id', user!.id),
          supabase.from('ai_generated_content').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'posted'),
          supabase.from('commitment_floors').select('id', { count: 'exact', head: true }).eq('user_id', user!.id),
        ]);

        let level = 1;

        // Always at least level 1 (they're using the app)
        level = 2; // Awareness → Compliance (using the system)

        const dispScore = displacement.status === 'fulfilled' ? parseFloat(displacement.value.data?.[0]?.displacement_score || '0') : 0;
        const avgPitch = pitchSamples.status === 'fulfilled' && pitchSamples.value.data?.length
          ? pitchSamples.value.data.reduce((s: number, p: any) => s + p.pitch_hz, 0) / pitchSamples.value.data.length
          : 0;
        const photoCount = photos.status === 'fulfilled' ? (photos.value.count || 0) : 0;
        const postCount = posts.status === 'fulfilled' ? (posts.value.count || 0) : 0;
        const floorCount = floors.status === 'fulfilled' ? (floors.value.count || 0) : 0;

        if (photoCount >= 1) level = Math.max(level, 3);
        if (avgPitch >= 160) level = Math.max(level, 4);
        if (photoCount >= 7) level = Math.max(level, 5);
        if (dispScore >= 0.6) level = Math.max(level, 6);
        if (postCount >= 20) level = Math.max(level, 7);
        if (dispScore >= 0.8) level = Math.max(level, 9);
        if (floorCount >= 5) level = Math.max(level, 10);

        setCurrentLevel(level);
      } catch {
        // Default
      } finally {
        setLoading(false);
      }
    }

    calculate();
  }, [user?.id]);

  if (loading) return null;

  return (
    <div className="p-6 space-y-3">
      <h2 className="text-xl font-bold text-white">Transformation Ladder</h2>
      <p className="text-xs text-gray-500">Current level: {currentLevel}/10. This only goes up.</p>

      <div className="space-y-1">
        {LADDER_RUNGS.map((rung) => {
          const reached = currentLevel >= rung.level;
          const current = currentLevel === rung.level;
          return (
            <div
              key={rung.level}
              className={`flex items-center gap-3 p-2 rounded-lg ${
                current ? 'bg-purple-600/30 border border-purple-500/50' :
                reached ? 'bg-purple-900/20' : 'bg-gray-900/50'
              }`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                reached ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-600'
              }`}>
                {rung.level}
              </div>
              <div>
                <p className={`text-sm font-medium ${reached ? 'text-white' : 'text-gray-600'}`}>
                  {rung.name}
                </p>
                <p className={`text-xs ${reached ? 'text-gray-400' : 'text-gray-700'}`}>
                  {rung.description}
                </p>
              </div>
              {current && (
                <span className="ml-auto text-xs text-purple-400 font-medium">YOU ARE HERE</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
