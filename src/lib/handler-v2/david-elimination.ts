/**
 * David Elimination Protocol
 *
 * Maps every masculine context, prescribes infiltrations,
 * tracks David's shrinking footprint.
 */

import { supabase } from '../supabase';

export async function initializeMasculineContexts(userId: string): Promise<number> {
  const contexts = [
    { context_name: 'Work meetings', category: 'professional', current_presentation: 'fully_masculine', hours_per_week: 15, current_infiltrations: [], next_infiltration: 'Soften email signature to first name only' },
    { context_name: 'Work email/chat', category: 'professional', current_presentation: 'fully_masculine', hours_per_week: 10, current_infiltrations: [], next_infiltration: 'Warmer sign-off style' },
    { context_name: 'Grocery/errands', category: 'public', current_presentation: 'fully_masculine', hours_per_week: 3, current_infiltrations: [], next_infiltration: 'Androgynous clothing for errands' },
    { context_name: 'Home with Gina', category: 'domestic', current_presentation: 'masculine_with_leakage', hours_per_week: 30, current_infiltrations: ['skincare visible', 'softer clothing', 'scent changed'], next_infiltration: 'Nail care visible' },
    { context_name: 'Home alone', category: 'domestic', current_presentation: 'feminine_leaning', hours_per_week: 20, current_infiltrations: ['full_presentation', 'voice_practice', 'content_creation'], next_infiltration: 'Default to feminine immediately on privacy' },
    { context_name: 'Gym/exercise', category: 'public', current_presentation: 'fully_masculine', hours_per_week: 4, current_infiltrations: [], next_infiltration: 'Feminine-cut workout wear' },
  ];

  let created = 0;
  for (const ctx of contexts) {
    const { error } = await supabase.from('masculine_contexts').insert({ user_id: userId, ...ctx });
    if (!error) created++;
  }
  return created;
}

export async function calculateDavidFootprint(userId: string): Promise<{
  masculineHours: number;
  feminineHours: number;
  ratio: number;
  contexts: Array<{ name: string; presentation: string; hours: number }>;
}> {
  const { data: contexts } = await supabase
    .from('masculine_contexts').select('*').eq('user_id', userId);

  let masculineHours = 0;
  let feminineHours = 0;
  const contextList: Array<{ name: string; presentation: string; hours: number }> = [];

  for (const ctx of contexts || []) {
    const hours = ctx.hours_per_week || 0;
    contextList.push({ name: ctx.context_name, presentation: ctx.current_presentation, hours });

    switch (ctx.current_presentation) {
      case 'fully_masculine': masculineHours += hours; break;
      case 'masculine_with_leakage': masculineHours += hours * 0.7; feminineHours += hours * 0.3; break;
      case 'androgynous': masculineHours += hours * 0.5; feminineHours += hours * 0.5; break;
      case 'feminine_leaning': masculineHours += hours * 0.2; feminineHours += hours * 0.8; break;
      case 'fully_feminine': feminineHours += hours; break;
    }
  }

  const total = masculineHours + feminineHours;
  return { masculineHours, feminineHours, ratio: total > 0 ? feminineHours / total : 0, contexts: contextList };
}

export async function getDavidEliminationContext(userId: string): Promise<string> {
  const footprint = await calculateDavidFootprint(userId);
  if (footprint.masculineHours === 0 && footprint.feminineHours === 0) return '';

  const pct = Math.round(footprint.ratio * 100);
  const lines = ['## David Elimination'];
  lines.push(`Feminine hours/week: ${footprint.feminineHours.toFixed(0)}`);
  lines.push(`Masculine hours/week: ${footprint.masculineHours.toFixed(0)}`);
  lines.push(`Femininity ratio: ${pct}%`);

  if (pct > 50) lines.push('She occupies more of your life than he does. David is the minority.');
  else lines.push(`David still controls ${100 - pct}% of waking hours. Every context feminized shifts this.`);

  return lines.join('\n');
}
