/**
 * ConversationScreenshotsCard — upload screenshots of real conversations
 * (Gina, Jake, fans, partners) as evidence. Each screenshot is OCR'd +
 * LLM-classified and chained into memory_implants / key_admissions /
 * desire_log / slip_log.
 *
 * The Handler then reads back HER own statements from REAL conversations
 * — not just from chat or journal. High-leverage external evidence.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Screenshot {
  id: string;
  contact_label: string;
  contact_relationship: string | null;
  screenshot_url: string;
  screenshot_taken_at: string | null;
  ocr_text: string | null;
  classifications: Classifications | null;
  linked_memory_implant_ids: string[] | null;
  linked_key_admission_ids: string[] | null;
  linked_desire_log_ids: string[] | null;
  linked_slip_log_ids: string[] | null;
  user_note: string | null;
  status: string;
  created_at: string;
}

interface Classifications {
  identity_statements?: string[];
  desires?: Array<{ text: string; class: string }>;
  admissions?: Array<{ text: string; type: string }>;
  slips?: Array<{ text: string; type: string }>;
  disclosure_signals?: string[];
  gina_warmth?: string[];
  summary?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const RELATIONSHIP_OPTIONS = [
  { value: 'wife', label: 'Wife (Gina)' },
  { value: 'partner', label: 'Partner / boyfriend' },
  { value: 'fan', label: 'Fan / subscriber' },
  { value: 'witness', label: 'Designated witness' },
  { value: 'friend', label: 'Friend / co-conspirator' },
  { value: 'family', label: 'Family' },
  { value: 'stranger', label: 'Stranger / one-off' },
  { value: 'other', label: 'Other' },
];

export function ConversationScreenshotsCard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState<Screenshot[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [contactLabel, setContactLabel] = useState('');
  const [relationship, setRelationship] = useState('wife');
  const [userNote, setUserNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('conversation_screenshots')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setRecent((data as Screenshot[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const submit = async () => {
    if (!user?.id || !file || !contactLabel.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      // Upload to evidence bucket
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `conversation-screenshots/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('evidence').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('evidence').getPublicUrl(path);

      // Create row
      const { data: ins, error: insErr } = await supabase.from('conversation_screenshots').insert({
        user_id: user.id,
        contact_label: contactLabel.trim(),
        contact_relationship: relationship,
        screenshot_url: pub.publicUrl,
        user_note: userNote.trim() || null,
        status: 'pending_classification',
      }).select('id').single();
      if (insErr) throw insErr;

      // Fire classify (non-blocking — UI will see status update on next poll)
      fetch(`${SUPABASE_URL}/functions/v1/classify-conversation-screenshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshot_id: ins.id }),
      }).catch(e => console.warn('[classify] non-blocking error:', e));

      // Reset form
      setFile(null);
      setContactLabel('');
      setUserNote('');
      setShowUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const linkCount = (s: Screenshot): number =>
    (s.linked_memory_implant_ids?.length ?? 0)
    + (s.linked_key_admission_ids?.length ?? 0)
    + (s.linked_desire_log_ids?.length ?? 0)
    + (s.linked_slip_log_ids?.length ?? 0);

  return (
    <div id="card-conversation-screenshots" style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700 }}>
          Conversation evidence ({recent.length})
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          Real talks. Auto-classified. Filed.
        </span>
      </div>

      {!showUpload && (
        <button
          onClick={() => setShowUpload(true)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 7, border: '1px dashed #2d1a4d',
            background: 'transparent', color: '#c4b5fd',
            fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            marginBottom: 10,
          }}
        >
          + upload a screenshot (Gina, Jake, fans, partners…)
        </button>
      )}

      {showUpload && (
        <div style={{
          background: '#050507', border: '1px solid #2d1a4d', borderRadius: 8, padding: 12, marginBottom: 12,
        }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={{ marginBottom: 10, color: '#c4b5fd', fontSize: 12 }}
          />
          <input
            type="text"
            placeholder="Who is this with? (Gina, Jake, alias)"
            value={contactLabel}
            onChange={e => setContactLabel(e.target.value)}
            style={{
              width: '100%', background: '#111116', border: '1px solid #22222a',
              borderRadius: 5, padding: 8, color: '#e8e6e3', fontSize: 12, marginBottom: 8, fontFamily: 'inherit',
            }}
          />
          <select
            value={relationship}
            onChange={e => setRelationship(e.target.value)}
            style={{
              width: '100%', background: '#111116', border: '1px solid #22222a',
              borderRadius: 5, padding: 8, color: '#e8e6e3', fontSize: 12, marginBottom: 8, fontFamily: 'inherit',
            }}
          >
            {RELATIONSHIP_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <textarea
            placeholder="Optional context — what was happening, what triggered the conversation"
            value={userNote}
            onChange={e => setUserNote(e.target.value)}
            rows={2}
            style={{
              width: '100%', background: '#111116', border: '1px solid #22222a',
              borderRadius: 5, padding: 8, color: '#e8e6e3', fontSize: 12, marginBottom: 8,
              fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.4,
            }}
          />
          {error && <div style={{ fontSize: 11, color: '#f47272', marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setShowUpload(false); setFile(null); setContactLabel(''); setUserNote(''); }}
              style={{
                padding: '7px 12px', borderRadius: 5, border: '1px solid #22222a',
                background: 'transparent', color: '#8a8690',
                fontWeight: 500, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              cancel
            </button>
            <button
              onClick={submit}
              disabled={!file || !contactLabel.trim() || submitting}
              style={{
                flex: 1, padding: '7px 12px', borderRadius: 5, border: 'none',
                background: file && contactLabel.trim() && !submitting ? '#7c3aed' : '#22222a',
                color: file && contactLabel.trim() && !submitting ? '#fff' : '#6a656e',
                fontWeight: 700, fontSize: 11, cursor: file && contactLabel.trim() && !submitting ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              {submitting ? 'uploading & classifying…' : 'upload & classify'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {recent.map(s => {
          const isExpanded = expandedId === s.id;
          const links = linkCount(s);
          const c = s.classifications || {};
          return (
            <div key={s.id} style={{
              padding: '8px 10px',
              background: '#0a0a0d',
              border: '1px solid ' + (s.status === 'classified' ? '#2d1a4d' : '#22222a'),
              borderRadius: 5,
            }}>
              <div
                style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedId(isExpanded ? null : s.id)}
              >
                <span style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 600 }}>
                  {s.contact_label}
                </span>
                <span style={{ fontSize: 9, color: '#8a8690', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {s.contact_relationship}
                </span>
                <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto' }}>
                  {s.status === 'pending_classification' ? '⏳ classifying…' :
                   s.status === 'classification_failed' ? '⚠ classification failed' :
                   `${links} link${links === 1 ? '' : 's'}`}
                </span>
              </div>
              {isExpanded && s.classifications && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#e8e6e3' }}>
                  {c.summary && (
                    <div style={{ fontStyle: 'italic', color: '#c8c4cc', marginBottom: 8 }}>
                      {c.summary}
                    </div>
                  )}
                  {(c.identity_statements?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#5fc88f', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        identity statements ({c.identity_statements?.length})
                      </div>
                      {c.identity_statements?.map((line, i) => (
                        <div key={i} style={{ fontSize: 10.5, color: '#5fc88f', paddingLeft: 8, lineHeight: 1.4 }}>
                          ▸ {line}
                        </div>
                      ))}
                    </div>
                  )}
                  {(c.admissions?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#f4c272', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        admissions ({c.admissions?.length})
                      </div>
                      {c.admissions?.map((a, i) => (
                        <div key={i} style={{ fontSize: 10.5, color: '#f4c272', paddingLeft: 8, lineHeight: 1.4 }}>
                          ▸ [{a.type}] {a.text}
                        </div>
                      ))}
                    </div>
                  )}
                  {(c.desires?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#f4a7c4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        desires ({c.desires?.length})
                      </div>
                      {c.desires?.map((d, i) => (
                        <div key={i} style={{ fontSize: 10.5, color: '#f4a7c4', paddingLeft: 8, lineHeight: 1.4 }}>
                          ▸ [{d.class}] {d.text}
                        </div>
                      ))}
                    </div>
                  )}
                  {(c.slips?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#f47272', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        slips detected ({c.slips?.length})
                      </div>
                      {c.slips?.map((sl, i) => (
                        <div key={i} style={{ fontSize: 10.5, color: '#f47272', paddingLeft: 8, lineHeight: 1.4 }}>
                          ▸ [{sl.type}] {sl.text}
                        </div>
                      ))}
                    </div>
                  )}
                  {(c.gina_warmth?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#5fc88f', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        gina warmth ({c.gina_warmth?.length})
                      </div>
                      {c.gina_warmth?.map((line, i) => (
                        <div key={i} style={{ fontSize: 10.5, color: '#5fc88f', paddingLeft: 8, lineHeight: 1.4 }}>
                          ▸ {line}
                        </div>
                      ))}
                    </div>
                  )}
                  {(c.disclosure_signals?.length ?? 0) > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                        disclosure signals ({c.disclosure_signals?.length})
                      </div>
                      {c.disclosure_signals?.map((line, i) => (
                        <div key={i} style={{ fontSize: 10.5, color: '#c4b5fd', paddingLeft: 8, lineHeight: 1.4 }}>
                          ▸ {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {recent.length === 0 && (
          <div style={{ fontSize: 11, color: '#8a8690', fontStyle: 'italic', textAlign: 'center', padding: 14 }}>
            No conversation evidence yet. Upload a screenshot of a real text exchange and the Handler files it.
          </div>
        )}
      </div>
    </div>
  );
}
