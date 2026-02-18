/**
 * TimeCapsulePrompt
 *
 * Implements FM1.1: Time Capsule Generation
 * Prompts user during peak arousal to capture messages for their sober self
 * Used during identity crises to remind user of their authentic feelings
 */

import { useState, useEffect } from 'react';
import {
  MessageCircle,
  Sparkles,
  Heart,
  Send,
  X,
  Clock,
} from 'lucide-react';

interface TimeCapsulePromptProps {
  prompt: string;
  context: string;
  emotionalIntensity: number;
  onSave: (message: string) => Promise<void>;
  onDismiss: () => void;
  className?: string;
}

export function TimeCapsulePrompt({
  prompt,
  context,
  emotionalIntensity,
  onSave,
  onDismiss,
  className = '',
}: TimeCapsulePromptProps) {
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pulseIntensity, setPulseIntensity] = useState(0);

  // Pulsing animation based on emotional intensity
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIntensity(prev => (prev + 1) % 100);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    if (!message.trim()) return;

    setIsSaving(true);
    try {
      await onSave(message.trim());
      setSaved(true);
      setTimeout(() => {
        onDismiss();
      }, 2000);
    } catch (err) {
      console.error('Failed to save time capsule:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Dynamic glow based on intensity
  const glowOpacity = 0.2 + (emotionalIntensity / 5) * 0.3;
  const pulseScale = 1 + (Math.sin(pulseIntensity * 0.1) * 0.05);

  // Context-specific styling
  const contextColors: Record<string, { from: string; to: string; text: string }> = {
    peak_arousal: { from: 'from-red-500', to: 'to-pink-500', text: 'text-red-300' },
    vulnerability: { from: 'from-purple-500', to: 'to-indigo-500', text: 'text-purple-300' },
    identity: { from: 'from-pink-500', to: 'to-rose-500', text: 'text-pink-300' },
    desire: { from: 'from-fuchsia-500', to: 'to-pink-500', text: 'text-fuchsia-300' },
  };

  const colors = contextColors[context] || contextColors.peak_arousal;

  if (saved) {
    return (
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md ${className}`}>
        <div className="text-center">
          <div
            className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-500
                       flex items-center justify-center mx-auto mb-4 animate-bounce"
          >
            <Heart className="w-10 h-10 text-white fill-white" />
          </div>
          <h3 className="text-white text-xl font-semibold mb-2">
            Time Capsule Saved
          </h3>
          <p className="text-gray-300 text-sm">
            Your future self will thank you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${className}`}>
      {/* Animated background */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Pulsing glow effect */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, rgba(236, 72, 153, ${glowOpacity}) 0%, transparent 50%)`,
          transform: `scale(${pulseScale})`,
        }}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg">
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute -top-12 right-0 p-2 rounded-full bg-white/10 hover:bg-white/20
                     transition-colors text-gray-300"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Card */}
        <div className="bg-gradient-to-b from-gray-900/90 to-black/90 border border-white/10
                        rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className={`p-6 bg-gradient-to-r ${colors.from} ${colors.to} opacity-20`} />

          <div className="p-6 -mt-16">
            {/* Icon */}
            <div
              className={`w-16 h-16 rounded-full bg-gradient-to-br ${colors.from} ${colors.to}
                         flex items-center justify-center mx-auto mb-6 shadow-lg shadow-pink-500/30`}
              style={{ transform: `scale(${pulseScale})` }}
            >
              <MessageCircle className="w-8 h-8 text-white" />
            </div>

            {/* Title */}
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-pink-400" />
                <span className="text-pink-400 text-sm font-medium uppercase tracking-wider">
                  Time Capsule
                </span>
                <Sparkles className="w-4 h-4 text-pink-400" />
              </div>
              <p className={`text-xl font-medium ${colors.text}`}>
                {prompt}
              </p>
            </div>

            {/* Input */}
            <div className="relative mb-4">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write to your sober self..."
                rows={4}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl
                         text-white placeholder-gray-500 resize-none
                         focus:outline-none focus:border-pink-500/50 focus:bg-white/10
                         transition-colors"
                autoFocus
              />

              {/* Character hint */}
              <div className="absolute bottom-3 right-3 text-xs text-gray-500">
                Be honest. Be raw.
              </div>
            </div>

            {/* Context hint */}
            <div className="flex items-center gap-2 mb-6 text-gray-400 text-sm">
              <Heart className="w-4 h-4 text-pink-500" />
              <span>
                Intensity: {emotionalIntensity}/5 -
                {emotionalIntensity >= 4 ? ' Peak vulnerability moment' : ' Good moment to capture'}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onDismiss}
                className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10
                         text-gray-300 rounded-xl font-medium transition-colors"
              >
                Not Now
              </button>
              <button
                onClick={handleSave}
                disabled={!message.trim() || isSaving}
                className={`flex-1 py-3 px-4 bg-gradient-to-r ${colors.from} ${colors.to}
                          text-white rounded-xl font-medium transition-all
                          hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed
                          flex items-center justify-center gap-2`}
              >
                {isSaving ? (
                  'Saving...'
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Save Message
                  </>
                )}
              </button>
            </div>

            {/* Footer */}
            <p className="text-center text-gray-500 text-xs mt-4 italic">
              This message will be shown to you during moments of doubt.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TimeCapsulePrompt;
