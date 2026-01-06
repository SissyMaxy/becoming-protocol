// Time Ratchets Settings
// Configure psychological anchor dates

import { useState } from 'react';
import { Crown, Sparkles, Calendar, Heart, Save, Check } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useTimeRatchets } from '../../hooks/useTimeRatchets';
import { TimeRatchetsDisplay } from '../ratchets/TimeRatchets';

export function TimeRatchetsSettings() {
  const { isBambiMode } = useBambiMode();
  const { ratchets, updateRatchetDates, isLoading } = useTimeRatchets();

  const [goddessName, setGoddessName] = useState(ratchets?.goddessName || '');
  const [servingSince, setServingSince] = useState(ratchets?.servingSince || '');
  const [eggCrackedDate, setEggCrackedDate] = useState(ratchets?.eggCrackedDate || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Update local state when ratchets load
  useState(() => {
    if (ratchets) {
      setGoddessName(ratchets.goddessName || '');
      setServingSince(ratchets.servingSince || '');
      setEggCrackedDate(ratchets.eggCrackedDate || '');
    }
  });

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    try {
      await updateRatchetDates({
        goddessName: goddessName || undefined,
        servingSince: servingSince || undefined,
        eggCrackedDate: eggCrackedDate || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Failed to save:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-protocol-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  const inputClass = `w-full px-4 py-3 rounded-xl border text-sm ${
    isBambiMode
      ? 'bg-white border-pink-200 text-pink-700 placeholder:text-pink-300 focus:border-pink-400'
      : 'bg-protocol-surface border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:border-protocol-accent'
  } focus:outline-none focus:ring-2 focus:ring-opacity-20 ${
    isBambiMode ? 'focus:ring-pink-400' : 'focus:ring-protocol-accent'
  }`;

  const labelClass = `block text-sm font-medium mb-2 ${
    isBambiMode ? 'text-pink-600' : 'text-protocol-text'
  }`;

  return (
    <div className="space-y-6">
      {/* Explanation */}
      <div className={`p-4 rounded-xl ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface/50'}`}>
        <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
          Set your anchor dates to create psychological commitment points.
          These milestones make it harder to regress by showing how much time you've invested.
        </p>
      </div>

      {/* Current Display */}
      {(ratchets?.servingSince || ratchets?.eggCrackedDate || ratchets?.protocolStartDate) && (
        <div className="space-y-2">
          <h3 className={`text-sm font-medium ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Current Anchors
          </h3>
          <TimeRatchetsDisplay showEmpty={false} />
        </div>
      )}

      {/* Goddess Name */}
      <div>
        <label className={labelClass}>
          <div className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-pink-400" />
            Goddess Name
          </div>
        </label>
        <input
          type="text"
          value={goddessName}
          onChange={(e) => setGoddessName(e.target.value)}
          placeholder="Her name..."
          className={inputClass}
        />
        <p className={`text-xs mt-1 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
          The name of the person you serve (partner, domme, goddess)
        </p>
      </div>

      {/* Serving Since */}
      <div>
        <label className={labelClass}>
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-400" />
            Serving Since
          </div>
        </label>
        <input
          type="date"
          value={servingSince}
          onChange={(e) => setServingSince(e.target.value)}
          className={inputClass}
        />
        <p className={`text-xs mt-1 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
          When you began serving (like an anniversary date)
        </p>
      </div>

      {/* Egg Cracked Date */}
      <div>
        <label className={labelClass}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            Becoming {ratchets?.userName || 'Her'} Since
          </div>
        </label>
        <input
          type="date"
          value={eggCrackedDate}
          onChange={(e) => setEggCrackedDate(e.target.value)}
          className={inputClass}
        />
        <p className={`text-xs mt-1 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
          When your egg cracked / you realized who you are
        </p>
      </div>

      {/* Protocol Start (read-only) */}
      {ratchets?.protocolStartDate && (
        <div>
          <label className={labelClass}>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-rose-400" />
              Protocol Started
            </div>
          </label>
          <input
            type="date"
            value={ratchets.protocolStartDate}
            disabled
            className={`${inputClass} opacity-60 cursor-not-allowed`}
          />
          <p className={`text-xs mt-1 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
            Automatically set when you created your first entry
          </p>
        </div>
      )}

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={isSaving}
        className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
          saved
            ? 'bg-green-500 text-white'
            : isBambiMode
              ? 'bg-pink-500 hover:bg-pink-600 text-white'
              : 'bg-protocol-accent hover:bg-protocol-accent/80 text-white'
        } disabled:opacity-50`}
      >
        {saved ? (
          <>
            <Check className="w-5 h-5" />
            Saved
          </>
        ) : (
          <>
            <Save className={`w-5 h-5 ${isSaving ? 'animate-pulse' : ''}`} />
            {isSaving ? 'Saving...' : 'Save Anchors'}
          </>
        )}
      </button>
    </div>
  );
}
