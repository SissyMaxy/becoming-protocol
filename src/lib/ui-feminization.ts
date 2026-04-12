import { supabase } from './supabase';

interface FeminizationTheme {
  accentHue: number;
  accentSaturation: number;
  bgTint: string;
  fontWeight: string;
}

export async function getAdaptiveTheme(userId: string): Promise<FeminizationTheme> {
  try {
    const { data } = await supabase
      .from('identity_displacement_log')
      .select('displacement_score')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const score = data?.displacement_score ? parseFloat(data.displacement_score) : 0;

    const hue = 270 - (score * 50);
    const sat = 50 + (score * 30);

    return {
      accentHue: hue,
      accentSaturation: sat,
      bgTint: score > 0.6 ? 'rgba(255, 192, 203, 0.03)' : 'transparent',
      fontWeight: score > 0.7 ? '300' : '400',
    };
  } catch {
    return { accentHue: 270, accentSaturation: 50, bgTint: 'transparent', fontWeight: '400' };
  }
}
