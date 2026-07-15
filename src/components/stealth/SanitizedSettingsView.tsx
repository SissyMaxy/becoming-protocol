import { ArrowLeft, Shield } from 'lucide-react';
import { StealthSettings } from '../settings/StealthSettings';

export function SanitizedSettingsView({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-xl px-4 py-5">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 rounded-md border border-slate-800 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-600 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <header className="mb-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-400/15 text-emerald-300">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Privacy</p>
              <h1 className="text-xl font-semibold text-white">Settings & Privacy</h1>
            </div>
          </div>
        </header>

        <StealthSettings />
      </div>
    </div>
  );
}
