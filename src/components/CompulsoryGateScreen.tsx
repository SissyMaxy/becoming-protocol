// CompulsoryGateScreen - App Lock Screen (Feature 38)
// Locks the app until compulsory daily elements are completed
// This is the single most forceful mechanic in the system.
// Elements that require logging show inline forms instead of just "Done".

import { useState, useEffect } from 'react';
import {
  Lock,
  Clock,
  CheckCircle2,
  Loader2,
  Smile,
  Frown,
  Meh,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  type CompulsoryElement,
  type PhysicalState,
  getAppBlockingElements,
  completeCompulsoryElement,
  evaluateCompulsoryStatus,
  saveMorningCheckin,
  savePhysicalStateLog,
  type CompulsoryStatus,
} from '../lib/compulsory-elements';

// Elements that need inline forms (not just "Done")
const ELEMENTS_WITH_FORMS = new Set([
  'morning_checkin',
  'physical_state_log',
  'evening_log',
]);

// Physical state items with labels
const PHYSICAL_STATE_ITEMS: { key: keyof PhysicalState; label: string }[] = [
  { key: 'cage_on', label: 'Cage' },
  { key: 'panties', label: 'Panties' },
  { key: 'plug', label: 'Plug' },
  { key: 'feminine_clothing', label: 'Feminine clothing' },
  { key: 'nail_polish', label: 'Nail polish' },
  { key: 'scent_anchor', label: 'Scent anchor' },
  { key: 'jewelry', label: 'Jewelry' },
];

interface CompulsoryGateScreenProps {
  daysOnProtocol: number;
  onUnlock: () => void;
}

