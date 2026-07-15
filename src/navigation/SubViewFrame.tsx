/**
 * SubViewFrame — the ONE back affordance for registry views with
 * frame: 'framed'. Replaces ~20 hand-copied "← Back to Menu" buttons that
 * had drifted across labels and classNames. Views with frame: 'self'
 * render their own header and receive ctx.onBack instead.
 */

import type { ReactNode } from 'react';

interface SubViewFrameProps {
  onBack: () => void;
  backLabel?: string;
  children: ReactNode;
}

export function SubViewFrame({ onBack, backLabel = 'Back to Menu', children }: SubViewFrameProps) {
  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
      >
        &larr; {backLabel}
      </button>
      {children}
    </div>
  );
}
