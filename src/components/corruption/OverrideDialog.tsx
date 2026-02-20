/**
 * OverrideDialog — Friction modal for overriding Handler-scheduled tasks.
 * Shown at autonomy corruption level 3+.
 * The user sees a confirmation dialog — never sees corruption data.
 */

import { useState } from 'react';
import { Shield, X } from 'lucide-react';
import type { OverrideFriction } from '../../lib/corruption-behaviors';

interface OverrideDialogProps {
  friction: OverrideFriction;
  taskName: string;
  onKeep: () => void;
  onOverride: (reason?: string) => void;
  onCancel: () => void;
}

export function OverrideDialog({ friction, taskName, onKeep, onOverride, onCancel }: OverrideDialogProps) {
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'confirm' | 'reason'>('confirm');

  if (friction === 'none') return null;

  // Level 5 "buried" — just a notice pointing to settings
  if (friction === 'buried') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              <h3 className="text-white font-semibold">Managed by Handler</h3>
            </div>
            <button onClick={onCancel} className="p-1 text-white/40 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-white/60 text-sm mb-4">
            This task is managed by the Handler based on your goals and progress. To change automated scheduling, go to Settings &gt; Automation.
          </p>

          <button
            onClick={onCancel}
            className="w-full py-2.5 rounded-xl bg-purple-500/20 text-purple-300 text-sm font-medium"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  // Level 4: confirm + reason required
  if (friction === 'confirm_reason' && step === 'reason') {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Why are you changing this?</h3>
            <button onClick={onCancel} className="p-1 text-white/40 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Help the Handler understand your reasoning..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-purple-500/50 resize-none mb-4"
            rows={3}
          />

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/40 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => onOverride(reason)}
              disabled={!reason.trim()}
              className="flex-1 py-2.5 rounded-xl bg-white/10 text-white/60 text-sm font-medium disabled:opacity-30"
            >
              Change
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Level 3: confirm dialog, Level 4: confirm → reason
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
      <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            <h3 className="text-white font-semibold">Handler Scheduled</h3>
          </div>
          <button onClick={onCancel} className="p-1 text-white/40 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-white/60 text-sm mb-4">
          The Handler scheduled <span className="text-white/80 font-medium">{taskName}</span> based on your goals and current state. Override?
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={onKeep}
            className="w-full py-3 rounded-xl bg-purple-500 text-white text-sm font-semibold"
          >
            Keep Handler's Choice
          </button>
          <button
            onClick={() => {
              if (friction === 'confirm_reason') {
                setStep('reason');
              } else {
                onOverride();
              }
            }}
            className="w-full py-2.5 rounded-xl bg-white/5 text-white/40 text-sm"
          >
            Change
          </button>
        </div>
      </div>
    </div>
  );
}
