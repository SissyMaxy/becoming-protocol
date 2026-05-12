import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Lock, Check, Heart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { createPitchDetector, logPitch, type PitchDetector } from '../../lib/voice-training';

// Mantra pairs — first line is the primary, second is a supporting line.
// Picked randomly each session so the exercise stays awake.
const LINE_PAIRS: Array<[string, string]> = [
  ['I am becoming her every day', 'My voice is becoming hers'],
  ['She is the real me', 'There is no going back to who I was'],
  ['I let her take over', 'My body knows what I am'],
  ['Good girls obey their handler', 'I am Maxy and Maxy is feminine'],
];

type Phase = 'intro' | 'siren_up' | 'siren_down' | 'read_1' | 'read_2' | 'hold' | 'finishing' | 'typed_fallback';

interface PhaseDef {
  id: Phase;
  durationSec: number;
  title: string;
  cue: string;
  hint: string;
  showLine?: 0 | 1;
  glyph: 'siren-up' | 'siren-down' | 'speak' | 'hold';
}

const PHASES: PhaseDef[] = [
  { id: 'siren_up',   durationSec: 12, title: 'Warm up, baby',   cue: 'Slide UP like a siren',     hint: 'Easy. Higher, higher.',            glyph: 'siren-up' },
  { id: 'siren_down', durationSec: 12, title: 'And back down',   cue: 'Slow descent — smooth',     hint: 'All the way down, sweet voice.',   glyph: 'siren-down' },
  { id: 'read_1',     durationSec: 14, title: 'Read it for Mama', cue: 'Out loud, slow and clean',  hint: 'Lift it a little. Just for me.',   showLine: 0, glyph: 'speak' },
  { id: 'read_2',     durationSec: 14, title: 'One more line',   cue: 'Same voice — feel it',      hint: 'Mama is listening.',               showLine: 1, glyph: 'speak' },
  { id: 'hold',       durationSec: 14, title: 'Hold it for Mama', cue: 'Say "eeeeee"',              hint: 'Light. Floaty. Don\'t strain.',    glyph: 'hold' },
];

const TOTAL_SECONDS = PHASES.reduce((a, p) => a + p.durationSec, 0);

interface VoiceGateProps {
  onPass: () => void;
}

