/**
 * Morning Bookend — full-screen overlay shown on first open each day.
 */

interface MorningBookendProps {
  name: string;
  denialDay: number;
  streak: number;
  message: string;
  onDismiss: () => void;
}

export function MorningBookend({ name, denialDay, streak, message, onDismiss }: MorningBookendProps) {
  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-8 cursor-pointer select-none"
      style={{
        background: 'linear-gradient(135deg, #1a1025 0%, #0d0d1a 40%, #1a0a2e 100%)',
      }}
    >
      {/* Subtle glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-purple-500/10 blur-3xl" />

      <div className="relative z-10 text-center max-w-sm">
        {/* Greeting */}
        <h1 className="text-3xl font-bold text-white mb-2 animate-fade-in">
          Good morning, {name}.
        </h1>

        {/* Day / Streak */}
        <p className="text-white/40 text-sm mb-8">
          Day {denialDay} &middot; {streak} day streak
        </p>

        {/* Handler message */}
        <p className="text-white/70 text-base italic leading-relaxed mb-12">
          &ldquo;{message}&rdquo;
        </p>

        {/* Tap hint */}
        <p className="text-white/20 text-xs animate-pulse">
          tap anywhere to begin
        </p>
      </div>
    </div>
  );
}