export function CompulsoryGateScreen({
  daysOnProtocol,
  onUnlock,
}: CompulsoryGateScreenProps) {
  const { user } = useAuth();
  const [blockingElements, setBlockingElements] = useState<CompulsoryElement[]>([]);
  const [allStatuses, setAllStatuses] = useState<CompulsoryStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Form state for morning check-in
  const [morningMood, setMorningMood] = useState<number | null>(null);
  const [morningIntention, setMorningIntention] = useState('');

  // Form state for physical state log
  const [physicalState, setPhysicalState] = useState<PhysicalState>({
    cage_on: false,
    panties: false,
    plug: false,
    feminine_clothing: false,
    nail_polish: false,
    scent_anchor: false,
    jewelry: false,
  });

  // Form state for evening log
  const [eveningDavid, setEveningDavid] = useState('');
  const [eveningMaxy, setEveningMaxy] = useState('');

  // Load blocking elements
  useEffect(() => {
    async function loadBlockingElements() {
      if (!user?.id) return;

      setIsLoading(true);
      try {
        const [blocking, statuses] = await Promise.all([
          getAppBlockingElements(user.id, daysOnProtocol),
          evaluateCompulsoryStatus(user.id, daysOnProtocol),
        ]);
        setBlockingElements(blocking);
        setAllStatuses(statuses);

        // If no blocking elements, unlock
        if (blocking.length === 0) {
          onUnlock();
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadBlockingElements();
  }, [user?.id, daysOnProtocol, onUnlock]);

  // Refresh after completing
  const refreshAndCheck = async () => {
    if (!user?.id) return;
    const [blocking, statuses] = await Promise.all([
      getAppBlockingElements(user.id, daysOnProtocol),
      evaluateCompulsoryStatus(user.id, daysOnProtocol),
    ]);
    setBlockingElements(blocking);
    setAllStatuses(statuses);
    if (blocking.length === 0) {
      onUnlock();
    }
  };

  // Handle "Done" for simple confirmation elements (skincare, voice)
  const handleSimpleComplete = async (element: CompulsoryElement) => {
    if (!user?.id || completingId) return;

    setCompletingId(element.id);
    try {
      const success = await completeCompulsoryElement(user.id, element.id);
      if (success) await refreshAndCheck();
    } finally {
      setCompletingId(null);
    }
  };

  // Handle morning check-in submission
  const handleMorningSubmit = async () => {
    if (!user?.id || completingId || morningMood === null) return;

    setCompletingId('morning_checkin');
    try {
      const success = await saveMorningCheckin(user.id, morningMood, morningIntention);
      if (success) {
        setExpandedId(null);
        await refreshAndCheck();
      }
    } finally {
      setCompletingId(null);
    }
  };

  // Handle physical state submission
  const handlePhysicalStateSubmit = async () => {
    if (!user?.id || completingId) return;

    setCompletingId('physical_state_log');
    try {
      const success = await savePhysicalStateLog(user.id, physicalState);
      if (success) {
        setExpandedId(null);
        await refreshAndCheck();
      }
    } finally {
      setCompletingId(null);
    }
  };

  // Handle evening log submission
  const handleEveningSubmit = async () => {
    if (!user?.id || completingId) return;

    setCompletingId('evening_log');
    try {
      const notes = [
        eveningDavid.trim() && `David: ${eveningDavid.trim()}`,
        eveningMaxy.trim() && `Maxy: ${eveningMaxy.trim()}`,
      ].filter(Boolean).join('\n');

      const success = await completeCompulsoryElement(user.id, 'evening_log', notes || undefined);
      if (success) {
        setExpandedId(null);
        await refreshAndCheck();
      }
    } finally {
      setCompletingId(null);
    }
  };

  // Toggle expanding a form element
  const toggleExpand = (elementId: string) => {
    setExpandedId(prev => prev === elementId ? null : elementId);
  };

  // Calculate progress
  const requiredCount = allStatuses.filter(s => s.isRequired && s.blocksApp).length;
  const completedCount = allStatuses.filter(s => s.isRequired && s.blocksApp && s.completed).length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex flex-col items-center justify-center px-6">
        <Loader2 className="w-10 h-10 text-pink-500 animate-spin mb-4" />
        <p className="text-gray-400 text-sm">Checking daily requirements...</p>
      </div>
    );
  }

  // Mood options for morning check-in
  const moodOptions = [
    { value: 2, label: 'Low', icon: Frown, color: 'text-red-400' },
    { value: 5, label: 'Okay', icon: Meh, color: 'text-yellow-400' },
    { value: 8, label: 'Good', icon: Smile, color: 'text-green-400' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-950 flex flex-col px-6 py-12">
      {/* Handler message */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white font-bold text-lg">H</span>
        </div>
        <div>
          <p className="text-gray-100 text-xl font-semibold">First things first.</p>
          <p className="text-gray-400 text-sm">The rest of the app unlocks when these are done.</p>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-gray-400 text-sm">Progress</span>
          <span className="text-pink-400 text-sm font-medium">
            {completedCount}/{requiredCount}
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-500"
            style={{ width: `${(completedCount / Math.max(requiredCount, 1)) * 100}%` }}
          />
        </div>
      </div>

      {/* Compulsory elements list */}
      <div className="space-y-4 flex-1">
        {blockingElements.map((element) => {
          const status = allStatuses.find(s => s.element.id === element.id);
          const isCompleting = completingId === element.id;
          const hasForm = ELEMENTS_WITH_FORMS.has(element.id);
          const isExpanded = expandedId === element.id;

          return (
            <div
              key={element.id}
              className={`rounded-xl border transition-all overflow-hidden ${
                status?.completed
                  ? 'bg-green-900/20 border-green-700/30'
                  : isExpanded
                    ? 'bg-gray-800/70 border-pink-500/40'
                    : 'bg-gray-800/50 border-gray-700/50 hover:border-pink-500/30'
              }`}
            >
              {/* Header row */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {status?.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      ) : (
                        <Lock className="w-5 h-5 text-pink-400" />
                      )}
                      <h3 className={`font-semibold ${
                        status?.completed ? 'text-green-300' : 'text-gray-100'
                      }`}>
                        {element.name}
                      </h3>
                    </div>
                    <p className="text-gray-400 text-sm mb-2">
                      {element.description}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        ~{element.estimatedMinutes} min
                      </span>
                      <span>
                        Due by {element.mustCompleteBy}
                      </span>
                    </div>
                  </div>

                  {!status?.completed && (
                    hasForm ? (
                      <button
                        onClick={() => toggleExpand(element.id)}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium text-sm hover:from-pink-600 hover:to-purple-600 transition-all shadow-lg shadow-pink-500/20 flex items-center gap-1.5"
                      >
                        Log
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSimpleComplete(element)}
                        disabled={isCompleting}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium text-sm hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/20"
                      >
                        {isCompleting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Done'
                        )}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* ===== INLINE FORMS ===== */}

              {/* Morning Check-In Form */}
              {element.id === 'morning_checkin' && isExpanded && !status?.completed && (
                <div className="px-4 pb-4 border-t border-gray-700/50 pt-4 space-y-4">
                  {/* Mood */}
                  <div>
                    <label className="text-xs font-medium text-gray-400 mb-2 block">
                      How are you feeling?
                    </label>
                    <div className="flex gap-2">
                      {moodOptions.map(option => {
                        const Icon = option.icon;
                        const isSelected = morningMood === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => setMorningMood(option.value)}
                            className={`flex-1 p-3 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                              isSelected
                                ? 'bg-pink-500/30 border-2 border-pink-400 text-pink-300'
                                : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:border-gray-500'
                            }`}
                          >
                            <Icon className="w-5 h-5" />
                            <span className="text-sm">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Intention */}
                  <div>
                    <label className="text-xs font-medium text-gray-400 mb-2 block">
                      Intention for today
                    </label>
                    <input
                      type="text"
                      value={morningIntention}
                      onChange={(e) => setMorningIntention(e.target.value)}
                      placeholder="What's your focus today?"
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-600 bg-gray-700/50 text-gray-100 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleMorningSubmit}
                    disabled={morningMood === null || isCompleting}
                    className="w-full py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium text-sm hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isCompleting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </span>
                    ) : morningMood === null ? (
                      'Select your mood to continue'
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Save Check-In
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Physical State Form */}
              {element.id === 'physical_state_log' && isExpanded && !status?.completed && (
                <div className="px-4 pb-4 border-t border-gray-700/50 pt-4 space-y-3">
                  <label className="text-xs font-medium text-gray-400 block">
                    What are you wearing/using right now?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PHYSICAL_STATE_ITEMS.map(item => {
                      const isOn = physicalState[item.key];
                      return (
                        <button
                          key={item.key}
                          onClick={() => setPhysicalState(prev => ({
                            ...prev,
                            [item.key]: !prev[item.key],
                          }))}
                          className={`p-3 rounded-lg text-sm text-left transition-colors ${
                            isOn
                              ? 'bg-pink-500/30 border-2 border-pink-400 text-pink-300'
                              : 'bg-gray-700/50 border border-gray-600 text-gray-400 hover:border-gray-500'
                          }`}
                        >
                          {isOn ? '\u2713 ' : ''}{item.label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Submit buttons */}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handlePhysicalStateSubmit}
                      disabled={isCompleting}
                      className="flex-1 py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium text-sm hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isCompleting ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </span>
                      ) : Object.values(physicalState).some(Boolean) ? (
                        <span className="flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          Save Physical State
                        </span>
                      ) : (
                        'Nothing right now'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Evening Reflection Form */}
              {element.id === 'evening_log' && isExpanded && !status?.completed && (
                <div className="px-4 pb-4 border-t border-gray-700/50 pt-4 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-gray-400 mb-2 block">
                      How was David today? (one moment)
                    </label>
                    <textarea
                      value={eveningDavid}
                      onChange={(e) => setEveningDavid(e.target.value)}
                      placeholder="One moment from David's day..."
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-600 bg-gray-700/50 text-gray-100 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-400 mb-2 block">
                      How was Maxy today? (one moment)
                    </label>
                    <textarea
                      value={eveningMaxy}
                      onChange={(e) => setEveningMaxy(e.target.value)}
                      placeholder="One moment from Maxy's day..."
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-600 bg-gray-700/50 text-gray-100 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500/50 resize-none"
                    />
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleEveningSubmit}
                    disabled={isCompleting || (!eveningDavid.trim() && !eveningMaxy.trim())}
                    className="w-full py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-500 text-white font-medium text-sm hover:from-pink-600 hover:to-purple-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isCompleting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </span>
                    ) : (!eveningDavid.trim() && !eveningMaxy.trim()) ? (
                      'Write at least one reflection'
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Save Reflection
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Lock notice */}
      <div className="mt-8 p-4 rounded-xl bg-gray-800/30 border border-gray-700/50">
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-amber-300 text-sm font-medium">App Locked</p>
            <p className="text-gray-400 text-xs">
              Complete all required elements to access the full app.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CompulsoryGateScreen;
