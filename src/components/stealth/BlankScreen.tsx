import type { StealthIconVariant } from '../../lib/stealth/types';

export interface BlankScreenProps {
  variant: StealthIconVariant;
  onTap: () => void;
}

// A neutral landing surfaced after a panic-close gesture. Tap anywhere
// to come back. The look matches the icon variant so the disguise is
// consistent: calculator → calculator face; notes → blank notepad;
// default → black void.
export function BlankScreen({ variant, onTap }: BlankScreenProps) {
  if (variant === 'calculator') {
    return (
      <button
        type="button"
        onClick={onTap}
        className="fixed inset-0 z-[9999] flex flex-col bg-slate-800 text-slate-100"
      >
        <div className="flex-1 flex items-end justify-end p-8">
          <span className="text-6xl font-light">0</span>
        </div>
        <div className="grid grid-cols-4 gap-2 p-4 pb-8 text-2xl">
          {['AC', '+/-', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '0', '.', '='].map((k, i) => {
            const isOp = ['÷', '×', '−', '+', '='].includes(k);
            return (
              <span
                key={i}
                className={`flex items-center justify-center rounded-full h-16 ${
                  isOp ? 'bg-orange-500 text-white' : 'bg-slate-600 text-white'
                } ${k === '0' && i === 16 ? 'col-span-2' : ''}`}
              >
                {k}
              </span>
            );
          })}
        </div>
      </button>
    );
  }
  if (variant === 'notes') {
    return (
      <button
        type="button"
        onClick={onTap}
        className="fixed inset-0 z-[9999] flex flex-col bg-amber-50 text-stone-700 p-6"
      >
        <div className="text-xs uppercase tracking-wider text-stone-500 mb-3">Notes</div>
        <div className="flex-1 space-y-3 text-left">
          <div className="text-sm">Grocery list</div>
          <div className="text-sm">Call dentist Tuesday</div>
          <div className="text-sm">Pick up dry cleaning</div>
          <div className="text-sm text-stone-400">—</div>
        </div>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onTap}
      className="fixed inset-0 z-[9999] bg-black"
      aria-label="Resume"
    />
  );
}
