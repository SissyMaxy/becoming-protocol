/**
 * JournalPrompt — Inline daily journal below task cards.
 * Shows a rotating Handler-framed prompt, textarea, and submit.
 * Saves to daily_entries via saveJournalEntry (UPSERT).
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { saveJournalEntry, getJournalEntries } from '../../lib/dashboard-analytics';
import type { HandlerMode } from '../../hooks/useUserState';

interface JournalPromptProps {
  userId: string;
  handlerMode: HandlerMode;
}

const PROMPTS = [
  "What did she notice today?",
  "What felt different this morning?",
  "What would Maxy do that David wouldn't?",
  "What are you avoiding? Name it.",
  "How did your body feel during practice?",
  "What's one thing you did today that surprised you?",
  "What did the Handler get right today?",
];

function getDailyPrompt(): string {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return PROMPTS[dayOfYear % PROMPTS.length];
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function JournalPrompt({ userId }: JournalPromptProps) {
  const { isBambiMode } = useBambiMode();
  const [text, setText] = useState('');
  const [savedText, setSavedText] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Check for existing entry today
  const loadExisting = useCallback(async () => {
    try {
      const entries = await getJournalEntries(userId, 1);
      if (entries.length > 0 && entries[0].date === getTodayDate() && entries[0].freeText) {
        setSavedText(entries[0].freeText);
      }
    } catch {
      // Silently fail — show empty prompt
    }
    setLoaded(true);
  }, [userId]);

  useEffect(() => { loadExisting(); }, [loadExisting]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setIsSubmitting(true);
    const ok = await saveJournalEntry(userId, getTodayDate(), { freeText: text.trim() });
    setIsSubmitting(false);
    if (ok) {
      setSavedText(text.trim());
      setText('');
      setIsEditing(false);
    }
  };

  const handleEdit = () => {
    setText(savedText || '');
    setIsEditing(true);
  };

  if (!loaded) return null;

  const prompt = getDailyPrompt();
  const showInput = !savedText || isEditing;

  return (
    <div className={`rounded-xl p-4 ${
      isBambiMode
        ? 'bg-pink-50/60 border border-pink-200'
        : 'bg-protocol-surface/40 border border-protocol-border'
    }`}>
      {/* Prompt */}
      <p className={`text-sm italic mb-3 handler-voice ${
        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
      }`}>
        {prompt}
      </p>

      {showInput ? (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder="Write freely..."
            className={`w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 ${
              isBambiMode
                ? 'bg-white border border-pink-200 text-gray-800 placeholder-pink-300 focus:ring-pink-400'
                : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder-protocol-text-muted/50 focus:ring-protocol-accent'
            }`}
          />
          <div className="flex justify-end mt-2">
            {isEditing && (
              <button
                onClick={() => { setIsEditing(false); setText(''); }}
                className={`text-xs mr-3 px-3 py-1.5 rounded-lg ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || isSubmitting}
              className={`text-xs px-4 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent/80'
              }`}
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Log'}
            </button>
          </div>
        </>
      ) : (
        <div>
          <p className={`text-sm leading-relaxed ${
            isBambiMode ? 'text-pink-700/70' : 'text-protocol-text/60'
          }`}>
            {savedText}
          </p>
          <button
            onClick={handleEdit}
            className={`mt-2 text-xs flex items-center gap-1 ${
              isBambiMode ? 'text-pink-400 hover:text-pink-600' : 'text-protocol-text-muted hover:text-protocol-text'
            }`}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
