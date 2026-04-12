import { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Loader2, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface AudioConfessionProps {
  prompt: string;
  minDurationSeconds?: number;
  onComplete: (transcript: string) => void;
}

export function AudioConfession({ prompt, minDurationSeconds = 30, onComplete }: AudioConfessionProps) {
  const { user } = useAuth();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<any>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(1000);
      setRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed(s => s + 1);
      }, 1000);

      // Start speech recognition for transcript
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const recognition = new SR();
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;
        let finalTranscript = '';
        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          setTranscript(finalTranscript + interim);
        };
        recognition.onerror = () => {};
        recognitionRef.current = recognition;
        recognition.start();
      }
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }

    return new Promise<void>((resolve) => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = () => resolve();
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      } else {
        resolve();
      }
    });
  };

  const handleSubmit = async () => {
    if (!user?.id || elapsed < minDurationSeconds) return;
    setSubmitting(true);
    await stopRecording();

    try {
      // Save transcript to shame_journal
      const finalText = transcript.trim() || '(audio only — no transcript captured)';
      await supabase.from('shame_journal').insert({
        user_id: user.id,
        entry_text: `[AUDIO CONFESSION] ${finalText}`,
        prompt_used: prompt,
        emotional_intensity: 8,
      });

      // Log to handler_notes
      await supabase.from('handler_notes').insert({
        user_id: user.id,
        note_type: 'audio_confession',
        content: `Audio confession (${elapsed}s): "${finalText.substring(0, 200)}"`,
        priority: 4,
      });

      setDone(true);
      onComplete(finalText);
    } catch (err) {
      console.error('Confession submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) try { recognitionRef.current.stop(); } catch {}
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  if (done) {
    return (
      <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-6 text-center">
        <Check className="w-8 h-8 mx-auto text-purple-400 mb-2" />
        <p className="text-white font-medium">Confession recorded.</p>
        <p className="text-xs text-gray-500 mt-1">Your voice is permanent evidence.</p>
      </div>
    );
  }

  return (
    <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 space-y-4">
      <p className="text-lg text-red-200 italic text-center">"{prompt}"</p>
      <p className="text-xs text-gray-400 text-center">
        Say it out loud. Min {minDurationSeconds} seconds. Your voice will be recorded and transcribed.
      </p>

      <div className="text-center">
        <p className="text-4xl font-bold text-white">{elapsed}s</p>
        <p className="text-xs text-gray-500">
          {elapsed < minDurationSeconds ? `${minDurationSeconds - elapsed}s remaining` : 'Ready to submit'}
        </p>
      </div>

      {transcript && (
        <div className="bg-black/30 rounded-lg p-3 text-sm text-gray-300 max-h-24 overflow-y-auto">
          {transcript}
        </div>
      )}

      <div className="flex gap-2">
        {!recording ? (
          <button
            onClick={startRecording}
            className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium flex items-center justify-center gap-2"
          >
            <Mic className="w-5 h-5" /> Start recording
          </button>
        ) : (
          <>
            <button
              onClick={handleSubmit}
              disabled={elapsed < minDurationSeconds || submitting}
              className="flex-1 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Check className="w-5 h-5" /> Submit</>}
            </button>
            <button
              onClick={() => { stopRecording(); setRecording(false); }}
              className="px-4 py-3 rounded-xl bg-gray-800 text-gray-400"
            >
              <MicOff className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
