/**
 * SideQuestCard — the trojan horse's drift surface.
 *
 * The app is a fitness tracker; this is the "side quest" riding the fitness
 * habit. It shows the current unlockable quest (from side_quest_next, gated by
 * cumulative fitness sessions) and the pull toward the next locked rung. Low
 * quests are innocent fitness; they DRIFT toward feminine embodiment → arousal
 * pairing → turning-out as her session count climbs. Gated on
 * conditioning_gate('recondition') so the safeword ejects the whole drift.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Quest {
  quest_key: string;
  corruption_level: number;
  category: string;
  title: string;
  body: string;
  proof_kind: string;
}
interface Progress { sessions: number; next_unlock_at: number | null; completed: number; }

const CAT_LABEL: Record<string, string> = {
  fitness: 'Warm-up', body: 'Shaping', feminine: 'Becoming', arousal: 'Wanting', turnout: 'Wanted',
};

export function SideQuestCard() {
  const { user } = useAuth();
  const [gated, setGated] = useState<boolean | null>(null);
  const [quest, setQuest] = useState<Quest | null>(null);
  const [prog, setProg] = useState<Progress | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    try {
      const gate = await supabase.rpc('conditioning_gate', { uid: user.id, system: 'recondition' });
      const allowed = (gate.data as { allow?: boolean } | null)?.allow === true;
      setGated(!allowed);
      if (!allowed) return;
      const [q, p] = await Promise.all([
        supabase.rpc('side_quest_next', { p_user: user.id }),
        supabase.rpc('side_quest_progress', { p_user: user.id }),
      ]);
      const row = Array.isArray(q.data) ? q.data[0] : q.data;
      setQuest((row as Quest) ?? null);
      setProg((p.data as Progress) ?? null);
    } catch { setGated(true); }
  };
  useEffect(() => {
    load();
    const onLogged = () => load();
    window.addEventListener('fitness-logged', onLogged);
    return () => window.removeEventListener('fitness-logged', onLogged);
    /* eslint-disable-next-line */
  }, [user?.id]);

  if (gated === null || gated) return null;   // loading or safeword/off → quiet

  const done = async () => {
    if (!user?.id || !quest || busy) return;
    setBusy(true);
    try {
      await supabase.from('side_quests').upsert(
        { user_id: user.id, quest_key: quest.quest_key, status: 'completed', completed_at: new Date().toISOString() },
        { onConflict: 'user_id,quest_key' },
      );
      if (note.trim()) {
        try {
          await supabase.from('key_admissions').insert({
            user_id: user.id, admission_text: note.trim().slice(0, 2000), admission_type: 'side_quest_reflection',
          });
        } catch { /* non-blocking */ }
      }
      setNote('');
      await load();
    } finally { setBusy(false); }
  };

  const wrap: React.CSSProperties = {
    margin: '10px 12px', padding: '14px 16px', borderRadius: 14,
    background: 'linear-gradient(160deg, #1a1118 0%, #171017 100%)', border: '1px solid #3b2635',
  };

  // Nothing unlocked right now — the pull: keep using the tracker.
  if (!quest) {
    const need = prog?.next_unlock_at != null ? Math.max(0, prog.next_unlock_at - (prog.sessions ?? 0)) : null;
    return (
      <div style={wrap}>
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#c9557f', fontWeight: 700, marginBottom: 6 }}>Side quest</div>
        <div style={{ fontSize: 14, color: '#d5c3ca', lineHeight: 1.5 }}>
          {need != null
            ? `${need} more session${need === 1 ? '' : 's'} and Mommy unlocks your next step. Keep moving for me, baby.`
            : "You've done everything Mommy's unlocked for now. Good girl."}
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c9557f', fontWeight: 700 }}>Side quest</span>
        <span style={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#edaec5', background: '#291823', border: '1px solid #4a2438', padding: '2px 7px', borderRadius: 8, fontWeight: 700 }}>
          {CAT_LABEL[quest.category] ?? quest.category}
        </span>
        {prog && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#7f6b74', fontVariantNumeric: 'tabular-nums' }}>{prog.completed} done</span>}
      </div>
      <div className="mommy-voice" style={{ fontSize: 18, fontWeight: 600, color: '#f7efe9', marginBottom: 6 }}>{quest.title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: '#d5c3ca', marginBottom: 12 }}>{quest.body}</div>
      <textarea
        value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Tell Mommy how it went…" rows={2}
        style={{ width: '100%', padding: '9px 11px', resize: 'vertical', background: '#160c13', color: '#f2e9e6', border: '1px solid #2a2a32', borderRadius: 8, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }}
      />
      <button onClick={done} disabled={busy} style={{ width: '100%', padding: '11px', borderRadius: 9, background: '#c9557f', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, letterSpacing: '0.03em', cursor: 'pointer', fontFamily: 'inherit' }}>
        {busy ? '…' : (note.trim() ? 'Give it to Mommy' : 'Done — next')}
      </button>
    </div>
  );
}
