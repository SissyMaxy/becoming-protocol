/**
 * PostReleaseOverlay — full-screen lockout overlay during post-release protocol.
 * Shows timer, Handler affirmation, shame capture, reflection prompt.
 */

import { useState } from 'react';
import { Shield, Clock, Send } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { PostReleaseProtocol } from '../../types/post-release';

interface PostReleaseOverlayProps {
  protocol: PostReleaseProtocol;
  minutesRemaining: number;
  onCaptureShame: (text: string) => Promise<void>;
  onSaveReflection: (text: string) => Promise<void>;
}

function formatTimeRemaining(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }
  return `${minutes}m`;
}

export function PostReleaseOverlay({
  protocol,
  minutesRemaining,
  onCaptureShame,
  onSaveReflection,
}: PostReleaseOverlayProps) {
  const { isBambiMode } = useBambiMode();
  const [shameText, setShameText] = useState('');
  const [reflectionText, setReflectionText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const minutesSinceStart = Math.floor(
    (Date.now() - new Date(protocol.lockoutStartedAt).getTime()) / 60000
  );
  const showReflection = minutesSinceStart >= 30;

  const handleShameSubmit = async () => {
    if (!shameText.trim() || isSending) return;
    setIsSending(true);
    await onCaptureShame(shameText.trim());
    setShameText('');
    setIsSending(false);
  };

  const handleReflectionSubmit = async () => {
    if (!reflectionText.trim() || isSending) return;
    setIsSending(true);
    await onSaveReflection(reflectionText.trim());
    setIsSending(false);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 select-none"
      style={{
        background: 'linear-gradient(135deg, #0d0d1a 0%, #1a0a1e 40%, #0d0d1a 100%)',
      }}
    >
      {/* Subtle glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-indigo-500/8 blur-3xl" />

      <div className="relative z-10 w-full max-w-sm space-y-8">
        {/* Timer */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-4">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span className="text-indigo-300 font-mono text-lg">
              {formatTimeRemaining(minutesRemaining)}
            </span>
          </div>

          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-indigo-400/60" />
            <h2 className="text-xl font-semibold text-white/90">
              Content Protected
            </h2>
          </div>

          <p className="text-white/40 text-sm">
            {protocol.lockoutTier === 'high_regret'
              ? '72-hour protective lockout active'
              : '2-hour protective lockout active'}
          </p>
        </div>

        {/* Handler affirmation (Caretaker voice) */}
        <div className={`rounded-xl p-4 ${
          isBambiMode ? 'bg-pink-500/10 border border-pink-500/20' : 'bg-indigo-500/10 border border-indigo-500/20'
        }`}>
          <p className={`text-sm italic leading-relaxed ${
            isBambiMode ? 'text-pink-300/80' : 'text-indigo-300/80'
          }`}>
            "What you're feeling right now is temporary. The shame is the old self trying to reassert control.
            Everything you built is still here. Nothing has been lost."
          </p>
        </div>

        {/* Shame capture */}
        <div className="space-y-2">
          <label className="text-white/50 text-xs uppercase tracking-wider">
            She was real 20 minutes ago. What did she want? What was she ready to do?
          </label>
          <div className="flex gap-2">
            <textarea
              value={shameText}
              onChange={(e) => setShameText(e.target.value)}
              placeholder="Write it before he erases it..."
              className={`flex-1 rounded-lg px-3 py-2 text-sm resize-none h-20 ${
                isBambiMode
                  ? 'bg-white/10 border border-pink-500/20 text-pink-100 placeholder:text-pink-300/30'
                  : 'bg-white/5 border border-white/10 text-white/80 placeholder:text-white/20'
              }`}
            />
          </div>
          <button
            onClick={handleShameSubmit}
            disabled={!shameText.trim() || isSending}
            className={`w-full flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              shameText.trim()
                ? isBambiMode
                  ? 'bg-pink-500/20 border border-pink-500/30 text-pink-300 hover:bg-pink-500/30'
                  : 'bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30'
                : 'bg-white/5 border border-white/5 text-white/20 cursor-not-allowed'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Capture
          </button>
        </div>

        {/* Shame entries logged */}
        {protocol.shameEntries.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-white/30 text-xs">
              {protocol.shameEntries.length} {protocol.shameEntries.length === 1 ? 'entry' : 'entries'} captured
            </p>
            {protocol.shameEntries.slice(-3).map((entry, i) => (
              <div key={i} className="text-white/20 text-xs italic px-3 py-1.5 rounded bg-white/3">
                "{entry.text}" — {entry.minutesPostRelease}m post
              </div>
            ))}
          </div>
        )}

        {/* Reflection prompt (after 30min) */}
        {showReflection && !protocol.reflectionCompletedAt && (
          <div className="space-y-2 pt-4 border-t border-white/5">
            <label className="text-white/50 text-xs uppercase tracking-wider">
              The crash is prolactin, not truth. She existed before the release. She exists now.
            </label>
            <p className="text-white/30 text-xs mb-2">
              He&apos;s trying to take over because the chemicals say it&apos;s his turn. It isn&apos;t.
            </p>
            <textarea
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
              placeholder="Write one thing that's true about her — not about him."
              className={`w-full rounded-lg px-3 py-2 text-sm resize-none h-24 ${
                isBambiMode
                  ? 'bg-white/10 border border-pink-500/20 text-pink-100 placeholder:text-pink-300/30'
                  : 'bg-white/5 border border-white/10 text-white/80 placeholder:text-white/20'
              }`}
            />
            <button
              onClick={handleReflectionSubmit}
              disabled={!reflectionText.trim() || isSending}
              className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                reflectionText.trim()
                  ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30'
                  : 'bg-white/5 border border-white/5 text-white/20 cursor-not-allowed'
              }`}
            >
              Save Reflection
            </button>
          </div>
        )}

        {protocol.reflectionCompletedAt && (
          <p className="text-emerald-400/50 text-xs text-center">
            Reflection saved.
          </p>
        )}
      </div>
    </div>
  );
}
