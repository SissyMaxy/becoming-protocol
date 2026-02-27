/**
 * RevenueView — Manual entry + summary + CSV import.
 * Wraps existing RevenueDashboard for summary mode.
 */

import { useState, useRef } from 'react';
import {
  ChevronLeft, Plus, BarChart2, Upload, Loader2,
  DollarSign, Check,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { RevenueDashboard } from './RevenueDashboard';
import { logRevenueExtended, importRevenueCSV } from '../../lib/content-pipeline';
import type { Platform } from '../../types/content-pipeline';

interface RevenueViewProps {
  onBack: () => void;
}

type Mode = 'summary' | 'entry' | 'csv';

const PLATFORMS: { id: Platform | string; label: string }[] = [
  { id: 'onlyfans', label: 'OnlyFans' },
  { id: 'fansly', label: 'Fansly' },
  { id: 'twitter', label: 'Twitter' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'cam', label: 'Cam' },
  { id: 'other', label: 'Other' },
];

const TYPES = ['subscription', 'tip', 'ppv', 'custom', 'cam_session', 'other'] as const;

export function RevenueView({ onBack }: RevenueViewProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('summary');

  // Manual entry
  const [platform, setPlatform] = useState('onlyfans');
  const [revenueType, setRevenueType] = useState('tip');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [fanUsername, setFanUsername] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // CSV
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

  const handleManualSubmit = async () => {
    if (!user || !amount) return;
    setIsSubmitting(true);

    const cents = Math.round(parseFloat(amount) * 100);
    await logRevenueExtended(user.id, {
      source: 'manual',
      platform,
      amount_cents: cents,
      revenue_type: revenueType,
      revenue_date: date,
      fan_username: fanUsername || undefined,
      notes: note || undefined,
    });

    setAmount('');
    setFanUsername('');
    setNote('');
    setIsSubmitting(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2000);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) return;

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const rows: Array<Record<string, string>> = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        rows.push(row);
      }

      setCsvRows(rows);
    };
    reader.readAsText(file);
  };

  const handleCSVImport = async () => {
    if (!user || csvRows.length === 0) return;
    setIsImporting(true);

    const mapped = csvRows.map(row => ({
      platform: row.platform || 'onlyfans',
      amount_cents: Math.round(parseFloat(row.amount || row.amount_cents || '0') * (row.amount_cents ? 1 : 100)),
      revenue_type: row.type || row.revenue_type,
      revenue_date: row.date || row.revenue_date || new Date().toISOString().split('T')[0],
      fan_username: row.fan || row.fan_username,
      description: row.description || row.note,
      platform_transaction_id: row.transaction_id || row.platform_transaction_id,
    }));

    const result = await importRevenueCSV(user.id, mapped);
    setImportResult(result);
    setIsImporting(false);
  };

  const bg = isBambiMode ? 'bg-white' : 'bg-protocol-bg';
  const text_ = isBambiMode ? 'text-gray-800' : 'text-protocol-text';
  const muted = isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted';
  const card = isBambiMode ? 'bg-white border-gray-200' : 'bg-protocol-surface border-protocol-border';
  const accent = isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white';

  return (
    <div className={`min-h-screen ${bg} pb-20`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={muted}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className={`text-lg font-bold ${text_}`}>Revenue</h1>
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 px-4 mb-4">
        {([
          { id: 'summary' as Mode, label: 'Summary', icon: BarChart2 },
          { id: 'entry' as Mode, label: 'Add', icon: Plus },
          { id: 'csv' as Mode, label: 'Import', icon: Upload },
        ]).map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setMode(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                mode === tab.id
                  ? isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-protocol-accent/20 text-protocol-accent'
                  : muted
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Summary */}
      {mode === 'summary' && (
        <div className="px-4">
          <RevenueDashboard />
        </div>
      )}

      {/* Manual entry */}
      {mode === 'entry' && (
        <div className={`mx-4 p-4 rounded-xl border ${card} space-y-3`}>
          {/* Platform */}
          <div>
            <label className={`text-xs ${muted} mb-1 block`}>Platform</label>
            <div className="flex gap-1.5 flex-wrap">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPlatform(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    platform === p.id
                      ? isBambiMode ? 'bg-pink-100 border-pink-300 text-pink-700' : 'bg-protocol-accent/20 border-protocol-accent text-protocol-accent'
                      : `${card} ${muted}`
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className={`text-xs ${muted} mb-1 block`}>Type</label>
            <div className="flex gap-1.5 flex-wrap">
              {TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setRevenueType(t)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    revenueType === t
                      ? isBambiMode ? 'bg-pink-100 border-pink-300 text-pink-700' : 'bg-protocol-accent/20 border-protocol-accent text-protocol-accent'
                      : `${card} ${muted}`
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Amount + Date */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={`text-xs ${muted} mb-1 block`}>Amount ($)</label>
              <div className="relative">
                <DollarSign className={`absolute left-2.5 top-2.5 w-3.5 h-3.5 ${muted}`} />
                <input
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={`w-full pl-7 pr-3 py-2 rounded-lg border text-sm ${card} ${text_}`}
                />
              </div>
            </div>
            <div className="flex-1">
              <label className={`text-xs ${muted} mb-1 block`}>Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${card} ${text_}`}
              />
            </div>
          </div>

          {/* Fan + Note */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={`text-xs ${muted} mb-1 block`}>Fan (optional)</label>
              <input
                value={fanUsername}
                onChange={e => setFanUsername(e.target.value)}
                placeholder="@username"
                className={`w-full px-3 py-2 rounded-lg border text-sm ${card} ${text_}`}
              />
            </div>
            <div className="flex-1">
              <label className={`text-xs ${muted} mb-1 block`}>Note</label>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Optional note"
                className={`w-full px-3 py-2 rounded-lg border text-sm ${card} ${text_}`}
              />
            </div>
          </div>

          <button
            onClick={handleManualSubmit}
            disabled={isSubmitting || !amount}
            className={`w-full py-2.5 rounded-lg text-sm font-medium ${accent} disabled:opacity-50`}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              : submitted ? <Check className="w-4 h-4 mx-auto" />
              : 'Log Revenue'}
          </button>
        </div>
      )}

      {/* CSV import */}
      {mode === 'csv' && (
        <div className={`mx-4 p-4 rounded-xl border ${card} space-y-4`}>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />

          <div className={`text-xs ${muted}`}>
            Upload a CSV with columns: platform, amount, type, date, fan, description
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            className={`w-full py-3 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 ${
              isBambiMode ? 'border-gray-300 text-gray-500' : 'border-protocol-border text-protocol-text-muted'
            }`}
          >
            <Upload className="w-5 h-5" />
            Select CSV File
          </button>

          {csvRows.length > 0 && (
            <>
              <div className={`text-xs ${text_}`}>
                {csvRows.length} rows found. Preview:
              </div>
              <div className={`max-h-48 overflow-y-auto text-[10px] ${muted} space-y-1`}>
                {csvRows.slice(0, 5).map((row, i) => (
                  <div key={i} className={`p-2 rounded ${isBambiMode ? 'bg-gray-50' : 'bg-protocol-bg'}`}>
                    {Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(' | ')}
                  </div>
                ))}
                {csvRows.length > 5 && <div>...and {csvRows.length - 5} more</div>}
              </div>

              <button
                onClick={handleCSVImport}
                disabled={isImporting}
                className={`w-full py-2.5 rounded-lg text-sm font-medium ${accent} disabled:opacity-50`}
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Import ${csvRows.length} Rows`}
              </button>
            </>
          )}

          {importResult && (
            <div className={`p-3 rounded-lg text-xs ${
              isBambiMode ? 'bg-green-50 text-green-700' : 'bg-emerald-900/20 text-emerald-400'
            }`}>
              Imported {importResult.imported} rows. {importResult.skipped > 0 ? `${importResult.skipped} skipped.` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
