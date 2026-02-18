/**
 * Privacy Settings
 *
 * Phase H1: Data security, account management, clear data options.
 */

import { useState } from 'react';
import {
  Shield, Trash2, AlertTriangle, Loader2, Check, LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import { supabase } from '../../lib/supabase';

export function PrivacySettings() {
  const { user, signOut } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [showConfirm, setShowConfirm] = useState<'clear-entries' | 'clear-all' | null>(null);
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearEntries = async () => {
    if (!user) return;
    setProcessing(true);
    setError(null);
    try {
      await supabase.from('daily_entries').delete().eq('user_id', user.id);
      await supabase.from('daily_tasks').delete().eq('user_id', user.id);
      setDone(true);
      setShowConfirm(null);
    } catch (err) {
      setError('Failed to clear entries');
    } finally {
      setProcessing(false);
    }
  };

  const clearAllData = async () => {
    if (!user) return;
    setProcessing(true);
    setError(null);
    try {
      // Delete in dependency order
      const tables = [
        'daily_tasks',
        'daily_entries',
        'investments',
        'commitments',
        'evidence',
        'milestones',
        'personalized_letters',
        'escalation_state',
        'arousal_sessions',
      ];
      for (const table of tables) {
        await supabase.from(table).delete().eq('user_id', user.id);
      }
      setDone(true);
      setShowConfirm(null);
    } catch (err) {
      setError('Failed to clear all data');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Security info */}
      <div className={`rounded-lg p-4 ${
        isBambiMode ? 'bg-green-50 border border-green-200' : 'bg-green-500/10 border border-green-500/20'
      }`}>
        <div className="flex items-start gap-3">
          <Shield className={`w-5 h-5 mt-0.5 ${isBambiMode ? 'text-green-600' : 'text-green-400'}`} />
          <div>
            <div className={`text-sm font-medium ${isBambiMode ? 'text-green-800' : 'text-green-300'}`}>
              Your data is secure
            </div>
            <div className={`text-xs mt-1 ${isBambiMode ? 'text-green-600' : 'text-green-400/70'}`}>
              All data is stored in your private Supabase account. No data is shared with third parties.
              Row-level security ensures only you can access your records.
            </div>
          </div>
        </div>
      </div>

      {/* Account info */}
      <div className={`rounded-lg p-4 ${
        isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <h3 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
          Account
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-gray-500'}`}>Email</span>
            <span className={`text-xs font-medium ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>
              {user?.email || 'Unknown'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-gray-500'}`}>User ID</span>
            <span className={`text-xs font-mono ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
              {user?.id?.substring(0, 8)}...
            </span>
          </div>
        </div>
      </div>

      {/* Data management */}
      <div>
        <h3 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
          Data Management
        </h3>

        <div className="space-y-2">
          {/* Clear daily entries */}
          <button
            onClick={() => setShowConfirm('clear-entries')}
            className={`w-full p-4 rounded-lg border flex items-center gap-3 text-left transition-all ${
              isBambiMode
                ? 'bg-white border-yellow-200 hover:border-yellow-400'
                : 'bg-protocol-surface border-yellow-500/20 hover:border-yellow-500/40'
            }`}
          >
            <Trash2 className="w-4 h-4 text-yellow-500" />
            <div className="flex-1">
              <div className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>
                Clear Daily Entries
              </div>
              <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                Remove all journal entries and task history
              </div>
            </div>
          </button>

          {/* Clear all data */}
          <button
            onClick={() => setShowConfirm('clear-all')}
            className={`w-full p-4 rounded-lg border flex items-center gap-3 text-left transition-all ${
              isBambiMode
                ? 'bg-white border-red-200 hover:border-red-400'
                : 'bg-protocol-surface border-red-500/20 hover:border-red-500/40'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <div className="flex-1">
              <div className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>
                Clear All Data
              </div>
              <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                Remove everything except your profile. This cannot be undone.
              </div>
            </div>
          </button>

          {/* Sign out */}
          <button
            onClick={signOut}
            className={`w-full p-4 rounded-lg border flex items-center gap-3 text-left transition-all ${
              isBambiMode
                ? 'bg-white border-pink-200 hover:border-pink-400'
                : 'bg-protocol-surface border-protocol-border hover:border-gray-500'
            }`}
          >
            <LogOut className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`} />
            <div className="flex-1">
              <div className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>
                Sign Out
              </div>
              <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                Log out of your account
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Success message */}
      {done && (
        <div className="flex items-center gap-2 text-sm text-green-400">
          <Check className="w-4 h-4" />
          Data cleared successfully
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className={`w-full max-w-sm rounded-xl p-6 ${
            isBambiMode ? 'bg-white' : 'bg-protocol-surface'
          }`}>
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <h3 className={`text-lg font-semibold text-center mb-2 ${
              isBambiMode ? 'text-pink-800' : 'text-gray-200'
            }`}>
              {showConfirm === 'clear-entries' ? 'Clear Daily Entries?' : 'Clear All Data?'}
            </h3>
            <p className={`text-sm text-center mb-4 ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
              {showConfirm === 'clear-entries'
                ? 'This will delete all your journal entries and daily task history. Your profile and other data will be kept.'
                : 'This will permanently delete all your data except your profile. This action cannot be undone. Export your data first if you want a backup.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                disabled={processing}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium ${
                  isBambiMode
                    ? 'bg-pink-100 text-pink-700'
                    : 'bg-white/10 text-gray-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={showConfirm === 'clear-entries' ? clearEntries : clearAllData}
                disabled={processing}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-red-500 text-white flex items-center justify-center gap-2"
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
