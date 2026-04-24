/**
 * RationalizationPatternCard — shows Maxy's deflection patterns from the
 * rationalization-gate. Groups by category with counts + example phrases.
 * Silent if no patterns detected in 14 days.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Event {
  id: string;
  pattern_hit: string;
  pattern_category: string;
  severity: number;
  created_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  time_excuse: 'time excuses',
  emotional_excuse: 'mood excuses',
  body_excuse: 'body excuses',
  external_blame: 'blaming others',
  future_defer: '"tomorrow" deflection',
  false_agency: 'pretending it\'s your choice',
  minimization: 'minimizing',
  bargaining: 'bargaining',
  intellectualizing: 'intellectualizing',
};

const CATEGORY_COLORS: Record<string, string> = {
  time_excuse: '#f4c272',
  emotional_excuse: '#c4b5fd',
  body_excuse: '#f4a7c4',
  external_blame: '#f47272',
  future_defer: '#f47272',
  false_agency: '#f4c272',
  minimization: '#8a8690',
  bargaining: '#c4b5fd',
  intellectualizing: '#6ee7b7',
};

export function RationalizationPatternCard() {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const fourteenAgo = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data } = await supabase.from('rationalization_events')
      .select('id, pattern_hit, pattern_category, severity, created_at')
      .eq('user_id', user.id)
      .gte('created_at', fourteenAgo)
      .order('created_at', { ascending: false })
      .limit(80);
    setEvents((data || []) as Event[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (events.length === 0) return null;

  // Group by category
  const byCategory = new Map<string, { count: number; maxSeverity: number; phrases: Set<string>; lastAt: string }>();
  for (const e of events) {
    const cur = byCategory.get(e.pattern_category) || { count: 0, maxSeverity: 0, phrases: new Set(), lastAt: e.created_at };
    cur.count += 1;
    cur.maxSeverity = Math.max(cur.maxSeverity, e.severity);
    cur.phrases.add(e.pattern_hit);
    if (new Date(e.created_at).getTime() > new Date(cur.lastAt).getTime()) cur.lastAt = e.created_at;
    byCategory.set(e.pattern_category, cur);
  }

  const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1].count - a[1].count);
  const totalHits = events.length;

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4c272" strokeWidth="1.8">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4c272', fontWeight: 700 }}>
          Your deflection patterns · 14 days
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {totalHits} hits
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 10, lineHeight: 1.4 }}>
        The Handler sees these. Patterns you repeat stop being invisible. Naming them out loud is the first move that doesn't cost anything.
      </div>

      {sorted.map(([cat, data]) => {
        const label = CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ');
        const color = CATEGORY_COLORS[cat] || '#8a8690';
        const ago = Math.floor((Date.now() - new Date(data.lastAt).getTime()) / 3600000);
        const agoStr = ago < 1 ? 'just now' : ago < 24 ? `${ago}h ago` : `${Math.floor(ago / 24)}d ago`;
        const pct = Math.round((data.count / totalHits) * 100);

        return (
          <div key={cat} style={{
            background: '#0a0a0d', border: `1px solid ${color}33`,
            borderLeft: `3px solid ${color}`, borderRadius: 5,
            padding: '7px 9px', marginBottom: 5,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
              <span style={{ fontSize: 10, color: '#8a8690' }}>×{data.count} · {pct}%</span>
              <span style={{ fontSize: 9.5, color: '#6a656e', marginLeft: 'auto' }}>last: {agoStr}</span>
            </div>
            <div style={{ fontSize: 10.5, color: '#c8c4cc', fontStyle: 'italic', lineHeight: 1.35 }}>
              {Array.from(data.phrases).slice(0, 5).map(p => `"${p}"`).join(' · ')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
