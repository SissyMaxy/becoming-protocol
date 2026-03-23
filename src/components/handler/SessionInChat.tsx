/**
 * SessionInChat — session controls embedded inside the Handler conversation.
 *
 * When the Handler prescribes a session, these controls appear inline
 * in the chat — not as a separate full-screen view.
 * Start, edge tracking, and completion all happen in context.
 */

import { useState, useEffect, useRef } from 'react';

interface SessionInChatProps {
  sessionType: 'anchoring' | 'exploration' | 'endurance';
  targetEdges: number;
  onComplete: (result: { edgeCount: number; duration: number; completed: boolean }) => void;
  onCancel: () => void;
}

export function SessionInChat({
  sessionType,
  targetEdges,
  onComplete,
  onCancel,
}: SessionInChatProps) {
  const [edgeCount, setEdgeCount] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startSession = () => {
    setIsActive(true);
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
  };

  const recordEdge = () => {
    setEdgeCount(prev => prev + 1);
  };

  const completeSession = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsActive(false);
    onComplete({
      edgeCount,
      duration: elapsed,
      completed: edgeCount >= targetEdges,
    });
  };

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progress = Math.min(1, edgeCount / targetEdges);

  if (!isActive) {
    return (
      <div className="bg-[#1a1a2e] border border-purple-800/30 rounded-xl p-4 mx-2 my-2">
        <div className="text-gray-400 text-xs uppercase tracking-wider mb-2">
          {sessionType} session prescribed
        </div>
        <div className="text-gray-300 text-sm mb-3">
          Target: {targetEdges} edges
        </div>
        <div className="flex gap-2">
          <button
            onClick={startSession}
            className="flex-1 py-2.5 bg-purple-600/70 text-white rounded-lg text-sm font-medium hover:bg-purple-500/70"
          >
            Begin
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 text-gray-500 text-sm hover:text-gray-400"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#1a1a2e] border border-purple-500/30 rounded-xl p-4 mx-2 my-2">
      {/* Timer */}
      <div className="text-center mb-3">
        <div className="text-2xl font-mono text-purple-300">{formatTime(elapsed)}</div>
        <div className="text-xs text-gray-500 mt-1">{sessionType}</div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-1.5 mb-3">
        <div
          className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Edge count */}
      <div className="text-center mb-4">
        <span className="text-3xl font-bold text-white">{edgeCount}</span>
        <span className="text-gray-500 text-sm ml-1">/ {targetEdges}</span>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={recordEdge}
          className="flex-1 py-3 bg-red-600/60 text-white rounded-lg text-sm font-medium hover:bg-red-500/60 active:bg-red-700/60"
        >
          Edge
        </button>
        <button
          onClick={completeSession}
          className="flex-1 py-3 bg-gray-700/60 text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-600/60"
        >
          {edgeCount >= targetEdges ? 'Complete' : 'End Early'}
        </button>
      </div>
    </div>
  );
}
