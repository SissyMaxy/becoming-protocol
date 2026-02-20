/**
 * HandlerNotification
 *
 * Replaces confirmation dialogs when standing permissions are granted.
 * One button: "Understood." The Handler is informing, not asking.
 *
 * Usage:
 *   <HandlerNotification
 *     message="Your session begins at 6:15pm. AmberSis Acceptance → Say Yes → Daddy."
 *     onDismiss={() => setShow(false)}
 *   />
 */

import { useState, useEffect } from 'react';
import { useBambiMode } from '../../context/BambiModeContext';

interface HandlerNotificationProps {
  message: string;
  detail?: string;
  onDismiss: () => void;
  autoDismissMs?: number;
  className?: string;
}

export function HandlerNotification({
  message,
  detail,
  onDismiss,
  autoDismissMs,
  className = '',
}: HandlerNotificationProps) {
  const { isBambiMode } = useBambiMode();
  const [isVisible, setIsVisible] = useState(false);

  // Animate in
  useEffect(() => {
    const t = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Auto-dismiss
  useEffect(() => {
    if (!autoDismissMs) return;
    const t = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300);
    }, autoDismissMs);
    return () => clearTimeout(t);
  }, [autoDismissMs, onDismiss]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm ${className}`}>
      <div
        className={`max-w-sm w-full rounded-2xl overflow-hidden transition-all duration-300 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        } ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface border border-protocol-border'
        }`}
      >
        {/* Header bar */}
        <div className={`px-5 py-3 flex items-center gap-2 ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-500 to-purple-500'
            : 'bg-gradient-to-r from-purple-900/50 to-indigo-900/50 border-b border-protocol-border'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            isBambiMode ? 'bg-white' : 'bg-purple-400'
          } animate-pulse`} />
          <span className={`text-sm font-medium ${
            isBambiMode ? 'text-white' : 'text-purple-300'
          }`}>
            Handler
          </span>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className={`text-sm leading-relaxed ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            {message}
          </p>

          {detail && (
            <p className={`text-xs mt-2 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              {detail}
            </p>
          )}
        </div>

        {/* Single action */}
        <div className="px-5 pb-5">
          <button
            onClick={handleDismiss}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline notification variant — not a modal.
 * Use for non-blocking Handler updates in feeds/views.
 */
export function HandlerNotificationBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  const { isBambiMode } = useBambiMode();

  return (
    <div className={`rounded-xl p-4 flex items-start gap-3 ${
      isBambiMode
        ? 'bg-pink-50 border-2 border-pink-200'
        : 'bg-purple-900/20 border border-purple-500/30'
    }`}>
      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
        isBambiMode ? 'bg-pink-500' : 'bg-purple-400'
      } animate-pulse`} />
      <div className="flex-1">
        <p className={`text-sm ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          {message}
        </p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className={`text-xs px-2 py-1 rounded ${
            isBambiMode ? 'text-pink-400 hover:text-pink-600' : 'text-protocol-text-muted hover:text-protocol-text'
          }`}
        >
          OK
        </button>
      )}
    </div>
  );
}
