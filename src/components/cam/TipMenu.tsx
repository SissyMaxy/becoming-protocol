/**
 * TipMenu — Manual tip entry for self-hosted mode
 * Quick-tap amounts + custom entry, shows tip level label
 */

import { useState } from 'react';
import { DollarSign, Zap, Loader2 } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { TipLevel } from '../../types/cam';
import { TIP_LEVELS, matchTipLevel } from '../../lib/cam/tips';

interface TipMenuProps {
  onRecordTip: (data: {
    tipperUsername?: string;
    tipperPlatform?: string;
    tokenAmount: number;
    tipAmountUsd?: number;
  }) => Promise<unknown>;
  customLevels?: TipLevel[];
  isRecording?: boolean;
}

const QUICK_AMOUNTS = [5, 10, 25, 50, 100, 200];

export function TipMenu({ onRecordTip, customLevels, isRecording }: TipMenuProps) {
  const { isBambiMode } = useBambiMode();
  const [customAmount, setCustomAmount] = useState('');
  const [tipperName, setTipperName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const levels = customLevels || TIP_LEVELS;

  const handleQuickTip = async (amount: number) => {
    setSubmitting(true);
    try {
      await onRecordTip({
        tipperUsername: tipperName || undefined,
        tokenAmount: amount,
      });
      setTipperName('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCustomTip = async () => {
    const amount = parseInt(customAmount);
    if (isNaN(amount) || amount < 1) return;

    setSubmitting(true);
    try {
      await onRecordTip({
        tipperUsername: tipperName || undefined,
        tokenAmount: amount,
      });
      setCustomAmount('');
      setTipperName('');
    } finally {
      setSubmitting(false);
    }
  };

  const getLevelColor = (amount: number): string => {
    const level = matchTipLevel(amount, levels);
    if (!level) return isBambiMode ? 'bg-gray-100 text-gray-600' : 'bg-gray-700 text-gray-300';

    if (amount >= 100) return isBambiMode ? 'bg-red-100 text-red-700 border-red-300' : 'bg-red-900/30 text-red-400 border-red-600/30';
    if (amount >= 50) return isBambiMode ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-orange-900/30 text-orange-400 border-orange-600/30';
    if (amount >= 25) return isBambiMode ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-amber-900/30 text-amber-400 border-amber-600/30';
    if (amount >= 10) return isBambiMode ? 'bg-pink-100 text-pink-700 border-pink-300' : 'bg-purple-900/30 text-purple-400 border-purple-600/30';
    return isBambiMode ? 'bg-pink-50 text-pink-600 border-pink-200' : 'bg-indigo-900/30 text-indigo-400 border-indigo-600/30';
  };

  return (
    <div className={`rounded-2xl p-4 ${
      isBambiMode
        ? 'bg-white border border-pink-200'
        : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-1.5 ${
        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
      }`}>
        <DollarSign className="w-4 h-4" />
        Record Tip
      </h3>

      {/* Tipper name */}
      <input
        type="text"
        value={tipperName}
        onChange={(e) => setTipperName(e.target.value)}
        placeholder="Tipper name (optional)"
        className={`w-full px-3 py-2 rounded-lg text-sm mb-3 ${
          isBambiMode
            ? 'bg-pink-50 border border-pink-200 text-pink-800 placeholder-pink-300'
            : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder-protocol-text-muted'
        }`}
      />

      {/* Quick amounts */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {QUICK_AMOUNTS.map(amount => {
          const level = matchTipLevel(amount, levels);
          return (
            <button
              key={amount}
              onClick={() => handleQuickTip(amount)}
              disabled={submitting}
              className={`p-3 rounded-xl border text-center transition-all active:scale-95 ${getLevelColor(amount)}`}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              ) : (
                <>
                  <span className="block text-lg font-bold">{amount}</span>
                  <span className="block text-[10px] opacity-75">
                    {level?.label || 'tokens'}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Custom amount */}
      <div className="flex gap-2">
        <input
          type="number"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          placeholder="Custom amount"
          min={1}
          className={`flex-1 px-3 py-2 rounded-lg text-sm ${
            isBambiMode
              ? 'bg-pink-50 border border-pink-200 text-pink-800 placeholder-pink-300'
              : 'bg-protocol-bg border border-protocol-border text-protocol-text placeholder-protocol-text-muted'
          }`}
        />
        <button
          onClick={handleCustomTip}
          disabled={submitting || !customAmount}
          className={`px-4 py-2 rounded-lg font-medium text-white transition-colors ${
            isBambiMode
              ? 'bg-pink-500 hover:bg-pink-600 disabled:bg-pink-300'
              : 'bg-protocol-accent hover:bg-protocol-accent-soft disabled:bg-gray-600'
          }`}
        >
          <Zap className="w-4 h-4" />
        </button>
      </div>

      {isRecording && (
        <p className={`text-[10px] mt-2 text-center ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}>
          Tips auto-trigger device response
        </p>
      )}
    </div>
  );
}
