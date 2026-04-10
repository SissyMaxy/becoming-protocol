import { useState, useEffect } from 'react';

interface TimeLockedDismissProps {
  delaySeconds: number;
  onDismiss: () => void;
  label?: string;
  className?: string;
}

export function TimeLockedDismiss({
  delaySeconds,
  onDismiss,
  label = 'Dismiss',
  className = '',
}: TimeLockedDismissProps) {
  const [secondsLeft, setSecondsLeft] = useState(delaySeconds);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const enabled = secondsLeft <= 0;

  return (
    <button
      disabled={!enabled}
      onClick={enabled ? onDismiss : undefined}
      className={`px-4 py-2 rounded-lg text-sm transition-all ${
        enabled
          ? 'bg-gray-700 text-white hover:bg-gray-600 cursor-pointer'
          : 'bg-gray-900 text-gray-500 cursor-not-allowed'
      } ${className}`}
    >
      {enabled ? label : `${label} in ${secondsLeft}s...`}
    </button>
  );
}
