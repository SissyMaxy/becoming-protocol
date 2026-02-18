/**
 * Task Import Component
 *
 * Allows importing tasks from JSON file or pasted JSON.
 */

import { useState, useRef } from 'react';
import { Upload, FileJson, Trash2, Check, AlertCircle, Copy, RefreshCw } from 'lucide-react';
import { bulkImportTasks, getTaskCountByDomain, clearUserTasks, replaceAllTasks, type TaskImportData } from '../../lib/task-bank';

const EXAMPLE_TASKS: TaskImportData[] = [
  {
    category: 'edge',
    domain: 'arousal',
    intensity: 3,
    instruction: 'Edge for 10 minutes while watching sissy hypno',
    subtext: 'Let the arousal build. Let it change you.',
    affirmation: 'Good girl. You\'re becoming so receptive.',
    durationMinutes: 10,
    completionType: 'duration',
  },
  {
    category: 'corrupt',
    domain: 'conditioning',
    intensity: 4,
    instruction: 'Watch BBC sissy hypno for 20 minutes',
    subtext: 'Don\'t look away. Let it sink in.',
    affirmation: 'That\'s it. You know what you need.',
    durationMinutes: 20,
    completionType: 'duration',
    isCore: true,
  },
  {
    category: 'say',
    domain: 'identity',
    intensity: 2,
    instruction: 'Say "I am a sissy" out loud 10 times',
    subtext: 'Feel the truth of it each time.',
    affirmation: 'Good girl. You\'re accepting who you are.',
    targetCount: 10,
    completionType: 'count',
  },
];

