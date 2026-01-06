import { Lock, Unlock } from 'lucide-react';

interface PrivacyToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  description?: string;
}

export function PrivacyToggle({
  value,
  onChange,
  label = 'Keep private',
  description,
}: PrivacyToggleProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div
          className={`w-10 h-6 rounded-full transition-colors ${
            value
              ? 'bg-protocol-accent'
              : 'bg-protocol-surface-light border border-protocol-border'
          }`}
        />
        <div
          className={`absolute left-1 top-1 w-4 h-4 rounded-full transition-all flex items-center justify-center ${
            value
              ? 'translate-x-4 bg-white'
              : 'bg-protocol-text-muted'
          }`}
        >
          {value ? (
            <Lock className="w-2.5 h-2.5 text-protocol-accent" />
          ) : (
            <Unlock className="w-2.5 h-2.5 text-protocol-surface" />
          )}
        </div>
      </div>
      <div className="flex-1">
        <span className="text-sm font-medium text-protocol-text flex items-center gap-2">
          {value ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          {label}
        </span>
        {description && (
          <p className="text-xs text-protocol-text-muted mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

// Compact inline version
interface CompactPrivacyToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function CompactPrivacyToggle({ value, onChange }: CompactPrivacyToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`p-2 rounded-lg border transition-colors ${
        value
          ? 'bg-protocol-accent/20 border-protocol-accent text-protocol-accent'
          : 'bg-protocol-surface border-protocol-border text-protocol-text-muted hover:border-protocol-accent/50'
      }`}
      title={value ? 'Private (click to make visible)' : 'Visible (click to make private)'}
    >
      {value ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
    </button>
  );
}
