/**
 * Data Export View
 *
 * Phase H1: Full data export and backup functionality.
 * Export profile, entries, progress, letters, investments, evidence.
 */

import { useState } from 'react';
import {
  Download, Loader2, Check, AlertTriangle, Database,
  FileText, User, Calendar, Shield, Heart,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import { supabase } from '../../lib/supabase';
import { profileStorage } from '../../lib/storage';

type ExportSection = 'profile' | 'entries' | 'progress' | 'letters' | 'investments' | 'evidence' | 'commitments';

const SECTIONS: { id: ExportSection; label: string; icon: typeof User; description: string }[] = [
  { id: 'profile', label: 'Profile', icon: User, description: 'Identity, preferences, intake data' },
  { id: 'entries', label: 'Daily Entries', icon: Calendar, description: 'Journal entries, tasks, scores' },
  { id: 'progress', label: 'Progress', icon: Database, description: 'Streaks, domain levels, phase' },
  { id: 'letters', label: 'Sealed Letters', icon: Heart, description: 'Personalized letters and unlock state' },
  { id: 'investments', label: 'Investments', icon: FileText, description: 'Investment records' },
  { id: 'commitments', label: 'Commitments', icon: Shield, description: 'Commitment history' },
  { id: 'evidence', label: 'Evidence', icon: FileText, description: 'Evidence log (metadata only)' },
];

async function exportUserData(userId: string, sections: Set<ExportSection>): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    version: '2.0',
  };

  if (sections.has('profile')) {
    const profile = await profileStorage.getProfile();
    result.profile = profile;
  }

  if (sections.has('entries')) {
    const { data } = await supabase
      .from('daily_entries')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    result.dailyEntries = data || [];
  }

  if (sections.has('progress')) {
    const { data } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    result.progress = data;

    const { data: escalation } = await supabase
      .from('escalation_state')
      .select('*')
      .eq('user_id', userId);
    result.escalationState = escalation || [];
  }

  if (sections.has('letters')) {
    const { data } = await supabase
      .from('personalized_letters')
      .select('*')
      .eq('user_id', userId);
    result.letters = data || [];
  }

  if (sections.has('investments')) {
    const { data } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    result.investments = data || [];
  }

  if (sections.has('commitments')) {
    const { data } = await supabase
      .from('commitments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    result.commitments = data || [];
  }

  if (sections.has('evidence')) {
    const { data } = await supabase
      .from('evidence')
      .select('id, evidence_type, domain, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    result.evidence = data || [];
  }

  return result;
}

export function DataExportView() {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [selected, setSelected] = useState<Set<ExportSection>>(
    new Set(SECTIONS.map(s => s.id))
  );
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSection = (id: ExportSection) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === SECTIONS.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(SECTIONS.map(s => s.id)));
    }
  };

  const handleExport = async () => {
    if (!user || selected.size === 0) return;
    setExporting(true);
    setError(null);
    setExported(false);

    try {
      const data = await exportUserData(user.id, selected);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `becoming-protocol-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExported(true);
    } catch (err) {
      console.error('Export failed:', err);
      setError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className={`rounded-lg p-3 text-sm ${
        isBambiMode ? 'bg-blue-50 text-blue-700' : 'bg-blue-500/10 text-blue-300'
      }`}>
        <Database className="w-4 h-4 inline mr-1.5" />
        Export your data as a JSON file. This includes all selected categories below.
      </div>

      {/* Select all toggle */}
      <button
        onClick={toggleAll}
        className={`text-xs font-medium ${isBambiMode ? 'text-pink-600' : 'text-purple-400'}`}
      >
        {selected.size === SECTIONS.length ? 'Deselect All' : 'Select All'}
      </button>

      {/* Section checkboxes */}
      <div className="space-y-2">
        {SECTIONS.map(section => {
          const Icon = section.icon;
          const isSelected = selected.has(section.id);

          return (
            <button
              key={section.id}
              onClick={() => toggleSection(section.id)}
              className={`w-full p-3 rounded-lg border flex items-center gap-3 text-left transition-all ${
                isSelected
                  ? isBambiMode
                    ? 'bg-pink-50 border-pink-300'
                    : 'bg-purple-500/10 border-purple-500/30'
                  : isBambiMode
                    ? 'bg-white border-pink-200'
                    : 'bg-protocol-surface border-protocol-border'
              }`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                isSelected
                  ? isBambiMode ? 'bg-pink-500 border-pink-500' : 'bg-purple-500 border-purple-500'
                  : isBambiMode ? 'border-pink-300' : 'border-gray-600'
              }`}>
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>
              <Icon className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`} />
              <div className="flex-1">
                <div className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-gray-200'}`}>
                  {section.label}
                </div>
                <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                  {section.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={exporting || selected.size === 0}
        className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
          exported
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : selected.size === 0
              ? 'opacity-50 cursor-not-allowed bg-gray-500/20 text-gray-400'
              : isBambiMode
                ? 'bg-pink-500 hover:bg-pink-600 text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
        }`}
      >
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : exported ? (
          <>
            <Check className="w-4 h-4" />
            Downloaded
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            Export {selected.size} {selected.size === 1 ? 'Section' : 'Sections'}
          </>
        )}
      </button>
    </div>
  );
}
