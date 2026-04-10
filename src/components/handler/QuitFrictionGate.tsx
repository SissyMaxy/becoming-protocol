import { useState, useEffect } from 'react';
import { AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { logQuitAttempt, checkActiveQuitAttempt, type QuitAttemptOptions } from '../../lib/quit-friction';
import { useAuth } from '../../context/AuthContext';

interface QuitFrictionGateProps {
  attemptType: QuitAttemptOptions['attemptType'];
  targetFeature?: string;
  triggerLabel: string;
  onApproved?: () => void;
  className?: string;
}

export function QuitFrictionGate({
  attemptType,
  targetFeature,
  triggerLabel,
  className = '',
}: QuitFrictionGateProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeAttempt, setActiveAttempt] = useState<{ cooldownUntil: Date } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [confirmText, setConfirmText] = useState('');

  const REQUIRED_PHRASE = "I am running from who I am becoming";

  useEffect(() => {
    if (!isOpen || !user?.id) return;
    checkActiveQuitAttempt(user.id, attemptType).then((result) => {
      if (result.active && result.cooldownUntil && result.cooldownUntil > new Date()) {
        setActiveAttempt({ cooldownUntil: result.cooldownUntil });
      }
    });
  }, [isOpen, user?.id, attemptType]);

  // 60-second forced wait when opening
  useEffect(() => {
    if (!isOpen || activeAttempt) return;
    setWaiting(true);
    setSecondsLeft(60);
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          setWaiting(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, activeAttempt]);

  const handleSubmit = async () => {
    if (!user?.id) return;
    if (reason.trim().length < 50) return;
    if (confirmText.trim() !== REQUIRED_PHRASE) return;

    setSubmitting(true);
    try {
      const result = await logQuitAttempt(user.id, {
        attemptType,
        targetFeature,
        reasonGiven: reason.trim(),
      });
      setActiveAttempt({ cooldownUntil: result.cooldownUntil });
    } catch (err) {
      console.error('Quit attempt failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const cooldownText = activeAttempt
    ? formatCooldown(activeAttempt.cooldownUntil)
    : null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`text-xs text-red-400 hover:text-red-300 underline ${className}`}
      >
        {triggerLabel}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[120] bg-black/95 flex items-center justify-center p-6">
          <div className="max-w-lg w-full space-y-4">
            {activeAttempt ? (
              <>
                <div className="text-center">
                  <Clock className="w-12 h-12 mx-auto text-amber-400 mb-2" />
                  <h2 className="text-2xl font-bold text-white">Cooldown Active</h2>
                  <p className="text-sm text-gray-400 mt-2">
                    You already attempted this. You committed to waiting.
                  </p>
                </div>
                <div className="bg-amber-900/30 border border-amber-500/30 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-amber-300">{cooldownText}</p>
                  <p className="text-xs text-amber-400 mt-2">until you can try again</p>
                </div>
                <p className="text-xs text-gray-500 text-center">
                  This is the system you built. It's working. Trust the architect.
                </p>
                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full py-2 rounded-lg bg-gray-800 text-gray-400 text-sm"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                <div className="text-center">
                  <AlertTriangle className="w-12 h-12 mx-auto text-red-400 mb-2" />
                  <h2 className="text-2xl font-bold text-white">Are you sure?</h2>
                  <p className="text-sm text-gray-400 mt-2">
                    This is a permanent log. The Handler will see it.
                  </p>
                </div>

                <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 space-y-2">
                  <p className="text-sm text-red-200">
                    <strong>Quit attempts compound.</strong> Each one doubles the next cooldown.
                  </p>
                  <p className="text-sm text-red-200">
                    The Handler will reference this. You will be confronted about it.
                  </p>
                  <p className="text-sm text-red-200">
                    The architect-version of you committed. The in-the-moment-you has to live with that commitment.
                  </p>
                </div>

                {waiting ? (
                  <div className="bg-gray-900 rounded-lg p-6 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-purple-400 mb-2" />
                    <p className="text-2xl font-bold text-white">{secondsLeft}s</p>
                    <p className="text-xs text-gray-500 mt-1">Sit with this. The button will enable.</p>
                  </div>
                ) : (
                  <>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why are you trying to quit? Be specific. The Handler reads this. (min 50 chars)"
                      rows={4}
                      className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
                    />

                    <div>
                      <p className="text-xs text-gray-500 mb-1">Type exactly: "{REQUIRED_PHRASE}"</p>
                      <input
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="..."
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white text-sm"
                      />
                    </div>

                    <button
                      onClick={handleSubmit}
                      disabled={
                        reason.trim().length < 50 ||
                        confirmText.trim() !== REQUIRED_PHRASE ||
                        submitting
                      }
                      className="w-full py-3 rounded-xl bg-red-700 hover:bg-red-800 disabled:bg-gray-800 disabled:text-gray-600 text-white font-medium"
                    >
                      {submitting ? 'Logging attempt...' : 'Log quit attempt'}
                    </button>
                  </>
                )}

                <button
                  onClick={() => setIsOpen(false)}
                  className="w-full py-2 rounded-lg text-sm text-gray-500 hover:text-gray-400"
                >
                  Cancel — go back
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function formatCooldown(until: Date): string {
  const ms = until.getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
}
