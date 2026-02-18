/**
 * Journal View
 *
 * Phase G2: Full journal with alignment score (1-10), euphoria/dysphoria notes,
 * free text entry, evidence capture integration, and chronological timeline.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Star, Sparkles, CloudRain, FileText, Save, Check,
  ChevronDown, ChevronUp, Loader2, Camera,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  getJournalEntries,
  saveJournalEntry,
  type JournalEntryData,
} from '../../lib/dashboard-analytics';

// ── Alignment slider ──

function AlignmentInput({ value, onChange, isBambiMode }: {
  value: number;
  onChange: (v: number) => void;
  isBambiMode: boolean;
}) {
  const labels = [
    'Disconnected', 'Struggling', 'Off', 'Uncertain', 'Neutral',
    'Okay', 'Good', 'Aligned', 'Flowing', 'Radiant',
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
          How aligned today?
        </span>
        <span className={`text-lg font-bold ${isBambiMode ? 'text-pink-600' : 'text-purple-400'}`}>
          {value}/10
        </span>
      </div>

      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <button key={n} onClick={() => onChange(n)} className="p-0.5">
            <Star className={`w-5 h-5 transition-colors ${
              n <= value
                ? isBambiMode ? 'fill-pink-500 text-pink-500' : 'fill-purple-500 text-purple-500'
                : isBambiMode ? 'text-pink-200' : 'text-gray-700'
            }`} />
          </button>
        ))}
      </div>

      <p className={`text-center text-xs font-medium ${isBambiMode ? 'text-pink-500' : 'text-gray-300'}`}>
        {labels[value - 1] || ''}
      </p>
    </div>
  );
}

// ── Text area field ──

function JournalField({ icon, label, placeholder, value, onChange, color, isBambiMode }: {
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  color: string;
  isBambiMode: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className={`flex items-center gap-1.5 text-xs font-medium ${
        isBambiMode ? 'text-pink-700' : 'text-gray-300'
      }`}>
        <span style={{ color }}>{icon}</span>
        {label}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`w-full px-3 py-2 rounded-lg text-sm resize-none transition-colors ${
          isBambiMode
            ? 'bg-pink-50 border border-pink-200 text-pink-800 placeholder:text-pink-300 focus:border-pink-400'
            : 'bg-white/5 border border-white/10 text-gray-200 placeholder:text-gray-600 focus:border-purple-500'
        } focus:outline-none focus:ring-1 ${isBambiMode ? 'focus:ring-pink-400' : 'focus:ring-purple-500'}`}
      />
    </div>
  );
}

// ── Timeline entry ──

function TimelineEntry({ entry, isBambiMode }: { entry: JournalEntryData; isBambiMode: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = entry.euphoriaNote || entry.dysphoriaNote || entry.freeText;

  return (
    <div className={`rounded-lg p-3 ${isBambiMode ? 'bg-pink-50' : 'bg-white/5'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
            entry.alignmentScore !== null
              ? entry.alignmentScore >= 7
                ? 'bg-green-500/20 text-green-400'
                : entry.alignmentScore >= 4
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-red-500/20 text-red-400'
              : isBambiMode ? 'bg-pink-100 text-pink-400' : 'bg-white/10 text-gray-500'
          }`}>
            {entry.alignmentScore ?? '?'}
          </div>
          <div className="text-left">
            <div className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>
              {entry.date}
            </div>
            <div className={`text-[10px] ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
              {entry.tasksCompleted} tasks · {entry.pointsEarned} pts
            </div>
          </div>
        </div>
        {hasContent && (
          expanded
            ? <ChevronUp className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`} />
            : <ChevronDown className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`} />
        )}
      </button>

      {expanded && hasContent && (
        <div className="mt-2 pt-2 border-t border-white/5 space-y-2">
          {entry.euphoriaNote && (
            <div>
              <span className="text-[10px] text-green-400 font-medium">Euphoria</span>
              <p className={`text-xs ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
                {entry.euphoriaNote}
              </p>
            </div>
          )}
          {entry.dysphoriaNote && (
            <div>
              <span className="text-[10px] text-yellow-400 font-medium">Dysphoria</span>
              <p className={`text-xs ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
                {entry.dysphoriaNote}
              </p>
            </div>
          )}
          {entry.freeText && (
            <div>
              <span className="text-[10px] text-purple-400 font-medium">Notes</span>
              <p className={`text-xs ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
                {entry.freeText}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main JournalView ──

type JournalTab = 'write' | 'timeline';

export function JournalView() {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [tab, setTab] = useState<JournalTab>('write');

  // Entry form state
  const today = new Date().toISOString().split('T')[0];
  const [alignment, setAlignment] = useState(5);
  const [euphoria, setEuphoria] = useState('');
  const [dysphoria, setDysphoria] = useState('');
  const [freeText, setFreeText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Timeline state
  const [entries, setEntries] = useState<JournalEntryData[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!user) return;
    setLoadingEntries(true);
    try {
      const data = await getJournalEntries(user.id, 30);
      setEntries(data);

      // If today's entry exists, load it into the form
      const todayEntry = data.find(e => e.date === today);
      if (todayEntry) {
        setAlignment(todayEntry.alignmentScore ?? 5);
        setEuphoria(todayEntry.euphoriaNote ?? '');
        setDysphoria(todayEntry.dysphoriaNote ?? '');
        setFreeText(todayEntry.freeText ?? '');
        setSaved(true);
      }
    } catch (err) {
      console.error('Failed to load journal entries:', err);
    } finally {
      setLoadingEntries(false);
    }
  }, [user, today]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  // Mark unsaved on change
  useEffect(() => { setSaved(false); }, [alignment, euphoria, dysphoria, freeText]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const ok = await saveJournalEntry(user.id, today, {
        alignmentScore: alignment,
        euphoriaNote: euphoria || undefined,
        dysphoriaNote: dysphoria || undefined,
        freeText: freeText || undefined,
      });
      if (ok) {
        setSaved(true);
        loadEntries(); // refresh timeline
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BookOpen className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
        <h2 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
          Journal
        </h2>
      </div>

      {/* Tabs */}
      <div className={`flex rounded-lg overflow-hidden ${
        isBambiMode ? 'bg-pink-100' : 'bg-white/5'
      }`}>
        {(['write', 'timeline'] as JournalTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? isBambiMode ? 'bg-pink-500 text-white' : 'bg-purple-600 text-white'
                : isBambiMode ? 'text-pink-600' : 'text-gray-400'
            }`}
          >
            {t === 'write' ? 'Today' : 'Timeline'}
          </button>
        ))}
      </div>

      {tab === 'write' ? (
        <div className="space-y-4">
          {/* Date display */}
          <div className={`text-center text-sm ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>

          {/* Alignment score */}
          <div className={`rounded-lg p-4 ${
            isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
          }`}>
            <AlignmentInput value={alignment} onChange={setAlignment} isBambiMode={isBambiMode} />
          </div>

          {/* Euphoria */}
          <div className={`rounded-lg p-4 ${
            isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
          }`}>
            <JournalField
              icon={<Sparkles className="w-3.5 h-3.5" />}
              label="Euphoria moments"
              placeholder="What felt right today?"
              value={euphoria}
              onChange={setEuphoria}
              color="#22c55e"
              isBambiMode={isBambiMode}
            />
          </div>

          {/* Dysphoria */}
          <div className={`rounded-lg p-4 ${
            isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
          }`}>
            <JournalField
              icon={<CloudRain className="w-3.5 h-3.5" />}
              label="Dysphoria notes"
              placeholder="What was difficult?"
              value={dysphoria}
              onChange={setDysphoria}
              color="#f59e0b"
              isBambiMode={isBambiMode}
            />
          </div>

          {/* Free text */}
          <div className={`rounded-lg p-4 ${
            isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
          }`}>
            <JournalField
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Free journal"
              placeholder="Anything else on your mind..."
              value={freeText}
              onChange={setFreeText}
              color={isBambiMode ? '#ec4899' : '#a855f7'}
              isBambiMode={isBambiMode}
            />
          </div>

          {/* Evidence capture link */}
          <button
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm ${
              isBambiMode
                ? 'bg-pink-50 text-pink-600 border border-pink-200'
                : 'bg-white/5 text-gray-400 border border-white/10'
            }`}
          >
            <Camera className="w-4 h-4" />
            Capture Evidence
          </button>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
              saved
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : isBambiMode
                  ? 'bg-pink-500 hover:bg-pink-600 text-white'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Entry
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {loadingEntries ? (
            <div className="flex justify-center py-8">
              <Loader2 className={`w-5 h-5 animate-spin ${isBambiMode ? 'text-pink-400' : 'text-purple-400'}`} />
            </div>
          ) : entries.length === 0 ? (
            <p className={`text-center py-8 text-sm ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
              No journal entries yet
            </p>
          ) : (
            entries.map(entry => (
              <TimelineEntry key={entry.id} entry={entry} isBambiMode={isBambiMode} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
