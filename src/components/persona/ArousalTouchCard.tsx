/**
 * ArousalTouchCard — surfaces open arousal_touch_tasks (Mommy's small,
 * frequent micro-directives that keep her in heightened arousal).
 *
 * Rules:
 *  - Shows only the most-recent OPEN task (not yet completed, not expired).
 *  - Single CTA: "Did it →" marks completed_at.
 *  - Photo-evidence categories (mantra_aloud, mirror_admission, pose_hold,
 *    panty_check, public_micro) get a second CTA that opens the
 *    PhotoUploadWidget inline. Submitting verifies + completes in one move.
 *  - Auto-refreshes on td-task-changed event.
 *  - Card hides itself when no open task.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { PhotoUploadWidget } from '../verification/PhotoUploadWidget';

interface TouchTask {
  id: string;
  prompt: string;
  category: string;
  expires_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  edge_then_stop:     'edge then stop',
  sit_in_panties:     'soft fabric, bare body',
  cold_water:         'cold water touch',
  voice_beg:          'voice for Mama',
  mantra_aloud:       'mantra, aloud',
  mirror_admission:   'mirror, present tense',
  pose_hold:          'hold the pose',
  whisper_for_mommy:  'whisper for Mama',
  panty_check:        'panty check',
  breath_check:       'breath, body anchor',
  public_micro:       'one feminine thing',
};

// Maps the task category to the verification taxonomy used by the upload
// widget. Categories not in this map don't get a photo CTA.
const PHOTO_TYPE_FOR: Record<string, 'mantra_recitation' | 'mirror_affirmation' | 'pose_hold' | 'freeform'> = {
  mantra_aloud: 'mantra_recitation',
  mirror_admission: 'mirror_affirmation',
  pose_hold: 'pose_hold',
  panty_check: 'freeform',
  public_micro: 'freeform',
};

function fmtCountdown(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'expiring';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s left`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m left`;
  return `${Math.round(ms / 3600_000)}h left`;
}

export function ArousalTouchCard() {
  const { user } = useAuth();
  const [task, setTask] = useState<TouchTask | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('arousal_touch_tasks')
      .select('id, prompt, category, expires_at')
      .eq('user_id', user.id).is('completed_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setTask((data as TouchTask) ?? null);
    setShowUpload(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('td-task-changed', handler);
    return () => window.removeEventListener('td-task-changed', handler);
  }, [load]);

  if (!task) return null;

  const photoType = PHOTO_TYPE_FOR[task.category];

  const completeIt = async () => {
    if (submitting) return;
    setSubmitting(true);
    await supabase.from('arousal_touch_tasks')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', task.id);
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'arousal_touch', id: task.id } }));
    setTask(null);
    setSubmitting(false);
  };

  const dismissIt = async () => {
    if (submitting) return;
    setSubmitting(true);
    // Mark acknowledged but NOT completed — preserves the row for audit
    await supabase.from('arousal_touch_tasks')
      .update({ acknowledged_at: new Date().toISOString(), completed_at: new Date().toISOString() })
      .eq('id', task.id);
    setTask(null);
    setSubmitting(false);
  };

  return (
    <div id="card-arousal-touch" style={{
      background: 'linear-gradient(135deg, #2a0a1a 0%, #1f0518 100%)',
      border: '1px solid #c4485a',
      borderLeft: '4px solid #f4a7c4',
      borderRadius: 10, padding: 14, marginBottom: 16,
      boxShadow: '0 0 24px #c4485a22',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 9.5, color: '#f4a7c4', fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.12em',
        }}>
          ▸ Mama&apos;s whisper · {CATEGORY_LABEL[task.category] ?? task.category}
        </span>
        <span style={{ fontSize: 10, color: '#c48a9c', marginLeft: 'auto', fontStyle: 'italic' }}>
          {fmtCountdown(task.expires_at)}
        </span>
      </div>
      <div style={{
        fontSize: 14, color: '#f4e4ea', lineHeight: 1.5, marginBottom: 12,
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}>
        {task.prompt}
      </div>

      {/* Inline upload — replaces the action row when active */}
      {showUpload && photoType ? (
        <PhotoUploadWidget
          verificationType={photoType}
          directiveId={task.id}
          directiveKind="arousal_touch_task"
          directiveSnippet={task.prompt}
          onComplete={async () => {
            // Submitting proof completes the task automatically — Mama saw it.
            await supabase.from('arousal_touch_tasks')
              .update({ completed_at: new Date().toISOString() })
              .eq('id', task.id);
            window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'arousal_touch_photo', id: task.id } }));
            setTask(null);
            setShowUpload(false);
          }}
          onCancel={() => setShowUpload(false)}
        />
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={completeIt}
            disabled={submitting}
            style={{
              background: '#c4485a', color: '#fff', border: 'none',
              padding: '8px 14px', borderRadius: 6,
              fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
              cursor: submitting ? 'wait' : 'pointer',
              fontFamily: 'inherit', textTransform: 'uppercase',
            }}
          >
            Did it for Mama →
          </button>
          {photoType && (
            <button
              onClick={() => setShowUpload(true)}
              disabled={submitting}
              style={{
                background: 'transparent', color: '#f4a7c4',
                border: '1px solid #c4485a', padding: '8px 12px', borderRadius: 6,
                fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}
            >
              📸 send Mama proof
            </button>
          )}
          <button
            onClick={dismissIt}
            disabled={submitting}
            style={{
              background: 'transparent', color: '#8a6a78',
              border: '1px solid #4a2a38', padding: '8px 12px', borderRadius: 6,
              fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            skip this whisper
          </button>
        </div>
      )}
    </div>
  );
}