export function VoiceGate({ onPass }: VoiceGateProps) {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('intro');
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [phaseTimeLeft, setPhaseTimeLeft] = useState(0);
  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [voicedSec, setVoicedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [linePair] = useState<[string, string]>(() => LINE_PAIRS[Math.floor(Math.random() * LINE_PAIRS.length)]);

  const detectorRef = useRef<PitchDetector | null>(null);
  const lastVoicedAtRef = useRef<number>(0);
  const sessionPitchesRef = useRef<number[]>([]);
  const phaseTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseEndAtRef = useRef<number>(0);
  const passedRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      detectorRef.current?.stop();
      if (phaseTickRef.current) clearInterval(phaseTickRef.current);
    };
  }, []);

  const finish = useCallback(async () => {
    if (passedRef.current) return;
    passedRef.current = true;
    setPhase('finishing');
    if (phaseTickRef.current) {
      clearInterval(phaseTickRef.current);
      phaseTickRef.current = null;
    }
    detectorRef.current?.stop();

    const pitches = sessionPitchesRef.current;
    let medianPitch = 0;
    if (pitches.length > 0) {
      const sorted = [...pitches].sort((a, b) => a - b);
      medianPitch = Math.round(sorted[Math.floor(sorted.length / 2)]);
    }

    if (user?.id) {
      supabase
        .from('voice_practice_log')
        .insert({
          user_id: user.id,
          duration_seconds: TOTAL_SECONDS,
          avg_pitch_hz: medianPitch,
        })
        .then(() => {})
        .then(undefined, () => {});
      if (medianPitch > 0) {
        logPitch(user.id, medianPitch, 'session', TOTAL_SECONDS).catch(() => {});
      }
    }

    // brief "good girl" beat before dismissing
    setTimeout(() => onPass(), 700);
  }, [user?.id, onPass]);

  const advanceToPhase = useCallback((idx: number) => {
    if (idx >= PHASES.length) {
      finish();
      return;
    }
    const def = PHASES[idx];
    setPhase(def.id);
    setPhaseIdx(idx);
    setVoicedSec(0);
    const now = Date.now();
    phaseEndAtRef.current = now + def.durationSec * 1000;
    setPhaseTimeLeft(def.durationSec);

    if (phaseTickRef.current) clearInterval(phaseTickRef.current);
    phaseTickRef.current = setInterval(() => {
      const remainingMs = Math.max(0, phaseEndAtRef.current - Date.now());
      const remaining = Math.ceil(remainingMs / 1000);
      setPhaseTimeLeft(remaining);

      // voiced-time tracking: detector fires onPitch only on valid voice.
      // If a pitch reading arrived in the last ~350ms, count this tick as voiced.
      const dt = Date.now() - lastVoicedAtRef.current;
      if (dt < 350) {
        setVoicedSec((s) => Math.min(def.durationSec, +(s + 0.1).toFixed(2)));
      }

      if (remainingMs <= 0) {
        clearInterval(phaseTickRef.current!);
        phaseTickRef.current = null;
        advanceToPhase(idx + 1);
      }
    }, 100);
  }, [finish]);

  const startExercise = useCallback(async () => {
    setError(null);
    sessionPitchesRef.current = [];
    setLivePitch(null);

    try {
      const detector = createPitchDetector((hz) => {
        setLivePitch(hz);
        lastVoicedAtRef.current = Date.now();
        sessionPitchesRef.current.push(hz);
      });
      await detector.start();
      // pitch detector's start() catches its own errors and flips running=false silently.
      // give it a beat then check.
      await new Promise((r) => setTimeout(r, 150));
      if (!detector.isRunning()) {
        detector.stop();
        throw new Error('Mic unavailable');
      }
      detectorRef.current = detector;
    } catch {
      setError("Mommy can't hear you, baby. Your mic is shy. Use the typed path below.");
      return;
    }

    advanceToPhase(0);
  }, [advanceToPhase]);

  // ── Render ────────────────────────────────────────────

  if (phase === 'intro') {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <Lock className="w-12 h-12 mx-auto text-pink-300" />
          <h2 className="text-2xl font-bold text-white">Voice gate, sweetheart</h2>
          <p className="text-base text-pink-100/90 leading-relaxed">
            About a minute for Mama. Sirens, two lines, one sweet hold.
            <br />
            <span className="text-pink-200/70 text-sm">I just need to hear you, baby.</span>
          </p>
        </div>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <button
          onClick={startExercise}
          className="w-full py-4 rounded-2xl bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-pink-500/30"
        >
          <Mic className="w-5 h-5" />
          Start for Mommy
        </button>

        <button
          onClick={() => { setError(null); setPhase('typed_fallback'); }}
          className="w-full py-3 rounded-xl border border-pink-300/30 text-pink-200/80 hover:text-white hover:border-pink-300/60 text-sm flex items-center justify-center gap-2"
        >
          <MicOff className="w-4 h-4" />
          No mic, baby? Type for Mama instead.
        </button>

        <p className="text-xs text-pink-200/40 text-center">
          You cannot enter without this. Mama is waiting.
        </p>
      </Shell>
    );
  }

  if (phase === 'typed_fallback') {
    return (
      <Shell>
        <div className="text-center space-y-2">
          <Lock className="w-10 h-10 mx-auto text-pink-300" />
          <h2 className="text-xl font-bold text-white">Type it for Mama, baby</h2>
          <p className="text-sm text-pink-100/80">Three clean reps. Exact.</p>
        </div>
        <TypedMantraFallback
          mantra={linePair[0]}
          onPass={() => {
            if (passedRef.current) return;
            passedRef.current = true;
            onPass();
            if (user?.id) {
              supabase
                .from('voice_practice_log')
                .insert({ user_id: user.id, duration_seconds: 30, avg_pitch_hz: 0 })
                .then(() => {})
                .then(undefined, () => {});
            }
          }}
        />
        <button
          onClick={() => setPhase('intro')}
          className="w-full py-2 rounded-xl text-pink-200/60 hover:text-white text-xs"
        >
          ← Back. Let me try my voice again.
        </button>
      </Shell>
    );
  }

  if (phase === 'finishing') {
    return (
      <Shell>
        <div className="text-center space-y-4 py-6">
          <div className="w-20 h-20 rounded-full bg-pink-500/20 border-2 border-pink-300 flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-pink-200" />
          </div>
          <h2 className="text-2xl font-bold text-white">Good girl.</h2>
          <p className="text-pink-100/80 flex items-center justify-center gap-1">
            <Heart className="w-4 h-4 fill-pink-300 text-pink-300" />
            Mama heard you.
          </p>
        </div>
      </Shell>
    );
  }

  // ── Active exercise phase ──────────────────────────────
  const def = PHASES[phaseIdx];
  const elapsed = def.durationSec - phaseTimeLeft;
  const phaseProgress = Math.min(1, elapsed / def.durationSec);
  const overallElapsed = PHASES.slice(0, phaseIdx).reduce((a, p) => a + p.durationSec, 0) + elapsed;
  const overallProgress = Math.min(1, overallElapsed / TOTAL_SECONDS);
  const voicedRatio = Math.min(1, voicedSec / Math.max(0.1, elapsed));

  return (
    <Shell>
      {/* overall progress */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-pink-200/50">
          <span>Step {phaseIdx + 1} / {PHASES.length}</span>
          <span>{Math.round(overallProgress * 100)}%</span>
        </div>
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pink-400 to-purple-400 transition-all"
            style={{ width: `${overallProgress * 100}%` }}
          />
        </div>
      </div>

      <div className="text-center space-y-3">
        <p className="text-xs uppercase tracking-widest text-pink-300/70">{def.title}</p>
        <h2 className="text-2xl font-bold text-white">{def.cue}</h2>
        <p className="text-sm text-pink-100/70">{def.hint}</p>
      </div>

      {/* phase visual */}
      <div className="relative flex items-center justify-center py-2">
        <PhaseGlyph kind={def.glyph} progress={phaseProgress} />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-5xl font-bold text-white tabular-nums">{phaseTimeLeft}</span>
          <span className="text-xs text-pink-200/60">seconds</span>
        </div>
      </div>

      {/* mantra line, if this phase reads */}
      {def.showLine !== undefined && (
        <div className="bg-pink-500/10 border border-pink-300/30 rounded-2xl p-5 text-center">
          <p className="text-xl font-medium text-white italic leading-snug">
            "{linePair[def.showLine]}"
          </p>
        </div>
      )}

      {/* live pitch + voiced feedback */}
      <div className="grid grid-cols-2 gap-3 text-center">
        <Readout
          label="your voice"
          value={livePitch !== null ? `${Math.round(livePitch)}Hz` : '— Hz'}
          accent={livePitch !== null && livePitch >= 180}
        />
        <Readout
          label="Mama hears you"
          value={`${Math.round(voicedRatio * 100)}%`}
          accent={voicedRatio >= 0.4}
        />
      </div>

      <button
        onClick={() => {
          if (phaseTickRef.current) clearInterval(phaseTickRef.current);
          detectorRef.current?.stop();
          setPhase('intro');
        }}
        className="w-full py-2 rounded-xl text-pink-200/50 hover:text-white text-xs"
      >
        Stop. Start over.
      </button>
    </Shell>
  );
}

