/**
 * Modal — THE overlay primitive. One scrim, one panel, one dismissal model,
 * bambi-aware. Hand-rolled fixed-inset-0 overlays with per-file scrim
 * opacities are the drift this replaces (ui-lint flags new ones).
 *
 * - Portal to document.body so stacking contexts can't clip it.
 * - Standard scrim: bg-black/60 + backdrop-blur-sm.
 * - Panel composes the .card utility (velvet) or bambi-card styling.
 * - Escape and scrim-click close (unless dismissable={false} — reserve that
 *   for flows that must resolve, e.g. an active session's exit confirm).
 * - Mobile-safe: 100dvh cap + safe-area padding, inner scroll.
 */

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import { CardHeader } from './CardHeader';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Small line under the title. */
  subtitle?: ReactNode;
  /** Set false to require an explicit in-panel action (no Esc/scrim close). */
  dismissable?: boolean;
  /** Tailwind max-width class for the panel. */
  maxWidth?: string;
  /** Hide the corner close button (title row still renders if title given). */
  hideCloseButton?: boolean;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  dismissable = true,
  maxWidth = 'max-w-lg',
  hideCloseButton = false,
  children,
}: ModalProps) {
  const { isBambiMode } = useBambiMode();

  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissable, onClose]);

  if (!open) return null;

  const panelClass = isBambiMode
    ? 'bg-white border-2 border-pink-200 rounded-3xl shadow-[0_10px_40px_rgba(196,132,122,0.35)]'
    : 'card shadow-velvet-lg';

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        paddingLeft: 'max(env(safe-area-inset-left), 16px)',
        paddingRight: 'max(env(safe-area-inset-right), 16px)',
      }}
      onClick={dismissable ? onClose : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full ${maxWidth} ${panelClass} p-5 max-h-[calc(100dvh-32px)] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        {(title || (dismissable && !hideCloseButton)) && (
          <div className="flex items-start justify-between gap-3 mb-4">
            {title ? (
              <CardHeader title={title} subtitle={subtitle} className="mb-0" />
            ) : <span />}
            {dismissable && !hideCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close"
                className={
                  isBambiMode
                    ? 'text-pink-400 hover:text-pink-600 transition-colors shrink-0'
                    : 'text-protocol-text-muted hover:text-protocol-text transition-colors shrink-0'
                }
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
