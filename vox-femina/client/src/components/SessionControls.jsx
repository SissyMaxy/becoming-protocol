/**
 * SessionControls — Start / Pause / Resume / Stop buttons with timer display.
 *
 * @param {{
 *   sessionState: 'idle' | 'active' | 'paused' | 'stopped',
 *   elapsedSeconds: number,
 *   onStart: () => void,
 *   onPause: () => void,
 *   onResume: () => void,
 *   onStop: () => void,
 * }} props
 */
export function SessionControls({ sessionState, elapsedSeconds, onStart, onPause, onResume, onStop }) {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = Math.floor(elapsedSeconds % 60);
  const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (sessionState === 'stopped') return null;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Timer + recording indicator */}
      {sessionState !== 'idle' && (
        <div className="flex items-center gap-3">
          {sessionState === 'active' && (
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
          {sessionState === 'paused' && (
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          )}
          <span className="text-3xl font-mono font-bold tabular-nums text-gray-100">
            {timeStr}
          </span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center gap-3">
        {sessionState === 'idle' && (
          <button
            onClick={onStart}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-500 transition-colors"
          >
            Start Session
          </button>
        )}

        {sessionState === 'active' && (
          <>
            <button
              onClick={onPause}
              className="px-5 py-2 rounded-xl bg-gray-800 text-gray-300 font-medium text-sm hover:bg-gray-700 transition-colors"
            >
              Pause
            </button>
            <button
              onClick={onStop}
              className="px-5 py-2 rounded-xl bg-red-600/80 text-white font-medium text-sm hover:bg-red-500 transition-colors"
            >
              Stop
            </button>
          </>
        )}

        {sessionState === 'paused' && (
          <>
            <button
              onClick={onResume}
              className="px-5 py-2 rounded-xl bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-500 transition-colors"
            >
              Resume
            </button>
            <button
              onClick={onStop}
              className="px-5 py-2 rounded-xl bg-red-600/80 text-white font-medium text-sm hover:bg-red-500 transition-colors"
            >
              Stop
            </button>
          </>
        )}
      </div>
    </div>
  );
}
