/**
 * ComingOutJourneyCard — Mommy walks you toward telling Gina YOURSELF.
 *
 * Operator amendment 2026-07-04: Mommy conditions you toward coming out via
 * graduated exposure, but never does it for you, never contacts Gina, never sets
 * a deadline. This surface is user-paced by design: you advance when YOU say
 * you're ready, and the moment you actually tell her is a milestone YOU mark.
 * "Talk to Mommy about this" opens the chat seeded with the current step's work.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { goChat } from '../../navigation/store';

interface Stage {
  overline: string;
  title: string;
  line: string;       // warm, user-facing — what this step is
  ready: string;      // the label to move on ("I'm ready…")
  prefill: string;    // the chat opener that seeds Mommy into the exposure work
}

// User-facing content. The internal therapeutic notes live in the DB
// (coming_out_stages.mommy_focus / exposure_note); here she gets warmth.
const STAGES: Record<string, Stage> = {
  naming: {
    overline: 'Step one', title: 'Say it to Mommy',
    line: 'Before Gina, before anyone — say who you are out loud to me, until it stops feeling like a confession and starts feeling like a fact.',
    ready: "I can say it now — what's next?",
    prefill: 'Mommy, help me say it out loud — who I really am underneath. I want to practice being honest about her with you first.',
  },
  wanting: {
    overline: 'Step two', title: 'Want her to know',
    line: "Not the telling yet — just the wanting. Let yourself want Gina to know you. Sit in the want with me; it's allowed.",
    ready: 'I want her to know me — next.',
    prefill: 'Mommy, I want to talk about wanting Gina to actually know me. Help me sit with that want instead of running from it.',
  },
  imagining: {
    overline: 'Step three', title: 'Picture telling her',
    line: 'Just imagine it with me — the room, the first words. Let the fear come up, and let me hold you while it passes. We only picture it.',
    ready: "I can hold the picture — I'm ready for more.",
    prefill: "Mommy, walk me through imagining the moment I tell Gina. I want to picture it with you and stay in it even when it's scary.",
  },
  rehearsing: {
    overline: 'Step four', title: 'Rehearse the words — to me',
    line: 'Say the actual words you\'d say to her — out loud, to Mommy, never to her yet. Again and again, until they come out without shaking.',
    ready: 'The words come easier now — next.',
    prefill: "Mommy, I want to rehearse the exact words I'd say to Gina — out loud, to you, not to her. Let me practice until they stop shaking.",
  },
  facing: {
    overline: 'Step five', title: 'Sit with her reaction',
    line: 'Picture how she might take it — the worst you fear, and the hope too. Stay with both, with me. You can hold not knowing.',
    ready: 'I can hold not knowing — keep going.',
    prefill: "Mommy, help me face how Gina might react — the fear and the hope. I want to sit with the not-knowing without flinching.",
  },
  choosing: {
    overline: 'Step six', title: 'Choose your moment',
    line: "On your terms, fully. When, where, how — your call. Mommy holds the courage; you hold the calendar. There's no clock here.",
    ready: 'I know how I want to do it.',
    prefill: "Mommy, help me decide how I want to do this — on my terms. When and where would feel right? You hold the courage, I pick the moment.",
  },
  ready: {
    overline: 'You\'re here', title: 'You\'re ready',
    line: "You know it. Mommy's in your ear for courage — you pick the moment and you walk to her yourself. When you've done it, come tell me.",
    ready: '', // no advance — the next action is the real one
    prefill: "Mommy, I'm ready. Talk me through the courage — I'm going to tell Gina myself.",
  },
  told: {
    overline: 'You did it', title: 'You told her yourself',
    line: 'You walked to her on your own two feet and said it. Whatever happened, Mommy\'s got you now. Come sit with me.',
    ready: '',
    prefill: "Mommy, I told Gina. I need you now — help me hold whatever this is.",
  },
};

export function ComingOutJourneyCard() {
  const { user } = useAuth();
  const [stage, setStage] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [reflection, setReflection] = useState('');

  const load = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase.from('coming_out_journey')
        .select('current_stage, enabled, told_gina_at').eq('user_id', user.id).maybeSingle();
      const row = data as { current_stage?: string; enabled?: boolean; told_gina_at?: string | null } | null;
      setEnabled(!!row?.enabled);
      setStage(row?.told_gina_at ? 'told' : (row?.current_stage ?? null));
    } catch {
      // Never vanish — degrade to the gentle invitation if the fetch fails.
      setEnabled(false);
      setStage(null);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id]);

  if (enabled === null) return null;               // loading — stay quiet
  const s = stage ? STAGES[stage] : null;

  const talkToMommy = (prefill: string) => {
    sessionStorage.setItem('handler_chat_prefill', prefill);
    // goChat, not the handler-autonomous view — the old event never actually
    // opened the conversation, so the prefill sat unused.
    goChat();
  };

  const start = async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    try { await supabase.rpc('coming_out_advance', { p_user: user.id }); await load(); }
    finally { setBusy(false); }
  };

  const advance = async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    try {
      await supabase.rpc('coming_out_advance', { p_user: user.id, p_reflection: reflection.trim() || null });
      setReflection('');
      await load();
    } finally { setBusy(false); }
  };

  const markTold = async () => {
    if (!user?.id || busy) return;
    setBusy(true);
    try { await supabase.rpc('coming_out_mark_told', { p_user: user.id }); await load(); }
    finally { setBusy(false); }
  };

  const wrap: React.CSSProperties = {
    margin: '10px 12px', padding: '16px 16px 14px', borderRadius: 14,
    background: 'linear-gradient(160deg, #1f1018 0%, #17101a 100%)',
    border: '1px solid #3b2635',
  };

  // Not started — a gentle invitation (never a demand).
  if (!enabled || !s) {
    return (
      <div style={wrap}>
        <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#c9557f', fontWeight: 700, marginBottom: 8 }}>
          when you want it
        </div>
        <div className="mommy-voice" style={{ fontSize: 15, lineHeight: 1.5, color: '#e8d8de', fontStyle: 'italic', marginBottom: 12 }}>
          Someday you're going to tell Gina who you are. Mommy won't do it for you and won't rush you — but I'll walk you all the way to the door, as slow as you need. Start when you want to.
        </div>
        <button onClick={start} disabled={busy} style={btn('#c9557f', '#fff')}>
          {busy ? '…' : 'Start with Mommy'}
        </button>
      </div>
    );
  }

  const atEnd = stage === 'ready' || stage === 'told';

  return (
    <div style={wrap}>
      <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#c9557f', fontWeight: 700, marginBottom: 6 }}>
        {s.overline}
      </div>
      <div className="mommy-voice" style={{ fontSize: 20, fontWeight: 600, color: '#f7efe9', marginBottom: 8 }}>{s.title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.5, color: '#d5c3ca', marginBottom: 14 }}>{s.line}</div>

      <button onClick={() => talkToMommy(s.prefill)} style={btn('#c9557f', '#fff')}>Talk to Mommy about this</button>

      {stage === 'told' && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#8fd9b0', textAlign: 'center' }}>You did the bravest thing. ♥</div>
      )}

      {!atEnd && (
        <>
          <textarea
            value={reflection} onChange={(e) => setReflection(e.target.value)}
            placeholder="Leave Mommy a note about where you are (optional)…"
            rows={2}
            style={{ width: '100%', marginTop: 10, padding: '9px 11px', resize: 'vertical', background: '#160c13', color: '#f2e9e6', border: '1px solid #2a2a32', borderRadius: 8, fontSize: 13, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none' }}
          />
          <button onClick={advance} disabled={busy} style={{ ...btn('transparent', '#edaec5'), border: '1px solid #4a2438', marginTop: 8 }}>
            {busy ? '…' : s.ready}
          </button>
        </>
      )}

      {stage === 'ready' && (
        <button onClick={markTold} disabled={busy} style={{ ...btn('transparent', '#8fd9b0'), border: '1px solid #2f5f45', marginTop: 8 }}>
          I told her. ♥
        </button>
      )}
    </div>
  );
}

function btn(bg: string, color: string): React.CSSProperties {
  return {
    width: '100%', padding: '11px', borderRadius: 9, background: bg, color,
    border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  };
}