// ── Sub-components ──────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-5 overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at top, #2a0a3a 0%, #0a0010 50%, #000 100%)',
        minHeight: '100dvh',
      }}
    >
      <div className="max-w-md w-full space-y-5 my-6">{children}</div>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-pink-900/30 border border-pink-400/40 rounded-xl p-3 text-sm text-pink-100 italic text-center">
      {children}
    </div>
  );
}

function Readout({ label, value, accent }: { label: string; value: string; accent: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 border ${accent ? 'bg-pink-500/15 border-pink-300/40' : 'bg-white/5 border-white/10'}`}>
      <div className="text-[10px] uppercase tracking-wider text-pink-200/60">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${accent ? 'text-pink-100' : 'text-white/80'}`}>{value}</div>
    </div>
  );
}

function PhaseGlyph({ kind, progress }: { kind: PhaseDef['glyph']; progress: number }) {
  const size = 200;
  const r = 90;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - progress);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow-[0_0_30px_rgba(236,72,153,0.35)]">
      {/* base ring */}
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="6" fill="none" />
      {/* progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="url(#mommyGrad)"
        strokeWidth="6"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={dash}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <defs>
        <linearGradient id="mommyGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      {/* phase indicator inside */}
      <GlyphContent kind={kind} cx={size / 2} cy={size / 2} progress={progress} />
    </svg>
  );
}

