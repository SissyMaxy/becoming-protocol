/**
 * CompulsoryConfessionGate — daily lockdown at a set time until Maxy types
 * a minimum-length confession answering a Handler-chosen dysphoria prompt.
 *
 * - Fires once per day at the configured start_hour in the user's tz.
 * - Pulls today's dysphoria_diary_prompts row if available; otherwise uses
 *   a seed bank.
 * - UI locks the entire viewport until min_chars is met, then submit
 *   writes to confessions (source='compulsory_gate', is_key_admission=true).
 * - Persists completion via localStorage key per calendar date so a single
 *   submit satisfies today; window won't re-trigger.
 * - Audits to handler_directives so the Handler's context sees the new
 *   admission on the next turn.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface WindowCfg {
  start_hour: number;
  start_minute: number;
  min_chars: number;
  timezone: string;
  active: boolean;
}

interface PromptRow {
  id: string;
  prompt_question: string;
  target_focus: string | null;
  min_chars: number | null;
}

// Per-prompt char minimums. Terse prompts ("name a body part") get small
// floors so honest two-word answers + a sentence of context clear the gate;
// longform prompts demand fuller responses. The global
// compulsory_confession_windows.min_chars is now a SOFT floor — the
// per-prompt min wins when smaller, the global wins when larger. Memory:
// feedback_char_min_per_prompt.
const SEED_PROMPTS: { focus: string; question: string; min_chars: number }[] = [
  { focus: 'body_part', question: 'Name the body part you caught yourself wanting most this week. One word, then the moment you noticed.', min_chars: 60 },
  { focus: 'mirror', question: 'Last time you avoided a mirror — when and why?', min_chars: 100 },
  { focus: 'arousal', question: 'When you got off last, whose body did you end up imagining?', min_chars: 80 },
  { focus: 'voice', question: 'Tell me the exact sound your voice makes that you wish was different.', min_chars: 80 },
  { focus: 'partner', question: 'What did Gina see of the real you this week that she pretended not to notice?', min_chars: 150 },
  { focus: 'future_self', question: 'Fast forward 6 months on HRT. What is the first thing you notice in the shower?', min_chars: 150 },
  { focus: 'past_self', question: 'The first time you wanted to be her instead of have her — how old were you?', min_chars: 100 },
  { focus: 'hrt_timeline', question: 'What specifically did you not do toward HRT yesterday that you could have?', min_chars: 100 },
];

function minutesSinceMidnightInTz(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(date);
  const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  return h * 60 + m;
}
function dateKeyInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value || '';
  const mo = parts.find(p => p.type === 'month')?.value || '';
  const d = parts.find(p => p.type === 'day')?.value || '';
  return `${y}-${mo}-${d}`;
}

export function CompulsoryConfessionGate() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<WindowCfg | null>(null);
  const [prompt, setPrompt] = useState<PromptRow | { id: null; prompt_question: string; target_focus: string; min_chars: number } | null>(null);
  const [text, setText] = useState('');
  const [gateOpen, setGateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const localKey = useCallback((tz: string) => `td_ccg_done_${dateKeyInTz(new Date(), tz)}`, []);

  const loadConfig = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('compulsory_confession_windows')
      .select('start_hour, start_minute, min_chars, timezone, active')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!data || !data.active) { setCfg(null); return; }
    setCfg(data as WindowCfg);
  }, [user?.id]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Window-evaluator loop
  useEffect(() => {
    if (!cfg || !user?.id) return;
    const evaluate = async () => {
      const now = new Date();
      const currentMins = minutesSinceMidnightInTz(now, cfg.timezone);
      const startMins = cfg.start_hour * 60 + cfg.start_minute;
      // Window is a 16-hour catch-up — if she misses 8am, the gate persists all day
      const endMins = startMins + 16 * 60;
      const inWindow = currentMins >= startMins && currentMins < Math.min(endMins, 24 * 60);
      if (!inWindow) { setGateOpen(false); return; }

      // Check local completion flag
      const done = localStorage.getItem(localKey(cfg.timezone)) === '1';
      if (done) { setGateOpen(false); return; }

      // Check DB — did she already submit today from any path?
      const today = dateKeyInTz(now, cfg.timezone);
      const { count } = await supabase
        .from('confessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('source', 'compulsory_gate')
        .gte('created_at', `${today}T00:00:00`);
      if ((count ?? 0) > 0) {
        localStorage.setItem(localKey(cfg.timezone), '1');
        setGateOpen(false);
        return;
      }

      // Pick today's prompt
      if (!prompt) {
        const { data: dpRow } = await supabase
          .from('dysphoria_diary_prompts')
          .select('id, prompt_question, target_focus, min_chars')
          .eq('user_id', user.id)
          .eq('prompt_date', today)
          .is('response', null)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (dpRow) {
          setPrompt(dpRow as PromptRow);
        } else {
          const seed = SEED_PROMPTS[Math.floor(Math.random() * SEED_PROMPTS.length)];
          setPrompt({ id: null, prompt_question: seed.question, target_focus: seed.focus, min_chars: seed.min_chars });
        }
      }

      setGateOpen(true);
    };
    evaluate();
    loopRef.current = setInterval(evaluate, 60_000);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
  }, [cfg, user?.id, prompt, localKey]);

  // Per-prompt min wins when set; global window min only acts when there's
  // no per-prompt override. (Memory: feedback_char_min_per_prompt.)
  const promptMin = (prompt as { min_chars?: number | null } | null)?.min_chars;
  const effectiveMin = promptMin && promptMin > 0 ? promptMin : (cfg?.min_chars ?? 100);
  const trimmedLen = text.trim().length;
  const canSubmit = cfg ? trimmedLen >= effectiveMin : false;

  const handleSubmit = async () => {
    if (!user?.id || !cfg || !canSubmit || !prompt) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = text.trim();
      const { error: confErr } = await supabase.from('confessions').insert({
        user_id: user.id,
        prompt: prompt.prompt_question,
        response: body,
        sentiment: prompt.target_focus || 'identity_shift',
        is_key_admission: true,
        source: 'compulsory_gate',
      });
      if (confErr) { setSubmitError(confErr.message); return; }

      // Mark the diary prompt row responded if one existed
      if (prompt.id) {
        await supabase
          .from('dysphoria_diary_prompts')
          .update({ response: body, responded_at: new Date().toISOString() })
          .eq('id', prompt.id);
      }

      // Audit
      await supabase.from('handler_directives').insert({
        user_id: user.id,
        action: 'compulsory_confession_submitted',
        value: { focus: prompt.target_focus, len: body.length, snippet: body.slice(0, 200) },
        reasoning: 'User completed daily compulsory confession gate',
      });

      localStorage.setItem(localKey(cfg.timezone), '1');
      setGateOpen(false);
      setText('');
      setPrompt(null);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!gateOpen || !prompt || !cfg) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(5, 3, 10, 0.96)', zIndex: 350,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      <div style={{
        maxWidth: 560, width: '100%',
        background: '#111116', border: '1px solid #2d1a4d', borderRadius: 14, padding: 24,
        color: '#e8e6e3', fontFamily: 'Inter, "SF Pro Text", system-ui, sans-serif',
      }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700, marginBottom: 10 }}>
          Daily confession · before you pass
        </div>
        <div style={{ fontSize: 19, lineHeight: 1.4, fontWeight: 600, color: '#fff', marginBottom: 16, letterSpacing: '-0.015em' }}>
          {prompt.prompt_question}
        </div>
        <div style={{ fontSize: 11.5, color: '#8a8690', marginBottom: 10 }}>
          Write {effectiveMin}+ characters. Honest. No editing out. This goes into the permanent record and the Handler will quote it back.
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="start typing…"
          rows={10}
          style={{
            width: '100%', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6,
            padding: '10px 12px', fontFamily: 'inherit', fontSize: 14, color: '#e8e6e3',
            resize: 'vertical', lineHeight: 1.55,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, marginBottom: 14, fontSize: 11, color: canSubmit ? '#5fc88f' : '#8a8690' }}>
          <span>{trimmedLen} / {effectiveMin} chars</span>
          <span>source: compulsory_gate · source_focus: {prompt.target_focus || 'identity'}</span>
        </div>
        {submitError && (
          <div style={{ fontSize: 11, color: '#f47272', background: 'rgba(244,114,114,0.08)', border: '1px solid rgba(244,114,114,0.3)', borderRadius: 6, padding: 8, marginBottom: 10 }}>
            Submit failed: {submitError}
          </div>
        )}
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          style={{
            width: '100%', padding: '10px', borderRadius: 6, border: 'none',
            background: canSubmit ? '#7c3aed' : '#2d1a4d',
            color: canSubmit ? '#fff' : '#6a656e',
            fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
            cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
          }}
        >
          {submitting ? 'submitting…' : canSubmit ? 'Submit confession & unlock' : `${effectiveMin - trimmedLen} more characters`}
        </button>
        <div style={{ fontSize: 10.5, color: '#5a5560', marginTop: 10, textAlign: 'center' }}>
          You can't skip this. The app stays locked until you finish. No safeword for this gate — the whole point is to finish.
        </div>
      </div>
    </div>
  );
}
