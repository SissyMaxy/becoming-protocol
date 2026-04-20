import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Props {
  sourceId: string;
  audioUrl: string;
  scriptPreview?: string;
  onClose: () => void;
}

// Minimal player for a generated hypno session.
// Starts a play-tracking row on play, closes it with edges on stop.

export function GeneratedSessionPlayer({ sourceId, audioUrl, scriptPreview, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [edges, setEdges] = useState(0);
  const [playId, setPlayId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      // On unmount, close play if still open
      if (playId) {
        void closePlay(playId, edges);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPlay = async () => {
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) return;
      const resp = await fetch('/api/hypno/play', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'start', sourceId }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { playId: string };
        setPlayId(data.playId);
      }
    } catch {
      // non-critical
    }
  };

  const handlePlay = () => {
    setPlaying(true);
    if (!playId) void startPlay();
    audioRef.current?.play();
  };

  const handlePause = () => {
    setPlaying(false);
    audioRef.current?.pause();
  };

  const handleEnd = async () => {
    setPlaying(false);
    if (playId) {
      await closePlay(playId, edges);
      setPlayId(null);
    }
  };

  const handleClose = async () => {
    handlePause();
    if (playId) await closePlay(playId, edges);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] bg-[#0a0a0a]/95 flex items-center justify-center p-4">
      <div className="bg-[#141414] rounded-xl p-6 max-w-2xl w-full border border-gray-800/50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-gray-200">Generated session</div>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-300 text-sm">
            Close
          </button>
        </div>

        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={handleEnd}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          controls
          className="w-full"
        />

        <div className="flex items-center gap-2">
          {!playing ? (
            <button
              onClick={handlePlay}
              className="px-4 py-2 rounded bg-purple-600/40 text-purple-100 hover:bg-purple-600/60 text-sm"
            >
              Play
            </button>
          ) : (
            <button
              onClick={handlePause}
              className="px-4 py-2 rounded bg-gray-700 text-gray-100 hover:bg-gray-600 text-sm"
            >
              Pause
            </button>
          )}
          <button
            onClick={() => setEdges((e) => e + 1)}
            className="px-4 py-2 rounded bg-red-600/30 text-red-200 hover:bg-red-600/50 text-sm"
          >
            Edge ({edges})
          </button>
        </div>

        {scriptPreview && (
          <details className="text-xs text-gray-400">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-300">
              Script preview
            </summary>
            <div className="mt-2 whitespace-pre-wrap max-h-64 overflow-y-auto p-2 bg-[#0a0a0a] rounded">
              {scriptPreview}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

async function closePlay(playId: string, edges: number): Promise<void> {
  try {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) return;
    await fetch('/api/hypno/play', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'end', playId, edges }),
    });
  } catch {
    // non-critical
  }
}