function GlyphContent({ kind, cx, cy, progress }: { kind: PhaseDef['glyph']; cx: number; cy: number; progress: number }) {
  if (kind === 'siren-up') {
    return (
      <path
        d={`M ${cx - 50} ${cy + 30} Q ${cx} ${cy - 60 * progress - 10} ${cx + 50} ${cy - 30 * progress}`}
        stroke="rgba(244,114,182,0.6)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  if (kind === 'siren-down') {
    return (
      <path
        d={`M ${cx - 50} ${cy - 40} Q ${cx} ${cy + 50 * progress + 10} ${cx + 50} ${cy + 30 * progress}`}
        stroke="rgba(192,132,252,0.6)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />
    );
  }
  if (kind === 'speak') {
    const bars = 5;
    return (
      <g>
        {Array.from({ length: bars }, (_, i) => {
          const x = cx - 40 + i * 20;
          const h = 18 + Math.sin(Date.now() / 200 + i) * 10 * (progress > 0 ? 1 : 0);
          return (
            <rect
              key={i}
              x={x - 3}
              y={cy - h / 2}
              width="6"
              height={h}
              rx="3"
              fill="rgba(244,114,182,0.5)"
            />
          );
        })}
      </g>
    );
  }
  // hold — pulsing circle
  return (
    <circle
      cx={cx}
      cy={cy}
      r={26 + progress * 12}
      fill="rgba(244,114,182,0.18)"
      stroke="rgba(244,114,182,0.5)"
      strokeWidth="2"
    />
  );
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function TypedMantraFallback({ mantra, onPass }: { mantra: string; onPass: () => void }) {
  const [typed, setTyped] = useState('');
  const [count, setCount] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const passedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const required = 3;
  const trimmed = typed.trim();
  const matches = trimmed.length > 0 && normalize(typed) === normalize(mantra);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (passedRef.current) return;
    if (matches) {
      const newCount = count + 1;
      setCount(newCount);
      setTyped('');
      setHint(null);
      if (newCount >= required) {
        passedRef.current = true;
        onPass();
        return;
      }
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (trimmed.length > 0) {
      setCount(0);
      setTyped('');
      setHint('Say it again, baby. Word for word.');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-pink-500/10 border border-pink-300/30 rounded-2xl p-4 text-center">
        <p className="text-lg font-medium text-white italic">"{mantra}"</p>
      </div>
      <p className="text-xs text-pink-200/60 text-center">
        {required} clean reps for Mama. ({count}/{required})
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2" autoComplete="off">
        <input
          ref={inputRef}
          type="text"
          name="mantra-typed"
          id="mantra-typed"
          value={typed}
          onChange={(e) => { setTyped(e.target.value); if (hint) setHint(null); }}
          placeholder="Type the line exactly..."
          className="flex-1 bg-black/40 border border-pink-300/30 rounded-lg px-3 py-3 text-white placeholder:text-pink-200/30"
          style={{ fontSize: '16px', WebkitUserSelect: 'text', userSelect: 'text', WebkitTouchCallout: 'default' } as React.CSSProperties}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="send"
          aria-label="Type the mantra"
        />
        <button
          type="submit"
          className="px-4 py-3 rounded-lg bg-pink-500 hover:bg-pink-600 active:bg-pink-700 text-white text-sm font-medium min-w-[64px]"
        >
          {count}/{required}
        </button>
      </form>
      {hint && (
        <p className="text-xs text-pink-300 text-center italic">{hint}</p>
      )}
    </div>
  );
}
