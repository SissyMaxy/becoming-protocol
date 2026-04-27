/**
 * DmTemplateCard — saved DM templates by platform + scenario, one-tap
 * copy with variable substitution. Replaces the "save as phone note"
 * step in shot directives.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Template {
  id: string;
  label: string;
  platform: string;
  scenario: string;
  body: string;
  used_count: number;
  last_used_at: string | null;
  variables: string[];
}

const PLATFORMS = ['reddit', 'fetlife', 'sniffies', 'fansly', 'onlyfans', 'irl', 'other'];
const SCENARIOS = ['cold_outreach', 'menu_response', 'tribute_followup', 'gig_offer', 'upsell', 'shipping_confirm', 'thanks', 'objection', 'other'];

const SCENARIO_LABEL: Record<string, string> = {
  cold_outreach: 'cold outreach',
  menu_response: 'menu reply',
  tribute_followup: 'tribute followup',
  gig_offer: 'gig offer',
  upsell: 'upsell',
  shipping_confirm: 'shipping confirm',
  thanks: 'thanks',
  objection: 'objection',
  other: 'other',
};

const PLATFORM_TONE: Record<string, string> = {
  reddit: '#ff4500',
  fetlife: '#c4272d',
  sniffies: '#f4a7c4',
  fansly: '#5fc88f',
  onlyfans: '#c4b5fd',
  irl: '#f4c272',
  other: '#8a8690',
};

function extractVars(body: string): string[] {
  const matches = [...body.matchAll(/\{(\w+)\}/g)];
  return [...new Set(matches.map(m => m[1]))];
}

export function DmTemplateCard() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [adding, setAdding] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [draft, setDraft] = useState({ label: '', platform: 'reddit', scenario: 'menu_response', body: '' });
  const [substituting, setSubstituting] = useState<string | null>(null);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('dm_templates')
      .select('id, label, platform, scenario, body, used_count, last_used_at, variables')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('used_count', { ascending: false })
      .order('last_used_at', { ascending: false, nullsFirst: false });
    setTemplates((data as Template[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!user?.id || !draft.label.trim() || !draft.body.trim()) return;
    const vars = extractVars(draft.body);
    await supabase.from('dm_templates').insert({
      user_id: user.id,
      label: draft.label.slice(0, 100),
      platform: draft.platform,
      scenario: draft.scenario,
      body: draft.body,
      variables: vars,
    });
    setDraft({ label: '', platform: 'reddit', scenario: 'menu_response', body: '' });
    setAdding(false);
    load();
  };

  const startCopy = (t: Template) => {
    if (t.variables.length === 0) {
      copyText(t, t.body);
    } else {
      setSubstituting(t.id);
      setVarValues({});
    }
  };

  const completeCopy = (t: Template) => {
    let body = t.body;
    for (const v of t.variables) {
      body = body.split(`{${v}}`).join(varValues[v] || `{${v}}`);
    }
    copyText(t, body);
    setSubstituting(null);
    setVarValues({});
  };

  const copyText = async (t: Template, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(t.id);
      setTimeout(() => setCopied(c => c === t.id ? null : c), 1500);
    } catch {}
    await supabase.from('dm_templates')
      .update({ used_count: t.used_count + 1, last_used_at: new Date().toISOString() })
      .eq('id', t.id);
    load();
  };

  const archive = async (id: string) => {
    await supabase.from('dm_templates').update({ active: false }).eq('id', id);
    load();
  };

  const filtered = useMemo(() =>
    filterPlatform === 'all' ? templates : templates.filter(t => t.platform === filterPlatform),
  [templates, filterPlatform]);

  const platformsInUse = useMemo(() => Array.from(new Set(templates.map(t => t.platform))), [templates]);

  return (
    <div id="card-dm-templates" style={{
      background: 'linear-gradient(135deg, #0a141f 0%, #061018 100%)',
      border: '1px solid #2d4a5a', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="1.8">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <path d="M8 9h8M8 13h6"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#6ee7b7', fontWeight: 700 }}>
          DM templates · {templates.length}
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          One tap → clipboard
        </span>
      </div>

      {platformsInUse.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setFilterPlatform('all')}
            style={{
              padding: '3px 9px', borderRadius: 10, border: '1px solid',
              borderColor: filterPlatform === 'all' ? '#6ee7b7' : '#2d4a5a',
              background: filterPlatform === 'all' ? '#0a1a14' : 'transparent',
              color: filterPlatform === 'all' ? '#6ee7b7' : '#8a8690',
              fontSize: 9.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
            all ({templates.length})
          </button>
          {platformsInUse.map(p => {
            const count = templates.filter(t => t.platform === p).length;
            const tone = PLATFORM_TONE[p] || '#8a8690';
            return (
              <button key={p} onClick={() => setFilterPlatform(p)}
                style={{
                  padding: '3px 9px', borderRadius: 10, border: '1px solid',
                  borderColor: filterPlatform === p ? tone : '#2d4a5a',
                  background: filterPlatform === p ? '#0a0a0d' : 'transparent',
                  color: filterPlatform === p ? tone : '#8a8690',
                  fontSize: 9.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                {p} ({count})
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 && !adding && (
        <div style={{ fontSize: 11, color: '#8a8690', fontStyle: 'italic', padding: '8px 0', textAlign: 'center' }}>
          No templates yet. Save a menu, gig offer, or thanks message — one tap to retrieve later.
        </div>
      )}

      {filtered.map(t => {
        const tone = PLATFORM_TONE[t.platform] || '#8a8690';
        return (
          <div key={t.id} style={{
            padding: '8px 10px', marginBottom: 6,
            background: '#0a0a0d', border: `1px solid ${tone}33`,
            borderLeft: `3px solid ${tone}`, borderRadius: 5,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: tone, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t.platform} · {SCENARIO_LABEL[t.scenario]}
              </span>
              <span style={{ fontSize: 11, color: '#e8e6e3', fontWeight: 600 }}>{t.label}</span>
              {t.used_count > 0 && (
                <span style={{ fontSize: 9.5, color: '#5fc88f', marginLeft: 'auto' }}>
                  used {t.used_count}×
                </span>
              )}
            </div>
            <div style={{
              fontSize: 11.5, color: '#c8c4cc', lineHeight: 1.4, marginBottom: 6,
              padding: '6px 8px', background: '#050507', borderRadius: 4, border: '1px solid #1a1a20',
              whiteSpace: 'pre-wrap',
            }}>
              {t.body}
            </div>
            {substituting === t.id ? (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 9.5, color: '#c4b5fd', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                  Fill variables:
                </div>
                {t.variables.map(v => (
                  <input
                    key={v}
                    value={varValues[v] || ''}
                    onChange={e => setVarValues(s => ({ ...s, [v]: e.target.value }))}
                    placeholder={`{${v}}`}
                    style={{
                      width: '100%', background: '#050507', border: '1px solid #2d4a5a',
                      borderRadius: 4, padding: '4px 7px', fontSize: 11, color: '#e8e6e3',
                      fontFamily: 'inherit', marginBottom: 4,
                    }}
                  />
                ))}
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={() => completeCopy(t)}
                    style={{
                      flex: 1, padding: '5px 10px', borderRadius: 4, border: 'none',
                      background: '#5fc88f', color: '#0a1a14',
                      fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      textTransform: 'uppercase',
                    }}>
                    Copy filled
                  </button>
                  <button onClick={() => setSubstituting(null)}
                    style={{
                      padding: '5px 10px', borderRadius: 4, background: 'transparent',
                      border: '1px solid #2d4a5a', color: '#8a8690', fontSize: 10,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => startCopy(t)}
                  style={{
                    flex: 1, padding: '5px 10px', borderRadius: 4, border: 'none',
                    background: copied === t.id ? '#5fc88f' : tone,
                    color: copied === t.id ? '#0a1a14' : '#0a0a0d',
                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    textTransform: 'uppercase',
                  }}>
                  {copied === t.id ? 'copied' : t.variables.length > 0 ? `Fill ${t.variables.length} vars + copy` : 'Copy'}
                </button>
                <button onClick={() => archive(t.id)}
                  style={{
                    padding: '5px 10px', borderRadius: 4, background: 'transparent',
                    border: '1px solid #2d4a5a', color: '#8a8690', fontSize: 10,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  archive
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!adding ? (
        <button onClick={() => setAdding(true)}
          style={{
            marginTop: 8, width: '100%', padding: 7, borderRadius: 5,
            border: '1px dashed #2d4a5a', background: 'transparent',
            color: '#6ee7b7', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
          + Save a template
        </button>
      ) : (
        <div style={{
          marginTop: 8, padding: 10, background: '#0a0a0d',
          border: '1px solid #2d4a5a', borderRadius: 5,
        }}>
          <input
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder="label (e.g. Reddit menu reply)"
            style={{
              width: '100%', background: '#050507', border: '1px solid #22222a',
              borderRadius: 4, padding: '5px 8px', fontSize: 11, color: '#e8e6e3',
              fontFamily: 'inherit', marginBottom: 5,
            }}
          />
          <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
            <select value={draft.platform} onChange={e => setDraft(d => ({ ...d, platform: e.target.value }))}
              style={{
                flex: 1, background: '#050507', border: '1px solid #22222a',
                borderRadius: 4, padding: '5px 8px', fontSize: 11, color: '#e8e6e3',
                fontFamily: 'inherit',
              }}>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={draft.scenario} onChange={e => setDraft(d => ({ ...d, scenario: e.target.value }))}
              style={{
                flex: 1, background: '#050507', border: '1px solid #22222a',
                borderRadius: 4, padding: '5px 8px', fontSize: 11, color: '#e8e6e3',
                fontFamily: 'inherit',
              }}>
              {SCENARIOS.map(s => <option key={s} value={s}>{SCENARIO_LABEL[s]}</option>)}
            </select>
          </div>
          <textarea
            value={draft.body}
            onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
            placeholder="template body. use {variable_name} for slots like {handle} or {price}."
            rows={3}
            style={{
              width: '100%', background: '#050507', border: '1px solid #22222a',
              borderRadius: 4, padding: '5px 8px', fontSize: 11, color: '#e8e6e3',
              fontFamily: 'inherit', resize: 'vertical', marginBottom: 5,
            }}
          />
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={save} disabled={!draft.label.trim() || !draft.body.trim()}
              style={{
                flex: 1, padding: 7, borderRadius: 4, border: 'none',
                background: (draft.label.trim() && draft.body.trim()) ? '#6ee7b7' : '#22222a',
                color: (draft.label.trim() && draft.body.trim()) ? '#0a1a14' : '#5a5560',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                textTransform: 'uppercase',
              }}>
              Save
            </button>
            <button onClick={() => setAdding(false)}
              style={{
                padding: '7px 12px', borderRadius: 4, background: 'transparent',
                border: '1px solid #2d4a5a', color: '#8a8690', fontSize: 10,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
