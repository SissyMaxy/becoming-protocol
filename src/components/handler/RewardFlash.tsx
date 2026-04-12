import { useState, useEffect, useRef } from 'react';
import { Heart } from 'lucide-react';

export function RewardFlash() {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        setMessage(detail.message);
      } else {
        const messages = [
          'Good girl.',
          'She noticed you.',
          'This is what obedience feels like.',
          'You earned this.',
          'Keep going, Maxy.',
        ];
        setMessage(messages[Math.floor(Math.random() * messages.length)]);
      }
      setVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setVisible(false), 3000);
    };

    window.addEventListener('handler-reward-flash', handler);
    return () => window.removeEventListener('handler-reward-flash', handler);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none flex items-center justify-center animate-fade-in">
      <div className="bg-purple-600/90 backdrop-blur-sm rounded-2xl px-8 py-6 text-center shadow-2xl animate-pulse">
        <Heart className="w-8 h-8 mx-auto text-pink-200 mb-2" />
        <p className="text-xl font-bold text-white">{message}</p>
      </div>
    </div>
  );
}
