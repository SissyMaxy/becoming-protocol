/**
 * Sexting — Template Management
 *
 * Message templates for Handler AI to use in fan conversations.
 * Supports variable substitution and tier-based filtering.
 */

import { supabase } from '../supabase';
import type { SextingTemplate, TemplateCategory } from '../../types/sexting';
import { mapTemplate } from '../../types/sexting';

// ── Get templates ───────────────────────────────────────

export async function getTemplates(
  userId: string,
  category?: TemplateCategory
): Promise<SextingTemplate[]> {
  let query = supabase
    .from('sexting_templates')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('effectiveness_score', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data || []).map((r) => mapTemplate(r as Record<string, unknown>));
}

// ── Render template with variable substitution ──────────

export function renderTemplate(
  template: SextingTemplate,
  vars: Record<string, string>
): string {
  let text = template.template_text;
  for (const [key, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return text;
}

// ── Record template usage ───────────────────────────────

export async function recordTemplateUsage(templateId: string): Promise<void> {
  const { data: current } = await supabase
    .from('sexting_templates')
    .select('usage_count')
    .eq('id', templateId)
    .single();

  if (!current) return;

  await supabase
    .from('sexting_templates')
    .update({ usage_count: (current.usage_count as number) + 1 })
    .eq('id', templateId);
}

// ── Create template ─────────────────────────────────────

export async function createTemplate(
  userId: string,
  template: {
    category: TemplateCategory;
    template_text: string;
    variables?: Record<string, string>;
    tier_minimum?: string;
  }
): Promise<SextingTemplate | null> {
  const { data, error } = await supabase
    .from('sexting_templates')
    .insert({
      user_id: userId,
      category: template.category,
      template_text: template.template_text,
      variables: template.variables || null,
      tier_minimum: template.tier_minimum || 'casual',
    })
    .select('*')
    .single();

  if (error) {
    console.error('[sexting] createTemplate error:', error);
    return null;
  }
  return mapTemplate(data as Record<string, unknown>);
}

// ── Seed default templates ──────────────────────────────

export async function seedDefaultTemplates(userId: string): Promise<void> {
  const defaults: Array<{ category: TemplateCategory; template_text: string; variables?: Record<string, string> }> = [
    {
      category: 'greeting',
      template_text: 'Hey {{fan_name}}! 💕 Thanks for reaching out~',
      variables: { fan_name: 'Name' },
    },
    {
      category: 'tip_thanks',
      template_text: 'Omg {{fan_name}} you\'re so sweet! 🥰 That tip made my day~ You\'re definitely getting something special later 💋',
      variables: { fan_name: 'Name', last_tip: 'Amount' },
    },
    {
      category: 'flirty',
      template_text: 'I was just thinking about you~ 💭 What are you up to tonight? 😏',
    },
    {
      category: 'tease',
      template_text: 'I just took the cutest pics but idk if you can handle them 🙈',
    },
    {
      category: 'media_offer',
      template_text: 'I have something special I think you\'d love 📸 Want a sneak peek? 👀',
    },
    {
      category: 'gfe_morning',
      template_text: 'Good morning {{fan_name}}~ ☀️ I just woke up and you were the first person I thought of 🥰',
      variables: { fan_name: 'Name' },
    },
    {
      category: 'gfe_goodnight',
      template_text: 'Goodnight {{fan_name}} 🌙 Sweet dreams about me okay? 💋✨',
      variables: { fan_name: 'Name' },
    },
    {
      category: 'boundary',
      template_text: 'Haha that\'s a bit much babe~ Let\'s keep things fun okay? 💕',
    },
  ];

  // Check if templates already exist
  const { count } = await supabase
    .from('sexting_templates')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (count && count > 0) return; // Already seeded

  const inserts = defaults.map((t) => ({
    user_id: userId,
    category: t.category,
    template_text: t.template_text,
    variables: t.variables || null,
  }));

  await supabase.from('sexting_templates').insert(inserts);
}