export function TaskImport() {
  const [jsonInput, setJsonInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    imported: number;
    failed: number;
    deleted?: number;
    errors: string[];
  } | null>(null);
  const [domainCounts, setDomainCounts] = useState<Record<string, number> | null>(null);
  const [showExample, setShowExample] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDomainCounts = async () => {
    try {
      const counts = await getTaskCountByDomain();
      setDomainCounts(counts);
    } catch (err) {
      console.error('Failed to load domain counts:', err);
    }
  };

  const handleImport = async () => {
    if (!jsonInput.trim()) {
      setResult({
        success: false,
        imported: 0,
        failed: 0,
        errors: ['No JSON provided'],
      });
      return;
    }

    setIsImporting(true);
    setResult(null);

    try {
      const tasks = JSON.parse(jsonInput) as TaskImportData[];

      if (!Array.isArray(tasks)) {
        throw new Error('JSON must be an array of tasks');
      }

      const importResult = await bulkImportTasks(tasks);
      setResult(importResult);

      if (importResult.imported > 0) {
        await loadDomainCounts();
        setJsonInput(''); // Clear on success
      }
    } catch (err) {
      setResult({
        success: false,
        imported: 0,
        failed: 0,
        errors: [err instanceof Error ? err.message : 'Invalid JSON'],
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setJsonInput(content);
    };
    reader.readAsText(file);
  };

  const handleClearUserTasks = async () => {
    if (!confirm('Delete all user-imported tasks? This cannot be undone.')) {
      return;
    }

    try {
      const deleted = await clearUserTasks();
      setResult({
        success: true,
        imported: 0,
        failed: 0,
        errors: [`Deleted ${deleted} user-imported tasks`],
      });
      await loadDomainCounts();
    } catch (err) {
      setResult({
        success: false,
        imported: 0,
        failed: 0,
        errors: [err instanceof Error ? err.message : 'Failed to delete tasks'],
      });
    }
  };

  const handleReplaceAll = async () => {
    if (!jsonInput.trim()) {
      setResult({
        success: false,
        imported: 0,
        failed: 0,
        errors: ['No JSON provided - paste your new tasks first'],
      });
      return;
    }

    if (!confirm('⚠️ REPLACE ALL TASKS?\n\nThis will DELETE all existing tasks (seed + imported) and replace them with the JSON you provided.\n\nThis cannot be undone!')) {
      return;
    }

    setIsReplacing(true);
    setResult(null);

    try {
      const tasks = JSON.parse(jsonInput) as TaskImportData[];

      if (!Array.isArray(tasks)) {
        throw new Error('JSON must be an array of tasks');
      }

      if (tasks.length === 0) {
        throw new Error('Cannot replace with empty task list');
      }

      const replaceResult = await replaceAllTasks(tasks);
      setResult({
        success: replaceResult.success,
        imported: replaceResult.imported,
        failed: replaceResult.failed,
        deleted: replaceResult.deleted,
        errors: replaceResult.errors,
      });

      if (replaceResult.imported > 0) {
        await loadDomainCounts();
        setJsonInput('');
      }
    } catch (err) {
      setResult({
        success: false,
        imported: 0,
        failed: 0,
        errors: [err instanceof Error ? err.message : 'Invalid JSON'],
      });
    } finally {
      setIsReplacing(false);
    }
  };

  const copyExample = () => {
    navigator.clipboard.writeText(JSON.stringify(EXAMPLE_TASKS, null, 2));
    setJsonInput(JSON.stringify(EXAMPLE_TASKS, null, 2));
  };

  // Load counts on mount
  useState(() => {
    loadDomainCounts();
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-protocol-text">Import Tasks</h3>
        <button
          onClick={handleClearUserTasks}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Clear User Tasks
        </button>
      </div>

      {/* Domain counts */}
      {domainCounts && (
        <div className="p-3 bg-protocol-surface rounded-lg">
          <p className="text-xs text-protocol-text-muted mb-2">Current task counts by domain:</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(domainCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([domain, count]) => (
                <span
                  key={domain}
                  className="px-2 py-1 text-xs bg-protocol-bg rounded text-protocol-text"
                >
                  {domain}: {count}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* File upload */}
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-4 py-2 bg-protocol-surface hover:bg-protocol-surface-light rounded-lg text-protocol-text transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload JSON File
        </button>
        <button
          onClick={() => setShowExample(!showExample)}
          className="flex items-center gap-2 px-4 py-2 bg-protocol-surface hover:bg-protocol-surface-light rounded-lg text-protocol-text transition-colors"
        >
          <FileJson className="w-4 h-4" />
          {showExample ? 'Hide Example' : 'Show Example'}
        </button>
      </div>

      {/* Example format */}
      {showExample && (
        <div className="p-3 bg-protocol-surface rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-protocol-text-muted">Example JSON format:</p>
            <button
              onClick={copyExample}
              className="flex items-center gap-1 px-2 py-1 text-xs text-protocol-accent hover:bg-protocol-accent/10 rounded"
            >
              <Copy className="w-3 h-3" />
              Copy & Use
            </button>
          </div>
          <pre className="text-xs text-protocol-text overflow-x-auto max-h-48 overflow-y-auto">
            {JSON.stringify(EXAMPLE_TASKS, null, 2)}
          </pre>
          <div className="mt-3 text-xs text-protocol-text-muted space-y-1">
            <p><strong>Required fields:</strong> category, domain, intensity (1-5), instruction</p>
            <p><strong>Categories:</strong> edge, corrupt, say, listen, watch, wear, plug, oral, worship, deepen, serve, surrender, commit, expose, practice, lock, thirst, fantasy, sissygasm, bambi</p>
            <p><strong>Domains:</strong> arousal, conditioning, chastity, identity, inner_narrative, body_language, social, movement, voice, style, makeup, skincare</p>
          </div>
        </div>
      )}

      {/* JSON input */}
      <textarea
        value={jsonInput}
        onChange={(e) => setJsonInput(e.target.value)}
        placeholder="Paste JSON array of tasks here..."
        className="w-full h-48 p-3 bg-protocol-bg border border-protocol-border rounded-lg text-protocol-text text-sm font-mono resize-none focus:outline-none focus:border-protocol-accent"
      />

      {/* Import buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleImport}
          disabled={isImporting || isReplacing || !jsonInput.trim()}
          className="flex-1 py-3 bg-protocol-accent hover:bg-protocol-accent/80 disabled:bg-protocol-surface disabled:text-protocol-text-muted text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isImporting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Add Tasks
            </>
          )}
        </button>
        <button
          onClick={handleReplaceAll}
          disabled={isImporting || isReplacing || !jsonInput.trim()}
          className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:bg-protocol-surface disabled:text-protocol-text-muted text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isReplacing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Replacing...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Replace All
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div
          className={`p-4 rounded-lg ${
            result.success && result.imported > 0
              ? 'bg-green-500/10 border border-green-500/30'
              : result.errors.length > 0
              ? 'bg-red-500/10 border border-red-500/30'
              : 'bg-protocol-surface'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            {result.success && result.imported > 0 ? (
              <Check className="w-5 h-5 text-green-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
            <span className="font-medium text-protocol-text">
              {result.deleted !== undefined && result.imported > 0
                ? `Replaced ${result.deleted} → ${result.imported} tasks`
                : result.imported > 0
                ? `Imported ${result.imported} tasks`
                : result.errors[0] || 'No tasks imported'}
            </span>
          </div>
          {result.deleted !== undefined && result.deleted > 0 && result.imported === 0 && (
            <p className="text-sm text-red-400 mb-2">
              Deleted {result.deleted} tasks but import failed!
            </p>
          )}
          {result.failed > 0 && (
            <p className="text-sm text-protocol-text-muted mb-2">
              Failed: {result.failed}
            </p>
          )}
          {result.errors.length > 0 && result.imported > 0 && (
            <div className="mt-2 text-xs text-red-400 max-h-24 overflow-y-auto">
              {result.errors.slice(0, 10).map((err, i) => (
                <p key={i}>{err}</p>
              ))}
              {result.errors.length > 10 && (
                <p>...and {result.errors.length - 10} more errors</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
