/**
 * MicStatus — Shows microphone state (active/inactive/error)
 * @param {{ status: 'inactive' | 'active' | 'error', errorMessage?: string, onStart: () => void }} props
 */
export function MicStatus({ status, errorMessage, onStart }) {
  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-red-500/10 border border-red-500/20">
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 01-3-3V5a3 3 0 116 0v7a3 3 0 01-3 3z" />
            <line x1="4" y1="4" x2="20" y2="20" strokeWidth={2} />
          </svg>
        </div>
        <p className="text-sm text-red-400 text-center max-w-xs">
          {errorMessage || 'Microphone access is required for voice training. Please enable it in your browser settings.'}
        </p>
        <button
          onClick={onStart}
          className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (status === 'inactive') {
    return (
      <div className="flex flex-col items-center gap-4 p-8">
        <button
          onClick={onStart}
          className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center hover:bg-emerald-500/30 hover:border-emerald-500/60 transition-all active:scale-95"
        >
          <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 01-3-3V5a3 3 0 116 0v7a3 3 0 01-3 3z" />
          </svg>
        </button>
        <p className="text-sm text-gray-400">Tap to start listening</p>
      </div>
    );
  }

  // Active
  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      <span className="text-xs text-emerald-400 font-medium">Listening</span>
    </div>
  );
}
